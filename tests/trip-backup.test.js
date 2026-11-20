import assert from 'node:assert/strict'
import test from 'node:test'
import { readTripBackup, serializeTripBackup } from '../src/services/tripBackup.js'

const trip = {
  title: '苏州周末', startDate: '2030-11-20', endDate: '2030-11-20',
  id: 'original', __srcId: 'original', planGroupId: 'another-trip',
  collaborationBaseline: { context: 'old-account' }, shareToken: 'private',
  days: [{ date: '2030-11-20', activities: [{ id: 'visit', title: '博物馆', time: '09:00', timeLocked: true }] }]
}

test('portable data retains activity IDs and excludes the source trip and account bindings', () => {
  const restored = readTripBackup(serializeTripBackup(trip))
  assert.deepEqual(restored.days, trip.days)
  assert.deepEqual(restored.themes, [])
  assert.deepEqual(restored.preferences, {})
  for (const field of ['id', '__srcId', 'collaborationBaseline', 'planGroupId', 'shareToken']) {
    assert.equal(Object.hasOwn(restored, field), false)
  }
  const file = JSON.parse(serializeTripBackup(trip))
  file.trip.id = 'another-trip'
  assert.equal(Object.hasOwn(readTripBackup(JSON.stringify(file)), 'id'), false)
})

test('rejects unreadable files, future versions and invalid nested data at preview', () => {
  const file = JSON.parse(serializeTripBackup(trip))
  assert.throws(() => readTripBackup('{'), /JSON/)
  assert.throws(() => readTripBackup(JSON.stringify({ ...file, version: 2 })), /版本/)
  for (const patch of [
    { days: [{ date: '2030-02-31', activities: [] }] },
    { pendingActivities: [null] }, { preparation: { items: [null] } },
    { ledger: { expenses: [], settlements: [], members: '无效' } },
    { startDate: '0001-01-01' }
  ]) {
    assert.throws(() => readTripBackup(JSON.stringify({ ...file, trip: { ...file.trip, ...patch } })))
  }
})
