const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow
let tray
let closeBehavior = 'ask'
const dataPath = () => path.join(app.getPath('userData'), 'd-asst-data.json')

const initialData = {
  tasks: [],
  categories: [
    { id: 'work', name: '工作', color: '#465c47' },
    { id: 'life', name: '生活', color: '#d98980' },
    { id: 'exercise', name: '锻炼', color: '#5b8c88' }
  ],
  settings: { theme: 'system', closeBehavior: 'ask', notifications: true, timezone: 'Asia/Shanghai' }
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
  fs.writeFileSync(dataPath(), JSON.stringify(data, null, 2), 'utf8')
}

function showWindow() {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
}

function createTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('D-Asst')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 D-Asst', click: showWindow },
    { type: 'separator' },
    { label: '退出', click: () => { closeBehavior = 'quit'; app.quit() } }
  ]))
  tray.on('double-click', showWindow)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
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
  if (process.env.D_ASST_DEV) mainWindow.loadURL('http://127.0.0.1:5173')
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  ipcMain.handle('data:load', () => readData())
  ipcMain.handle('data:save', (_event, data) => { writeData(data); return true })
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
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWindow() })
})

app.on('window-all-closed', (event) => { event.preventDefault() })
