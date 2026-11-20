import { createId } from '../utils/id.js'

// Keep each pending payment in its own record. Two tabs adding different
// expenses must never overwrite one another's outstanding requests.
export function pendingExpenses(storage, ownerId, accountId, tripId) {
  if (![ownerId, accountId, tripId].every(Boolean)) throw new Error('共享账本身份不完整')
  const prefix = 'travel-pending-expense:v1:' + [ownerId, accountId, tripId].map(encodeURIComponent).join(':') + ':'
  function list() {
    const items = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key?.startsWith(prefix)) continue
      const item = JSON.parse(storage.getItem(key))
      if (!item || key !== prefix + item.requestId || !Array.isArray(item.participantIds) ||
          typeof item.title !== 'string' || !Number.isSafeInteger(item.amountCents)) {
        throw new Error('待同步支出记录无法读取，请检查本机存储')
      }
      items.push(item)
    }
    return items
  }
  function add({ title, amountCents, participantIds }) {
    const item = { requestId: createId(), title, amountCents, participantIds: [...participantIds] }
    storage.setItem(prefix + item.requestId, JSON.stringify(item))
    return item
  }
  return { list, add, remove: id => storage.removeItem(prefix + id), prefix }
}
