import { createId } from './id.js'
import { parseDateOnly, localDateString } from './date.js'

// 旅行账本：金额全部以整数分计算，人民币。预计费用不进入实际分账。
export const LEDGER_CURRENCY = 'CNY'
export const LEDGER_CATEGORIES = ['餐饮', '交通', '住宿', '门票', '购物', '其他']
export const SPLIT_MODES = ['even', 'custom']

export function yuanToCents(value) {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('金额需为最多两位小数的非负数字')
  const [whole, fraction = ''] = text.split('.')
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2))
  if (!Number.isSafeInteger(cents)) throw new Error('金额过大')
  return cents
}

export function centsToYuan(cents) {
  if (!Number.isSafeInteger(cents)) throw new Error('金额需为整数分')
  return (cents / 100).toFixed(2)
}

export function formatCents(cents) {
  return `¥${centsToYuan(cents)}`
}

export function createLedger() {
  return { version: 1, currency: LEDGER_CURRENCY, members: [], expenses: [], settlements: [], updatedAt: '' }
}

function validMemberId(ledger, id) {
  return ledger.members.some(member => member.id === id)
}

export function ensureLedger(route) {
  if (!route || typeof route !== 'object') throw new Error('旅行信息无效')
  const ledger = route.ledger
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) route.ledger = createLedger()
  route.ledger.currency = LEDGER_CURRENCY
  route.ledger.members = Array.isArray(route.ledger.members)
    ? route.ledger.members.filter(member => member && typeof member.id === 'string' && typeof member.name === 'string')
    : []
  route.ledger.expenses = Array.isArray(route.ledger.expenses) ? route.ledger.expenses : []
  route.ledger.settlements = Array.isArray(route.ledger.settlements) ? route.ledger.settlements : []
  return route.ledger
}

export function readLedger(route) {
  const ledger = route?.ledger
  return {
    members: Array.isArray(ledger?.members) ? ledger.members.filter(member => member && typeof member.id === 'string') : [],
    expenses: Array.isArray(ledger?.expenses) ? ledger.expenses.filter(expense => expense && typeof expense.id === 'string') : [],
    settlements: Array.isArray(ledger?.settlements) ? ledger.settlements.filter(item => item && typeof item.id === 'string') : []
  }
}

export function addLedgerMember(route, name) {
  const ledger = ensureLedger(route)
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (!clean) throw new Error('请输入同行人名称')
  if (clean.length > 20) throw new Error('同行人名称需为20字以内')
  if (ledger.members.some(member => member.name === clean)) throw new Error('该同行人已存在')
  if (ledger.members.length >= 30) throw new Error('同行人最多 30 人')
  const member = { id: createId(), name: clean, createdAt: new Date().toISOString() }
  ledger.members.push(member)
  ledger.updatedAt = new Date().toISOString()
  return member
}

export function removeLedgerMember(route, id) {
  const ledger = ensureLedger(route)
  const member = ledger.members.find(item => item.id === id)
  if (!member) throw new Error('该同行人已不存在，请刷新后重试')
  if (ledger.expenses.some(expense => expense.payerId === id
    || (expense.shares && Object.hasOwn(expense.shares, id))
    || (Array.isArray(expense.participantIds) && expense.participantIds.includes(id)))) {
    throw new Error('该同行人已有支出记录，不能移除；可先删除相关支出')
  }
  if (ledger.settlements.some(item => item.fromId === id || item.toId === id)) {
    throw new Error('该同行人已有结算记录，不能移除；可先撤销结算')
  }
  ledger.members = ledger.members.filter(item => item.id !== id)
  ledger.updatedAt = new Date().toISOString()
}

// 余数规则：按成员添加顺序（其次按 id 升序）每人补 1 分，保证分摊合计等于支出金额。
// 传入 trip 的账本成员顺序时，余数给最先加入的同行人，与界面“按成员顺序分配”一致。
export function splitEven(totalCents, participantIds, memberOrder = []) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error('支出金额无效')
  const ids = [...new Set(participantIds)]
  if (!ids.length) throw new Error('请选择至少一位分摊参与人')
  const base = Math.floor(totalCents / ids.length)
  const remainder = totalCents - base * ids.length
  const rank = new Map(memberOrder.map((id, index) => [id, index]))
  const order = [...ids].sort((a, b) => {
    const first = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER
    const second = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER
    if (first !== second) return first - second
    return String(a).localeCompare(String(b))
  })
  const shares = {}
  for (const id of ids) shares[id] = base
  for (let index = 0; index < remainder; index += 1) shares[order[index]] += 1
  return shares
}

function memberOrderOf(ledger) {
  return Array.isArray(ledger.members) ? ledger.members.map(member => member.id) : []
}

function validateShares(ledger, input) {
  const total = input.amountCents
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('支出金额需大于 0')
  if (!validMemberId(ledger, input.payerId)) throw new Error('请选择付款人')
  const participants = [...new Set(input.participantIds || [])]
  if (!participants.length) throw new Error('请选择至少一位分摊参与人')
  for (const id of participants) if (!validMemberId(ledger, id)) throw new Error('分摊参与人无效')
  if (input.splitMode === 'custom') {
    const provided = input.shares || {}
    const shares = {}
    let sum = 0
    for (const id of participants) {
      const value = provided[id]
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('自定义分摊金额需为非负整数分')
      shares[id] = value
      sum += value
    }
    if (sum !== total) throw new Error(`自定义分摊合计 ${formatCents(sum)} 与支出金额 ${formatCents(total)} 不一致`)
    return shares
  }
  if (input.splitMode !== undefined && input.splitMode !== 'even') throw new Error('分摊方式无效')
  return splitEven(total, participants, memberOrderOf(ledger))
}

export function addLedgerExpense(route, input) {
  const ledger = ensureLedger(route)
  if (!input || typeof input !== 'object') throw new Error('支出信息无效')
  const title = String(input.title ?? '').trim()
  if (!title) throw new Error('请输入支出名称')
  if (title.length > 60) throw new Error('支出名称需为60字以内')
  const category = LEDGER_CATEGORIES.includes(input.category) ? input.category : '其他'
  const date = input.date || localDateString()
  parseDateOnly(date)
  const amountCents = Number.isSafeInteger(input.amountCents) ? input.amountCents : yuanToCents(input.amount)
  const splitMode = input.splitMode === 'custom' ? 'custom' : 'even'
  if (input.sourceExpenseId && ledger.expenses.some(expense => expense.sourceExpenseId === input.sourceExpenseId)) {
    throw new Error('该实际支出已记入账本，未重复添加')
  }
  const shares = validateShares(ledger, { amountCents, payerId: input.payerId, participantIds: input.participantIds, splitMode, shares: input.shares })
  const expense = {
    id: createId(),
    title,
    category,
    amountCents,
    payerId: input.payerId,
    participantIds: [...new Set(input.participantIds)],
    splitMode,
    shares,
    note: typeof input.note === 'string' ? input.note.slice(0, 300) : '',
    date,
    sourceExpenseId: typeof input.sourceExpenseId === 'string' ? input.sourceExpenseId : '',
    createdAt: new Date().toISOString(),
    updatedAt: ''
  }
  ledger.expenses.push(expense)
  ledger.updatedAt = new Date().toISOString()
  return expense
}

export function findLedgerExpense(route, id) {
  return ensureLedger(route).expenses.find(expense => expense.id === id) || null
}

export function settlementCovering(ledger, expenseId) {
  return (ledger.settlements || []).find(item => Array.isArray(item.coveredExpenseIds) && item.coveredExpenseIds.includes(expenseId)) || null
}

export function updateLedgerExpense(route, id, patch = {}) {
  const ledger = ensureLedger(route)
  const expense = ledger.expenses.find(item => item.id === id)
  if (!expense) throw new Error('该支出已不存在，请刷新后重试')
  const settlement = settlementCovering(ledger, id)
  if (settlement) throw new Error('该支出已包含在结算记录中，请先撤销对应结算再修改')
  const amountCents = patch.amountCents !== undefined ? patch.amountCents : patch.amount !== undefined ? yuanToCents(patch.amount) : expense.amountCents
  const payerId = patch.payerId ?? expense.payerId
  const participantIds = patch.participantIds ?? expense.participantIds
  const splitMode = patch.splitMode ?? expense.splitMode
  const title = patch.title === undefined ? expense.title : String(patch.title).trim()
  if (!title) throw new Error('请输入支出名称')
  if (title.length > 60) throw new Error('支出名称需为60字以内')
  const date = patch.date ?? expense.date
  parseDateOnly(date)
  const category = patch.category === undefined ? expense.category : (LEDGER_CATEGORIES.includes(patch.category) ? patch.category : '其他')
  const shares = validateShares(ledger, { amountCents, payerId, participantIds, splitMode, shares: patch.shares ?? expense.shares })
  Object.assign(expense, {
    title, category, amountCents, payerId, participantIds: [...new Set(participantIds)], splitMode, shares,
    note: patch.note === undefined ? expense.note : String(patch.note).slice(0, 300),
    date, updatedAt: new Date().toISOString()
  })
  ledger.updatedAt = new Date().toISOString()
  return expense
}

export function removeLedgerExpense(route, id) {
  const ledger = ensureLedger(route)
  const expense = ledger.expenses.find(item => item.id === id)
  if (!expense) throw new Error('该支出已不存在，请刷新后重试')
  const settlement = settlementCovering(ledger, id)
  if (settlement) throw new Error('该支出已包含在结算记录中，请先撤销对应结算再删除')
  ledger.expenses = ledger.expenses.filter(item => item.id !== id)
  ledger.updatedAt = new Date().toISOString()
}

export function expenseShares(expense) {
  const shares = expense.shares && typeof expense.shares === 'object' ? expense.shares : {}
  const participants = Array.isArray(expense.participantIds) ? expense.participantIds : Object.keys(shares)
  const result = {}
  let sum = 0
  for (const id of participants) {
    const value = Number.isSafeInteger(shares[id]) ? shares[id] : 0
    result[id] = value
    sum += value
  }
  if (sum !== expense.amountCents) throw new Error('账本数据异常：分摊合计与支出金额不一致')
  return result
}

// 兼容直接传入账本对象；传入旅行时只读取 route.ledger，绝不要把旅行本身的旧版 expenses 当成账本。
function ledgerOf(input) {
  if (!input || typeof input !== 'object') return {}
  if (input.ledger && typeof input.ledger === 'object') return input.ledger
  if (Array.isArray(input.members) && !Array.isArray(input.routes)) return input
  return {}
}

// paid / share / net：net 为正表示应收，为负表示应付。所有人的 net 合计为 0。
export function ledgerBalances(input) {
  const ledger = ledgerOf(input)
  const members = Array.isArray(ledger.members) ? ledger.members : []
  const expenses = Array.isArray(ledger.expenses) ? ledger.expenses : []
  const settlements = Array.isArray(ledger.settlements) ? ledger.settlements : []
  const totals = new Map(members.map(member => [member.id, { id: member.id, name: member.name, paid: 0, share: 0, transferred: 0, received: 0 }]))
  let expenseTotal = 0
  for (const expense of expenses) {
    expenseTotal += expense.amountCents
    const payer = totals.get(expense.payerId)
    if (payer) payer.paid += expense.amountCents
    const shares = expenseShares(expense)
    for (const [id, cents] of Object.entries(shares)) {
      const entry = totals.get(id)
      if (entry) entry.share += cents
    }
  }
  for (const settlement of settlements) {
    const from = totals.get(settlement.fromId)
    const to = totals.get(settlement.toId)
    if (from) from.transferred += settlement.amountCents
    if (to) to.received += settlement.amountCents
  }
  const rows = [...totals.values()].map(row => {
    const net = row.paid - row.share
    return { ...row, net, remaining: net + row.transferred - row.received }
  })
  const remainingSum = rows.reduce((sum, row) => sum + row.remaining, 0)
  return {
    rows,
    expenseTotal,
    settlementTotal: settlements.reduce((sum, item) => sum + item.amountCents, 0),
    settled: remainingSum === 0 && rows.every(row => row.remaining === 0),
    remainingSum
  }
}

// 建议转账：贪心配对，结果确定；仅用于建议，不代表真实支付。
export function suggestedTransfers(balances) {
  const debtors = balances.rows.filter(row => row.remaining < 0).map(row => ({ id: row.id, name: row.name, amount: -row.remaining })).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
  const creditors = balances.rows.filter(row => row.remaining > 0).map(row => ({ id: row.id, name: row.name, amount: row.remaining })).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
  const transfers = []
  let debtorIndex = 0, creditorIndex = 0
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex], creditor = creditors[creditorIndex]
    const amount = Math.min(debtor.amount, creditor.amount)
    if (amount > 0) transfers.push({ fromId: debtor.id, fromName: debtor.name, toId: creditor.id, toName: creditor.name, amountCents: amount })
    debtor.amount -= amount
    creditor.amount -= amount
    if (debtor.amount === 0) debtorIndex += 1
    if (creditor.amount === 0) creditorIndex += 1
  }
  return transfers
}

// 结算记录只表示“在应用内登记了一次转账”，不表示实际付款已完成。
// 只有同时满足“方向一致（收款人垫付）”“金额已覆盖该方向全部未结算垫付”时，
// 才把这些支出标记为已结算并锁定编辑；部分转账不会锁住任何支出。
export function recordSettlement(route, input) {
  const ledger = ensureLedger(route)
  if (!input || typeof input !== 'object') throw new Error('结算信息无效')
  if (!validMemberId(ledger, input.fromId) || !validMemberId(ledger, input.toId)) throw new Error('请选择结算双方')
  if (input.fromId === input.toId) throw new Error('结算双方不能是同一个人')
  const amountCents = Number.isSafeInteger(input.amountCents) ? input.amountCents : yuanToCents(input.amount)
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('结算金额需大于 0')
  const settled = ledger.expenses
    .filter(expense => !settlementCovering(ledger, expense.id))
    .filter(expense => expense.payerId === input.toId
      && expense.shares && (expense.shares[input.fromId] || 0) > 0)
  const owed = settled.reduce((sum, expense) => sum + (expense.shares[input.fromId] || 0), 0)
  const coveredExpenseIds = owed > 0 && amountCents >= owed ? settled.map(expense => expense.id) : []
  const settlement = {
    id: createId(),
    fromId: input.fromId,
    toId: input.toId,
    amountCents,
    coveredExpenseIds,
    note: typeof input.note === 'string' ? input.note.slice(0, 200) : '',
    date: input.date || localDateString(),
    createdAt: new Date().toISOString()
  }
  parseDateOnly(settlement.date)
  ledger.settlements.push(settlement)
  ledger.updatedAt = new Date().toISOString()
  return settlement
}

export function revokeSettlement(route, id) {
  const ledger = ensureLedger(route)
  const index = ledger.settlements.findIndex(item => item.id === id)
  if (index === -1) throw new Error('该结算记录已不存在，请刷新后重试')
  ledger.settlements.splice(index, 1)
  ledger.updatedAt = new Date().toISOString()
}

export function reconcileExpenseIds(expenses = []) {
  let changed = false
  for (const expense of expenses) {
    if (!expense || typeof expense !== 'object') continue
    if (typeof expense.id !== 'string' || !expense.id) { expense.id = createId(); changed = true }
  }
  return changed
}

// 早期版本把“实际支出”的数组下标当作 sourceExpenseId：删除前面的记录后会错位，
// 可能导致同一笔真实支出被重复入账。这里给实际支出补稳定 id，并迁移旧下标。
export function migrateExpenseSources(route) {
  if (!route || typeof route !== 'object') return false
  const expenses = Array.isArray(route.expenses) ? route.expenses : []
  let changed = reconcileExpenseIds(expenses)
  const ledger = route.ledger
  if (ledger && Array.isArray(ledger.expenses)) {
    for (const expense of ledger.expenses) {
      if (!expense || typeof expense.sourceExpenseId !== 'string' || !/^\d+$/.test(expense.sourceExpenseId)) continue
      const target = expenses[Number(expense.sourceExpenseId)]
      if (target && typeof target.id === 'string' && target.id) {
        expense.sourceExpenseId = target.id
        changed = true
      }
    }
  }
  if (changed && ledger && typeof ledger === 'object') ledger.updatedAt = new Date().toISOString()
  return changed
}

export function ledgerSummary(route) {
  const ledger = readLedger(route)
  const noSourceIds = new Set(ledger.expenses.map(expense => expense.sourceExpenseId).filter(Boolean))
  return {
    members: ledger.members.length,
    expenseCount: ledger.expenses.length,
    totalCents: ledger.expenses.reduce((sum, expense) => sum + (Number.isSafeInteger(expense.amountCents) ? expense.amountCents : 0), 0),
    settlementCount: ledger.settlements.length,
    hasLedger: ledger.expenses.length > 0,
    noSourceIds
  }
}
