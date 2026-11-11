import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { AppData, Category, Task, TaskStatus, TimeBlock, ViewId } from './types'
import { loadData, makeTask, saveData } from './store'
import { firstTaskStart, normalizeTask, remainingMinutes, scheduledMinutes, taskBlocks, taskHasDate, withTaskBlocks } from './scheduling'

const nav: { id: ViewId; label: string; icon: string }[] = [
  { id: 'dashboard', label: '工作台', icon: '⌂' }, { id: 'quadrants', label: '四象限', icon: '⊞' },
  { id: 'list', label: '任务清单', icon: '☷' }, { id: 'day', label: '我的一天', icon: '◷' },
  { id: 'week', label: '我的一周', icon: '▦' }, { id: 'month', label: '我的一月', icon: '▥' },
  { id: 'ai', label: 'AI 助手', icon: '✦' }
]

const pad = (n: number) => String(n).padStart(2, '0')
const clockLabel = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const sameDay = (value: string | undefined, d: Date) => Boolean(value && dayKey(new Date(value)) === dayKey(d))
const dateLabel = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`
const weekLabel = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const statusLabel: Record<TaskStatus, string> = { todo: '待开始', doing: '进行中', done: '已完成', cancelled: '已取消' }
const viewEnglish: Record<ViewId, string> = {
  dashboard: 'DASHBOARD', quadrants: 'EISENHOWER MATRIX', list: 'TASK LIBRARY',
  day: 'MY DAY', week: 'WEEK PLANNER', month: 'MONTH VIEW', ai: 'AI ASSISTANT', settings: 'PREFERENCES'
}
const isTextInput = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
const dayDistance = (a: Date, b: Date) => Math.abs(Math.round((new Date(dayKey(a)).getTime() - new Date(dayKey(b)).getTime()) / 86400000))
const readDragId = (event: React.DragEvent<HTMLElement>) => event.dataTransfer.getData('application/x-dasst-task') || event.dataTransfer.getData('text/plain')
const hideNativeDragPreview = (event: React.DragEvent<HTMLElement>) => { const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1; event.dataTransfer.setDragImage(canvas, 0, 0) }

function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [view, setView] = useState<ViewId>('dashboard')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [modal, setModal] = useState<{ task?: Task; date?: Date } | null>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [batchCategoryId, setBatchCategoryId] = useState('')
  const [batchDate, setBatchDate] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string } | null>(null)
  const [history, setHistory] = useState<AppData[]>([])
  const [future, setFuture] = useState<AppData[]>([])
  const [themePulse, setThemePulse] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsReturnView, setSettingsReturnView] = useState<ViewId>('dashboard')

  const navigateTo = (next: ViewId) => {
    if (next === 'settings') {
      if (view === 'settings') {
        setView(settingsReturnView)
        return
      }
      setSettingsReturnView(view)
    }
    setView(next)
  }

  useEffect(() => { loadData().then(setData) }, [])
  useEffect(() => { if (data) saveData(data) }, [data])
  useEffect(() => { if (data) window.dAsst?.setCloseBehavior(data.settings.closeBehavior) }, [data?.settings.closeBehavior])
  useEffect(() => window.dAsst?.onNavigate(viewId => { if (['dashboard', 'quadrants', 'list', 'day', 'week', 'month', 'ai', 'settings'].includes(viewId)) setView(viewId as ViewId) }), [])
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const editing = isTextInput(event.target)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && !editing) { event.preventDefault(); setModal({ date: selectedDate }) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && !editing) { event.preventDefault(); document.querySelector<HTMLInputElement>('.search input')?.focus() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editing) { event.preventDefault(); undo() }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z' && !editing) { event.preventDefault(); redo() }
      if (event.key === 'Escape') { setModal(null); setContextMenu(null); setSelectedIds([]) }
      if (event.key === 'Delete' && !editing && selectedIds.length) { event.preventDefault(); batchDelete() }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [selectedDate, selectedIds, history, future, data])
  useEffect(() => {
    if (!window.dAsst) return
    const remove = window.dAsst.onCloseRequest(() => {
      if (!data) return
      if (data.settings.closeBehavior === 'ask') {
        const keep = window.confirm('关闭 D-Asst 后是否继续在系统托盘运行？\n确定：最小化到托盘\n取消：退出应用')
        const next = { ...data, settings: { ...data.settings, closeBehavior: keep ? 'tray' as const : 'quit' as const } }
        setData(next); saveData(next); window.dAsst?.respondClose(keep ? 'tray' : 'quit')
      } else window.dAsst?.respondClose(data.settings.closeBehavior)
    })
    return remove
  }, [data])
  if (!data) return <div className="boot"><div className="brand-mark">D</div><span>正在打开 D-Asst…</span></div>
  const category = (id: string) => data.categories.find(c => c.id === id)
  const visibleTasks = data.tasks.filter(t => !search || `${t.title} ${t.description} ${t.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()))
  const commit = (next: AppData, message?: string) => { setHistory(previous => [...previous, data].slice(-30)); setFuture([]); setData(next); if (message) flash(message) }
  const updateTask = (id: string, patch: Partial<Task>, message?: string) => commit({ ...data, tasks: data.tasks.map(t => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t) }, message)
  const removeTask = (id: string, message = '已删除') => commit({ ...data, tasks: data.tasks.filter(t => t.id !== id) }, message)
  const saveTask = (task: Task) => {
    const blocks = taskBlocks(task)
    const first = blocks[0]
    const adjusted = first && task.startAt && task.dueAt
      ? { ...task, scheduleBlocks: blocks.map((block, index) => index === 0 ? { ...block, startAt: task.startAt!, endAt: task.dueAt! } : block) }
      : task
    const normalized = normalizeTask(adjusted)
    commit({ ...data, tasks: data.tasks.some(t => t.id === task.id) ? data.tasks.map(t => t.id === task.id ? normalized : t) : [normalized, ...data.tasks] }, '已保存'); setModal(null)
  }
  const toggleTask = (task: Task) => {
    const done = task.status !== 'done'
    const nextTasks = data.tasks.map(t => t.id === task.id ? { ...t, status: done ? 'done' as const : 'todo' as const, updatedAt: new Date().toISOString() } : t)
    if (done && task.recurrenceRule) {
      const next = new Date(task.startAt || Date.now()); next.setDate(next.getDate() + (task.recurrenceRule === 'weekly' ? 7 : 1))
      nextTasks.push({ ...task, id: crypto.randomUUID(), status: 'todo', startAt: next.toISOString(), dueAt: next.toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    }
    commit({ ...data, tasks: nextTasks }, done ? '已完成，已生成下一次任务' : '已恢复未完成')
  }
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2200) }
  const onDropDate = (taskId: string, date: Date, minutes?: number) => { const t = data.tasks.find(x => x.id === taskId); if (!t) return; const blocks = taskBlocks(t); const block = blocks[0]; const start = block ? new Date(block.startAt) : new Date(); const end = block ? new Date(block.endAt) : new Date(start.getTime() + (t.estimatedDuration || data.settings.defaultTaskDuration) * 60000); date.setHours(minutes === undefined ? start.getHours() : Math.floor(minutes / 60), minutes === undefined ? start.getMinutes() : minutes % 60, 0, 0); const moved = { id: block?.id || crypto.randomUUID(), taskId: t.id, startAt: date.toISOString(), endAt: new Date(date.getTime() + Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)) * 60000).toISOString() }; const next = withTaskBlocks(t, [moved, ...blocks.filter(item => item.id !== moved.id)]); commit({ ...data, tasks: data.tasks.map(item => item.id === taskId ? next : item) }, minutes === undefined ? '已调整日期' : `已调整到 ${pad(date.getHours())}:${pad(date.getMinutes())}`) }
  const blocksOverlap = (a: TimeBlock, b: TimeBlock) => new Date(a.startAt).getTime() < new Date(b.endAt).getTime() && new Date(b.startAt).getTime() < new Date(a.endAt).getTime()
  const dependencyBlock = (task: Task) => (task.dependencyIds || []).map(id => data.tasks.find(item => item.id === id)).filter((item): item is Task => Boolean(item && item.status !== 'done' && item.status !== 'cancelled'))
  const commitScheduledBlock = (taskId: string, start: Date, duration: number, blockId?: string) => {
    const task = data.tasks.find(item => item.id === taskId)
    if (!task) return
    const blocked = dependencyBlock(task)
    if (blocked.length) { flash(`请先完成依赖任务：${blocked.map(item => item.title).join('、')}`); return }
    const end = new Date(start.getTime() + Math.max(15, duration) * 60000)
    const block: TimeBlock = { id: blockId || crypto.randomUUID(), taskId, startAt: start.toISOString(), endAt: end.toISOString() }
    const allBlocks = data.tasks.flatMap(item => taskBlocks(item)).filter(item => item.id !== blockId)
    const conflict = allBlocks.some(item => blocksOverlap(block, item))
    const nextTask = withTaskBlocks(task, blockId ? [...taskBlocks(task).filter(item => item.id !== blockId), block] : [...taskBlocks(task), block])
    commit({ ...data, tasks: data.tasks.map(item => item.id === taskId ? nextTask : item) }, conflict ? '已安排，但与已有时间块重叠' : '已安排时间')
  }
  const scheduleTask = (taskId: string, date: Date, minutes: number) => {
    const task = data.tasks.find(item => item.id === taskId)
    if (!task) return
    const duration = remainingMinutes(task) || data.settings.defaultTaskDuration
    const start = new Date(date)
    start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    commitScheduledBlock(taskId, start, duration)
  }
  const moveBlock = (blockId: string, date: Date, minutes: number) => {
    const owner = data.tasks.find(item => taskBlocks(item).some(block => block.id === blockId))
    const block = owner && taskBlocks(owner).find(item => item.id === blockId)
    if (!owner || !block) return
    const duration = Math.max(15, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60000))
    const start = new Date(date)
    start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
    commitScheduledBlock(owner.id, start, duration, blockId)
  }
  const resizeBlock = (blockId: string, edge: 'start' | 'end', minute: number) => {
    const owner = data.tasks.find(item => taskBlocks(item).some(block => block.id === blockId))
    const block = owner && taskBlocks(owner).find(item => item.id === blockId)
    if (!owner || !block) return
    const currentStart = new Date(block.startAt)
    const currentEnd = new Date(block.endAt)
    const dayStart = new Date(currentStart)
    dayStart.setHours(0, 0, 0, 0)
    const snapped = Math.max(0, Math.min(1440, Math.round(minute / 15) * 15))
    const target = new Date(dayStart.getTime() + snapped * 60000)
    const nextStart = edge === 'start' ? (target.getTime() < currentEnd.getTime() - 15 * 60000 ? target : new Date(currentEnd.getTime() - 15 * 60000)) : currentStart
    const nextEnd = edge === 'end' ? (target.getTime() > currentStart.getTime() + 15 * 60000 ? target : new Date(currentStart.getTime() + 15 * 60000)) : currentEnd
    const resized = { ...block, startAt: nextStart.toISOString(), endAt: nextEnd.toISOString() }
    const nextTask = withTaskBlocks(owner, taskBlocks(owner).map(item => item.id === blockId ? resized : item))
    commit({ ...data, tasks: data.tasks.map(item => item.id === owner.id ? nextTask : item) }, `计划时长已调整为 ${Math.round((nextEnd.getTime() - nextStart.getTime()) / 60000)} 分钟`)
  }
  const removeBlock = (blockId: string) => {
    const owner = data.tasks.find(item => taskBlocks(item).some(block => block.id === blockId))
    if (!owner) return
    const nextTask = withTaskBlocks(owner, taskBlocks(owner).filter(block => block.id !== blockId))
    commit({ ...data, tasks: data.tasks.map(item => item.id === owner.id ? nextTask : item) }, '已移除时间安排')
  }
  const updateEstimatedDuration = (taskId: string, duration: number) => {
    const safeDuration = Math.max(15, Math.round(duration / 15) * 15)
    updateTask(taskId, { estimatedDuration: safeDuration }, `预计工时已更新为 ${safeDuration} 分钟`)
  }
  const undo = () => { const previous = history.at(-1); if (!previous) return; setHistory(history.slice(0, -1)); setFuture([data, ...future]); setData(previous); flash('已撤销') }
  const redo = () => { const next = future[0]; if (!next) return; setFuture(future.slice(1)); setHistory([...history, data]); setData(next); flash('已重做') }
  const batchDelete = () => { if (!selectedIds.length || !window.confirm(`确定删除已选择的 ${selectedIds.length} 项任务吗？`)) return; commit({ ...data, tasks: data.tasks.filter(t => !selectedIds.includes(t.id)) }, `已删除 ${selectedIds.length} 项`); setSelectedIds([]) }
  const batchComplete = () => { if (!selectedIds.length) return; commit({ ...data, tasks: data.tasks.map(t => selectedIds.includes(t.id) ? { ...t, status: 'done' as const, updatedAt: new Date().toISOString() } : t) }, `已完成 ${selectedIds.length} 项`); setSelectedIds([]) }
  const batchApply = () => {
    if (!selectedIds.length || (!batchCategoryId && !batchDate)) return
    const nextTasks = data.tasks.map(task => {
      if (!selectedIds.includes(task.id)) return task
      const next = { ...task, updatedAt: new Date().toISOString() }
      if (batchCategoryId) next.categoryId = batchCategoryId
      if (batchDate) {
        const sourceBlock = taskBlocks(task)[0]
        const source = sourceBlock ? new Date(sourceBlock.startAt) : task.startAt ? new Date(task.startAt) : new Date()
        const target = new Date(`${batchDate}T00:00:00`)
        target.setHours(source.getHours(), source.getMinutes(), 0, 0)
        const duration = sourceBlock ? new Date(sourceBlock.endAt).getTime() - new Date(sourceBlock.startAt).getTime() : task.dueAt && task.startAt ? new Date(task.dueAt).getTime() - new Date(task.startAt).getTime() : (task.estimatedDuration || data.settings.defaultTaskDuration) * 60000
        const moved = { id: sourceBlock?.id || crypto.randomUUID(), taskId: task.id, startAt: target.toISOString(), endAt: new Date(target.getTime() + duration).toISOString() }
        next.scheduleBlocks = withTaskBlocks(task, [moved, ...taskBlocks(task).filter(block => block.id !== moved.id)]).scheduleBlocks
        next.startAt = moved.startAt
        next.dueAt = moved.endAt
      }
      return next
    })
    commit({ ...data, tasks: nextTasks }, `已批量更新 ${selectedIds.length} 项`)
    setBatchCategoryId('')
    setBatchDate('')
    setSelectedIds([])
  }
  const toggleTheme = () => { const nextTheme = data.settings.theme === 'dark' ? 'light' : 'dark'; setData({ ...data, settings: { ...data.settings, theme: nextTheme } }); setThemePulse(true); window.setTimeout(() => setThemePulse(false), 220); flash(nextTheme === 'dark' ? '已切换深色模式' : '已切换浅色模式') }
  const handleTaskClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => { const target = event.target as HTMLElement; const id = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId; if (!id || (!event.ctrlKey && !event.metaKey && !event.shiftKey)) return; event.preventDefault(); event.stopPropagation(); const index = visibleTasks.findIndex(t => t.id === id); if (event.shiftKey && selectionAnchor) { const anchor = visibleTasks.findIndex(t => t.id === selectionAnchor); const [from, to] = [Math.min(anchor, index), Math.max(anchor, index)]; setSelectedIds(visibleTasks.slice(from, to + 1).map(t => t.id)) } else setSelectedIds(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]); setSelectionAnchor(id) }
  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => { const target = event.target as HTMLElement; const id = target.closest<HTMLElement>('[data-task-id]')?.dataset.taskId; if (!id) return; event.preventDefault(); setContextMenu({ taskId: id, x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 180) }); if (!selectedIds.includes(id)) setSelectedIds([id]) }

  const contextTask = contextMenu ? data.tasks.find(t => t.id === contextMenu.taskId) : undefined
  return <div className={`app theme-${data.settings.theme === 'system' ? 'light' : data.settings.theme} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} onClickCapture={handleTaskClickCapture} onContextMenu={handleContextMenu} onClick={() => { if (contextMenu) setContextMenu(null) }}>
    <aside className={`sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar-head"><div className="brand"><div className="brand-mark">D</div><div className="brand-copy"><strong>D-Asst</strong><span>让计划自然发生</span></div></div><button className="sidebar-toggle" onClick={() => setSidebarCollapsed(value => !value)} title={sidebarCollapsed ? '展开侧边栏' : '收缩侧边栏'} aria-label={sidebarCollapsed ? '展开侧边栏' : '收缩侧边栏'}>{sidebarCollapsed ? '›' : '‹'}</button></div>
      <button className="quick-add" onClick={() => setModal({ date: selectedDate })} title="快速添加任务"><span>＋</span><b>快速添加任务</b><kbd>Ctrl N</kbd></button>
      <nav>{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => navigateTo(item.id)} title={item.label}><i>{item.icon}</i><span className="nav-label">{item.label}</span></button>)}</nav>
      <div className="sidebar-bottom"><button onClick={() => navigateTo('settings')} className={view === 'settings' ? 'active' : ''} title={view === 'settings' ? '返回原页面' : '打开设置'}><i>⚙</i><span className="nav-label">设置</span></button><div className="watermark">D-Asst · DESIGN PREVIEW</div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="eyebrow">{view === 'dashboard' ? '今天' : nav.find(n => n.id === view)?.label || '设置'}</span><span className="title-english">{viewEnglish[view]}</span><h1>{viewTitle(view, selectedDate)}</h1></div><div className="top-actions"><label className="search"><span>⌕</span><input placeholder="搜索任务" value={search} onChange={e => setSearch(e.target.value)} /></label><button className={`icon-button ${themePulse ? 'feedback' : ''}`} onClick={toggleTheme} title={data.settings.theme === 'dark' ? '切换浅色模式' : '切换深色模式'} aria-label={data.settings.theme === 'dark' ? '切换浅色模式' : '切换深色模式'} aria-pressed={data.settings.theme === 'dark'}>◐</button></div></header>
      {selectedIds.length > 0 && <div className="selection-toolbar"><strong>已选择 {selectedIds.length} 项</strong><select aria-label="批量修改分类" value={batchCategoryId} onChange={e => setBatchCategoryId(e.target.value)}><option value="">修改分类…</option>{data.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input aria-label="批量修改日期" type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} /><button disabled={!batchCategoryId && !batchDate} onClick={batchApply}>应用修改</button><button onClick={batchComplete}>标记完成</button><button onClick={batchDelete}>删除</button><button className="quiet" onClick={() => setSelectedIds([])}>取消选择</button></div>}
      <div className="content">{view === 'dashboard' && <Dashboard tasks={visibleTasks} categories={data.categories} onToggle={toggleTask} onOpen={task => setModal({ task })} onAdd={() => setModal({ date: selectedDate })} />}
        {view === 'quadrants' && <Quadrants tasks={visibleTasks} categories={data.categories} onToggle={toggleTask} onOpen={task => setModal({ task })} onDropQuadrant={(id, important, urgent) => updateTask(id, { important, urgent })} onAdd={() => setModal({ date: selectedDate })} />}
        {view === 'list' && <TaskBoard tasks={visibleTasks} categories={data.categories} onToggle={toggleTask} onOpen={task => setModal({ task })} onAdd={() => setModal({ date: selectedDate })} />}
        {view === 'day' && <DayPlannerView date={selectedDate} tasks={visibleTasks} categories={data.categories} defaultDuration={data.settings.defaultTaskDuration} onDate={setSelectedDate} onToggle={toggleTask} onOpen={task => setModal({ task })} onAdd={() => setModal({ date: selectedDate })} onSchedule={scheduleTask} onMoveBlock={moveBlock} onResizeBlock={resizeBlock} onRemoveBlock={removeBlock} onEditDuration={updateEstimatedDuration} />}
        {view === 'week' && <WeekTimelineViewV12 date={selectedDate} tasks={visibleTasks} categories={data.categories} onDate={setSelectedDate} onToggle={toggleTask} onOpen={task => setModal({ task })} onAdd={date => setModal({ date })} onDrop={onDropDate} />}
        {view === 'month' && <MonthView date={selectedDate} tasks={visibleTasks} categories={data.categories} onDate={setSelectedDate} onToggle={toggleTask} onOpen={task => setModal({ task })} onAdd={date => setModal({ date })} onDrop={onDropDate} />}
        {view === 'ai' && <AIImport categories={data.categories} onImport={newTasks => { setData({ ...data, tasks: [...newTasks, ...data.tasks] }); flash(`已导入 ${newTasks.length} 项任务`) }} />}
        {view === 'settings' && <Settings data={data} onChange={settings => setData({ ...data, settings })} onExport={() => download('d-asst-tasks.json', JSON.stringify(data, null, 2))} />}
      </div>
    </main>
    {contextMenu && contextTask && <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}><button onClick={() => { setModal({ task: contextTask }); setContextMenu(null) }}>编辑任务</button><button onClick={() => { toggleTask(contextTask); setContextMenu(null) }}>{contextTask.status === 'done' ? '取消完成' : '标记完成'}</button><button onClick={() => { const copy = makeTask({ ...contextTask, id: undefined, title: `${contextTask.title}（副本）`, source: 'manual' }); commit({ ...data, tasks: [copy, ...data.tasks] }, '已复制任务'); setContextMenu(null) }}>复制任务</button><button className="danger-menu" onClick={() => { if (window.confirm('确定删除这项任务吗？')) removeTask(contextTask.id); setContextMenu(null) }}>删除任务</button></div>}
    {modal && <TaskModalV12 task={modal.task} date={modal.date || selectedDate} categories={data.categories} tasks={data.tasks} defaultDuration={data.settings.defaultTaskDuration} onClose={() => setModal(null)} onSave={saveTask} onDelete={modal.task ? () => { removeTask(modal.task!.id); setModal(null) } : undefined} />}
    {toast && <div className="toast">✓ {toast}</div>}
  </div>
}

function viewTitle(view: ViewId, date: Date) { if (view === 'day') return `我的一天 · ${dateLabel(date)}`; if (view === 'week') return `我的一周 · ${date.getFullYear()}年${date.getMonth() + 1}月`; if (view === 'month') return `${date.getFullYear()}年 ${date.getMonth() + 1}月`; if (view === 'settings') return '偏好设置'; if (view === 'ai') return 'AI 任务导入'; return ({ dashboard: '工作台', quadrants: '事项 · 四象限', list: '事项 · 清单' } as Record<string, string>)[view] }
function download(name: string, content: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); a.download = name; a.click(); URL.revokeObjectURL(a.href) }

function Progress({ done, total }: { done: number; total: number }) { return <div className="progress-line"><div><strong>{done}</strong><span> / {total} 完成</span></div><div className="progress"><i style={{ width: `${total ? done / total * 100 : 0}%` }} /></div></div> }
function TaskRow({ task, category: _category, onToggle, onOpen }: { task: Task; category?: Category; onToggle: (t: Task) => void; onOpen: (t: Task) => void }) { return <div className={`task-row ${task.status === 'done' ? 'completed' : ''}`} data-task-id={task.id} onClick={() => onOpen(task)}><button className="check" aria-label={task.status === 'done' ? '取消完成' : '标记完成'} onClick={e => { e.stopPropagation(); onToggle(task) }} /><div className="task-copy"><strong>{task.title}</strong><span>{task.recurrenceRule ? `重复：${task.recurrenceRule === 'daily' ? '每天' : '每周'}` : task.description || (task.startAt ? new Date(task.startAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '未安排时间')}</span></div>{task.important && <span className="priority-dot" title="重要" aria-label="重要" />}{task.urgent && <span className="priority-star" title="紧急" aria-label="紧急">★</span>}</div> }
function DateStrip({ date, onDate }: { date: Date; onDate: (d: Date) => void }) { const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(date); d.setDate(date.getDate() - ((date.getDay() + 6) % 7) + i); return d }); return <div className="date-strip">{days.map(d => <button key={dayKey(d)} className={dayKey(d) === dayKey(date) ? 'selected' : ''} onClick={() => onDate(d)}><span>{weekLabel[d.getDay()]}</span><b>{d.getDate()}</b>{dayKey(d) === dayKey(new Date()) && <em>今天</em>}</button>)}</div> }

function Dashboard({ tasks, categories, onToggle, onOpen, onAdd }: { tasks: Task[]; categories: Category[]; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onAdd: () => void }) { const now = new Date(); const today = tasks.filter(t => taskHasDate(t, now)); const done = today.filter(t => t.status === 'done').length; const nextReminder = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && firstTaskStart(t) && new Date(firstTaskStart(t)!).getTime() >= now.getTime()).sort((a, b) => new Date(firstTaskStart(a)!).getTime() - new Date(firstTaskStart(b)!).getTime())[0]; const nextStart = nextReminder ? firstTaskStart(nextReminder) : undefined; const dateStamp = `${weekLabel[now.getDay()]} · ${now.getMonth() + 1} 月 ${now.getDate()} 日`; return <div className="stack"><section className="hero-card"><div><span className="pill">{dateStamp}</span><h2>把注意力放回<br /><i>下一件重要的事。</i></h2><p>今天有 {today.length} 项计划，其中 {today.filter(t => t.status !== 'done').length} 项等待你的专注。</p></div><div className="hero-orbit"><span>今日<br /><b>{done}/{today.length || 0}</b></span></div></section><section className="metrics"><div><span>今日完成</span><strong>{done}<small>/{today.length || 0}</small></strong><Progress done={done} total={today.length} /></div><div><span>最重要的事</span><strong>{tasks.filter(t => t.important && t.status !== 'done').length}</strong><p>保持节奏，先做一件。</p></div><div><span>下一个提醒</span><strong>{nextStart ? new Date(nextStart).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—'}</strong><p>{nextReminder?.title || '暂无安排'}</p></div></section><section className="panel"><div className="section-head"><div><span className="eyebrow">UP NEXT</span><h3>接下来</h3></div><button className="text-button" onClick={onAdd}>＋ 新任务</button></div>{today.slice(0, 5).map(t => <TaskRow key={t.id} task={t} category={categories.find(c => c.id === t.categoryId)} onToggle={onToggle} onOpen={onOpen} />)}{today.length === 0 && <Empty text="今天还没有安排，给自己留一点空间。" onAdd={onAdd} />}</section></div> }

function Quadrants({ tasks, categories, onToggle, onOpen, onDropQuadrant, onAdd }: { tasks: Task[]; categories: Category[]; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onDropQuadrant: (id: string, important: boolean, urgent: boolean) => void; onAdd: () => void }) { const groups = [{ title: 'Ⅰ 重要且紧急', i: true, u: true, className: 'q-red' }, { title: 'Ⅱ 重要不紧急', i: true, u: false, className: 'q-amber' }, { title: 'Ⅲ 不重要但紧急', i: false, u: true, className: 'q-teal' }, { title: 'Ⅳ 不重要不紧急', i: false, u: false, className: 'q-blue' }]; return <div className="quadrants">{groups.map(g => <section key={g.title} className={`quadrant ${g.className}`} onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('text/plain'); if (id) onDropQuadrant(id, g.i, g.u) }}><div className="section-head"><h3>{g.title}</h3><button className="plus" onClick={onAdd}>＋</button></div>{tasks.filter(t => t.important === g.i && t.urgent === g.u && t.status !== 'cancelled').map(t => <div draggable key={t.id} onDragStart={e => e.dataTransfer.setData('text/plain', t.id)}><TaskRow task={t} category={categories.find(c => c.id === t.categoryId)} onToggle={onToggle} onOpen={onOpen} /></div>)}{!tasks.some(t => t.important === g.i && t.urgent === g.u) && <Empty text="当前暂无事项" onAdd={onAdd} />}</section>)}</div> }

function TaskBoard({ tasks, categories, onToggle, onOpen, onAdd }: { tasks: Task[]; categories: Category[]; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onAdd: () => void }) { return <div className="board">{[{ id: 'all', name: '全部', color: '#465c47' }, ...categories].map(c => <section className="board-column" key={c.id}><div className="section-head"><div><span className="category-dot" style={{ background: c.color }} /><h3>{c.name}</h3></div><button className="plus" onClick={onAdd}>＋</button></div>{tasks.filter(t => c.id === 'all' || t.categoryId === c.id).map(t => <TaskRow key={t.id} task={t} category={categories.find(x => x.id === t.categoryId)} onToggle={onToggle} onOpen={onOpen} />)}{!tasks.some(t => c.id === 'all' || t.categoryId === c.id) && <Empty text="当前暂无事项" onAdd={onAdd} />}</section>)}</div> }

function DayView({ date, tasks, categories, onDate, onToggle, onOpen, onAdd }: { date: Date; tasks: Task[]; categories: Category[]; onDate: (d: Date) => void; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onAdd: () => void }) { const day = tasks.filter(t => sameDay(t.startAt || t.dueAt, date)); const done = day.filter(t => t.status === 'done').length; return <div className="stack"><DateStrip date={date} onDate={onDate} /><section className="panel"><div className="section-head"><div><span className="eyebrow">MY DAY</span><h3>{dateLabel(date)} · {done}/{day.length} 完成</h3></div><button className="primary-button" onClick={onAdd}>＋ 添加任务</button></div>{day.sort((a, b) => (a.startAt || '').localeCompare(b.startAt || '')).map(t => <TaskRow key={t.id} task={t} category={categories.find(c => c.id === t.categoryId)} onToggle={onToggle} onOpen={onOpen} />)}{!day.length && <Empty text="这一天还没有任务。" onAdd={onAdd} />}</section></div> }

function formatMinutes(minutes: number) { if (minutes < 60) return `${minutes} 分钟`; const hours = Math.floor(minutes / 60); const rest = minutes % 60; return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时` }
function DayPlannerView({ date, tasks, categories, defaultDuration, onDate, onToggle, onOpen, onAdd, onSchedule, onMoveBlock, onResizeBlock, onRemoveBlock, onEditDuration }: { date: Date; tasks: Task[]; categories: Category[]; defaultDuration: number; onDate: (d: Date) => void; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onAdd: () => void; onSchedule: (taskId: string, date: Date, minutes: number) => void; onMoveBlock: (blockId: string, date: Date, minutes: number) => void; onResizeBlock: (blockId: string, edge: 'start' | 'end', minute: number) => void; onRemoveBlock: (blockId: string) => void; onEditDuration: (taskId: string, duration: number) => void }) {
  const [poolSearch, setPoolSearch] = useState('')
  const [poolCategory, setPoolCategory] = useState('all')
  const [poolSort, setPoolSort] = useState<'due' | 'priority' | 'duration' | 'created'>('due')
  const [collapsed, setCollapsed] = useState(false)
  const [preview, setPreview] = useState<{ minute: number; duration: number } | null>(null)
  const [resizeDraft, setResizeDraft] = useState<{ blockId: string; edge: 'start' | 'end'; startMinute: number; endMinute: number } | null>(null)
  const slotHeight = 20
  const slots = Array.from({ length: 96 }, (_, index) => index * 15)
  const parentIds = new Set(tasks.filter(task => task.parentTaskId).map(task => task.parentTaskId!))
  const effectiveTasks = tasks.filter(task => !parentIds.has(task.id))
  const dateBlocks = effectiveTasks.flatMap(task => taskBlocks(task).filter(block => sameDay(block.startAt, date)).map(block => ({ task, block })))
  const assignedMinutes = dateBlocks.reduce((sum, item) => sum + Math.max(0, Math.round((new Date(item.block.endAt).getTime() - new Date(item.block.startAt).getTime()) / 60000)), 0)
  const occupiedIntervals = dateBlocks.map(item => [new Date(item.block.startAt).getTime(), new Date(item.block.endAt).getTime()] as [number, number]).sort((a, b) => a[0] - b[0])
  const occupiedMinutes = (() => { let total = 0; let start = occupiedIntervals[0]?.[0]; let end = occupiedIntervals[0]?.[1]; for (const [nextStart, nextEnd] of occupiedIntervals.slice(1)) { if (nextStart > end) { total += end - start; start = nextStart; end = nextEnd } else end = Math.max(end, nextEnd) } if (start !== undefined && end !== undefined) total += end - start; return total / 60000 })()
  const pendingPool = effectiveTasks.filter(task => task.status !== 'done' && task.status !== 'cancelled' && remainingMinutes(task) > 0).filter(task => poolCategory === 'all' || task.categoryId === poolCategory).filter(task => `${task.title} ${task.description}`.toLowerCase().includes(poolSearch.toLowerCase())).sort((a, b) => poolSort === 'priority' ? Number(b.important) + Number(b.urgent) * 2 - Number(a.important) - Number(a.urgent) * 2 : poolSort === 'duration' ? remainingMinutes(b) - remainingMinutes(a) : poolSort === 'created' ? b.createdAt.localeCompare(a.createdAt) : (a.dueAt || '9999').localeCompare(b.dueAt || '9999'))
  const minuteFromEvent = (event: React.DragEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(1425, Math.round(((event.clientY - rect.top) / slotHeight * 15) / 15) * 15)) }
  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>, block: TimeBlock, edge: 'start' | 'end') => {
    event.preventDefault()
    event.stopPropagation()
    const originalStart = new Date(block.startAt)
    const originalEnd = new Date(block.endAt)
    const startMinute = originalStart.getHours() * 60 + originalStart.getMinutes()
    const endMinute = originalEnd.getDate() === originalStart.getDate() ? originalEnd.getHours() * 60 + originalEnd.getMinutes() : 1440
    const originY = event.clientY
    let latest = { startMinute, endMinute }
    const updateDraft = (clientY: number) => {
      const delta = Math.round((clientY - originY) / slotHeight) * 15
      const nextStart = edge === 'start' ? Math.max(0, Math.min(startMinute + delta, endMinute - 15)) : startMinute
      const nextEnd = edge === 'end' ? Math.min(1440, Math.max(startMinute + 15, endMinute + delta)) : endMinute
      latest = { startMinute: nextStart, endMinute: nextEnd }
      setResizeDraft({ blockId: block.id, edge, ...latest })
    }
    const finish = () => {
      onResizeBlock(block.id, edge, edge === 'start' ? latest.startMinute : latest.endMinute)
      setResizeDraft(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
    }
    const cancel = () => {
      setResizeDraft(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
    }
    const move = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      updateDraft(moveEvent.clientY)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
  }
  const onTimelineDragOver = (event: React.DragEvent<HTMLDivElement>) => { event.preventDefault(); const rawMinute = minuteFromEvent(event); const taskId = event.dataTransfer.getData('application/x-dasst-task') || event.dataTransfer.getData('text/plain'); const blockId = event.dataTransfer.getData('application/x-dasst-block'); const task = taskId ? tasks.find(item => item.id === taskId) : undefined; const block = blockId ? tasks.flatMap(item => taskBlocks(item)).find(item => item.id === blockId) : undefined; const duration = block ? Math.max(15, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60000)) : task ? Math.max(15, remainingMinutes(task) || defaultDuration) : 30; const minute = Math.min(rawMinute, Math.max(0, 1440 - duration)); setPreview({ minute, duration }); event.dataTransfer.dropEffect = 'move' }
  const onTimelineDrop = (event: React.DragEvent<HTMLDivElement>) => { event.preventDefault(); const minute = preview?.minute ?? minuteFromEvent(event); const taskId = event.dataTransfer.getData('application/x-dasst-task') || event.dataTransfer.getData('text/plain'); const blockId = event.dataTransfer.getData('application/x-dasst-block'); if (taskId && !blockId) onSchedule(taskId, date, minute); else if (blockId) onMoveBlock(blockId, date, minute); setPreview(null) }
  const dateLabelShort = (value?: string) => value ? `${new Date(value).getMonth() + 1}月${new Date(value).getDate()}日` : '未设置'
  const isConflict = (block: TimeBlock) => dateBlocks.some(item => item.block.id !== block.id && item.block.taskId !== block.taskId && new Date(block.startAt).getTime() < new Date(item.block.endAt).getTime() && new Date(item.block.startAt).getTime() < new Date(block.endAt).getTime())
  return <div className="day-planner">
    <div className="day-planner-main">
      <div className="day-planner-toolbar"><button className="text-button" onClick={() => { const next = new Date(date); next.setDate(next.getDate() - 1); onDate(next) }}>‹ 前一天</button><div><span className="eyebrow">24 HOUR PLANNER</span><h2>{dateLabel(date)}</h2></div><button className="today-button" onClick={() => onDate(new Date())}>今天</button><button className="text-button" onClick={() => { const next = new Date(date); next.setDate(next.getDate() + 1); onDate(next) }}>后一天 ›</button><button className="primary-button" onClick={onAdd}>＋ 添加任务</button></div>
      <div className="day-workload"><div><span>已分配</span><strong>{formatMinutes(assignedMinutes)}</strong></div><div><span>实际占用</span><strong>{formatMinutes(Math.round(occupiedMinutes))}</strong></div><div><span>待安排</span><strong>{formatMinutes(pendingPool.reduce((sum, task) => sum + remainingMinutes(task), 0))}</strong></div><p>{dateBlocks.some(item => isConflict(item.block)) ? '存在重叠时间块，请检查安排。' : '拖动任务到任意 15 分钟时间格即可安排。'}</p></div>
      <div className="day-timeline-shell"><div className="day-timeline-axis">{slots.map(minute => <div key={minute} className="day-timeline-label">{minute % 60 === 0 ? clockLabel(minute) : ''}</div>)}</div><div className="day-timeline-body" onDragOver={onTimelineDragOver} onDragLeave={() => setPreview(null)} onDrop={onTimelineDrop}>{slots.map(minute => <div key={minute} className="day-timeline-slot" style={{ top: `${minute / 15 * slotHeight}px`, height: `${slotHeight}px` }} />)}{preview && <div className="day-timeline-preview" style={{ top: `${preview.minute / 15 * slotHeight}px`, height: `${Math.max(slotHeight, preview.duration / 15 * slotHeight)}px` }}>{clockLabel(preview.minute)}—{clockLabel(Math.min(1440, preview.minute + preview.duration))}</div>}{dateBlocks.map(({ task, block }) => { const start = new Date(block.startAt); const startMinute = start.getHours() * 60 + start.getMinutes(); const duration = Math.max(15, Math.round((new Date(block.endAt).getTime() - start.getTime()) / 60000)); const visualStartMinute = resizeDraft?.blockId === block.id ? resizeDraft.startMinute : startMinute; const visualEndMinute = resizeDraft?.blockId === block.id ? resizeDraft.endMinute : startMinute + duration; const visualDuration = Math.max(15, visualEndMinute - visualStartMinute); const resizeHandle = (edge: 'start' | 'end') => <button type="button" className={`timeline-resize-handle ${edge}`} aria-label={edge === 'start' ? '调整任务开始时间' : '调整任务结束时间'} onPointerDown={event => beginResize(event, block, edge)} onClick={event => event.stopPropagation()} />; return <div key={block.id} draggable data-task-id={task.id} className={`day-task-block ${task.status === 'done' ? 'completed' : ''} ${isConflict(block) ? 'conflict' : ''}`} style={{ top: `${visualStartMinute / 15 * slotHeight}px`, height: `${Math.max(32, visualDuration / 15 * slotHeight - 4)}px`, borderLeftColor: categories.find(category => category.id === task.categoryId)?.color }} onDragStart={event => { hideNativeDragPreview(event); event.currentTarget.classList.add('dragging'); event.dataTransfer.setData('application/x-dasst-block', block.id); event.dataTransfer.effectAllowed = 'move' }} onDragEnd={event => event.currentTarget.classList.remove('dragging')} onClick={() => onOpen(task)}>{resizeHandle('start')}<span>{clockLabel(visualStartMinute)}–{clockLabel(Math.min(1440, visualEndMinute))}</span><strong>{task.title}</strong><button className="day-task-remove" aria-label="移除时间安排" onClick={event => { event.stopPropagation(); onRemoveBlock(block.id) }}>×</button><button className="day-task-toggle" aria-label={task.status === 'done' ? '取消完成' : '标记完成'} onClick={event => { event.stopPropagation(); onToggle(task) }}>{task.status === 'done' ? '' : '○'}</button>{resizeHandle('end')}</div> })}</div></div>
    </div>
    <aside className={`unscheduled-panel ${collapsed ? 'collapsed' : ''}`}><div className="unscheduled-head"><div><span className="eyebrow">UNSCHEDULED</span><h3>未安排任务池 <small>{pendingPool.length}</small></h3></div><button className="panel-collapse" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? '展开任务池' : '折叠任务池'}>{collapsed ? '‹' : '›'}</button></div>{!collapsed && <><div className="pool-controls"><input placeholder="搜索任务" value={poolSearch} onChange={event => setPoolSearch(event.target.value)} /><select value={poolCategory} onChange={event => setPoolCategory(event.target.value)}><option value="all">全部分类</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select value={poolSort} onChange={event => setPoolSort(event.target.value as typeof poolSort)}><option value="due">按截止日期</option><option value="priority">按重要紧急</option><option value="duration">按剩余工时</option><option value="created">按创建时间</option></select></div><div className="pool-list">{pendingPool.map(task => <article key={task.id} className="pool-task" draggable onDragStart={event => { hideNativeDragPreview(event); event.dataTransfer.setData('application/x-dasst-task', task.id); event.dataTransfer.setData('text/plain', task.id); event.dataTransfer.effectAllowed = 'move' }} onClick={() => onOpen(task)}><div className="pool-task-top"><strong>{task.title}</strong><span className="pool-priority">{task.important && task.urgent ? '重要且紧急' : task.important ? '重要' : task.urgent ? '紧急' : ''}</span></div><div className="pool-task-meta"><span>预计 {formatMinutes(task.estimatedDuration || defaultDuration)}</span><span>已安排 {formatMinutes(scheduledMinutes(task))}</span><span className={task.dueAt && new Date(task.dueAt).getTime() - Date.now() < 2 * 86400000 ? 'due-soon' : ''}>截止 {dateLabelShort(task.dueAt)}</span></div><div className="pool-task-foot"><span className="category-name" style={{ color: categories.find(category => category.id === task.categoryId)?.color }}>{categories.find(category => category.id === task.categoryId)?.name || '未分类'}</span><label>剩余 <input type="number" min="15" step="15" value={remainingMinutes(task)} onChange={event => onEditDuration(task.id, Number(event.target.value) + scheduledMinutes(task))} /> 分钟</label></div></article>)}{!pendingPool.length && <div className="pool-empty">没有待安排任务<br /><small>已安排完成的任务会自动移出这里。</small></div>}</div></>}</aside>
  </div>
}

function WeekView({ date, tasks, categories, onDate, onToggle, onOpen, onAdd, onDrop }: { date: Date; tasks: Task[]; categories: Category[]; onDate: (d: Date) => void; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onAdd: (d: Date) => void; onDrop: (id: string, d: Date) => void }) { const start = new Date(date); start.setDate(date.getDate() - ((date.getDay() + 6) % 7)); const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d }); const today = new Date(); return <div className="stack"><div className="view-toolbar"><button className="text-button" onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 7); onDate(d) }}>‹ 上周</button><button className="today-button" onClick={() => onDate(new Date())}>回到本周</button><button className="text-button" onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 7); onDate(d) }}>下周 ›</button></div><div className="week-grid">{days.map(d => { const selected = dayKey(d) === dayKey(date); const distance = Math.min(dayDistance(d, date), 3); return <section key={dayKey(d)} className={`week-col distance-${distance} ${selected ? 'selected-col' : ''} ${dayKey(d) === dayKey(today) ? 'today-col' : ''}`} onClick={() => onDate(d)} onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('text/plain'); if (id) onDrop(id, d) }}><header><span>{weekLabel[d.getDay()]}</span><b>{d.getDate()}</b><button onClick={e => { e.stopPropagation(); onAdd(d) }}>＋</button></header>{tasks.filter(t => sameDay(t.startAt || t.dueAt, d)).map(t => <div key={t.id} draggable data-task-id={t.id} onDragStart={e => e.dataTransfer.setData('text/plain', t.id)} className={`week-task ${t.status === 'done' ? 'completed' : ''}`} style={{ borderLeftColor: categories.find(c => c.id === t.categoryId)?.color }} onClick={e => { e.stopPropagation(); onOpen(t) }}><span>{t.startAt ? new Date(t.startAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '全天'}</span><strong>{t.title}</strong><button className={`task-check ${t.status === 'done' ? 'filled' : ''}`} aria-label={t.status === 'done' ? '取消完成' : '标记完成'} onClick={e => { e.stopPropagation(); onToggle(t) }} /></div>)}</section> })}</div><p className="hint">拖动任务到其他日期即可重新安排；时间块以 15 分钟为默认粒度。</p></div> }

function WeekTimelineView({ date, tasks, categories, onDate, onToggle, onOpen, onAdd, onDrop }: { date: Date; tasks: Task[]; categories: Category[]; onDate: (d: Date) => void; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onAdd: (d: Date) => void; onDrop: (id: string, d: Date, minutes?: number) => void }) {
  const start = new Date(date); start.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  const today = new Date(); const startMinutes = 6 * 60; const endMinutes = 24 * 60; const slotHeight = 18
  const slots = Array.from({ length: (endMinutes - startMinutes) / 15 }, (_, i) => startMinutes + i * 15)
  const minuteOf = (block: TimeBlock) => { const d = new Date(block.startAt); return d.getHours() * 60 + d.getMinutes() }
  const durationOf = (block: TimeBlock) => Math.max(15, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60000 / 15) * 15)
  const slotTop = (minute: number) => Math.max(0, Math.min((endMinutes - startMinutes - 15) * slotHeight / 15, (minute - startMinutes) * slotHeight / 15))
  return <div className="stack"><div className="view-toolbar"><button className="text-button" onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 7); onDate(d) }}>‹ 上周</button><button className="today-button" onClick={() => onDate(new Date())}>回到本周</button><button className="text-button" onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 7); onDate(d) }}>下周 ›</button></div><div className="week-grid timeline-grid"><div className="timeline-axis"><div className="timeline-axis-head" />{slots.map(minute => <div key={minute} className="timeline-label">{minute % 60 === 0 ? `${pad(Math.floor(minute / 60))}:00` : ''}</div>)}</div>{days.map(d => { const selected = dayKey(d) === dayKey(date); const distance = Math.min(dayDistance(d, date), 3); const dayTasks = tasks.flatMap(task => taskBlocks(task).filter(block => sameDay(block.startAt, d)).map(block => ({ task, block }))); const workload = dayTasks.reduce((sum, item) => sum + durationOf(item.block), 0); return <section key={dayKey(d)} className={`timeline-column distance-${distance} ${selected ? 'selected-col' : ''} ${dayKey(d) === dayKey(today) ? 'today-col' : ''}`} onClick={() => onDate(d)}><header><span>{weekLabel[d.getDay()]}</span><b>{d.getDate()}</b><small>{formatMinutes(workload)}</small><button onClick={e => { e.stopPropagation(); onAdd(d) }}>＋</button></header><div className="timeline-body" onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('text/plain'); if (id) onDrop(id, d) }}>{slots.map(minute => <div key={minute} className="timeline-slot" style={{ top: `${(minute - startMinutes) * slotHeight / 15}px`, height: `${slotHeight}px` }} onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); const id = e.dataTransfer.getData('text/plain'); if (id) onDrop(id, d, minute) }} />)}{dayTasks.map(({ task, block }) => <div key={block.id} draggable data-task-id={task.id} onDragStart={e => e.dataTransfer.setData('text/plain', task.id)} className={`week-task timeline-task ${task.status === 'done' ? 'completed' : ''}`} style={{ top: `${slotTop(minuteOf(block))}px`, height: `${Math.max(28, durationOf(block) * slotHeight / 15 - 4)}px`, borderLeftColor: categories.find(c => c.id === task.categoryId)?.color }} onClick={e => { e.stopPropagation(); onOpen(task) }}><span>{new Date(block.startAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span><strong>{task.title}</strong><button className={`task-check ${task.status === 'done' ? 'filled' : ''}`} aria-label={task.status === 'done' ? '取消完成' : '标记完成'} onClick={e => { e.stopPropagation(); onToggle(task) }} /></div>)}</div></section> })}</div><p className="hint">拖动任务块到目标时间格；时间轴以 15 分钟为粒度。</p></div>
}

function MonthView({ date, tasks, categories, onDate, onToggle, onOpen, onAdd, onDrop }: { date: Date; tasks: Task[]; categories: Category[]; onDate: (d: Date) => void; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onAdd: (d: Date) => void; onDrop: (id: string, d: Date) => void }) { const first = new Date(date.getFullYear(), date.getMonth(), 1); const offset = (first.getDay() + 6) % 7; const cells = Array.from({ length: 42 }, (_, i) => new Date(date.getFullYear(), date.getMonth(), i - offset + 1)); return <div className="stack"><div className="view-toolbar"><button className="text-button" onClick={() => onDate(new Date(date.getFullYear(), date.getMonth() - 1, 1))}>‹ 上月</button><button className="today-button" onClick={() => onDate(new Date())}>回到本月</button><button className="text-button" onClick={() => onDate(new Date(date.getFullYear(), date.getMonth() + 1, 1))}>下月 ›</button></div><div className="month-grid">{['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(x => <div className="month-weekday" key={x}>{x}</div>)}{cells.map(d => <section key={dayKey(d)} className={`month-cell ${d.getMonth() !== date.getMonth() ? 'muted' : ''} ${dayKey(d) === dayKey(new Date()) ? 'today-cell' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('text/plain'); if (id) onDrop(id, d) }}><header><b>{d.getDate()}</b><button onClick={() => onAdd(d)}>＋</button></header>{tasks.filter(t => taskHasDate(t, d)).slice(0, 3).map(t => <div draggable data-task-id={t.id} key={t.id} className="month-task" style={{ background: categories.find(c => c.id === t.categoryId)?.color }} onDragStart={e => e.dataTransfer.setData('text/plain', t.id)} onClick={() => onOpen(t)}><span className={`month-state ${t.status === 'done' ? 'filled' : ''}`} aria-label={t.status === 'done' ? '取消完成' : '标记完成'} onClick={e => { e.stopPropagation(); onToggle(t) }} />{t.title}</div>)}</section>)}</div></div> }

function AIImport({ categories, onImport }: { categories: Category[]; onImport: (tasks: Task[]) => void }) {
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState<Task[]>([])
  const parse = () => {
    const lines = input.split(/\n|；|;/).map(x => x.trim()).filter(Boolean)
    setPreview(lines.map(line => makeTask({ title: line.replace(/[，,].*$/, ''), description: line, categoryId: line.includes('健身') ? 'exercise' : line.includes('阅读') ? 'life' : 'work', important: /重要|必须|截止/.test(line), urgent: /今天|明天|尽快|截止/.test(line), source: 'ai' })))
  }
  return <div className="ai-chat-layout">
    <section className="ai-chat-empty">
      <span className="ai-spark">✦</span>
      <h2>STAY WITH ME</h2>
      <p>描述你要完成的事情，我会先整理成可执行任务，再由你确认后写入本地。</p>
    </section>
    <section className="ai-composer">
      <label className="ai-composer-label">AI 任务导入</label>
      <textarea value={input} onChange={e => setInput(e.target.value)} placeholder={'例如：\n下周三之前交空间制冷作业\n每天晚上阅读十页书\n每天下午三点去健身'} />
      <div className="ai-composer-foot">
        <div className="ai-composer-actions"><button className="ai-chip" type="button">深度拆解</button><button className="ai-chip" type="button">本地解析</button></div>
        <button className="ai-send" type="button" disabled={!input.trim()} onClick={parse} aria-label="解析任务">↑</button>
      </div>
    </section>
    <div className="privacy-note ai-privacy">⌁ 默认只在本机解析。配置 AI Provider 后，发送前会明确提示。</div>
    {preview.length > 0 && <div className="preview ai-preview"><div className="section-head"><div><span className="eyebrow">PREVIEW</span><h3>解析预览 · {preview.length} 项</h3></div><span className="pill">待确认</span></div>{preview.map((t, i) => <div className="preview-row" key={t.id}><span>{i + 1}</span><input value={t.title} onChange={e => setPreview(p => p.map(x => x.id === t.id ? { ...x, title: e.target.value } : x))} /><select value={t.categoryId} onChange={e => setPreview(p => p.map(x => x.id === t.id ? { ...x, categoryId: e.target.value } : x))}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>)}<button className="primary-button wide" onClick={() => { onImport(preview); setPreview([]); setInput('') }}>确认导入</button></div>}
  </div>
}

function Settings({ data, onChange, onExport }: { data: AppData; onChange: (settings: AppData['settings']) => void; onExport: () => void }) { const settings = data.settings; return <div className="settings-grid"><section className="panel"><div className="section-head"><div><span className="eyebrow">PREFERENCES</span><h3>外观与行为</h3></div></div><div className="setting-row"><div><strong>主题</strong><span>保留 Light / Dark 变量模式</span></div><select value={settings.theme} onChange={e => onChange({ ...settings, theme: e.target.value as AppData['settings']['theme'] })}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div><div className="setting-row"><div><strong>关闭窗口</strong><span>首次询问后记住选择</span></div><select value={settings.closeBehavior} onChange={e => { const value = e.target.value as AppData['settings']['closeBehavior']; onChange({ ...settings, closeBehavior: value }); window.dAsst?.setCloseBehavior(value) }}><option value="ask">首次询问</option><option value="tray">最小化到托盘</option><option value="quit">直接退出</option></select></div><div className="setting-row"><div><strong>默认任务时长</strong><span>未填写预计工时时，任务池使用此时长</span></div><label className="setting-number"><input type="number" min="15" step="15" value={settings.defaultTaskDuration} onChange={e => onChange({ ...settings, defaultTaskDuration: Math.max(15, Number(e.target.value) || 30) })} /> 分钟</label></div><div className="setting-row"><div><strong>系统提醒</strong><span>任务开始前发送 Windows 通知</span></div><button className={`switch ${settings.notifications ? 'on' : ''}`} onClick={() => onChange({ ...settings, notifications: !settings.notifications })}><i /></button></div></section><section className="panel"><div className="section-head"><div><span className="eyebrow">DATA</span><h3>本地数据</h3></div></div><p className="settings-copy">任务默认保存在本机。AI 功能只有在你主动配置 Provider 并确认后才会发送内容。</p><button className="secondary-button" onClick={onExport}>导出 JSON 备份</button><div className="watermark-box">D-Asst · DESIGN PREVIEW<br /><small>公开发布版本保留水印</small></div></section></div> }

function TaskModal({ task, date, categories, tasks, defaultDuration, onClose, onSave, onDelete }: { task?: Task; date: Date; categories: Category[]; tasks: Task[]; defaultDuration: number; onClose: () => void; onSave: (task: Task) => void; onDelete?: () => void }) { const base = task || makeTask({ title: '', startAt: new Date(date).toISOString(), dueAt: new Date(date.getTime() + defaultDuration * 60000).toISOString(), estimatedDuration: defaultDuration }); const [draft, setDraft] = useState<Task>(base); const [saving, setSaving] = useState(false); const update = (patch: Partial<Task>) => setDraft({ ...draft, ...patch }); const submit = () => { if (saving || !draft.title.trim()) return; setSaving(true); window.setTimeout(() => onSave({ ...draft, title: draft.title.trim(), updatedAt: new Date().toISOString() }), 180); }; const parentOptions = tasks.filter(item => item.id !== draft.id); const dependencyOptions = tasks.filter(item => item.id !== draft.id && item.id !== draft.parentTaskId); return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{task ? 'EDIT TASK' : 'NEW TASK'}</span><h2>{task ? '编辑任务' : '新建任务'}</h2></div><button className="close" onClick={onClose}>×</button></div><label className="field-label">任务名称<input autoFocus value={draft.title} onChange={e => update({ title: e.target.value })} placeholder="写下你要推进的事" /></label><label className="field-label">备注<textarea value={draft.description} onChange={e => update({ description: e.target.value })} placeholder="可选，补充上下文" /></label><div className="field-grid"><label className="field-label">分类<select value={draft.categoryId} onChange={e => update({ categoryId: e.target.value })}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field-label">状态<select value={draft.status} onChange={e => update({ status: e.target.value as TaskStatus })}>{Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div><div className="field-grid"><label className="field-label">计划时间<input type="datetime-local" value={draft.startAt ? toInputDate(draft.startAt) : ''} onChange={e => update({ startAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} /></label><label className="field-label">截止时间<input type="datetime-local" value={draft.dueAt ? toInputDate(draft.dueAt) : ''} onChange={e => update({ dueAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} /></label></div><div className="field-grid"><label className="field-label">预计工时（分钟）<input type="number" min="15" step="15" value={draft.estimatedDuration || defaultDuration} onChange={e => update({ estimatedDuration: Math.max(15, Number(e.target.value) || defaultDuration) })} /></label><label className="field-label">父任务 / 阶段<select value={draft.parentTaskId || ''} onChange={e => update({ parentTaskId: e.target.value || undefined })}><option value="">独立任务</option>{parentOptions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div><div className="field-grid"><label className="field-label">前置依赖<select multiple value={draft.dependencyIds || []} onChange={e => update({ dependencyIds: Array.from(e.target.selectedOptions, option => option.value) })}>{dependencyOptions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className="field-help">按住 Ctrl / Command 可选择多个依赖。未完成依赖任务时，时间轴不会允许安排。</div></div><div className="flag-row"><label><input type="checkbox" checked={draft.important} onChange={e => update({ important: e.target.checked })} /> 重要</label><label><input type="checkbox" checked={draft.urgent} onChange={e => update({ urgent: e.target.checked })} /> 紧急</label><label><input type="checkbox" checked={Boolean(draft.recurrenceRule)} onChange={e => update({ recurrenceRule: e.target.checked ? 'daily' : undefined })} /> 每日重复</label><label className="reminder-field">提醒<select value={draft.reminderMinutes ?? ''} onChange={e => update({ reminderMinutes: e.target.value === '' ? undefined : Number(e.target.value) })}><option value="">不提醒</option><option value="0">准时</option><option value="5">提前 5 分钟</option><option value="10">提前 10 分钟</option><option value="30">提前 30 分钟</option></select></label></div><div className="modal-foot">{onDelete && <button className="danger-button" onClick={onDelete}>删除</button>}<div><button className="secondary-button" onClick={onClose} disabled={saving}>取消</button><button className={`primary-button save-button ${saving ? 'is-saving' : ''}`} disabled={!draft.title.trim() || saving} onClick={submit}>{saving ? <><i className="button-spinner" />保存中</> : '保存'}</button></div></div></div></div> }
function TaskModalV12({ task, date, categories, tasks, defaultDuration, onClose, onSave, onDelete }: { task?: Task; date: Date; categories: Category[]; tasks: Task[]; defaultDuration: number; onClose: () => void; onSave: (task: Task) => void; onDelete?: () => void }) {
  const base = task || makeTask({ title: '', startAt: new Date(date).toISOString(), dueAt: new Date(date.getTime() + defaultDuration * 60000).toISOString(), estimatedDuration: defaultDuration })
  const [draft, setDraft] = useState<Task>(base)
  const [saving, setSaving] = useState(false)
  const update = (patch: Partial<Task>) => setDraft({ ...draft, ...patch })
  const submit = () => { if (saving || !draft.title.trim()) return; setSaving(true); window.setTimeout(() => onSave({ ...draft, title: draft.title.trim(), updatedAt: new Date().toISOString() }), 180) }
  const parentOptions = tasks.filter(item => item.id !== draft.id)
  const dependencyOptions = tasks.filter(item => item.id !== draft.id && item.id !== draft.parentTaskId)
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{task ? 'EDIT TASK' : 'NEW TASK'}</span><h2>{task ? '编辑任务' : '新建任务'}</h2></div><button className="close" onClick={onClose}>×</button></div><label className="field-label">任务名称<input autoFocus value={draft.title} onChange={event => update({ title: event.target.value })} placeholder="写下你要推进的事" /></label><label className="field-label">备注<textarea value={draft.description} onChange={event => update({ description: event.target.value })} placeholder="可选，补充上下文" /></label><div className="field-grid"><label className="field-label">分类<select value={draft.categoryId} onChange={event => update({ categoryId: event.target.value })}>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="field-label">状态<select value={draft.status} onChange={event => update({ status: event.target.value as TaskStatus })}>{Object.entries(statusLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label></div><div className="field-grid"><DateTimeField label="计划时间" value={draft.startAt} onChange={value => update({ startAt: value })} /><DateTimeField label="截止时间" value={draft.dueAt} onChange={value => update({ dueAt: value })} /></div><div className="field-grid"><label className="field-label">预计工时（分钟）<input type="number" min="15" step="15" value={draft.estimatedDuration || defaultDuration} onChange={event => update({ estimatedDuration: Math.max(15, Number(event.target.value) || defaultDuration) })} /></label><label className="field-label">父任务 / 阶段<select value={draft.parentTaskId || ''} onChange={event => update({ parentTaskId: event.target.value || undefined })}><option value="">独立任务</option>{parentOptions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div><div className="field-grid"><label className="field-label">前置依赖<select multiple value={draft.dependencyIds || []} onChange={event => update({ dependencyIds: Array.from(event.target.selectedOptions, option => option.value) })}>{dependencyOptions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className="field-help">按住 Ctrl / Command 可选择多个依赖。未完成依赖任务时，时间轴不会允许安排。</div></div><div className="flag-row"><label><input type="checkbox" checked={draft.important} onChange={event => update({ important: event.target.checked })} /> 重要</label><label><input type="checkbox" checked={draft.urgent} onChange={event => update({ urgent: event.target.checked })} /> 紧急</label><label><input type="checkbox" checked={Boolean(draft.recurrenceRule)} onChange={event => update({ recurrenceRule: event.target.checked ? 'daily' : undefined })} /> 每日重复</label><label className="reminder-field">提醒<select value={draft.reminderMinutes ?? ''} onChange={event => update({ reminderMinutes: event.target.value === '' ? undefined : Number(event.target.value) })}><option value="">不提醒</option><option value="0">准时</option><option value="5">提前 5 分钟</option><option value="10">提前 10 分钟</option><option value="30">提前 30 分钟</option></select></label></div><div className="modal-foot">{onDelete && <button className="danger-button" onClick={onDelete}>删除</button>}<div><button className="secondary-button" onClick={onClose} disabled={saving}>取消</button><button className={`primary-button save-button ${saving ? 'is-saving' : ''}`} disabled={!draft.title.trim() || saving} onClick={submit}>{saving ? <><i className="button-spinner" />保存中</> : '保存'}</button></div></div></div></div>
}
function toInputDate(value: string) { const d = new Date(value); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
function DateTimeField({ label, value, onChange }: { label: string; value?: string; onChange: (value?: string) => void }) {
  const current = value ? new Date(value) : new Date()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const [month, setMonth] = useState(new Date(current.getFullYear(), current.getMonth(), 1))
  const [draftDate, setDraftDate] = useState(`${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`)
  const [hour, setHour] = useState(current.getHours())
  const [minute, setMinute] = useState(Math.round(current.getMinutes() / 15) * 15 >= 60 ? 45 : Math.round(current.getMinutes() / 15) * 15)
  const days = Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - ((month.getDay() + 6) % 7) + 1))
  const commit = (dateText = draftDate, nextHour = hour, nextMinute = minute) => { const [year, monthNumber, day] = dateText.split('-').map(Number); const next = new Date(year, monthNumber - 1, day, nextHour, nextMinute, 0, 0); setDraftDate(dateText); setHour(nextHour); setMinute(nextMinute); onChange(next.toISOString()) }
  useEffect(() => { if (!open) return; const closeIfOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }; document.addEventListener('pointerdown', closeIfOutside, true); return () => document.removeEventListener('pointerdown', closeIfOutside, true) }, [open])
  return <div ref={rootRef} className="field-label date-time-field"><span>{label}</span><div className="date-time-input"><input readOnly value={value ? toInputDate(value).replace('T', ' ') : '未设置'} onClick={() => setOpen(true)} /><button type="button" onClick={() => setOpen(value ? !open : true)} aria-label={`打开${label}`}>▣</button></div>{open && <div className="date-time-popover"><div className="date-time-head"><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><strong>{month.getFullYear()} 年 {month.getMonth() + 1} 月</strong><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div><div className="date-time-week">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div><div className="date-time-days">{days.map(day => { const text = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`; const selected = text === draftDate; return <button type="button" key={text} className={`${day.getMonth() === month.getMonth() ? '' : 'muted'} ${selected ? 'selected' : ''}`} onClick={() => commit(text)}>{day.getDate()}</button> })}</div><div className="date-time-controls"><select value={hour} onChange={event => { const next = Number(event.target.value); setHour(next); commit(draftDate, next, minute) }}>{Array.from({ length: 24 }, (_, index) => <option key={index} value={index}>{pad(index)} 时</option>)}</select><select value={minute} onChange={event => { const next = Number(event.target.value); setMinute(next); commit(draftDate, hour, next) }}>{[0, 15, 30, 45].map(value => <option key={value} value={value}>{pad(value)} 分</option>)}</select></div><div className="date-time-foot"><button type="button" onClick={() => commit(`${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`)}>今天</button><button type="button" onClick={() => { onChange(undefined); setOpen(false) }}>清除</button><button type="button" className="primary-button" onClick={() => setOpen(false)}>完成</button></div></div>}</div>
}
function Empty({ text, onAdd }: { text: string; onAdd: () => void }) { return <div className="empty"><span>○</span><p>{text}</p><button className="text-button" onClick={onAdd}>＋ 添加第一项</button></div> }

export default App

function WeekTimelineViewV12({ date, tasks, categories, onDate, onToggle, onOpen, onAdd, onDrop }: { date: Date; tasks: Task[]; categories: Category[]; onDate: (d: Date) => void; onToggle: (t: Task) => void; onOpen: (t: Task) => void; onAdd: (d: Date) => void; onDrop: (id: string, d: Date, minutes?: number) => void }) {
  const [preview, setPreview] = useState<{ day: string; minute: number; duration: number } | null>(null)
  const [mode, setMode] = useState<'focus' | 'overview'>('focus')
  const gridRef = useRef<HTMLDivElement>(null)
  const start = new Date(date); start.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day })
  const today = new Date(); const startMinutes = mode === 'overview' ? 0 : 8 * 60; const endMinutes = 24 * 60; const slotHeight = mode === 'overview' ? 12 : 26
  const slots = Array.from({ length: (endMinutes - startMinutes) / 15 }, (_, index) => startMinutes + index * 15)
  const durationOf = (block: TimeBlock) => Math.max(15, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60000 / 15) * 15)
  const durationForTask = (task: Task) => { const block = taskBlocks(task)[0]; return block ? durationOf(block) : Math.max(15, Math.round((task.estimatedDuration || 60) / 15) * 15) }
  const slotTop = (minute: number) => Math.max(0, Math.min((endMinutes - startMinutes - 15) * slotHeight / 15, (minute - startMinutes) * slotHeight / 15))
  const previewAt = (event: React.DragEvent<HTMLDivElement>, day: Date, minute: number) => { event.preventDefault(); event.stopPropagation(); const task = tasks.find(item => item.id === readDragId(event)); if (task) setPreview({ day: dayKey(day), minute, duration: durationForTask(task) }); event.dataTransfer.dropEffect = 'move' }
  const dropAt = (event: React.DragEvent<HTMLDivElement>, day: Date, minute?: number) => { event.preventDefault(); event.stopPropagation(); const id = readDragId(event); if (id) onDrop(id, day, minute ?? preview?.minute); setPreview(null) }
  const shiftDay = (offset: number) => { const next = new Date(date); next.setDate(next.getDate() + offset); onDate(next) }
  useEffect(() => { if (mode !== 'focus') return; const selected = gridRef.current?.querySelector<HTMLElement>('.selected-col'); selected?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }) }, [date, mode])
  return <div className="stack"><div className="view-toolbar week-planner-toolbar"><button className="text-button" onClick={() => { const next = new Date(date); next.setDate(next.getDate() - 7); onDate(next) }}>‹ 上周</button><button className="today-button" onClick={() => onDate(new Date())}>回到本周</button><button className="text-button" onClick={() => { const next = new Date(date); next.setDate(next.getDate() + 7); onDate(next) }}>下周 ›</button><span className="week-toolbar-divider" /><button className="week-day-shift" onClick={() => shiftDay(-1)} aria-label="前一天">‹</button><button className="week-day-shift" onClick={() => shiftDay(1)} aria-label="后一天">›</button><div className="week-mode-switch" role="group" aria-label="周视图显示模式"><button className={mode === 'focus' ? 'active' : ''} onClick={() => setMode('focus')}>放大显示</button><button className={mode === 'overview' ? 'active' : ''} onClick={() => setMode('overview')}>整周预览</button></div></div><div ref={gridRef} className={`week-grid timeline-grid ${mode === 'overview' ? 'week-overview' : 'week-focus'}`}><div className="timeline-axis"><div className="timeline-axis-head" style={{ height: `${mode === 'overview' ? 132 : 176}px` }} />{slots.map(minute => <div key={minute} className="timeline-label">{minute % (mode === 'overview' ? 60 : 30) === 0 ? clockLabel(minute) : ''}</div>)}</div>{days.map(day => { const selected = dayKey(day) === dayKey(date); const distance = Math.min(dayDistance(day, date), 3); const dayTasks = tasks.flatMap(task => taskBlocks(task).filter(block => sameDay(block.startAt, day)).map(block => ({ task, block }))); const workload = dayTasks.reduce((sum, item) => sum + durationOf(item.block), 0); return <section key={dayKey(day)} className={`timeline-column distance-${distance} ${selected ? 'selected-col' : ''} ${dayKey(day) === dayKey(today) ? 'today-col' : ''}`} onClick={() => onDate(day)}><header onClick={event => { event.stopPropagation(); onDate(day) }} title="点击将这一天居中"><div className="timeline-day-label"><span>{weekLabel[day.getDay()]}</span><b>{day.getDate()}</b></div><small>{workload ? `已安排 ${formatMinutes(workload)}` : '暂无安排'}</small><button className="timeline-add" onClick={event => { event.stopPropagation(); onAdd(day) }} aria-label={`在${dateLabel(day)}添加任务`}>＋</button></header><div className="timeline-body" style={{ height: `${(endMinutes - startMinutes) / 15 * slotHeight}px` }} onDragOver={event => event.preventDefault()} onDragLeave={() => setPreview(null)} onDrop={event => dropAt(event, day)}>{slots.map(minute => <div key={minute} className={`timeline-slot ${preview?.day === dayKey(day) && preview.minute === minute ? 'drop-target' : ''}`} style={{ top: `${(minute - startMinutes) * slotHeight / 15}px`, height: `${slotHeight}px` }} onDragOver={event => previewAt(event, day, minute)} onDrop={event => dropAt(event, day, minute)} />)}{preview?.day === dayKey(day) && <div className="timeline-drop-preview" style={{ top: `${slotTop(preview.minute)}px`, height: `${Math.max(28, preview.duration * slotHeight / 15 - 4)}px` }}>{clockLabel(preview.minute)}—{clockLabel(Math.min(endMinutes, preview.minute + preview.duration))} · {formatMinutes(preview.duration)}</div>}{dayTasks.map(({ task, block }) => { const taskStart = new Date(block.startAt); const minute = taskStart.getHours() * 60 + taskStart.getMinutes(); return <div key={block.id} draggable data-task-id={task.id} onDragStart={event => { hideNativeDragPreview(event); event.currentTarget.classList.add('dragging'); event.dataTransfer.setData('application/x-dasst-task', task.id); event.dataTransfer.setData('text/plain', task.id); event.dataTransfer.effectAllowed = 'move' }} onDragEnd={event => event.currentTarget.classList.remove('dragging')} className={`week-task timeline-task ${task.status === 'done' ? 'completed' : ''}`} style={{ top: `${slotTop(minute)}px`, height: `${Math.max(28, durationOf(block) * slotHeight / 15 - 4)}px`, borderLeftColor: categories.find(category => category.id === task.categoryId)?.color }} onClick={event => { event.stopPropagation(); onOpen(task) }}><span>{taskStart.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span><strong>{task.title}</strong><button className={`task-check ${task.status === 'done' ? 'filled' : ''}`} aria-label={task.status === 'done' ? '取消完成' : '标记完成'} onClick={event => { event.stopPropagation(); onToggle(task) }} /></div> })}</div></section> })}</div><p className="hint">标题栏可点击居中日期；左右三角切换前后一天；可在右侧切换整周预览或放大显示。</p></div>
}
