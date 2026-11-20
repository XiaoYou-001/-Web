import test from 'node:test'
import assert from 'node:assert/strict'
import { previewDayDelay } from '../src/utils/dayDelay.js'

const lunch = { title: '午饭', time: '12:00', durationMinutes: 60, travelMinutes: 20 }
const walk = { title: '公园', time: '13:30', durationMinutes: 30, travelMinutes: 15 }
const booking = { title: '博物馆', time: '14:45', durationMinutes: 60, timeLocked: true }

test('preview consumes slack, extends the current stay and shows the departure deadline without modifying activities', () => {
  const plan = [lunch, walk, booking]
  const before = structuredClone(plan)
  const result = previewDayDelay(plan, 0, 30)
  assert.equal(result.blocked, false)
  assert.deepEqual(result.rows.map(row => row.after), ['12:00', '13:50', '14:45'])
  assert.equal(result.rows[0].end, '13:30')
  assert.equal(result.rows[0].duration, 90)
  assert.equal(result.rows[2].leaveBy, '14:30')
  assert.equal(result.rows[2].maxPreviousStay, 40)
  assert.equal(result.rows[2].margin, 10)
  assert.deepEqual(plan, before)
})

test('a missed reservation remains fixed with its exact shortfall and cannot be confirmed', () => {
  const result = previewDayDelay([lunch, walk, booking], 0, 50)
  assert.equal(result.rows[2].after, '14:45')
  assert.equal(result.rows[2].margin, -10)
  assert.equal(result.blocked, true)
})

test('missing transfer estimates preserve the planned interval and distinguish zero travel', () => {
  const plan = [{ ...lunch, travelMinutes: null }, walk]
  const estimate = previewDayDelay(plan, 0, 30)
  assert.equal(estimate.rows[1].after, '14:00')
  assert.equal(estimate.warnings.length, 1)
  plan[0].travelMinutes = 0
  assert.equal(previewDayDelay(plan, 0, 30).rows[1].after, '13:30')
})

test('starting in the middle skips omitted activities and never reuses their inbound leg', () => {
  const plan = [walk, lunch, { ...walk, skipped: true }, booking]
  const result = previewDayDelay(plan, 1, 15)
  assert.deepEqual(result.rows.map(row => row.index), [1, 3])
  assert.equal(result.rows[1].leaveBy, undefined)
  assert.equal(result.warnings.length, 1)
})

test('missing anchor duration can be entered; invalid times, cross-day stays and invalid delay block changes', () => {
  const unknown = { ...lunch, durationMinutes: null }
  assert.ok(previewDayDelay([unknown], 0, 5).blocked)
  assert.equal(previewDayDelay([unknown], 0, 5, 60).rows[0].end, '13:05')
  for (const invalid of [0, -1, 1.5, '']) assert.ok(previewDayDelay([lunch], 0, invalid).blocked)
  assert.ok(previewDayDelay([{ ...lunch, time: '23:00' }], 0, 30).blocked)
  assert.ok(previewDayDelay([lunch, { ...walk, time: '下午' }], 0, 30).blocked)
})
