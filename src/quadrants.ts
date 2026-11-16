import type { Task } from './types'

export type QuadrantId = 'q1' | 'q2' | 'q3' | 'q4'

export const quadrantOptions: { id: QuadrantId; label: string; shortLabel: string }[] = [
  { id: 'q1', label: 'Ⅰ 重要且紧急', shortLabel: '重要且紧急' },
  { id: 'q2', label: 'Ⅱ 重要不紧急', shortLabel: '重要不紧急' },
  { id: 'q3', label: 'Ⅲ 不重要但紧急', shortLabel: '不重要但紧急' },
  { id: 'q4', label: 'Ⅳ 不重要不紧急', shortLabel: '不重要不紧急' }
]

export function quadrantIdFor(task: Pick<Task, 'important' | 'urgent'>): QuadrantId {
  if (task.important && task.urgent) return 'q1'
  if (task.important) return 'q2'
  if (task.urgent) return 'q3'
  return 'q4'
}

export function quadrantFlags(id: QuadrantId): Pick<Task, 'important' | 'urgent'> {
  return {
    important: id === 'q1' || id === 'q2',
    urgent: id === 'q1' || id === 'q3'
  }
}

export function quadrantLabel(task: Pick<Task, 'important' | 'urgent'>): string {
  return quadrantOptions.find(option => option.id === quadrantIdFor(task))?.shortLabel || '不重要不紧急'
}
