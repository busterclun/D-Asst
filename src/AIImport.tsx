import { useEffect, useMemo, useState } from 'react'
import type { AIConfigPublic, AppData, Category, Task } from './types'
import { makeTask } from './store'
import { dateKey, plannedMinutesForDate } from './scheduling'
import { quadrantFlags, quadrantIdFor, quadrantLabel, quadrantOptions, type QuadrantId } from './quadrants'
import { beijingDateKey, beijingDateTimeToIso, formatTime24, resolveNaturalTime } from './time'

type ParsedTask = { title: string; description?: string; categoryId?: string; categoryName?: string; estimatedDuration?: number | null; planDate?: string | null; dueDate?: string | null; eventDate?: string | null; startTime?: string | null; reminderMinutes?: number | null; important?: boolean; urgent?: boolean; parentIndex?: number | null; dependencyIndexes?: number[]; sourceType?: 'explicit' | 'inferred' | 'suggested' }
type ParsedResult = { summary?: string; eventDate?: string; tasks: ParsedTask[] }

const pad = (value: number) => String(value).padStart(2, '0')
const todayKey = () => beijingDateKey()
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return dateKey(date) }
const minutesLabel = (value?: number | null) => value ? `${Math.floor(value / 60) ? `${Math.floor(value / 60)}小时` : ''}${value % 60 ? `${value % 60}分钟` : ''}` : '未估算'
const reminderLabel = (value?: number | null) => value == null ? '' : value === 0 ? '准时提醒' : `提前 ${value >= 60 ? `${Math.floor(value / 60)}小时${value % 60 ? ` ${value % 60}分钟` : ''}` : `${value}分钟`}提醒`

function inferPriority(text: string, eventDate?: string) {
  const important = /(重要|考试|答辩|毕业|论文|作业|报告|汇报|presentation|项目|客户|工作|健康|就医|缴费|提交)/i.test(text)
  const urgentWords = /(紧急|马上|立刻|尽快|今天|今晚|明天|明晚|截止|到期|逾期|提醒)/i.test(text)
  const daysUntilEvent = eventDate ? Math.ceil((new Date(`${eventDate}T23:59:59+08:00`).getTime() - Date.now()) / 86400000) : undefined
  return { important, urgent: urgentWords || (daysUntilEvent !== undefined && daysUntilEvent >= 0 && daysUntilEvent <= 2) }
}

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
  const relative = resolveNaturalTime(text, now)
  if (relative.relativeSoon && relative.time) return relative.date
  return undefined
}

function inferStartTime(text: string) {
  return resolveNaturalTime(text).time
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
  const priority = inferPriority(text, eventDate)
  const category = categories.find(item => /课程|presentation|报告|作业/i.test(text) && /课程|科研|学习/.test(item.name)) || categories.find(item => item.id === 'work') || categories[0]
  const titles: ParsedTask[] = []
  const isPresentation = /presentation|汇报|展示/i.test(text)
  const hasPpt = /ppt|幻灯片|演示文稿/i.test(text)
  const hasReport = /报告|report/i.test(text)
  if (isPresentation && (hasPpt || hasReport)) {
    const parentIndex = 0
    titles.push({ title: '准备课程 Presentation', description: text, categoryId: category?.id, categoryName: category?.name, eventDate, ...priority, sourceType: 'inferred' })
    if (hasPpt) titles.push({ title: '制作 Presentation PPT', categoryId: category?.id, planDate: eventDate ? addDays(eventDate, -3) : undefined, estimatedDuration: 180, parentIndex, ...priority, sourceType: 'explicit' })
    if (hasReport) titles.push({ title: '撰写课程报告', categoryId: category?.id, planDate: eventDate ? addDays(eventDate, -2) : undefined, estimatedDuration: 240, parentIndex, ...priority, sourceType: 'explicit' })
    titles.push({ title: '检查材料并进行展示演练', categoryId: category?.id, planDate: eventDate ? addDays(eventDate, -1) : undefined, estimatedDuration: 60, parentIndex, ...priority, sourceType: 'suggested' })
  } else {
    const reminderMinutes = inferReminderMinutes(text)
    const startTime = inferStartTime(text)
    text.split(/\n|；|;/).map(item => item.trim()).filter(Boolean).forEach(item => titles.push({ title: item.replace(/^(帮我|请|需要|我要)\s*/g, '').replace(/提前\s*(?:\d+(?:\.\d+)?|一|两|二|三|四|五|六|七|八|九|十)\s*(?:个)?\s*(?:小时|小時|h|分钟|分鐘|min)/i, '').replace(/[，,].*$/, '').trim() || '提醒事项', description: item, categoryId: category?.id, categoryName: category?.name, planDate: eventDate, eventDate, startTime, reminderMinutes, estimatedDuration: /小时|h/i.test(item) ? 60 : undefined, ...inferPriority(item, eventDate), sourceType: 'explicit' }))
  }
  return { summary: '未配置外部模型，使用本地快速解析；结果可修改后再导入。', eventDate, tasks: titles }
}

function toTasks(result: ParsedResult, categories: Category[], sourceText = ''): Task[] {
  const ids = result.tasks.map(() => crypto.randomUUID())
  return result.tasks.map((item, index) => {
    const category = categories.find(value => value.id === item.categoryId) || categories.find(value => value.name === item.categoryName) || categories.find(value => value.id === 'work') || categories[0]
    const relativeTime = sourceText ? resolveNaturalTime(sourceText) : undefined
    const fallbackDate = sourceText ? inferDate(sourceText) : undefined
    const planDate = relativeTime?.relativeSoon && relativeTime.time ? relativeTime.date : item.planDate || item.eventDate || fallbackDate
    const startTime = relativeTime?.relativeSoon && relativeTime.time ? relativeTime.time : item.startTime || (sourceText ? inferStartTime(sourceText) : undefined)
    const startAt = planDate && startTime ? beijingDateTimeToIso(planDate, startTime) : undefined
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
  const parseExternal = async () => { const parseApi = window.dAsst?.aiParse; if (!parseApi) throw new Error('当前运行环境不支持外部 AI，请更新便携版'); const result = await parseApi({ text: input, context }) as ParsedResult; if (!result?.tasks?.length) throw new Error('模型没有识别出可执行任务'); const parsedTasks = toTasks(result, categories, input); const relative = resolveNaturalTime(input); setSource('external'); setSummary(relative.relativeSoon && relative.time ? `已按当前北京时间将相对时间解析为 ${relative.date} ${relative.time}，请在下方确认具体时间。` : result.summary || '外部模型已完成结构化解析。'); setPreview(parsedTasks); setStatus('ready'); setMessage('请检查日期、24 小时制具体时间及提醒后再写入任务库。') }
  const parseLocal = () => { const result = localParse(input, categories); setSource('local'); setSummary(result.summary || ''); setPreview(toTasks(result, categories)); setStatus('ready'); setMessage('这是本地快速解析结果，不代表外部 AI 已处理。') }
  const parse = async (forceLocal = false) => { if (!input.trim()) return; setStatus('loading'); setMessage(forceLocal ? '正在本地解析…' : '正在真实调用外部模型…'); try { if (!forceLocal && config?.configured && window.dAsst?.aiParse) await parseExternal(); else { if (!forceLocal) setMessage('尚未配置外部模型，正在使用本地快速解析…'); parseLocal() } } catch (error) { setStatus('error'); setMessage(error instanceof Error ? error.message : '解析失败'); setPreview([]) } }
  const updateTask = (id: string, patch: Partial<Task>) => setPreview(items => items.map(item => item.id === id ? { ...item, ...patch } : item))
  const updateReminder = (task: Task, value: string) => {
    const reminderMinutes = value === '' ? undefined : Math.max(0, Number(value))
    const reminderAt = task.startAt && reminderMinutes !== undefined
      ? new Date(new Date(task.startAt).getTime() - reminderMinutes * 60000).toISOString()
      : undefined
    updateTask(task.id, { reminderMinutes, reminderAt })
  }
  const updatePlanDate = (task: Task, value: string) => {
    const time = task.startAt ? formatTime24(task.startAt) : undefined
    const startAt = value && time ? beijingDateTimeToIso(value, time) : undefined
    const reminderAt = startAt && task.reminderMinutes !== undefined ? new Date(new Date(startAt).getTime() - task.reminderMinutes * 60000).toISOString() : undefined
    updateTask(task.id, { datePlans: value ? [{ date: value }] : [], startAt, reminderAt })
  }
  const updateStartTime = (task: Task, value: string) => {
    const planDate = task.datePlans?.[0]?.date || todayKey()
    const startAt = value ? beijingDateTimeToIso(planDate, value) : undefined
    const reminderAt = startAt && task.reminderMinutes !== undefined ? new Date(new Date(startAt).getTime() - task.reminderMinutes * 60000).toISOString() : undefined
    updateTask(task.id, { datePlans: task.datePlans?.length ? task.datePlans : [{ date: planDate }], startAt, reminderAt })
  }
  const removeTask = (id: string) => setPreview(items => items.filter(item => item.id !== id).map(item => item.parentTaskId === id ? { ...item, parentTaskId: undefined } : item))
  const confirm = () => { if (!preview.length) return; const reminderCount = preview.filter(task => task.reminderAt || (task.startAt && task.reminderMinutes !== undefined)).length; const pendingReminderCount = preview.filter(task => !task.startAt && task.reminderMinutes !== undefined).length; onImport(preview); setPreview([]); setInput(''); setStatus('success'); setMessage(`已确认导入 ${preview.length} 项任务，父子关系、四象限与日期计划已保存${reminderCount ? `，${reminderCount} 项系统提醒已启用` : ''}${pendingReminderCount ? `；${pendingReminderCount} 项提醒需补充具体时间后生效` : ''}。`) }
  return <div className="ai-import-page"><section className="ai-chat-layout"><section className="ai-chat-empty"><span className="ai-spark">✦</span><h2>真实 AI 任务理解</h2><p>外部模型会提取任务、拆解父子关系、判断四象限归属，并生成可编辑的日期级计划。所有 AI 判断都可在导入前手动调整。</p><div className={`ai-mode-badge ${config?.configured ? 'configured' : ''}`}>{config?.configured ? `外部模型：${config.model}` : '尚未配置外部模型'}</div></section><section className="ai-composer"><label className="ai-composer-label">自然语言任务输入</label><textarea value={input} onChange={event => setInput(event.target.value)} placeholder={'例如：\n十二月三号我有个能源系统课的 presentation，需要提前准备 PPT 和报告'} /><div className="ai-composer-foot"><div className="ai-composer-actions"><button className="ai-chip" type="button" onClick={() => parse(false)} disabled={status === 'loading'}>{status === 'loading' ? '解析中…' : config?.configured ? '外部 AI 解析' : '基础解析'}</button><button className="ai-chip" type="button" onClick={() => parse(true)} disabled={status === 'loading'}>本地快速解析</button></div><button className="ai-send" type="button" disabled={!input.trim() || status === 'loading'} onClick={() => parse(false)} aria-label="解析任务">↑</button></div></section></section>{message && <div className={`ai-status ${status === 'error' ? 'error' : status === 'success' ? 'success' : ''}`}>{message}</div>}{preview.length > 0 && <section className="panel ai-preview-panel"><div className="section-head"><div><span className="eyebrow">PREVIEW · {source === 'external' ? 'EXTERNAL AI' : 'LOCAL'}</span><h3>解析预览 · {preview.length} 项</h3></div><span className="pill">待确认</span></div>{summary && <p className="ai-summary">{summary}</p>}<div className="ai-preview-list">{preview.map((task, index) => <article className={`ai-preview-task ${task.description ? 'has-description' : ''}`} key={task.id}><div className="ai-preview-index">{index + 1}</div><div className="ai-preview-main"><input className="ai-title-input" value={task.title} onChange={event => updateTask(task.id, { title: event.target.value })} /><div className="ai-meta-row"><label>分类<select value={task.categoryId} onChange={event => updateTask(task.id, { categoryId: event.target.value })}>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>四象限归属<select className={`quadrant-select ${quadrantIdFor(task)}`} value={quadrantIdFor(task)} onChange={event => updateTask(task.id, quadrantFlags(event.target.value as QuadrantId))}>{quadrantOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>计划日期<input type="date" value={task.datePlans?.[0]?.date || ''} onChange={event => updatePlanDate(task, event.target.value)} /></label><label>具体时间（24小时制）<input type="time" step="60" value={task.startAt ? formatTime24(task.startAt) : ''} onChange={event => updateStartTime(task, event.target.value)} /></label><label>预计工时<input type="number" min="0" step="15" value={task.estimatedDuration ?? ''} placeholder="未估算" onChange={event => updateTask(task.id, { estimatedDuration: event.target.value ? Number(event.target.value) : undefined })} /></label><label>提醒<select value={task.reminderMinutes ?? ''} onChange={event => updateReminder(task, event.target.value)}><option value="">不提醒</option><option value="0">准时提醒</option><option value="5">提前 5 分钟</option><option value="10">提前 10 分钟</option><option value="30">提前 30 分钟</option><option value="60">提前 1 小时</option></select></label></div><div className="ai-task-source"><span className={`source-chip ${task.parentTaskId ? 'inferred' : 'explicit'}`}>{task.parentTaskId ? '子任务' : '任务'}</span><span className={`quadrant-chip ${quadrantIdFor(task)}`}>{quadrantLabel(task)}</span><span>{task.datePlans?.[0]?.date || '未安排日期'}</span><span>{task.startAt ? formatTime24(task.startAt) : '未设置具体时间'}</span><span>{minutesLabel(task.estimatedDuration)}</span>{task.reminderMinutes !== undefined && <span className={`reminder-chip ${task.startAt ? '' : 'warning'}`}>{task.startAt ? reminderLabel(task.reminderMinutes) : '提醒需设置具体时间'}</span>}</div></div><button className="ai-remove" type="button" onClick={() => removeTask(task.id)} aria-label="删除这项建议">×</button></article>)}</div><div className="ai-preview-actions"><button className="secondary-button" onClick={() => parse(source === 'local')}>重新解析</button><button className="primary-button" onClick={confirm}>确认导入</button></div></section>}</div>
}
