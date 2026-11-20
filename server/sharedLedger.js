import { randomUUID } from 'node:crypto'
import { splitEven, ledgerBalances } from '../src/utils/ledger.js'
import { CollabError, text } from '../src/utils/sharedItinerary.js'

const maxExpenses = 1000
const requestIdPattern = /^[a-zA-Z0-9_-]{1,128}$/

export function sharedLedgerView(trip) {
  const expenses = trip.sharedExpenses || []
  const names = new Map(trip.members.map(member => [member.accountId, member.name]))
  // Keep the balances of people who left. Their original receipts stay in the ledger.
  for (const expense of expenses) {
    if (!names.has(expense.payerId)) names.set(expense.payerId, expense.payerName)
    for (const id of expense.participantIds) {
      if (!names.has(id)) names.set(id, expense.participantNames[id])
    }
  }
  const members = Array.from(names, ([id, name]) => ({ id, name }))
  const { rows, expenseTotal } = ledgerBalances({ members, expenses })
  return {
    expenses,
    totalCents: expenseTotal,
    balances: rows.map(({ id, name, paid, share, net }) => ({
      id, name, paidCents: paid, owedCents: share, netCents: net
    }))
  }
}

// Called inside the single-process synchronous read/validate/write operation.
// A successful duplicate leaves the original receipt and trip revision intact.
export function recordSharedExpense(trip, payer, input, now) {
  if ([input.expectedPayerId, input.payerId].some(id => id !== undefined && id !== payer.accountId)) {
    throw new CollabError('CONTEXT_CHANGED', '协作账号已切换，请回到原账号处理待同步支出', 409)
  }
  const { requestId, amountCents, participantIds } = input
  if (typeof requestId !== 'string' || !requestIdPattern.test(requestId)) {
    throw new CollabError('VALIDATION', '缺少有效的记账请求编号')
  }
  const title = text(input.title, 1, 60, '支出名称')
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new CollabError('VALIDATION', '支出金额须为正整数分')
  if (!Array.isArray(participantIds) || !participantIds.length || new Set(participantIds).size !== participantIds.length ||
      !participantIds.every(id => typeof id === 'string')) {
    throw new CollabError('VALIDATION', '请选择分摊成员，成员不能重复')
  }

  const expenses = trip.sharedExpenses ||= []
  const existing = expenses.find(item => item.payerId === payer.accountId && item.requestId === requestId)
  if (existing) {
    if (existing.amountCents === amountCents && existing.title === title &&
        existing.participantIds.length === participantIds.length &&
        existing.participantIds.every(id => participantIds.includes(id))) return false
    throw new CollabError('IDEMPOTENCY_CONFLICT', '该记账编号已有不同的支出记录，请核对账本', 409)
  }
  const selectedIds = new Set(participantIds)
  const participants = trip.members.filter(member => selectedIds.has(member.accountId))
  if (participants.length !== selectedIds.size) throw new CollabError('VALIDATION', '分摊参与人已变化，请刷新并重新选择')
  if (expenses.length >= maxExpenses) throw new CollabError('LEDGER_LIMIT', '共享账本已达到 1000 笔上限', 409)
  const total = expenses.reduce((sum, item) => sum + item.amountCents, 0)
  if (!Number.isSafeInteger(total + amountCents)) throw new CollabError('VALIDATION', '累计金额超出可精确计算的范围')

  const orderedIds = participants.map(member => member.accountId)
  expenses.push({
    id: randomUUID(), requestId, title, amountCents, payerId: payer.accountId, payerName: payer.name,
    participantIds: orderedIds,
    participantNames: Object.fromEntries(participants.map(member => [member.accountId, member.name])),
    shares: splitEven(amountCents, orderedIds, orderedIds),
    createdAt: new Date(now).toISOString()
  })
  return true
}
