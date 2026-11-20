import { parseDateOnly } from './date.js'
import { parseMealTime } from './dining.js'
import { destinationLabel } from './routeStats.js'

const minute = 60_000
const encoder = new TextEncoder()
const utcStamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const escapeText = value => String(value ?? '').replaceAll('\\', '\\\\').replace(/\r\n?|\n/g, '\\n')
  .replaceAll(',', '\\,').replaceAll(';', '\\;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')

function fold(line) {
  let bytes = 0, output = ''
  for (const character of line) {
    const size = encoder.encode(character).length
    if (bytes + size > 75) { output += '\r\n '; bytes = 1 }
    output += character
    bytes += size
  }
  return output
}

function wallClock(formatter, instant) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]))
  return Date.parse(`${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`)
}

function reservationInstant(formatter, date, time) {
  const minutes = parseMealTime(time)
  if (minutes === null) throw new Error('请填写有效的开始时间')
  const wall = parseDateOnly(date).getTime() + minutes * minute
  // Probe offsets on both sides of a clock change. A repeated hour denotes its first occurrence.
  const offsets = [-36, 0, 36].map(hours => {
    const probe = wall + hours * 60 * minute
    return wallClock(formatter, probe) - probe
  })
  const matches = [...new Set(offsets)].map(offset => wall - offset).filter(utc => wallClock(formatter, utc) === wall)
  if (!matches.length) throw new Error('该当地时间因时钟调整而不存在，请核对预约')
  return Math.min(...matches)
}

export function lockedReservations(route) {
  const rows = []
  const counts = new Map()
  for (const day of route.days || []) {
    for (const activity of day.activities || []) {
      if (activity?.timeLocked !== true || activity.skipped) continue
      const key = activity.id ? 'id-' + activity.id : `legacy-${day.date}-${activity.title || ''}`
      const occurrence = counts.get(key) || 0
      counts.set(key, occurrence + 1)
      rows.push({ date: day.date, activity, uid: JSON.stringify([route.id, key, occurrence]) })
    }
  }
  return rows
}

export function reservationCalendar(route, { timeZone = 'Asia/Shanghai', reminderMinutes = 30, now = new Date() } = {}) {
  let formatter
  try {
    if (!timeZone.trim()) throw new Error()
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { throw new Error('请填写有效的目的地时区，例如 Asia/Shanghai。') }
  if (!Number.isInteger(reminderMinutes) || reminderMinutes < 0) throw new Error('请填写有效的提醒分钟。')
  const rows = lockedReservations(route)
  if (!rows.length) throw new Error('请先在日程编辑中锁定预约的开始时间。')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Travel Planner//Reservations//ZH', 'CALSCALE:GREGORIAN']
  const destination = destinationLabel(route)
  for (const { date, activity, uid } of rows) {
    const title = activity.title || '旅行预约'
    let start
    try { start = reservationInstant(formatter, date, activity.time) }
    catch (error) { throw new Error(`${date}「${title}」：${error.message}`) }
    const description = [route.title, destination, `当地时间 ${date} ${activity.time}（${timeZone}）`, activity.notes, activity.description].filter(Boolean).join('\n')
    const location = [activity.place?.name, activity.place?.address].filter(Boolean).join(' · ') || destination
    lines.push('BEGIN:VEVENT', 'UID:' + encodeURIComponent(uid) + '@travel-planner.local',
      'DTSTAMP:' + utcStamp(now), 'DTSTART:' + utcStamp(start))
    if (Number.isFinite(activity.durationMinutes) && activity.durationMinutes > 0) {
      lines.push('DTEND:' + utcStamp(start + activity.durationMinutes * minute))
    }
    lines.push('SUMMARY:' + escapeText(title), 'DESCRIPTION:' + escapeText(description))
    if (location) lines.push('LOCATION:' + escapeText(location))
    if (reminderMinutes) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${reminderMinutes}M`,
      'DESCRIPTION:' + escapeText(title), 'END:VALARM')
    lines.push('END:VEVENT')
  }
  return [...lines, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n'
}
