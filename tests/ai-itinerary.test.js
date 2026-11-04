import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAiItineraryService } from '../src/services/aiItineraryService.js'
const plan = { destination: '北京', startDate: '2030-06-01', endDate: '2030-06-01', budget: 1000, persons: 2, preferences: ['culture'], pace: 'normal' }
const day = { date: plan.startDate, activities: [{ time: '09:00', title: '故宫', description: '提前预约，门票费用为估算' }] }
test('uses customer service model endpoint and preserves requirements and cancellation', async () => {
  const signal = new AbortController().signal
  const service = createAiItineraryService({ request: async (path, options) => {
    assert.equal(path, 'ai/chat')
    assert.equal(options.json.model, 'open-source-llm')
    assert.equal(options.json.purpose, 'itinerary')
    assert.equal(options.signal, signal)
    assert.deepEqual(JSON.parse(options.json.message), plan)
    return { choices: [{ message: { content: JSON.stringify({ days: [day] }) } }] }
  } })
  assert.deepEqual((await service.generate(plan, { signal })).days, [day])
})
test('rejects incomplete, invalid dates and malformed activities', async () => {
  for (const days of [[], [{ ...day, date: '2030-06-02' }], [{ ...day, activities: [] }], [{ ...day, activities: [{ time: '25:00', title: 'x', description: 'x' }] }]]) {
    const service = createAiItineraryService({ request: async () => ({ choices: [{ message: { content: JSON.stringify({ days }) } }] }) })
    await assert.rejects(service.generate(plan), { code: 'INVALID_RESPONSE' })
  }
})
test('propagates upstream failures without template fallback', async () => {
  const service = createAiItineraryService({ request: async () => { throw new Error('offline') } })
  await assert.rejects(service.generate(plan), /offline/)
  await assert.rejects(service.generate({ ...plan, budget: -1 }), /预算/)
})

test('reports model truncation explicitly instead of a JSON format failure', async () => {
  const service = createAiItineraryService({ request: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{"days":[' } }] }) })
  await assert.rejects(service.generate(plan), /输出达到长度限制/)
})
