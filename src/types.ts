export type ViewId = 'dashboard' | 'quadrants' | 'list' | 'day' | 'week' | 'month' | 'ai' | 'settings'
export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled'

export interface Category { id: string; name: string; color: string }
export interface Task {
  id: string
  title: string
  description: string
  categoryId: string
  tags: string[]
  important: boolean
  urgent: boolean
  status: TaskStatus
  createdAt: string
  updatedAt: string
  startAt?: string
  endAt?: string
  dueAt?: string
  estimatedDuration?: number
  reminderMinutes?: number
  recurrenceRule?: string
  parentTaskId?: string
  source: 'manual' | 'ai' | 'seed'
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  closeBehavior: 'ask' | 'tray' | 'quit'
  notifications: boolean
  timezone: string
}

export interface AppData {
  tasks: Task[]
  categories: Category[]
  settings: Settings
  /** Idempotency ledger for reminder instances; optional for V1.0 data compatibility. */
  notificationLog?: Record<string, string>
}
