import { createId } from './id.js'
import { sanitizeDays } from './sharedItinerary.js'

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Earlier plans and cloud snapshots can contain missing or repeated activity IDs.
// Upgrade those rows on import. Subsequent edits and moves keep their assigned ID.
export function identifyActivities(days, { local = false, legacyCloud = [] } = {}) {
  const used = new Set()
  const reserved = new Set(days.flatMap(day => (day.activities || []).map(item => item.id).filter(Boolean)))
  for (const day of days) {
    const legacyDay = legacyCloud.find(item => item.date === day.date)
    for (const [index, activity] of (day.activities || []).entries()) {
      if (!activity.id || used.has(activity.id)) {
        const oldRow = legacyDay?.activities?.[index]
        let legacyId = `legacy-${day.date}-${index}`
        while (reserved.has(legacyId) || used.has(legacyId)) legacyId += '-x'
        const match = oldRow && oldRow.title === activity.title &&
          (oldRow.id === activity.id || oldRow.id === legacyId)
        const id = local && !match ? createId() : legacyId
        day.activities[index] = { ...activity, id }
      }
      used.add(day.activities[index].id)
    }
  }
}

function indexed(days) {
  const dates = new Map()
  const rows = new Map()
  for (const day of days) {
    dates.set(day.date, day)
    for (const activity of day.activities) rows.set(activity.id, { date: day.date, activity })
  }
  return { dates, rows }
}

// Insert items missing from the preferred order near their surviving neighbours.
function combineOrder(preferred, additional) {
  const order = preferred.slice()
  let cursor = 0
  for (const id of additional) {
    const existing = order.indexOf(id)
    if (existing !== -1) cursor = existing + 1
    else order.splice(cursor++, 0, id)
  }
  return order
}

// Build the outcomes shown for a concurrent edit. They differ only on fields
// both people changed. Treat completion/skipping as a single mutually exclusive state.
function rowAlternatives(ancestor, mine, theirs) {
  function alternatives(before, local, remote) {
    if (equal(local, before)) return [remote, remote]
    if (equal(remote, before)) return [local, local]
    return [local, remote]
  }
  const rows = alternatives(ancestor.date, mine.date, theirs.date).map(date => ({ date, activity: {} }))
  const activities = [ancestor.activity, mine.activity, theirs.activity]
  const keys = new Set(activities.flatMap(activity => Object.keys(activity)))
  for (const key of keys) {
    if (key === 'completed' || key === 'skipped') continue
    alternatives(...activities.map(activity => activity[key])).forEach((value, side) => {
      if (value !== undefined) rows[side].activity[key] = value
    })
  }
  const states = activities.map(activity => ({ completed: activity.completed, skipped: activity.skipped }))
  alternatives(...states).forEach((state, side) => Object.assign(rows[side].activity, state))
  return rows
}

export function mergeItineraries(baseDays, localDays, remoteDays, choices = {}) {
  const [base, local, remote] = [baseDays, localDays, remoteDays].map(indexed)
  const conflicts = []
  function choose(key, label, ancestor, mine, theirs, display = v => v) {
    if (equal(mine, theirs) || equal(theirs, ancestor)) return mine
    if (equal(mine, ancestor)) return theirs
    // Bind each resolution to exactly the two values shown to this editor.
    const signature = JSON.stringify([mine, theirs])
    const selection = choices[key]
    if (selection?.signature === signature) return selection.side === 'remote' ? theirs : mine
    conflicts.push({ key, label, signature, local: display(mine), remote: display(theirs) })
    return mine
  }

  const rows = new Map()
  for (const id of new Set([...local.rows.keys(), ...remote.rows.keys(), ...base.rows.keys()])) {
    const row = local.rows.get(id) || remote.rows.get(id) || base.rows.get(id)
    const before = base.rows.get(id)
    const mine = local.rows.get(id)
    const theirs = remote.rows.get(id)
    let merged
    if (mine && theirs && before && !equal(mine, theirs) && !equal(mine, before) && !equal(theirs, before)) {
      const alternatives = rowAlternatives(before, mine, theirs)
      merged = choose('item-' + id, row.activity.title, undefined, ...alternatives)
    } else {
      merged = choose('item-' + id, row.activity.title, before, mine, theirs)
    }
    if (merged) rows.set(id, merged)
  }

  const days = []
  const dates = [...new Set([...base.dates.keys(), ...local.dates.keys(), ...remote.dates.keys()])].sort()
  for (const date of dates) {
    const versions = [base, local, remote].map(data => data.dates.get(date))
    const dayRows = [...rows.values()].filter(row => row.date === date)
    const exists = choose('date-' + date, date, ...versions.map(Boolean))
    const budget = choose('budget-' + date, date + ' · 当日预算', ...versions.map(day => day?.budget))
    if (!exists && !dayRows.length && budget === undefined) continue
    const ids = dayRows.map(row => row.activity.id)
    const orders = versions.map(day => (day?.activities || []).map(item => item.id).filter(id => ids.includes(id)))
    const common = new Set(orders[0].filter(id => orders.every(order => order.includes(id))))
    const relative = orders.map(order => order.filter(id => common.has(id)))
    const order = choose('order-' + date, date + ' · 活动顺序', ...relative, sequence => sequence.map(id => rows.get(id).activity.title).join(' → '))
    const preferLocal = !equal(order, relative[2])
    const combined = preferLocal ? combineOrder(orders[1], orders[2]) : combineOrder(orders[2], orders[1])
    const result = { date, activities: combined.map(id => rows.get(id).activity) }
    if (budget !== undefined) result.budget = budget
    days.push(result)
  }
  return { days, conflicts }
}

export function canonicalDays(days) {
  const result = sanitizeDays(days)
  identifyActivities(result)
  return result
}

const labels = {
  date: '日期', title: '活动', time: '开始', description: '说明', notes: '备注', completed: '已完成',
  skipped: '已跳过', durationMinutes: '停留分钟', travelMinutes: '交通分钟', place: '地点',
  timeLocked: '固定时间', opensAt: '开放时间', closesAt: '关闭时间', travelEstimate: '交通估算',
  meal: '用餐', category: '类别', slot: '时段', slotLabel: '时段名称', name: '名称', address: '地址',
  location: '坐标', city: '城市', mode: '方式', minutes: '分钟', distanceMeters: '距离（米）'
}

function describe(value) {
  if (value === undefined) return '未设置'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (value && typeof value === 'object') return Array.isArray(value) ? value.join(', ') :
    Object.entries(value).map(([key, child]) => (labels[key] || key) + '：' + describe(child)).join('，')
  return String(value) || '未填写'
}

export function conflictText(item, side) {
  const version = item[side]
  if (!item.key.startsWith('item-')) return describe(version)
  if (!version) return '删除活动'
  const other = item[side === 'local' ? 'remote' : 'local']
  const fields = { date: version.date, ...version.activity }
  const otherFields = { date: other?.date, ...other?.activity }
  return [...new Set([...Object.keys(fields), ...Object.keys(otherFields)])]
    .filter(key => key !== 'id' && !equal(fields[key], otherFields[key]))
    .map(key => (labels[key] || key) + '：' + describe(fields[key])).join(' · ')
}
