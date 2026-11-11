const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow
let tray
let closeBehavior = 'ask'
let reminderTimer
const dataPath = () => path.join(app.getPath('userData'), 'd-asst-data.json')
const windowStatePath = () => path.join(app.getPath('userData'), 'window-state.json')
const aiConfigPath = () => path.join(app.getPath('userData'), 'ai-config.bin')

const initialData = {
  tasks: [],
  categories: [
    { id: 'work', name: '工作', color: '#465c47' },
    { id: 'life', name: '生活', color: '#d98980' },
    { id: 'exercise', name: '锻炼', color: '#5b8c88' }
  ],
  settings: { theme: 'system', closeBehavior: 'ask', notifications: true, timezone: 'Asia/Shanghai', defaultTaskDuration: 30 },
  notificationLog: {}
}

function readData() {
  try {
    const raw = fs.readFileSync(dataPath(), 'utf8')
    return { ...initialData, ...JSON.parse(raw) }
  } catch {
    return null
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(dataPath()), { recursive: true })
  const target = dataPath()
  const temp = `${target}.tmp`
  const backup = `${target}.bak`
  const payload = JSON.stringify(data, null, 2)
  fs.writeFileSync(temp, payload, 'utf8')
  if (fs.existsSync(target)) fs.copyFileSync(target, backup)
  fs.renameSync(temp, target)
}

function publicAIConfig(config) {
  return { providerName: config.providerName || 'OpenAI 兼容接口', baseUrl: config.baseUrl || '', model: config.model || '', timeoutMs: Number(config.timeoutMs) || 30000, maxTokens: Number(config.maxTokens) || 1200, temperature: Number(config.temperature) || 0.2, configured: Boolean(config.apiKey && config.baseUrl && config.model) }
}

function readAIConfig() {
  try {
    const encrypted = fs.readFileSync(aiConfigPath())
    if (!safeStorage.isEncryptionAvailable()) return null
    return JSON.parse(safeStorage.decryptString(encrypted))
  } catch { return null }
}

function writeAIConfig(config) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 安全凭据存储不可用')
  fs.mkdirSync(path.dirname(aiConfigPath()), { recursive: true })
  fs.writeFileSync(aiConfigPath(), safeStorage.encryptString(JSON.stringify(config)))
}

function normalizeAIUrl(value) {
  const raw = String(value || '').trim().replace(/\/$/, '')
  if (!raw) throw new Error('API地址不能为空')
  return /\/chat\/completions$/i.test(raw) ? raw : `${raw}/chat/completions`
}

function extractJSON(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型返回的内容不是有效 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

async function callAI(messages, configOverride) {
  const config = configOverride || readAIConfig()
  if (!config?.apiKey || !config?.baseUrl || !config?.model) throw new Error('尚未配置 AI 模型，请先在设置中填写 API 地址、API Key 和模型名称')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(3000, Number(config.timeoutMs) || 30000))
  try {
    const response = await fetch(normalizeAIUrl(config.baseUrl), { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages, temperature: Number(config.temperature) || 0.2, max_tokens: Number(config.maxTokens) || 1200 }) })
    const raw = await response.text()
    let body
    try { body = JSON.parse(raw) } catch { throw new Error(`接口返回了无效 JSON（HTTP ${response.status}）`) }
    if (!response.ok) { const detail = body?.error?.message || body?.message || `HTTP ${response.status}`; throw new Error(`模型请求失败：${detail}`) }
    const content = body?.choices?.[0]?.message?.content
    if (Array.isArray(content)) return content.map(item => item?.text || '').join('')
    if (!content) throw new Error('模型返回为空')
    return content
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('模型请求超时，请检查网络或增加请求超时设置')
    throw error
  } finally { clearTimeout(timeout) }
}

function validateAIResult(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.tasks)) throw new Error('模型结果缺少 tasks 数组')
  const tasks = result.tasks.map((task, index) => {
    if (!task || typeof task.title !== 'string' || !task.title.trim()) throw new Error(`第 ${index + 1} 项任务缺少名称`)
    const minutes = task.estimatedDuration == null ? undefined : Number(task.estimatedDuration)
    if (minutes !== undefined && (!Number.isFinite(minutes) || minutes < 0 || minutes > 10080)) throw new Error(`第 ${index + 1} 项预计工时无效`)
    for (const field of ['planDate', 'dueDate', 'eventDate']) if (task[field] && !/^\d{4}-\d{2}-\d{2}$/.test(task[field])) throw new Error(`第 ${index + 1} 项日期格式无效`)
    return { ...task, title: task.title.trim(), estimatedDuration: minutes }
  })
  return { summary: typeof result.summary === 'string' ? result.summary : '', eventDate: result.eventDate || undefined, tasks }
}

function reminderKey(task) {
  return `${task.id}:${task.startAt}:${task.reminderMinutes || 0}`
}

function runReminderSweep() {
  const data = readData()
  if (!data || !data.settings?.notifications || !Notification.isSupported()) return
  const now = Date.now()
  const log = { ...(data.notificationLog || {}) }
  let changed = false
  for (const task of data.tasks || []) {
    if (task.status === 'done' || task.status === 'cancelled' || !task.startAt || task.reminderMinutes === undefined) continue
    const at = new Date(task.startAt).getTime() - Number(task.reminderMinutes || 0) * 60000
    const key = reminderKey(task)
    if (Math.abs(at - now) > 45000 || log[key]) continue
    const notification = new Notification({ title: 'D-Asst 提醒', body: `${task.title} · 即将开始`, silent: false })
    notification.on('click', showWindow)
    notification.show()
    log[key] = new Date().toISOString()
    changed = true
  }
  const keys = Object.keys(log)
  if (keys.length > 500) for (const key of keys.slice(0, keys.length - 500)) delete log[key]
  if (changed) writeData({ ...data, notificationLog: log })
}

function startReminderScheduler() {
  if (reminderTimer) clearInterval(reminderTimer)
  runReminderSweep()
  reminderTimer = setInterval(runReminderSweep, 15000)
}

function showWindow() {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
}

function readWindowState() {
  try { return JSON.parse(fs.readFileSync(windowStatePath(), 'utf8')) } catch { return { width: 1440, height: 900 } }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return
  const state = { ...mainWindow.getBounds(), isMaximized: mainWindow.isMaximized() }
  fs.mkdirSync(path.dirname(windowStatePath()), { recursive: true })
  fs.writeFileSync(windowStatePath(), JSON.stringify(state), 'utf8')
}

function createTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('D-Asst')
  const tasks = readData()?.tasks || []
  const today = tasks.filter(t => t.status !== 'done' && t.startAt && new Date(t.startAt).toDateString() === new Date().toDateString()).slice(0, 5)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 D-Asst', click: showWindow },
    { label: `今日待办（${today.length}）`, enabled: today.length > 0, click: showWindow },
    { label: '打开设置', click: () => { showWindow(); mainWindow?.webContents.send('navigate', 'settings') } },
    { type: 'separator' },
    { label: '退出', click: () => { closeBehavior = 'quit'; app.quit() } }
  ]))
  tray.on('double-click', showWindow)
}

function createWindow() {
  const state = readWindowState()
  mainWindow = new BrowserWindow({
    width: state.width || 1440,
    height: state.height || 900,
    x: Number.isFinite(state.x) ? state.x : undefined,
    y: Number.isFinite(state.y) ? state.y : undefined,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#faf9f6',
    title: 'D-Asst',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  })
  mainWindow.on('close', (event) => {
    if (closeBehavior === 'quit') return
    event.preventDefault()
    mainWindow.webContents.send('close-request')
  })
  mainWindow.on('resize', saveWindowState)
  mainWindow.on('move', saveWindowState)
  mainWindow.on('maximize', saveWindowState)
  mainWindow.on('unmaximize', saveWindowState)
  if (state.isMaximized) mainWindow.maximize()
  if (process.env.D_ASST_DEV) mainWindow.loadURL('http://127.0.0.1:5173')
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  ipcMain.handle('ai:config:load', () => publicAIConfig(readAIConfig() || {}))
  ipcMain.handle('ai:config:save', (_event, input) => {
    const previous = readAIConfig() || {}
    const next = { ...previous, providerName: String(input?.providerName || 'OpenAI 兼容接口').trim(), baseUrl: String(input?.baseUrl || '').trim(), apiKey: String(input?.apiKey || previous.apiKey || '').trim(), model: String(input?.model || '').trim(), timeoutMs: Math.min(120000, Math.max(3000, Number(input?.timeoutMs) || 30000)), maxTokens: Math.min(8000, Math.max(256, Number(input?.maxTokens) || 1200)), temperature: Math.min(2, Math.max(0, Number(input?.temperature) || 0.2)) }
    if (!next.baseUrl || !next.model || !next.apiKey) throw new Error('请填写 API 地址、API Key 和模型名称')
    writeAIConfig(next)
    return publicAIConfig(next)
  })
  ipcMain.handle('ai:test', async () => {
    try { await callAI([{ role: 'system', content: '只输出 JSON：{"ok":true}' }, { role: 'user', content: '连接测试。' }]); return { ok: true, message: '连接成功，模型已返回结构化内容。' } } catch (error) { return { ok: false, message: error?.message || '连接失败' } }
  })
  ipcMain.handle('ai:parse', async (_event, payload) => {
    const categories = Array.isArray(payload?.context?.categories) ? payload.context.categories : []
    const today = new Date().toISOString().slice(0, 10)
    const system = `你是 D-Asst 的任务规划助手。当前日期 ${today}，时区 Asia/Shanghai。只返回严格 JSON，不要 Markdown，不要解释。Schema：{"summary":string,"eventDate":string|null,"tasks":[{"title":string,"description":string,"categoryId":string,"categoryName":string,"estimatedDuration":number|null,"planDate":string|null,"dueDate":string|null,"eventDate":string|null,"important":boolean,"urgent":boolean,"parentIndex":number|null,"dependencyIndexes":number[],"sourceType":"explicit"|"inferred"|"suggested"}]}. 任务必须是可执行动作；用户明确提到的事项标记 explicit，依据上下文推断标记 inferred，额外补充的步骤标记 suggested。日期必须使用 YYYY-MM-DD；未确定就 null。不要为没有依据的任务编造时间。已有分类：${JSON.stringify(categories)}。请识别事件日期与准备任务的区别，并按预计工时和截止日期给出日期级建议。`
    const raw = await callAI([{ role: 'system', content: system }, { role: 'user', content: String(payload?.text || '') }])
    return validateAIResult(extractJSON(raw))
  })
  ipcMain.handle('data:load', () => readData())
  ipcMain.handle('data:save', (_event, data) => { writeData(data); runReminderSweep(); return true })
  ipcMain.on('window:close-response', (_event, action) => {
    if (action === 'quit') { closeBehavior = 'quit'; app.quit() }
    else if (action === 'tray') { closeBehavior = 'tray'; mainWindow.hide() }
  })
  ipcMain.on('window:set-close-behavior', (_event, value) => { closeBehavior = value })
  ipcMain.on('notification:show', (_event, payload) => {
    if (!Notification.isSupported()) return
    const n = new Notification({ title: payload.title || 'D-Asst 提醒', body: payload.body || '', silent: false })
    n.on('click', showWindow)
    n.show()
  })
  createWindow()
  createTray()
  startReminderScheduler()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWindow() })
})

app.on('window-all-closed', (event) => { event.preventDefault() })
