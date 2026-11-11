const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dAsst', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  notify: (payload) => ipcRenderer.send('notification:show', payload),
  setCloseBehavior: (value) => ipcRenderer.send('window:set-close-behavior', value),
  respondClose: (action) => ipcRenderer.send('window:close-response', action),
  onNavigate: (handler) => {
    const listener = (_event, view) => handler(view)
    ipcRenderer.on('navigate', listener)
    return () => ipcRenderer.removeListener('navigate', listener)
  },
  aiConfigLoad: () => ipcRenderer.invoke('ai:config:load'),
  aiConfigSave: (config) => ipcRenderer.invoke('ai:config:save', config),
  aiTest: () => ipcRenderer.invoke('ai:test'),
  aiParse: (payload) => ipcRenderer.invoke('ai:parse', payload),
  onCloseRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('close-request', listener)
    return () => ipcRenderer.removeListener('close-request', listener)
  }
})
