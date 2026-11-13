import { useEffect, useMemo, useState } from 'react'
import type { AIConfigPublic, AppData, Category, Task } from './types'
import { makeTask } from './store'
import { dateKey, plannedMinutesForDate } from './scheduling'

type ParsedTask = { title: string; description?: string; categoryId?: string; categoryName?: string; estimatedDuration?: number | null; planDate?: string | null; dueDate?: string | null; eventDate?: string | null; startTime?: string | null; reminderMinutes?: number | null; important?: boolean; urgent?: boolean; parentIndex?: number | null; dependencyIndexes?: number[]; sourceType?: 'explicit' | 'inferred' | 'suggested' }
type ParsedResult = { summary?: string; eventDate?: string; tasks: ParsedTask[] }

const pad = (value: number) => String(value).padStart(2, '0')
const todayKey = () => dateKey(new Date())
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return dateKey(date) }
const minutesLabel = (value?: number | null) => value ? `${Math.floor(value / 60) ? `${Math.floor(value / 60)}小时` : ''}${value % 60 ? `${value % 60}分钟` : ''}` : '未估算'
const reminderLabel = (value?: number | null) => value == null ? '' : value === 0 ? '准时提醒' : `提前 ${value >= 60 ? `${Math.floor(value / 60)}小时${value % 60 ? ` ${value % 60}分钟` : ''}` : `${value}分钟`}提醒`

function inferDate(text: string) {
  const now = new Date()
  const numeric = text.match(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})[日号]?/)
  if (numeric) { const year = Number(numeric[1] || now.getFullYear()); return `${year}-${pad(Number(numeric[2]))}-${pad(Number(numeric[3]))}` }
  const chinese = text.match(/(?:(\d{4})年)?\s*([一二三四五六七八九十]+)月\s*([一二三四五六七八九十]+)[日号]?/)
  if (chinese) {
    const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
    const toNum = (value: string) => {
      if (!value.includes('十')) return digits[value] || 0
      const [tens, ones] = value.split('十')
      return (tens ? (digits[tens] || 0) * 10 : 10) + (ones ? (digits[ones] || 0) : 0)
    }
    return `${Number(chinese[1] || now.getFullYear())}-${pad(toNum(chinese[2]))}-${pad(toNum(chinese[3]))}`
  }
  const offset = text.includes('后天') ? 2 : text.includes('明天') || text.includes('明晚') ? 1 : text.includes('今天') || text.includes('今晚') ? 0 : undefined
  if (offset !== undefined) { now.setDate(now.getDate() + offset); return dateKey(now) }
  return undefined
}

function inferStartTime(text: string) {
  const chinese = text.match(/(?:晚上|明晚|今晚|下午|上午|早上)?\s*(十二|十一|十|九|八|七|六|五|四|三|二|一)点(?:([0-5]\d)分?)?/)
  const numeric = text.match(/(?:晚上|明晚|今晚|下午|上午|早上)?\s*(\d{1,2})(?:点|:\s*)(\d{2})?/)
  if (!chinese && !numeric) return undefined
  const chineseHours: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 }
  let hour = chinese ? chineseHours[chinese[1]] : Number(numeric![1]); const minute = Number(chinese?.[2] || numeric?.[2] || 0)
  if (/(晚上|明晚|今晚|下午)/.test(text) && hour < 12) hour += 12
  if (hour > 23 || minute > 59) return undefined
  return `${pad(hour)}:${pad(minute)}`
}

function inferReminderMinutes(text: string) {
  const match = text.match(/提前\s*(\d+(?:\.\d+)?|一|两|二|三|四|五|六|七|八|九|十)\s*(?:个)?\s*(小时|小時|h|分钟|分鐘|min)/i)
  if (!match) return undefined
  const amount = Number(match[1]) || ({ 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 } as Record<string, number>)[match[1]] || 0
  return Math.max(0, Math.round(amount * (/小时|小時|h/i.test(match[2]) ? 60 : 1)))
}

function reminderTaskTitle(text: string) {
  const title = text.replace(/^(帮我|请|需要|我要|设置|安排|创建)\s*/g, '')
    .replace(/提前\s*(?:\d+(?:\.\d+)?|一|两|二|三|四|五|六|七|八|九|十)\s*(?:个)?\s*(?:小时|小時|h|分钟|分鐘|min)/i, '')
    .replace(/提醒我?/g, '').replace(/(?:明天|明晚|今晚|今天)\s*\d{1,2}(?:点|:\s*\d{2})?\s*(?:的)?/g, '')
    .replace(/^(设置|安排|创建)\s*/, '').trim()
  return title || '提醒事项'
}

function localParse(text: string, categories: Category[]): ParsedResult {
  const eventDate = inferDate(text)
  const category = categories.find(item => /课程|presentation|报告|作业/i.test(text) && /课程|科研|学习/.test(item.name)) || categories.find(item => item.id === 'work') || categories[0]
  const titles: ParsedTask[] = []
  const isPresentation = /presentation|汇报|展示/i.test(text)
  const hasPpt = /ppt|幻灯片|演示文稿/i.test(text)
  const hasReport = /报告|report/i.test(text)
  if (isPresentation && (hasPpt || hasReport)) {
    const parentIndex = 0
    titles.push({ title: '准备课程 Presentation', description: text, categoryId: category?.id, categoryName: category?.name, eventDate, sourceType: 'inferred' })
    if (hasPpt) titles.push({ title: '制作 Presentation PPT', categoryId: category?.id, planDate: eventDate ? addDays(eventDate, -3) : undefined, estimatedDuration: 180, parentIndex, sourceType: 'explicit' })
    if (hasReport) titles.push({ title: '撰写课程报告', categoryId: category?.id, planDate: eventDate ? addDays(eventDate, -2) : undefined, estimatedDuration: 240, parentIndex, sourceType: 'explicit' })
    titles.push({ title: '检查材料并进行展示演练', categoryId: category?.id, planDate: eventDate ? addDays(eventDate, -1) : undefined, estimatedDuration: 60, parentIndex, sourceType: 'suggested' })
  } else {
    const reminderMinutes = inferReminderMinutes(text)
    const startTime = inferStartTime(text)
    text.split(/\n|；|;/).map(item => item.trim()).filter(Boolean).forEach(item => titles.push({ title: item.replace(/^(帮我|请|需要|我要)\s*/g, '').replace(/提前\s*(?:\d+(?:\.\d+)?|一|两|二|三|四|五|六|七|八|九|十)\s*(?:个)?\s*(?:小时|小時|h|分钟|分鐘|min)/i, '').replace(/[，,].*$/, '').trim() || '提醒事项', description: item, categoryId: category?.id, categoryName: category?.name, planDate: eventDate, eventDate, startTime, reminderMinutes, estimatedDuration: /小时|h/i.test(item) ? 60 : undefined, sourceType: 'explicit' }))
  }
  return { summary: '未配置外部模型，使用本地快速解析；结果可修改后再导入。', eventDate, tasks: titles }
}

function toTasks(result: ParsedResult, categories: Category[], sourceText = ''): Task[] {
  const ids = result.tasks.map(() => crypto.randomUUID())
  return result.tasks.map((item, index) => {
    const category = categories.find(value => value.id === item.categoryId) || categories.find(value => value.name === item.categoryName) || categories.find(value => value.id === 'work') || categories[0]
    const fallbackDate = sourceText ? inferDate(sourceText) : undefined
    const planDate = item.planDate || item.eventDate || fallbackDate
    const startTime = item.startTime || (sourceText ? inferStartTime(sourceText) : undefined)
    const startAt = planDate && startTime ? new Date(`${planDate}T${startTime}:00`).toISOString() : undefined
    const reminderMinutes = item.reminderMinutes == null && sourceText ? inferReminderMinutes(sourceText) : item.reminderMinutes == null ? undefined : Math.max(0, Math.round(item.reminderMinutes))
    const reminderAt = startAt && reminderMinutes !== undefined ? new Date(new Date(startAt).getTime() - reminderMinutes * 60000).toISOString() : undefined
    const generatedReminderTask = /设置.*提醒|手机日历|提醒应用|自己.*提醒/.test(`${item.title} ${item.description || ''}`)
    const title = generatedReminderTask && sourceText ? reminderTaskTitle(sourceText) : item.title
    return makeTask({ id: ids[index], title, description: item.description || sourceText, categoryId: category?.id || 'work', estimatedDuration: item.estimatedDuration == null ? undefined : Math.max(0, Math.round(item.estimatedDuration)), datePlans: planDate ? [{ date: planDate }] : [], startAt, reminderAt, reminderMinutes, dueAt: item.dueDate ? `${item.dueDate}T18:00:00.000Z` : undefined, important: Boolean(item.important), urgent: Boolean(item.urgent), parentTaskId: item.parentIndex != null && ids[item.parentIndex] ? ids[item.parentIndex] : undefined, dependencyIds: (item.dependencyIndexes || []).map(value => ids[value]).filter(Boolean), source: 'ai' })
  })
}

export function AIImport({ categories, tasks, settings, onImport }: { categories: Category[]; tasks: Task[]; settings: AppData['settings']; onImport: (tasks: Task[]) => void }) {
  const [input, setInput] = useState('')
  const [config, setConfig] = useState<AIConfigPublic | null>(null)
  const [preview, setPreview] = useState<Task[]>([])
  const [summary, setSummary] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready' | 'success'>('idle')
  const [message, setMessage] = useState('')
  const [source, setSource] = useState<'external' | 'local'>('external')
  useEffect(() => { const load = window.dAsst?.aiConfigLoad?.(); if (load) load.then(setConfig).catch(() => setConfig(null)); else setConfig(null) }, [])
  const context = useMemo(() => ({ categories: categories.map(category => ({ id: category.id, name: category.name })), existingTasks: tasks.slice(0, 80).map(task => ({ title: task.title, categoryId: task.categoryId, dueAt: task.dueAt, estimatedDuration: task.estimatedDuration })), dailyCapacityMinutes: settings.dailyCapacityMinutes ?? 300 }), [categories, tasks, settings.dailyCapacityMinutes])
  const parseExternal = async () => { const parseApi = window.dAsst?.aiParse; if (!parseApi) throw new Error('当前运行环境不支持外部 AI，请更新便携版'); const result = await parseApi({ text: input, context }) as ParsedResult; if (!result?.tasks?.length) throw new Error('模型没有识别出可执行任务'); setSource('external'); setSummary(result.summary || '外部模型已完成结构化解析。'); setPreview(toTasks(result, categories, input)); setStatus('ready'); setMessage('请检查并确认后再写入任务库。') }
  const parseLocal = () => { const result = localParse(input, categories); setSource('local'); setSummary(result.summary || ''); setPreview(toTasks(result, categories)); setStatus('ready'); setMessage('这是本地快速解析结果，不代表外部 AI 已处理。') }
  const parse = async (forceLocal = false) => { if (!input.trim()) return; setStatus('loading'); setMessage(forceLocal ? '正在本地解析…' : '正在真实调用外部模型…'); try { if (!forceLocal && config?.configured && window.dAsst?.aiParse) await parseExternal(); else { if (!forceLocal) setMessage('尚未配置外部模型，正在使用本地快速解析…'); parseLocal() } } catch (error) { setStatus('error'); setMessage(error instanceof Error ? error.message : '解析失败'); setPreview([]) } }
  const updateTask = (id: string, patch: Partial<Task>) => setPreview(items => items.map(item => item.id === id ? { ...item, ...patch } : item))
  const removeTask = (id: string) => setPreview(items => items.filter(item => item.id !== id).map(item => item.parentTaskId === id ? { ...item, parentTaskId: undefined } : item))
  const confirm = () => { if (!preview.length) return; const reminderCount = preview.filter(task => task.reminderAt || task.reminderMinutes !== undefined).length; onImport(preview); setPreview([]); setInput(''); setStatus('success'); setMessage(`已确认导入 ${preview.length} 项任务，父子关系与日期计划已保存${reminderCount ? `，${reminderCount} 项系统提醒已启用` : ''}。`) }
  return <div className="ai-import-page"><section className="ai-chat-layout"><section className="ai-chat-empty"><span className="ai-spark">✦</span><h2>真实 AI 任务理解</h2><p>外部模型会提取任务、拆解父子关系、匹配已有分类并生成可编辑的日期级计划。未配置模型时可手动使用本地快速解析。</p><div className={`ai-mode-badge ${config?.configured ? 'configured' : ''}`}>{config?.configured ? `外部模型：${config.model}` : '尚未配置外部模型'}</div></section><section className="ai-composer"><label className="ai-composer-label">自然语言任务输入</label><textarea value={input} onChange={event => setInput(event.target.value)} placeholder={'例如：\n十二月三号我有个能源系统课的 presentation，需要提前准备 PPT 和报告'} /><div className="ai-composer-foot"><div className="ai-composer-actions"><button className="ai-chip" type="button" onClick={() => parse(false)} disabled={status === 'loading'}>{status === 'loading' ? '解析中…' : config?.configured ? '外部 AI 解析' : '基础解析'}</button><button className="ai-chip" type="button" onClick={() => parse(true)} disabled={status === 'loading'}>本地快速解析</button></div><button className="ai-send" type="button" disabled={!input.trim() || status === 'loading'} onClick={() => parse(false)} aria-label="解析任务">↑</button></div></section></section>{message && <div className={`ai-status ${status === 'error' ? 'error' : status === 'success' ? 'success' : ''}`}>{message}</div>}{preview.length > 0 && <section className="panel ai-preview-panel"><div className="section-head"><div><span className="eyebrow">PREVIEW · {source === 'external' ? 'EXTERNAL AI' : 'LOCAL'}</span><h3>解析预览 · {preview.length} 项</h3></div><span className="pill">待确认</span></div>{summary && <p className="ai-summary">{summary}</p>}<div className="ai-preview-list">{preview.map((task, index) => <article className={`ai-preview-task ${task.description ? 'has-description' : ''}`} key={task.id}><div className="ai-preview-index">{index + 1}</div><div className="ai-preview-main"><input className="ai-title-input" value={task.title} onChange={event => updateTask(task.id, { title: event.target.value })} /><div className="ai-meta-row"><label>分类<select value={task.categoryId} onChange={event => updateTask(task.id, { categoryId: event.target.value })}>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>计划日期<input type="date" value={task.datePlans?.[0]?.date || ''} onChange={event => updateTask(task.id, { datePlans: event.target.value ? [{ date: event.target.value }] : [] })} /></label><label>预计工时<input type="number" min="0" step="15" value={task.estimatedDuration ?? ''} placeholder="未估算" onChange={event => updateTask(task.id, { estimatedDuration: event.target.value ? Number(event.target.value) : undefined })} /></label></div><div className="ai-task-source"><span className={`source-chip ${task.parentTaskId ? 'inferred' : 'explicit'}`}>{task.parentTaskId ? '子任务' : '任务'}</span><span>{task.datePlans?.[0]?.date || '未安排日期'}</span><span>{minutesLabel(task.estimatedDuration)}</span></div></div><button className="ai-remove" type="button" onClick={() => removeTask(task.id)} aria-label="删除这项建议">×</button></article>)}</div><div className="ai-preview-actions"><button className="secondary-button" onClick={() => parse(source === 'local')}>重新解析</button><button className="primary-button" onClick={confirm}>确认导入</button></div></section>}</div>
}
