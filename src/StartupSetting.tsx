import { useEffect, useState } from 'react'

export function StartupSetting() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const api = window.dAsst

  useEffect(() => {
    let mounted = true
    async function read() {
      try {
        const current = await api?.getStartup()
        if (mounted) {
          setEnabled(current ?? null)
          setMessage(current == null ? '请在 Windows 发行版中设置' : '')
        }
      } catch {
        if (mounted) setMessage('无法读取 Windows 启动设置，请重新打开设置重试')
      } finally {
        if (mounted) setBusy(false)
      }
    }
    void read()
    return () => { mounted = false }
  }, [api])

  async function toggle() {
    if (!api || enabled === null || busy) return
    setBusy(true)
    try {
      setEnabled(await api.setStartup(!enabled))
      setMessage('')
    } catch {
      setMessage('更改未成功，请检查 Windows 启动应用设置后重试')
    } finally {
      setBusy(false)
    }
  }

  return <div className="setting-row">
    <div><strong>开机自启</strong><span aria-live="polite">{message || '登录 Windows 后自动打开 D-Asst'}</span></div>
    <button type="button" className={`switch ${enabled ? 'on' : ''}`} role="switch" aria-label="开机自启"
      aria-checked={enabled === true} disabled={busy || enabled === null} onClick={toggle}><i /></button>
  </div>
}
