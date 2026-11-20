import { localDateString, parseDateOnly } from './date.js'
import { parseMealTime, formatMealTime } from './dining.js'

function tripClock(now, timeZone) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(now)
      const p = Object.fromEntries(parts.map(part => [part.type, part.value]))
      return { date: `${p.year}-${p.month}-${p.day}`, minute: +p.hour * 60 + +p.minute, zone: timeZone }
    } catch { /* Legacy records may contain an unsupported zone. Use the device clock. */ }
  }
  return { date: localDateString(now), minute: now.getHours() * 60 + now.getMinutes(), zone: '设备时间' }
}

function departureBefore(booking, activities) {
  const prior = activities[booking.index - 1]
  if (!prior || prior.skipped || !Number.isInteger(prior.travelMinutes) || prior.travelMinutes < 0 || prior.travelMinutes > 1440) return null
  // The stored journey always connects adjacent rows in the original itinerary.
  const previousStart = parseMealTime(prior.time)
  if (previousStart === null || previousStart > booking.start) return null
  const limit = booking.start - prior.travelMinutes
  return { from: prior.title, time: (limit < 0 ? '前一天 ' : '') + formatMealTime((limit + 1440) % 1440) }
}

export function todayItinerary(route, now = new Date()) {
  const clock = tripClock(now, route.timeZone)
  const todayStart = parseDateOnly(clock.date).getTime() / 60000
  const instant = todayStart + clock.minute
  const items = [], overdue = [], untimed = []
  let latestStartedToday = null
  let current = null, nextOverall = null, nextBooking = null, latestDeparture = null
  const days = route.days || []
  for (const day of days) {
    let dayStart
    try { dayStart = parseDateOnly(day.date).getTime() / 60000 } catch { continue }
    for (const [index, activity] of (day.activities || []).entries()) {
      if (!activity || activity.skipped) continue
      const start = parseMealTime(activity.time)
      const row = { date: day.date, index, start, activity }
      if (day.date === clock.date && start !== null && start <= clock.minute &&
          (!latestStartedToday || start >= latestStartedToday.start)) latestStartedToday = row
      if (activity.completed) continue
      if (start === null) {
        if (day.date === clock.date) untimed.push(row)
        else if (day.date < clock.date) overdue.push(row)
        continue
      }
      const begins = dayStart + start
      items.push({ row, begins, activities: day.activities })
    }
  }
  items.sort((a, b) => a.begins - b.begins)
  for (const { row, begins, activities } of items) {
    const stay = row.activity.durationMinutes
    if (begins > instant) {
      nextOverall ||= row
      if (!nextBooking && row.date === clock.date && row.activity.timeLocked) {
        nextBooking = row
        latestDeparture = departureBefore(row, activities)
      }
    } else if ((!Number.isFinite(stay) || stay < 0) && row === latestStartedToday) {
      row.timingNote = '已到开始时间，结束待确认'
      current = row
    } else if (Number.isFinite(stay) && stay >= 0 && (instant === begins || instant < begins + stay)) {
      current = row
    } else {
      overdue.push(row)
    }
  }
  overdue.sort((a, b) => b.date.localeCompare(a.date) || (b.start ?? -1) - (a.start ?? -1))
  return {
    ...clock, current, next: nextOverall?.date === clock.date ? nextOverall : null, nextOverall,
    nextBooking, latestDeparture, overdue, untimed,
    inProgress: route.lifecycle !== 'planning' && route.lifecycle !== 'cancelled' &&
      Boolean(route.startDate && route.endDate && route.startDate <= clock.date && clock.date <= route.endDate)
  }
}
