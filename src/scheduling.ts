import type { AppData, Task, TimeBlock } from './types'

export const DEFAULT_TASK_DURATION = 30

const minutesBetween = (start: string, end: string) => Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))

export function taskBlocks(task: Task): TimeBlock[] {
  if (Array.isArray(task.scheduleBlocks)) return task.scheduleBlocks.filter(block => block.taskId === task.id && block.startAt && block.endAt)
  if (!task.startAt) return []
  const dueDuration = task.dueAt ? minutesBetween(task.startAt, task.dueAt) : 0
  // V1.0 used `dueAt` both as an end time and as a deadline. Treat multi-day
  // legacy ranges as deadlines so they do not become accidental 30-hour blocks.
  const end = task.dueAt && dueDuration <= 24 * 60
    ? task.dueAt
    : new Date(new Date(task.startAt).getTime() + (task.estimatedDuration || DEFAULT_TASK_DURATION) * 60000).toISOString()
  return [{ id: `legacy-${task.id}`, taskId: task.id, startAt: task.startAt, endAt: end }]
}

export function normalizeTask(task: Task): Task {
  const blocks = taskBlocks(task).map(block => ({ ...block, taskId: task.id }))
  const first = [...blocks].sort((a, b) => a.startAt.localeCompare(b.startAt))[0]
  const fallbackEstimate = blocks.reduce((sum, block) => sum + minutesBetween(block.startAt, block.endAt), 0) || DEFAULT_TASK_DURATION
  return {
    ...task,
    estimatedDuration: Math.max(15, task.estimatedDuration || fallbackEstimate),
    scheduleBlocks: blocks,
    startAt: first?.startAt,
    dueAt: first?.endAt
  }
}

export function normalizeData(data: AppData): AppData {
  const settings = data?.settings || {} as AppData['settings']
  return {
    ...data,
    categories: data?.categories || [],
    settings: {
      ...({ theme: 'system', closeBehavior: 'ask', notifications: true, timezone: 'Asia/Shanghai', defaultTaskDuration: DEFAULT_TASK_DURATION } as AppData['settings']),
      ...settings,
      defaultTaskDuration: settings.defaultTaskDuration || DEFAULT_TASK_DURATION
    },
    tasks: (data?.tasks || []).map(normalizeTask),
    notificationLog: data.notificationLog || {}
  }
}

export function withTaskBlocks(task: Task, blocks: TimeBlock[]): Task {
  const sorted = blocks.filter(block => block.taskId === task.id).sort((a, b) => a.startAt.localeCompare(b.startAt))
  const first = sorted[0]
  return { ...task, scheduleBlocks: sorted, startAt: first?.startAt, dueAt: first?.endAt, updatedAt: new Date().toISOString() }
}

export function scheduledMinutes(task: Task): number {
  return taskBlocks(task).reduce((sum, block) => sum + minutesBetween(block.startAt, block.endAt), 0)
}

export function remainingMinutes(task: Task): number {
  return Math.max((task.estimatedDuration || DEFAULT_TASK_DURATION) - scheduledMinutes(task), 0)
}

export function taskHasDate(task: Task, date: Date): boolean {
  return taskBlocks(task).some(block => {
    const start = new Date(block.startAt)
    const end = new Date(block.endAt)
    return start.toDateString() === date.toDateString() || end.toDateString() === date.toDateString()
  })
}

export function firstTaskStart(task: Task): string | undefined {
  return taskBlocks(task).sort((a, b) => a.startAt.localeCompare(b.startAt))[0]?.startAt
}
