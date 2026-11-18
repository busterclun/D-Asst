function startupPreference(app, runtime) {
  const supported = runtime.platform === 'win32' && app.isPackaged
  const path = runtime.env.PORTABLE_EXECUTABLE_FILE || runtime.execPath
  const name = 'D-Asst'

  function read() {
    if (!supported) return null
    const { launchItems } = app.getLoginItemSettings({ path, args: [] })
    return launchItems.some(item => item.scope === 'user' && item.name === name && item.enabled)
  }

  function set(enabled) {
    if (!supported || typeof enabled !== 'boolean') throw new Error('无法设置开机自启')
    app.setLoginItemSettings({ name, path, args: [], openAtLogin: enabled, enabled })
    const actual = read()
    if (actual !== enabled) throw new Error('Windows 未保存开机自启设置')
    return actual
  }

  return { read, set }
}

module.exports = { startupPreference }
