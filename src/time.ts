const TIME_ZONE = 'Asia/Shanghai'

const partsInBeijing = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(value)
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value || 0)
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute') }
}

const pad = (value: number) => String(value).padStart(2, '0')

export const beijingDateKey = (value = new Date()) => {
  const parts = partsInBeijing(value)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

export const addDaysToDateKey = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00+08:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return beijingDateKey(date)
}

/** Always renders an unambiguous 24-hour clock in Beijing time. */
export const formatTime24 = (value: string | Date) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  hour12: false
}).format(typeof value === 'string' ? new Date(value) : value)

export const beijingDateTimeToIso = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`).toISOString()

export type NaturalTimeResolution = { time?: string; date?: string; dayOffset: number; relativeSoon: boolean }

/**
 * Parses a stated hour and resolves “等下/待会/稍后” to the nearest future occurrence.
 * Example: at 19:40, “等下十点” becomes 22:00 today rather than 10:00.
 */
export function resolveNaturalTime(text: string, now = new Date()): NaturalTimeResolution {
  const chinese = text.match(/(?:凌晨|晚上|明晚|今晚|下午|中午|上午|早上)?\s*(十二|十一|十|九|八|七|六|五|四|三|二|一)点(?:([0-5]\d)分?)?/)
  const numeric = text.match(/(?:凌晨|晚上|明晚|今晚|下午|中午|上午|早上)?\s*(\d{1,2})(?:点|:\s*)(\d{2})?/)
  const relativeSoon = /(等下|待会|一会儿|一会|稍后)/.test(text)
  if (!chinese && !numeric) return { dayOffset: 0, relativeSoon }

  const chineseHours: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 }
  let hour = chinese ? chineseHours[chinese[1]] : Number(numeric![1])
  const minute = Number(chinese?.[2] || numeric?.[2] || 0)
  const explicitEvening = /(晚上|明晚|今晚|下午|中午)/.test(text)
  const explicitMorning = /(凌晨|上午|早上)/.test(text)
  if (explicitEvening && hour < 12) hour += 12
  if (/凌晨/.test(text) && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return { dayOffset: 0, relativeSoon }

  let dayOffset = 0
  if (relativeSoon && !/(明天|明晚|后天)/.test(text)) {
    const current = partsInBeijing(now)
    const currentMinutes = current.hour * 60 + current.minute
    const candidates = explicitEvening || explicitMorning || hour === 0 || hour >= 13
      ? [hour]
      : hour === 12 ? [12] : [hour, hour + 12]
    const next = candidates.find(candidate => candidate * 60 + minute > currentMinutes)
    if (next === undefined) dayOffset = 1
    else hour = next
  }

  const date = addDaysToDateKey(beijingDateKey(now), dayOffset)
  return { time: `${pad(hour)}:${pad(minute)}`, date, dayOffset, relativeSoon }
}
