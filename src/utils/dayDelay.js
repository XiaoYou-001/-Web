import { parseMealTime, formatMealTime } from './dining.js'

const dayMinutes = 24 * 60
export function knownMinutes(value) {
  return Number.isInteger(value) && value >= 0
}

// All calculations use the activity's local calendar day and the leg to its successor.
export function previewDayDelay(activities, index, delay, originalStay) {
  const rows = [], warnings = []
  const result = { rows, warnings, error: '', blocked: false }
  const current = activities[index]
  const fail = error => ({ ...result, error, blocked: true })
  if (!current || current.skipped) return fail('请选择当天实际参加的活动。')
  if (!Number.isInteger(delay) || delay < 1) return fail('延误分钟请填写正整数。')
  const stay = knownMinutes(current.durationMinutes) ? current.durationMinutes : originalStay
  if (!knownMinutes(stay)) return fail('请填写这项活动原计划的停留分钟。')
  let previous
  for (let i = index; i < activities.length; i++) {
    const activity = activities[i]
    if (activity.skipped) continue
    const title = activity.title || '未命名活动'
    const planned = parseMealTime(activity.time)
    if (planned === null) return fail(`请先为「${title}」填写有效的开始时间。`)
    const row = { index: i, title, before: activity.time, after: activity.time }
    let start = planned
    const duration = i === index ? stay + delay : activity.durationMinutes
    if (previous) {
      const leg = previous.index + 1 === i ? activities[previous.index].travelMinutes : null
      let arrival
      if (knownMinutes(leg) && previous.end !== null) {
        arrival = previous.end + leg
      } else {
        // Retain the original interval if its unrecorded stop/transfer split is unknown.
        arrival = Math.max(planned + previous.shift, (previous.end ?? previous.start) + (knownMinutes(leg) ? leg : 0))
        warnings.push(`「${previous.title}」至「${title}」停留或交通耗时待确认，暂按原间隔推算。`)
      }
      if (activity.timeLocked || activity.completed) {
        row.fixed = true
        row.margin = planned - arrival
        if (knownMinutes(leg) && planned >= leg) {
          row.leaveBy = formatMealTime(planned - leg)
          row.maxPreviousStay = Math.max(0, planned - leg - previous.start)
        }
        if (row.margin < 0) result.blocked = true
      } else {
        start = Math.max(planned, arrival)
        if (start !== planned) row.after = formatMealTime(start)
      }
    }
    const end = knownMinutes(duration) ? start + duration : null
    if (start >= dayMinutes || (end !== null && end >= dayMinutes)) return fail(`「${title}」将跨到次日，请先调整当天安排。`)
    if (i === index) {
      row.duration = duration
      row.end = formatMealTime(end)
    }
    rows.push(row)
    previous = { index: i, title, start, end, shift: i === index ? delay : start - planned }
  }
  return result
}
