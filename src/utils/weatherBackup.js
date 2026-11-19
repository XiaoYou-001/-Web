import { createId } from './id.js'

const clone = value => JSON.parse(JSON.stringify(value))

const validLocation = value => Array.isArray(value) && value.length >= 2
  && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
  && Math.abs(Number(value[1])) <= 90 && Math.abs(Number(value[0])) <= 180

export function normalizeBackupPlace(place) {
  if (place === null || place === undefined) return null
  if (typeof place !== 'object' || Array.isArray(place)) throw new Error('备选地点信息无效')
  const name = typeof place.name === 'string' ? place.name.trim() : ''
  if (!name) throw new Error('备选地点缺少名称')
  if (!validLocation(place.location)) throw new Error('备选地点缺少有效坐标')
  return {
    id: typeof place.id === 'string' ? place.id : '',
    name,
    address: typeof place.address === 'string' ? place.address : '',
    location: [Number(place.location[0]), Number(place.location[1])],
    coordinateSystem: place.coordinateSystem === 'WGS-84' ? 'WGS-84' : 'GCJ-02'
  }
}

export function normalizeBackupInput(input = {}) {
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) throw new Error('请填写备选名称')
  if ([...title].length > 60) throw new Error('备选名称需为 60 字以内')
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if ([...note].length > 200) throw new Error('备选备注需为 200 字以内')
  let durationMinutes = null
  if (input.durationMinutes !== null && input.durationMinutes !== undefined && input.durationMinutes !== '') {
    durationMinutes = Number(input.durationMinutes)
    if (!Number.isFinite(durationMinutes) || durationMinutes < 0 || durationMinutes > 1440) {
      throw new Error('备选停留时间需为 0 到 1440 分钟')
    }
    durationMinutes = Math.round(durationMinutes)
  }
  return {
    title,
    note,
    durationMinutes,
    place: normalizeBackupPlace(input.place),
    indoor: input.indoor !== false,
    source: input.source === 'pool' ? 'pool' : 'manual'
  }
}

export function backupsOf(activity) {
  return Array.isArray(activity?.backups) ? activity.backups : []
}

export function addBackup(activity, input = {}) {
  if (!activity || typeof activity !== 'object') throw new Error('活动信息无效')
  if (activity.category === '用餐' || activity.meal) {
    throw new Error('用餐活动请使用替换餐厅功能，避免餐费记录丢失')
  }
  const normalized = normalizeBackupInput(input)
  const backup = { id: createId(), ...normalized, createdAt: new Date().toISOString() }
  activity.backups = [...backupsOf(activity), backup]
  return backup
}

export function removeBackup(activity, id) {
  const list = backupsOf(activity)
  if (!list.some(item => item.id === id)) throw new Error('备选已不存在')
  activity.backups = list.filter(item => item.id !== id)
}

export function backupFromCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') throw new Error('候选信息无效')
  const place = candidate.place && validLocation(candidate.place.location) ? candidate.place : null
  return normalizeBackupInput({
    title: candidate.title || candidate.name || '',
    note: typeof candidate.description === 'string' ? candidate.description : '',
    durationMinutes: candidate.durationMinutes,
    place,
    source: 'pool',
    indoor: true
  })
}

export function swapWarnings(activity, backup) {
  const warnings = []
  warnings.push(backup.place
    ? '替换地点后，到下一站的交通耗时需要重新查询'
    : '备选没有确认地点，替换后交通耗时需要重新查询')
  warnings.push('账本和已记录的实际支出不会自动改动，请按实际消费核对')
  if (activity?.meal) warnings.push('该活动关联用餐费用，请使用替换餐厅功能')
  return warnings
}

export function planBackupSwap(activity, backupId) {
  if (!activity) throw new Error('活动信息无效')
  if (activity.category === '用餐' || activity.meal) throw new Error('用餐活动请使用替换餐厅功能')
  if (activity.swapUndo?.activity) throw new Error('请先撤销上一次替换，再尝试其他备选')
  const backup = backupsOf(activity).find(item => item.id === backupId)
  if (!backup) throw new Error('备选已不存在')
  return {
    activityId: activity.id || '',
    backupId,
    current: {
      title: activity.title || '',
      time: activity.time || '',
      durationMinutes: activity.durationMinutes ?? null,
      placeName: activity.place?.name || ''
    },
    next: {
      title: backup.title,
      time: activity.time || '',
      durationMinutes: backup.durationMinutes ?? (activity.durationMinutes ?? null),
      placeName: backup.place?.name || activity.place?.name || ''
    },
    warnings: swapWarnings(activity, backup)
  }
}

// 替换只改当前草稿；保存前可撤销。用餐活动的餐费与账本关联不被破坏。
export function applyBackupSwap(day, activityId, backupId, { now = () => new Date().toISOString() } = {}) {
  const activities = Array.isArray(day?.activities) ? day.activities : []
  const index = activities.findIndex(item => item.id === activityId)
  if (index === -1) throw new Error('活动已不存在')
  const activity = activities[index]
  const preview = planBackupSwap(activity, backupId)
  const backup = backupsOf(activity).find(item => item.id === backupId)
  const previous = activities[index - 1]
  const next = {
    ...clone(activity),
    title: backup.title,
    durationMinutes: backup.durationMinutes ?? activity.durationMinutes,
    completed: false,
    skipped: false,
    weatherBackupApplied: true,
    swappedFromTitle: activity.title || '',
    swapUndo: {
      activity: clone(activity),
      // 相邻路段的交通估算也会被清除，撤销时一并恢复。
      previous: previous ? estimateSnapshot(previous, index - 1) : null,
      at: now()
    }
  }
  if (backup.note) next.description = backup.note
  if (backup.place) next.place = clone(backup.place)
  else delete next.place
  delete next.travelEstimate
  next.travelMinutes = null
  // 前后相邻路段的耗时会因地点变化而失真，一并清除，等待重新查询。
  if (previous) {
    delete previous.travelEstimate
    previous.travelMinutes = null
  }
  activities[index] = next
  return { preview, activity: next, invalidatedPrevious: Boolean(previous) }
}

function estimateSnapshot(activity, index) {
  const snapshot = { index, id: activity.id || '' }
  if (Object.prototype.hasOwnProperty.call(activity, 'travelEstimate')) {
    snapshot.travelEstimate = activity.travelEstimate == null ? null : clone(activity.travelEstimate)
  }
  if (Object.prototype.hasOwnProperty.call(activity, 'travelMinutes')) {
    snapshot.travelMinutes = activity.travelMinutes
  }
  return snapshot
}

function restoreEstimate(activity, snapshot) {
  if (!snapshot) return
  if (Object.prototype.hasOwnProperty.call(snapshot, 'travelEstimate')) {
    activity.travelEstimate = snapshot.travelEstimate == null ? null : clone(snapshot.travelEstimate)
  } else {
    delete activity.travelEstimate
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, 'travelMinutes')) {
    activity.travelMinutes = snapshot.travelMinutes
  } else {
    delete activity.travelMinutes
  }
}

export function undoBackupSwap(day, activityId) {
  const activities = Array.isArray(day?.activities) ? day.activities : []
  const index = activities.findIndex(item => item.id === activityId)
  if (index === -1) throw new Error('活动已不存在')
  const activity = activities[index]
  const undo = activity.swapUndo
  if (!undo?.activity) throw new Error('没有可撤销的替换')
  const restored = clone(undo.activity)
  activities[index] = restored
  const previousSnapshot = undo.previous
  if (previousSnapshot) {
    const previous = previousSnapshot.id
      ? activities.find(item => item.id === previousSnapshot.id)
      : activities[previousSnapshot.index]
    if (previous && previous !== restored) restoreEstimate(previous, previousSnapshot)
  }
  return { activity: restored, title: restored.title || '' }
}

export function hasBackupUndo(activity) {
  return Boolean(activity?.swapUndo?.activity)
}
