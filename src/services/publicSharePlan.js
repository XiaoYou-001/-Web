export function sharePayload(route) {
  return {
    title: route.title, startDate: route.startDate, endDate: route.endDate,
    days: (route.days || []).map(day => ({
      date: day.date,
      activities: (day.activities || []).map(activity => ({ title: activity.title, time: activity.time || '' }))
    }))
  }
}

function activityLine(item, index) {
  return [`第 ${index + 1} 项`, item.time, item.title].filter(Boolean).join(' · ')
}

// A public snapshot has no activity IDs. Align unchanged title/time pairs by
// longest common subsequence, leaving only edits, insertions, removals and moves.
function changedActivities(before, after) {
  const same = (a, b) => a.title === b.title && a.time === b.time
  const lengths = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1))
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lengths[i][j] = same(before[i], after[j])
        ? 1 + lengths[i + 1][j + 1]
        : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  const removed = [], added = []
  let i = 0, j = 0
  while (i < before.length && j < after.length) {
    if (same(before[i], after[j])) {
      i++
      j++
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      removed.push(activityLine(before[i], i))
      i++
    } else {
      added.push(activityLine(after[j], j))
      j++
    }
  }
  for (; i < before.length; i++) removed.push(activityLine(before[i], i))
  for (; j < after.length; j++) added.push(activityLine(after[j], j))
  return { before: removed, after: added }
}

export function shareChanges(published, draft) {
  const changes = []
  function compare(label, before, after) {
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ label, before, after })
  }
  compare('旅行名称', [published.name], [draft.title])
  compare('旅行日期', [published.startDate + ' 至 ' + published.endDate], [draft.startDate + ' 至 ' + draft.endDate])
  const beforeDates = published.days.map(day => day.date)
  const afterDates = draft.days.map(day => day.date)
  compare('日期顺序', beforeDates.filter(date => afterDates.includes(date)), afterDates.filter(date => beforeDates.includes(date)))
  for (const date of new Set([...beforeDates, ...afterDates])) {
    const before = published.days.find(day => day.date === date), after = draft.days.find(day => day.date === date)
    if (!before || !after) {
      changes.push({
        label: date, before: before?.activities.map(activityLine) ?? null, after: after?.activities.map(activityLine) ?? null
      })
      continue
    }
    const changed = changedActivities(before.activities, after.activities)
    if (changed.before.length || changed.after.length) changes.push({ label: date, activitiesOnly: true, ...changed })
  }
  return changes
}
