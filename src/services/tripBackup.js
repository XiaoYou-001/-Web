import { inclusiveDayCount, parseDateOnly } from '../utils/date.js'
import { expenseShares } from '../utils/ledger.js'

const format = 'travel-planner-trip'
export const maxBackupBytes = 16 * 1024 * 1024
// Only trip-owned data travels with the file. Account, draft, variant and
// collaboration identities must be assigned independently on the other device.
const portableFields = [
  'title', 'description', 'startDate', 'endDate', 'destination', 'destinations',
  'persons', 'budget', 'themes', 'companion', 'preferences', 'coverImage',
  'lifecycle', 'progress', 'isFavorite', 'timeZone', 'days', 'pendingActivities',
  'dateAdjustmentArchive', 'expenses', 'preparation', 'ledger'
]
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const invalid = label => { throw new Error('旅行备份中的' + label + '无效') }

function records(value, label) {
  if (!Array.isArray(value) || !value.every(record)) invalid(label)
  return value
}

function checkActivities(rows) {
  for (const item of records(rows, '活动列表')) {
    if (typeof item.title !== 'string') invalid('活动名称')
    if (item.place != null && !record(item.place)) invalid('活动地点')
  }
}

function checkLedger(ledger) {
  if (!record(ledger)) invalid('账本')
  const members = records(ledger.members, '账本成员')
  if (members.some(item => typeof item.id !== 'string' || typeof item.name !== 'string')) invalid('账本成员')
  const memberIds = new Set(members.map(item => item.id))
  const positiveCents = amount => Number.isSafeInteger(amount) && amount > 0
  for (const expense of records(ledger.expenses, '账本支出')) {
    if (!positiveCents(expense.amountCents) || !memberIds.has(expense.payerId) ||
        !record(expense.shares) || (expense.participantIds != null && !Array.isArray(expense.participantIds))) invalid('支出分摊')
    for (const [id, amount] of Object.entries(expenseShares(expense))) {
      if (!memberIds.has(id) || !Number.isSafeInteger(amount) || amount < 0) invalid('支出分摊')
    }
  }
  for (const item of records(ledger.settlements, '结算记录')) {
    if (!positiveCents(item.amountCents) || !memberIds.has(item.fromId) || !memberIds.has(item.toId)) invalid('结算记录')
  }
}

function portableTrip(source) {
  if (!record(source) || typeof source.title !== 'string' || !source.title.trim()) invalid('旅行名称')
  const span = inclusiveDayCount(source.startDate, source.endDate)
  if (span > 366 && (!Array.isArray(source.days) || source.days.length < span)) invalid('旅行日期与每日安排')
  const trip = Object.fromEntries(portableFields.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]]))
  trip.themes ??= []
  trip.preferences ??= {}
  trip.days ??= []
  if (!record(trip.preferences)) invalid('旅行偏好')
  for (const list of [trip.themes, trip.destinations ?? []]) {
    if (!Array.isArray(list) || !list.every(value => typeof value === 'string')) invalid('主题或目的地')
  }
  for (const list of [trip.days, trip.dateAdjustmentArchive ?? []]) {
    for (const day of records(list, '每日安排')) {
      parseDateOnly(day.date)
      checkActivities(day.activities)
    }
  }
  checkActivities(trip.pendingActivities ?? [])
  records(trip.expenses ?? [], '费用记录')
  if (trip.preparation != null) {
    if (!record(trip.preparation)) invalid('准备清单')
    for (const item of records(trip.preparation.items, '准备清单')) {
      if (typeof item.title !== 'string') invalid('准备事项')
      if (item.dueDate) parseDateOnly(item.dueDate)
    }
  }
  if (trip.ledger != null) checkLedger(trip.ledger)
  return trip
}

export function serializeTripBackup(route) {
  return JSON.stringify({ format, version: 1, trip: portableTrip(route) })
}

export function readTripBackup(raw) {
  let file
  try {
    file = JSON.parse(raw, (key, value) => {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error()
      return value
    })
  } catch { throw new Error('文件不是有效的旅行备份 JSON') }
  if (file?.format !== format || file.version !== 1) throw new Error('请选择支持的单次旅行备份文件（版本 1）')
  return portableTrip(file.trip)
}

export function downloadTripBackup(route) {
  const file = new Blob([serializeTripBackup(route)], { type: 'application/json' })
  const url = URL.createObjectURL(file)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = route.title + '-旅行备份.json'
    link.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
