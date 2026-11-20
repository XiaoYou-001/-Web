import test from 'node:test'
import assert from 'node:assert/strict'
import { lockedReservations, reservationCalendar } from '../src/utils/reservationCalendar.js'

const booking = { title: '博物馆', time: '9:30', timeLocked: true, durationMinutes: 45 }
const travel = (activities, date = '2031-06-01') => ({
  id: 'trip', destination: '上海', days: [{ date, activities }]
})
const unfolded = content => content.replaceAll('\r\n ', '')

test('export contains only active locked bookings with UTC instants, destination and display alarm', () => {
  const route = travel([booking, { ...booking, timeLocked: false }, { ...booking, skipped: true }])
  const content = unfolded(reservationCalendar(route))
  assert.equal(lockedReservations(route).length, 1)
  assert.equal(content.match(/BEGIN:VEVENT/g).length, 1)
  for (const line of ['DTSTART:20310601T013000Z', 'DTEND:20310601T021500Z',
    'LOCATION:上海', 'ACTION:DISPLAY', 'TRIGGER:-PT30M']) assert.ok(content.includes(line + '\r\n'))
  assert.ok(content.includes('当地时间 2031-06-01 9:30（Asia/Shanghai）'))
})

test('conversion uses destination DST, including a repeated local hour, and rejects missing local hours', () => {
  const ny = { timeZone: 'America/New_York', reminderMinutes: 0 }
  const exportAt = (day, time) => reservationCalendar(travel([{ ...booking, time }], day), ny)
  assert.match(exportAt('2026-07-01', '09:30'), /DTSTART:20260701T133000Z/)
  assert.match(exportAt('2026-11-01', '01:30'), /DTSTART:20261101T053000Z/)
  assert.doesNotMatch(exportAt('2026-01-01', '09:30'), /VALARM/)
  assert.throws(() => exportAt('2026-03-08', '02:30'), /不存在/)
})

test('calendar escapes text, folds UTF-8 safely and gives historical duplicates distinct repeatable UIDs', () => {
  const old = { ...booking, title: '园'.repeat(40), durationMinutes: null, place: { name: '花园', address: '一,二;三\\街\nA' } }
  const route = travel([old, { ...old }])
  const content = reservationCalendar(route)
  assert.ok(content.split('\r\n').every(line => Buffer.byteLength(line) <= 75))
  const flat = unfolded(content)
  assert.ok(flat.includes('LOCATION:花园 · 一\\,二\\;三\\\\街\\nA'))
  assert.ok(flat.includes('SUMMARY:' + old.title))
  assert.doesNotMatch(flat, /DTEND:/)
  const ids = flat.match(/^UID:.*$/gm)
  assert.equal(new Set(ids).size, 2)
  assert.deepEqual(unfolded(reservationCalendar(route)).match(/^UID:.*$/gm), ids)
  assert.equal(old.id, undefined)
})

test('empty, invalid dates and times, and invalid time zone give actionable errors', () => {
  assert.throws(() => reservationCalendar({}), /锁定/)
  assert.throws(() => reservationCalendar(travel([booking], '2031-02-29')), /博物馆.*有效日期/)
  assert.throws(() => reservationCalendar(travel([{ ...booking, time: '' }])), /有效的开始时间/)
  assert.throws(() => reservationCalendar(travel([booking]), { timeZone: 'wrong' }), /有效的目的地时区/)
})
