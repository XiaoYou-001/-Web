import test from 'node:test'
import assert from 'node:assert/strict'
import { todayItinerary } from '../src/utils/todayItinerary.js'

const base = { lifecycle: 'ready', startDate: '2030-10-03', endDate: '2030-10-04', timeZone: 'Asia/Tokyo' }
const run = (activities, now, otherDays = []) => todayItinerary({
  ...base, days: [{ date: base.startDate, activities }, ...otherDays]
}, new Date(now))

test('derives current, next and reservation from local clock, excludes skipped and completed rows', () => {
  const rows = [
    { title: '早餐', time: '08:00', durationMinutes: 40 }, { title: '迟到未勾', time: '09:00' },
    { title: '已跳过', time: '10:00', skipped: true }, { title: '午饭', time: '12:00', durationMinutes: 60 },
    { title: '公园', time: '13:15', travelMinutes: 20 }, { title: '博物馆', time: '14:00', timeLocked: true },
    { title: '已完成', time: '09:00', completed: true }, { title: '机动安排' }
  ]
  const state = run(rows, '2030-10-03T03:30:00Z')
  assert.equal(state.current.activity.title, '午饭')
  assert.equal(state.next.activity.title, '公园')
  assert.equal(state.nextBooking.activity.title, '博物馆')
  assert.deepEqual(state.latestDeparture, { from: '公园', time: '13:40' })
  assert.deepEqual(state.overdue.map(row => row.activity.title), ['迟到未勾', '早餐'])
  assert.equal(state.untimed[0].activity.title, '机动安排')
  assert.equal(state.inProgress, true)
  assert.equal(run(rows, '2030-10-03T04:00:00Z').current, null)
})

test('after local midnight a crossing stay remains current and future days never become today’s next stop', () => {
  const tomorrow = [{ date: base.endDate, activities: [{ title: '出发', time: '11:00' }] }]
  const rows = [{ title: '夜间游览', time: '23:50', durationMinutes: 40 }]
  const state = run(rows, '2030-10-03T15:01:00Z', tomorrow)
  assert.equal(state.date, base.endDate)
  assert.equal(state.current.activity.title, '夜间游览')
  assert.equal(state.next.activity.title, '出发')
  const evening = run(rows, '2030-10-03T14:59:00Z', tomorrow)
  assert.equal(evening.next, null)
  assert.equal(evening.nextOverall.activity.title, '出发')
})

test('a missing duration remains unconfirmed until a later timed stop begins or the local day ends', () => {
  const rows = [
    { title: '早市', time: '09:00', durationMinutes: null },
    { title: '跳过的展览', time: '10:00', skipped: true },
    { title: '午餐', time: '12:00', durationMinutes: 30 },
    { title: '公园', time: '13:00' }
  ]
  const morning = run(rows, '2030-10-03T02:45:00Z')
  assert.equal(morning.current.activity.title, '早市')
  assert.equal(morning.current.timingNote, '已到开始时间，结束待确认')
  assert.deepEqual(morning.overdue, [])
  const lunch = run(rows, '2030-10-03T03:00:00Z')
  assert.equal(lunch.current.activity.title, '午餐')
  assert.equal(lunch.current.timingNote, undefined)
  assert.equal(lunch.overdue[0].activity.title, '早市')
  assert.equal(run(rows, '2030-10-03T03:30:00Z').current, null)
  assert.equal(run(rows, '2030-10-03T14:59:00Z').current.timingNote, '已到开始时间，结束待确认')
  assert.equal(run(rows, '2030-10-03T15:00:00Z').current, null)
  rows[2].completed = true
  assert.equal(run(rows, '2030-10-03T03:10:00Z').current, null)
})

test('next is chronological with unsorted legacy plans and missing transport has no made-up departure', () => {
  const rows = [{ title: '晚饭', time: '18:00', travelMinutes: 30 }, { title: '展览', time: '15:00', timeLocked: true }]
  const state = run(rows, '2030-10-03T02:00:00Z')
  assert.equal(state.next.activity.title, '展览')
  assert.equal(state.latestDeparture, null)
  assert.equal(todayItinerary({ ...base, lifecycle: 'cancelled' }).inProgress, false)
  assert.equal(todayItinerary({ ...base, lifecycle: 'planning' }).inProgress, false)
})
