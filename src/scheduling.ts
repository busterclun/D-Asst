import type { AppData, DatePlan, Task, TimeBlock } from './types'

export const DEFAULT_TASK_DURATION = 30

const minutesBetween = (start: string, end: string) => Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
const pad = (value: number) => String(value).padStart(2, '0')
export const dateKey = (value: Date | string) => {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function taskBlocks(task: Task): TimeBlock[] {
  if (Array.isArray(task.scheduleBlocks)) return task.scheduleBlocks.filter(block => block.taskId === task.id && block.startAt && block.endAt)
  if (!task.startAt || (!task.endAt && (!task.dueAt || task.datePlans))) return []
  const end = task.endAt || (task.dueAt && minutesBetween(task.startAt, task.dueAt) <= 24 * 60
    ? task.dueAt
    : new Date(new Date(task.startAt).getTime() + (task.estimatedDuration || DEFAULT_TASK_DURATION) * 60000).toISOString())
  return [{ id: `legacy-${task.id}`, taskId: task.id, startAt: task.startAt, endAt: end }]
}

const blockMinutes = (block: TimeBlock) => minutesBetween(block.startAt, block.endAt)

function normalizeDatePlans(task: Task, blocks: TimeBlock[]): DatePlan[] {
  const existing = Array.isArray(task.datePlans)
    ? task.datePlans.filter(plan => /^\d{4}-\d{2}-\d{2}$/.test(plan.date)).map(plan => ({ ...plan, minutes: plan.minutes === undefined ? undefined : Math.max(0, Math.round(plan.minutes)) }))
    : []
  if (existing.length) return existing
  const dates = [...new Set(blocks.map(block => dateKey(block.startAt)))]
  if (dates.length) return dates.map(date => ({ date }))
  return task.startAt ? [{ date: dateKey(task.startAt) }] : []
}

export function normalizeTask(task: Task): Task {
  const blocks = taskBlocks(task).map(block => ({ ...block, taskId: task.id }))
  const first = [...blocks].sort((a, b) => a.startAt.localeCompare(b.startAt))[0]
  const next: Task = {
    ...task,
    datePlans: normalizeDatePlans(task, blocks),
    scheduleBlocks: blocks,
    startAt: task.startAt || first?.startAt,
    endAt: task.endAt || first?.endAt
  }
  if (next.estimatedDuration !== undefined) next.estimatedDuration = Math.max(0, Math.round(next.estimatedDuration))
  return next
}

const recurringIdentity = (task: Task) => [
  task.title.trim().toLocaleLowerCase(), task.categoryId || '', task.recurrenceRule || '',
  task.description || '', task.important ? 'important' : '', task.urgent ? 'urgent' : '',
  task.estimatedDuration ?? ''
].join('|')

/**
 * Older builds created the next recurring record by copying the current
 * datePlans. Those records have a start date different from their only plan
 * date and therefore all render on the original day. Collapse only that
 * recognizable legacy shape; two intentionally-created recurring tasks with
 * matching dates are left alone.
 */
function isLegacyRecurringClone(task: Task): boolean {
  const plan = task.datePlans?.length === 1 ? task.datePlans[0].date : undefined
  return Boolean(task.recurrenceRule && plan && task.startAt && dateKey(task.startAt) !== plan)
}

function dedupeLegacyRecurringTasks(tasks: Task[]): Task[] {
  const output: Task[] = []
  const indexes = new Map<string, number>()
  for (const task of tasks) {
    if (!task.recurrenceRule || task.datePlans?.length !== 1) {
      output.push(task)
      continue
    }
    const key = `${recurringIdentity(task)}|${task.datePlans[0].date}`
    const previousIndex = indexes.get(key)
    if (previousIndex === undefined) {
      indexes.set(key, output.length)
      output.push(task)
      continue
    }
    const previous = output[previousIndex]
    const previousIsClone = isLegacyRecurringClone(previous)
    const currentIsClone = isLegacyRecurringClone(task)
    if (previousIsClone || currentIsClone) {
      // Prefer the canonical record whose start date agrees with its plan.
      if (previousIsClone && !currentIsClone) output[previousIndex] = task
      continue
    }
    // Matching canonical records may be intentional separate tasks.
    indexes.delete(key)
    output.push(task)
  }
  return output
}

export function normalizeData(data: AppData): AppData {
  const settings = data?.settings || {} as AppData['settings']
  return {
    ...data,
    categories: data?.categories || [],
    settings: {
      ...({ theme: 'system', closeBehavior: 'ask', notifications: true, timezone: 'Asia/Shanghai', defaultTaskDuration: DEFAULT_TASK_DURATION, dailyCapacityMinutes: 300 } as AppData['settings']),
      ...settings,
      defaultTaskDuration: settings.defaultTaskDuration || DEFAULT_TASK_DURATION,
      dailyCapacityMinutes: settings.dailyCapacityMinutes ?? 300
    },
    tasks: dedupeLegacyRecurringTasks((data?.tasks || []).map(normalizeTask)),
    notificationLog: data.notificationLog || {}
  }
}

export function withTaskBlocks(task: Task, blocks: TimeBlock[]): Task {
  const sorted = blocks.filter(block => block.taskId === task.id).sort((a, b) => a.startAt.localeCompare(b.startAt))
  const first = sorted[0]
  const dates = [...new Set(sorted.map(block => dateKey(block.startAt)))]
  const currentPlans = task.datePlans || []
  const datePlans = [...currentPlans]
  for (const date of dates) if (!datePlans.some(plan => plan.date === date)) datePlans.push({ date })
  return { ...task, scheduleBlocks: sorted, datePlans, startAt: first?.startAt, endAt: first?.endAt, updatedAt: new Date().toISOString() }
}

export function datePlansFor(task: Task): DatePlan[] {
  return task.datePlans || normalizeDatePlans(task, taskBlocks(task))
}

/** Exact blocks win over date-level estimates so one task is never counted twice. */
export function plannedMinutesForDate(task: Task, date: Date | string): number {
  const key = dateKey(date)
  const exact = taskBlocks(task).filter(block => dateKey(block.startAt) === key).reduce((sum, block) => sum + blockMinutes(block), 0)
  if (exact > 0) return exact
  const plans = datePlansFor(task).filter(plan => plan.date === key)
  if (!plans.length) return 0
  if (plans.some(plan => plan.minutes !== undefined)) return plans.reduce((sum, plan) => sum + (plan.minutes || 0), 0)
  return plans.length === 1 ? task.estimatedDuration || 0 : 0
}

export function plannedMinutesTotal(task: Task): number {
  const blocks = taskBlocks(task)
  if (blocks.length) return blocks.reduce((sum, block) => sum + blockMinutes(block), 0)
  const plans = datePlansFor(task)
  if (plans.some(plan => plan.minutes !== undefined)) return plans.reduce((sum, plan) => sum + (plan.minutes || 0), 0)
  return plans.length === 1 ? task.estimatedDuration || 0 : 0
}

export function scheduledMinutes(task: Task): number { return plannedMinutesTotal(task) }

export function remainingMinutes(task: Task): number {
  if (task.estimatedDuration === undefined) return 0
  return Math.max(task.estimatedDuration - plannedMinutesTotal(task), 0)
}

export function taskHasDate(task: Task, date: Date): boolean {
  const key = dateKey(date)
  return datePlansFor(task).some(plan => plan.date === key) || taskBlocks(task).some(block => dateKey(block.startAt) === key || dateKey(block.endAt) === key)
}

export function firstTaskStart(task: Task): string | undefined {
  return taskBlocks(task).sort((a, b) => a.startAt.localeCompare(b.startAt))[0]?.startAt
}

export function planTaskOnDate(task: Task, date: Date | string, minutes?: number): Task {
  const key = dateKey(date)
  const plans = datePlansFor(task).filter(plan => plan.date !== key)
  plans.push({ date: key, ...(minutes === undefined ? {} : { minutes: Math.max(0, Math.round(minutes)) }) })
  return { ...task, datePlans: plans, updatedAt: new Date().toISOString() }
}

export function moveTaskDate(task: Task, date: Date | string): Task {
  const target = new Date(`${dateKey(date)}T00:00:00`)
  const current = taskBlocks(task)
  const nextBlocks = current.map(block => {
    const oldStart = new Date(block.startAt)
    const oldEnd = new Date(block.endAt)
    const start = new Date(target); start.setHours(oldStart.getHours(), oldStart.getMinutes(), oldStart.getSeconds(), oldStart.getMilliseconds())
    const end = new Date(start.getTime() + Math.max(15, oldEnd.getTime() - oldStart.getTime()))
    return { ...block, startAt: start.toISOString(), endAt: end.toISOString() }
  })
  const existingPlan = datePlansFor(task)[0]
  const next = { ...task, datePlans: [{ date: dateKey(target), ...(existingPlan?.minutes === undefined ? {} : { minutes: existingPlan.minutes }) }], updatedAt: new Date().toISOString() }
  return nextBlocks.length ? withTaskBlocks(next, nextBlocks) : next
}

/** Deterministic local candidate generator for the AI date-level planning preview. */
export function suggestDatePlans(tasks: Task[], startDate: Date, horizonDays: number, capacityMinutes: number): Task[] {
  const loads = new Map<string, number>()
  const candidates = tasks.filter(task => task.status !== 'done' && task.status !== 'cancelled' && !datePlansFor(task).length)
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || Number(b.important) - Number(a.important) || (a.dueAt || '9999').localeCompare(b.dueAt || '9999'))
  const planned: Task[] = []
  for (const task of candidates) {
    if ((task.dependencyIds || []).some(id => tasks.some(item => item.id === id && item.status !== 'done' && item.status !== 'cancelled'))) continue
    const minutes = task.estimatedDuration
    let chosen: Date | undefined
    for (let index = 0; index < horizonDays; index += 1) {
      const date = new Date(startDate); date.setDate(startDate.getDate() + index)
      const key = dateKey(date)
      if (task.dueAt && key > dateKey(task.dueAt)) continue
      if (minutes === undefined || (loads.get(key) || 0) + minutes <= capacityMinutes) { chosen = date; break }
    }
    if (!chosen) continue
    const key = dateKey(chosen)
    if (minutes !== undefined) loads.set(key, (loads.get(key) || 0) + minutes)
    planned.push(planTaskOnDate(task, key))
  }
  return planned
}
