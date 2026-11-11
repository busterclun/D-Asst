const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow
let tray
let closeBehavior = 'ask'
let reminderTimer
const dataPath = () => path.join(app.getPath('userData'), 'd-asst-data.json')
const windowStatePath = () => path.join(app.getPath('userData'), 'window-state.json')

const initialData = {
  tasks: [],
  categories: [
    { id: 'work', name: '工作', color: '#465c47' },
    { id: 'life', name: '生活', color: '#d98980' },
    { id: 'exercise', name: '锻炼', color: '#5b8c88' }
  ],
  settings: { theme: 'system', closeBehavior: 'ask', notifications: true, timezone: 'Asia/Shanghai' },
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
