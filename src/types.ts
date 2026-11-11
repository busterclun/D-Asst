export type ViewId = 'dashboard' | 'quadrants' | 'list' | 'day' | 'week' | 'month' | 'planner' | 'ai' | 'settings'
export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled'

export interface Category { id: string; name: string; color: string }
export interface TimeBlock {
  id: string
  taskId: string
  startAt: string
  endAt: string
}
/** A date-level plan. Minutes are optional because a task may be assigned to a date without an estimate. */
export interface DatePlan {
  date: string
  minutes?: number
}
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
  /** Date-level planning, independent from exact time blocks and deadline. */
  datePlans?: DatePlan[]
  startAt?: string
  /** Exact execution block end. Kept separate from dueAt (deadline). */
  endAt?: string
  dueAt?: string
  estimatedDuration?: number
  scheduleBlocks?: TimeBlock[]
  /** Optional absolute reminder timestamp. reminderMinutes remains a relative legacy setting. */
  reminderAt?: string
  reminderMinutes?: number
  recurrenceRule?: string
  parentTaskId?: string
  dependencyIds?: string[]
  source: 'manual' | 'ai' | 'seed'
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  closeBehavior: 'ask' | 'tray' | 'quit'
  notifications: boolean
  timezone: string
  defaultTaskDuration: number
  /** Daily planning capacity used by date-level scheduling suggestions. */
  dailyCapacityMinutes?: number
}

export interface AIConfigPublic {
  providerName: string
  baseUrl: string
  model: string
  timeoutMs: number
  maxTokens: number
  temperature: number
  configured: boolean
}

export interface AIConfigInput {
  providerName: string
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  maxTokens: number
  temperature: number
}

export interface AppData {
  tasks: Task[]
  categories: Category[]
  settings: Settings
  /** Idempotency ledger for reminder instances; optional for V1.0 data compatibility. */
  notificationLog?: Record<string, string>
}
