import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { test } from 'node:test'
const tempDir = '.tmp-v2-tests'
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'src/scheduling.ts', '--outDir', tempDir, '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--skipLibCheck', '--ignoreConfig'], { stdio: 'ignore' })
const scheduling = await import(new URL(`../${tempDir}/scheduling.js`, import.meta.url).href)
await rm(tempDir, { recursive: true, force: true })

const task = (overrides = {}) => ({ id: 'task-1', title: '阅读论文', description: '', categoryId: 'work', tags: [], important: false, urgent: false, status: 'todo', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', source: 'manual', ...overrides })

test('日期级安排保留日期、预计工时和截止时间，不生成时间块', () => {
  const item = task({ estimatedDuration: 180, dueAt: '2026-11-14T18:00:00.000Z', datePlans: [{ date: '2026-11-11' }] })
  assert.equal(scheduling.taskBlocks(item).length, 0)
  assert.equal(scheduling.plannedMinutesForDate(item, '2026-11-11'), 180)
  assert.equal(item.dueAt, '2026-11-14T18:00:00.000Z')
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
