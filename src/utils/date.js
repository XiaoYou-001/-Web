const DAY_MS = 24 * 60 * 60 * 1000

// 日期输入按日历日期处理，避免时区或夏令时改变天数。
export function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('请输入有效日期')
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('请输入有效日期')
  }
  return date
}

export function inclusiveDayCount(startDate, endDate) {
  const days = (parseDateOnly(endDate) - parseDateOnly(startDate)) / DAY_MS + 1
  if (days < 1) throw new Error('结束日期不能早于出发日期')
  return days
}

export function addCalendarDays(startDate, offset) {
  const date = parseDateOnly(startDate)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

export function localDateString(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
