import type { AppData, Category, Task } from './types'

const key = 'd-asst-data'
const now = new Date().toISOString()
const iso = (date: Date, hour = 9) => { const d = new Date(date); d.setHours(hour, 0, 0, 0); return d.toISOString() }

export const seedData: AppData = {
  categories: [
    { id: 'work', name: '工作', color: '#465c47' },
    { id: 'life', name: '生活', color: '#d98980' },
    { id: 'exercise', name: '锻炼', color: '#5b8c88' }
  ],
  settings: { theme: 'system', closeBehavior: 'ask', notifications: true, timezone: 'Asia/Shanghai' },
  tasks: []
}

const seedTasks = (): Task[] => {
  const today = new Date()
  const add = (title: string, categoryId: string, offset: number, hour: number, extra: Partial<Task> = {}): Task => {
    const day = new Date(today); day.setDate(today.getDate() + offset)
    return { id: crypto.randomUUID(), title, description: '', categoryId, tags: [], important: false, urgent: false, status: 'todo', createdAt: now, updatedAt: now, startAt: iso(day, hour), dueAt: iso(day, hour + 1), source: 'seed', ...extra }
  }
  return [
    add('整理今天的工作计划', 'work', 0, 8, { important: true, urgent: true, estimatedDuration: 30 }),
    add('复现数值论文 case', 'work', 0, 10, { important: true, estimatedDuration: 90 }),
    add('看会议 PPT', 'work', 0, 14, { important: true, estimatedDuration: 60 }),
    add('阅读十页书', 'life', 0, 20, { recurrenceRule: 'daily', estimatedDuration: 30 }),
    add('健身', 'exercise', 0, 15, { recurrenceRule: 'daily', important: true, estimatedDuration: 60 }),
    add('空间制冷作业', 'work', 2, 9, { important: true, urgent: true, dueAt: iso(new Date(today.getTime() + 3 * 86400000), 18) }),
    add('能源系统设计报告', 'work', 4, 9, { important: true, dueAt: iso(new Date(today.getTime() + 5 * 86400000), 18) }),
    add('流动反向整理', 'work', 1, 11, { important: true }),
    add('经费报销', 'work', 3, 16, { urgent: true }),
    add('周末采购', 'life', 5, 11)
  ]
}

seedData.tasks = seedTasks()

export async function loadData(): Promise<AppData> {
  try {
    const remote = await window.dAsst?.load()
    if (remote && typeof remote === 'object') return remote as AppData
  } catch { /* browser fallback */ }
  try {
    const local = localStorage.getItem(key)
    if (local) {
      const parsed = JSON.parse(local) as AppData
      if (parsed.tasks.length === 0 && localStorage.getItem(`${key}-seeded`) !== '1') {
        localStorage.setItem(`${key}-seeded`, '1')
        return structuredClone(seedData)
      }
      return parsed
    }
  } catch { /* ignore */ }
  localStorage.setItem(`${key}-seeded`, '1')
  return structuredClone(seedData)
}

export async function saveData(data: AppData) {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* ignore */ }
  try { await window.dAsst?.save(data) } catch { /* browser fallback */ }
}

export const makeTask = (partial: Partial<Task> & Pick<Task, 'title'>): Task => ({
  description: '', categoryId: 'work', tags: [], important: false, urgent: false,
  status: 'todo', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'manual', ...partial, id: partial.id || crypto.randomUUID()
})

export const categoriesFor = (categories: Category[], task: Task) => categories.find(c => c.id === task.categoryId)?.name || '未分类'
