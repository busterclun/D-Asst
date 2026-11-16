import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { test } from 'node:test'
const tempDir = '.tmp-v2-tests'
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'src/scheduling.ts', 'src/quadrants.ts', 'src/time.ts', '--outDir', tempDir, '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--skipLibCheck', '--ignoreConfig'], { stdio: 'ignore' })
const scheduling = await import(new URL(`../${tempDir}/scheduling.js`, import.meta.url).href)
const quadrants = await import(new URL(`../${tempDir}/quadrants.js`, import.meta.url).href)
const time = await import(new URL(`../${tempDir}/time.js`, import.meta.url).href)
await rm(tempDir, { recursive: true, force: true })

const task = (overrides = {}) => ({ id: 'task-1', title: '阅读论文', description: '', categoryId: 'work', tags: [], important: false, urgent: false, status: 'todo', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', source: 'manual', ...overrides })

test('日期级安排保留日期、预计工时和截止时间，不生成时间块', () => {
  const item = task({ estimatedDuration: 180, dueAt: '2026-11-14T18:00:00.000Z', datePlans: [{ date: '2026-11-11' }] })
  assert.equal(scheduling.taskBlocks(item).length, 0)
  assert.equal(scheduling.plannedMinutesForDate(item, '2026-11-11'), 180)
  assert.equal(item.dueAt, '2026-11-14T18:00:00.000Z')
})

test('旧版重复任务迁移后只保留同一条重复任务', () => {
  const base = task({ title: '健身', categoryId: 'exercise', recurrenceRule: 'daily', important: true, estimatedDuration: 60, startAt: '2026-11-11T07:00:00.000Z', endAt: '2026-11-11T08:00:00.000Z', datePlans: [{ date: '2026-11-11' }] })
  const legacyClone = { ...base, id: 'task-2', startAt: '2026-11-12T07:00:00.000Z', dueAt: '2026-11-12T07:00:00.000Z', createdAt: '2026-11-11T13:20:41.000Z' }
  const normalized = scheduling.normalizeData({ tasks: [base, legacyClone], categories: [], settings: {}, notificationLog: {} })
  assert.deepEqual(normalized.tasks.map(item => item.id), ['task-1'])
})

test('每日重复任务从计划日起每天展开，但数据库仍只有一条任务', () => {
  const item = task({ recurrenceRule: 'daily', estimatedDuration: 30, datePlans: [{ date: '2026-11-11' }] })
  assert.equal(scheduling.taskHasDate(item, new Date('2026-11-11T12:00:00+08:00')), true)
  assert.equal(scheduling.taskHasDate(item, new Date('2026-11-12T12:00:00+08:00')), true)
  assert.equal(scheduling.taskHasDate(item, new Date('2026-11-10T12:00:00+08:00')), false)
  assert.equal(scheduling.plannedMinutesForDate(item, '2026-11-12'), 30)
})

test('每日重复任务按日期独立完成，后续日期保持未完成', () => {
  const item = task({ recurrenceRule: 'daily', completedOccurrences: ['2026-11-12'], datePlans: [{ date: '2026-11-11' }] })
  assert.equal(scheduling.taskCompletedOnDate(item, '2026-11-12'), true)
  assert.equal(scheduling.taskCompletedOnDate(item, '2026-11-13'), false)
})

test('精确时间块覆盖同日日期级工时，不能重复计算', () => {
  const item = task({ estimatedDuration: 180, datePlans: [{ date: '2026-11-11' }], scheduleBlocks: [{ id: 'block-1', taskId: 'task-1', startAt: '2026-11-11T14:00:00.000Z', endAt: '2026-11-11T17:00:00.000Z' }] })
  assert.equal(scheduling.plannedMinutesForDate(item, '2026-11-11'), 180)
  assert.equal(scheduling.scheduledMinutes(item), 180)
})

test('跨日期计划按各自 minutes 统计，总量不重复', () => {
  const item = task({ estimatedDuration: 240, datePlans: [{ date: '2026-11-11', minutes: 120 }, { date: '2026-11-12', minutes: 120 }] })
  assert.equal(scheduling.plannedMinutesForDate(item, '2026-11-11'), 120)
  assert.equal(scheduling.plannedMinutesForDate(item, '2026-11-12'), 120)
  assert.equal(scheduling.scheduledMinutes(item), 240)
})

test('没有预计工时的日期计划可以保存，但不虚构工作量', () => {
  const item = task({ datePlans: [{ date: '2026-11-11' }] })
  assert.equal(scheduling.taskHasDate(item, new Date('2026-11-11T08:00:00+08:00')), true)
  assert.equal(scheduling.plannedMinutesForDate(item, '2026-11-11'), 0)
})

test('迁移日期时保留同一任务和原有时间段长度', () => {
  const item = task({ datePlans: [{ date: '2026-11-11' }], scheduleBlocks: [{ id: 'block-1', taskId: 'task-1', startAt: '2026-11-11T14:00:00.000Z', endAt: '2026-11-11T17:00:00.000Z' }] })
  const moved = scheduling.moveTaskDate(item, '2026-11-13')
  assert.equal(moved.id, item.id)
  assert.equal(moved.scheduleBlocks[0].startAt, '2026-11-13T14:00:00.000Z')
  assert.equal(moved.scheduleBlocks[0].endAt, '2026-11-13T17:00:00.000Z')
})

test('日期级 AI 候选遵守容量、截止日期和未完成依赖', () => {
  const start = new Date('2026-11-11T00:00:00+08:00')
  const blocked = task({ id: 'blocked', title: '网格划分', estimatedDuration: 120, dependencyIds: ['dependency'] })
  const dependency = task({ id: 'dependency', title: '前置准备', status: 'todo', estimatedDuration: 60 })
  const normal = task({ id: 'normal', title: '阅读论文', estimatedDuration: 180 })
  const result = scheduling.suggestDatePlans([blocked, dependency, normal], start, 2, 180)
  assert.deepEqual(result.map(item => item.id), ['dependency', 'normal'])
  assert.equal(result.every(item => !item.startAt && !item.endAt), true)
})

test('AI 四象限字段可以在四种归属之间双向转换', () => {
  const expected = {
    q1: { important: true, urgent: true },
    q2: { important: true, urgent: false },
    q3: { important: false, urgent: true },
    q4: { important: false, urgent: false }
  }
  for (const [id, flags] of Object.entries(expected)) {
    assert.deepEqual(quadrants.quadrantFlags(id), flags)
    assert.equal(quadrants.quadrantIdFor(flags), id)
  }
})

test('北京时间 19:40 的“等下十点”解析为当天 22:00', () => {
  const result = time.resolveNaturalTime('我等下十点要吃饭', new Date('2026-11-16T19:40:00+08:00'))
  assert.equal(result.time, '22:00')
  assert.equal(result.date, '2026-11-16')
  assert.equal(result.dayOffset, 0)
})

test('北京时间 23:40 的“等下一点”顺延为次日 01:00', () => {
  const result = time.resolveNaturalTime('我等下一点要休息', new Date('2026-11-16T23:40:00+08:00'))
  assert.equal(result.time, '01:00')
  assert.equal(result.date, '2026-11-17')
  assert.equal(result.dayOffset, 1)
})

test('所有界面时间统一输出二十四小时制', () => {
  assert.equal(time.formatTime24('2026-11-16T14:00:00.000Z'), '22:00')
})
