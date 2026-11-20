import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canonicalDays, identifyActivities, mergeItineraries } from '../src/utils/mergeItineraries.js'

const day = (date, ...activities) => ({ date, activities })
const date = '2026-12-01', tomorrow = '2026-12-02'
const lunch = { id: 'a', title: '午餐' }, museum = { id: 'b', title: '博物馆' }

test('moves retain independent edits and deleting an edited activity requires a choice', () => {
  const base = canonicalDays([day(date, lunch, museum), day(tomorrow)])
  const mine = canonicalDays([day(date), day(tomorrow, lunch)])
  const theirs = canonicalDays([day(date, { ...lunch, notes: '12 点订位' }, { ...museum, timeLocked: true }), day(tomorrow)])
  const { conflicts } = mergeItineraries(base, mine, theirs)
  assert.deepEqual(new Set(conflicts.map(item => item.key)), new Set(['item-b']))
  const choices = Object.fromEntries(conflicts.map(({ key, signature }) => [key, { signature, side: 'local' }]))
  const merged = mergeItineraries(base, mine, theirs, choices)
  assert.deepEqual(merged.conflicts, [])
  assert.deepEqual(merged.days[0].activities, [])
  assert.equal(merged.days[1].activities[0].notes, '12 点订位')
})

test('single-side reorder survives independent additions and edits to other rows', () => {
  const base = canonicalDays([day(date, lunch, museum)])
  const local = canonicalDays([day(date, museum, lunch)])
  const remote = canonicalDays([day(date, lunch, { ...museum, time: '15:00' }, { id: 'c', title: '晚餐' })])
  const { days, conflicts } = mergeItineraries(base, local, remote)
  assert.deepEqual(conflicts, [])
  const order = days[0].activities.map(row => row.id)
  assert.deepEqual(new Set(order), new Set(['a', 'b', 'c']))
  assert.ok(order.indexOf('b') < order.indexOf('a'))
  assert.equal(days[0].activities.find(row => row.id === 'b').time, '15:00')
})

test('legacy missing or duplicate IDs are stable on import and new device-local rows receive unique IDs', () => {
  const raw = [day(date, { title: '旧活动', travelMinutes: null }, lunch, lunch)]
  const first = canonicalDays(raw)
  assert.deepEqual(first, canonicalDays(raw))
  assert.equal(new Set(first[0].activities.map(row => row.id)).size, 3)
  assert.equal(first[0].activities[0].travelMinutes, undefined)
  const edit = structuredClone(raw)
  edit[0].activities.push({ title: '新活动' })
  identifyActivities(edit, { local: true, legacyCloud: raw })
  assert.deepEqual(canonicalDays(edit)[0].activities.slice(0, 3), first[0].activities)
  assert.ok(edit[0].activities[3].id)
  const secondDevice = structuredClone(raw)
  identifyActivities(secondDevice, { local: true, legacyCloud: first })
  assert.deepEqual(canonicalDays(secondDevice), first)
})

test('choosing conflicting times keeps both editors’ other changes on the same row', () => {
  const base = canonicalDays([day(date, { ...lunch, time: '12:00' })])
  const local = canonicalDays([day(date, { ...lunch, time: '12:30', timeLocked: true })])
  const remote = canonicalDays([day(date, { ...lunch, time: '13:00', notes: '包间' })])
  const { conflicts } = mergeItineraries(base, local, remote)
  assert.equal(conflicts.length, 1)
  const selected = { 'item-a': { side: 'local', signature: conflicts[0].signature } }
  const [merged] = mergeItineraries(base, local, remote, selected).days[0].activities
  assert.equal(merged.time, '12:30')
  assert.equal(merged.timeLocked, true)
  assert.equal(merged.notes, '包间')
})
