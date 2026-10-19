import { parseDateOnly, addCalendarDays } from './date.js'

// 纯函数：预算与行程统计逻辑，便于独立单测。

// 依据同行类型给出默认人数
export function defaultPersons(companion) {
  return { family: 4, friends: 4, couple: 2, solo: 1 }[companion] || 2
}

// 计算逐日预算行（含占比），用于预算明细条
export function dailyBudgetRows(days) {
  const list = Array.isArray(days) ? days : []
  if (!list.length) return []
  const budgets = list.map(d => Number(d.budget) || 0)
  const max = Math.max(1, ...budgets)
  return list.map((day, di) => {
    const budget = budgets[di]
    const pct = budget ? Math.max(6, Math.round((budget / max) * 100)) : 0
    return { di, date: day.date || '', budget, pct, activities: (day.activities || []).length }
  })
}

// 人均 / 日均
export function perPerson(budget, persons) {
  if (!persons || persons < 1) return 0
  return budget / persons
}
export function dailyAverage(budget, days) {
  return budget / (days || 1)
}

// 生成某月的出行日历格子
export function calendarCells(startDate, endDate, todayStr) {
  if (!startDate || !endDate) return []
  let d
  try { d = parseDateOnly(startDate) } catch { return [] }
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth()
  const first = new Date(0); first.setUTCFullYear(year, month, 1); first.setUTCHours(0, 0, 0, 0)
  const lead = first.getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells = []
  let pad = 0
  while (pad++ < lead) cells.push({ day: '', travel: false, today: false, out: true })
  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    cells.push({
      day: dayNum,
      travel: ds >= startDate && ds <= endDate,
      today: ds === todayStr,
      out: false
    })
  }
  while (cells.length % 7 !== 0) cells.push({ day: '', travel: false, today: false, out: true })
  return cells
}

// 月份标题
export function monthTitle(dateStr) {
  try {
    const d = parseDateOnly(dateStr)
    return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`
  } catch { return '' }
}

// 目的地显示：支持多目的地数组或单个目的地
export function destinationLabel(route) {
  const r = route || {}
  if (Array.isArray(r.destinations) && r.destinations.length) return r.destinations.join(' → ')
  if (r.destination) return r.destination
  return ''
}

export function addDayDates(startDate, count) {
  const out = []
  for (let i = 0; i < count; i++) out.push(addCalendarDays(startDate, i))
  return out
}
