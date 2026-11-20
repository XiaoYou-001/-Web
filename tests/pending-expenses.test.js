import assert from 'node:assert/strict'
import test from 'node:test'
import { pendingExpenses } from '../src/services/pendingExpenses.js'

test('independent tabs retain separate pending receipts, scoped to both identities and the remote trip', () => {
  const items = new Map()
  const storage = {
    get length() { return items.size },
    key: i => [...items.keys()][i], getItem: key => items.get(key),
    setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key)
  }
  const queue = () => pendingExpenses(storage, 'local:me', 'remote-me', 'trip')
  const a = queue(), b = queue()
  const expense = { title: '午餐', amountCents: 6001, participantIds: ['A', 'B'] }
  const first = a.add(expense), second = b.add(expense)
  assert.notEqual(first.requestId, second.requestId)
  for (const scope of [['else', 'remote-me', 'trip'], ['local:me', 'other', 'trip'], ['local:me', 'remote-me', 'else']]) {
    assert.deepEqual(pendingExpenses(storage, ...scope).list(), [])
  }
  assert.deepEqual(queue().list(), [first, second])
  b.remove(first.requestId)
  assert.deepEqual(a.list(), [second])
})
