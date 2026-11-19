import { createId } from '../utils/id.js'
import { parseDateOnly, localDateString } from '../utils/date.js'

// 旅行手账按账号隔离保存在 localStorage；照片另存 IndexedDB（见 photoStore.js）。
export const JOURNAL_VERSION = 1
export const JOURNAL_MOODS = ['开心', '平静', '疲惫', '惊喜', '遗憾']

export const journalKey = ownerId => `travel_journal:v1:${encodeURIComponent(String(ownerId))}`
// 未提交的手账草稿按账号 + 记录位置分别保存，避免工作台快速记录覆盖整页编辑的内容。
export const journalDraftKey = (ownerId, scope = 'page') => `travel_journal_draft:v1:${encodeURIComponent(String(ownerId))}:${encodeURIComponent(String(scope || 'page'))}`

const emptyJournal = ownerId => ({ version: JOURNAL_VERSION, ownerId: String(ownerId), entries: [], updatedAt: '' })

function requireOwner(ownerId) {
  const owner = String(ownerId ?? '').trim()
  if (!owner) throw new Error('请先登录再使用旅行手账')
  return owner
}

export function parseTags(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,，、\s]+/)
  const tags = []
  for (const raw of list) {
    const tag = String(raw ?? '').trim()
    if (!tag) continue
    if (tag.length > 20) throw new Error('单个标签需为20字以内')
    if (!tags.includes(tag)) tags.push(tag)
  }
  if (tags.length > 10) throw new Error('最多添加 10 个标签')
  return tags
}

// 读取旧数据时容忍缺失日期：无法构成真实日历日期时回退到今天，避免列表排序崩溃。
function safeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return localDateString()
  try { parseDateOnly(value); return value } catch { return localDateString() }
}

export function normalizeJournalEntry(input = {}) {
  const lat = input.lat === null || input.lat === undefined || input.lat === '' ? null : Number(input.lat)
  const lng = input.lng === null || input.lng === undefined || input.lng === '' ? null : Number(input.lng)
  const validCoordinate = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  return {
    id: typeof input.id === 'string' && input.id ? input.id : createId(),
    routeId: typeof input.routeId === 'string' ? input.routeId : '',
    routeTitle: typeof input.routeTitle === 'string' ? input.routeTitle.slice(0, 80) : '',
    date: safeDate(input.date),
    title: typeof input.title === 'string' ? input.title.trim().slice(0, 80) : '',
    content: typeof input.content === 'string' ? input.content.slice(0, 5000) : '',
    mood: JOURNAL_MOODS.includes(input.mood) ? input.mood : '',
    placeName: typeof input.placeName === 'string' ? input.placeName.trim().slice(0, 80) : '',
    lat: validCoordinate ? lat : null,
    lng: validCoordinate ? lng : null,
    tags: Array.isArray(input.tags) ? input.tags.filter(tag => typeof tag === 'string' && tag).slice(0, 10) : [],
    photoIds: Array.isArray(input.photoIds) ? input.photoIds.filter(id => typeof id === 'string' && id) : [],
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : ''
  }
}

export function validateJournalEntry(input) {
  if (input?.date) parseDateOnly(input.date)
  const entry = normalizeJournalEntry(input)
  if (!entry.title) throw new Error('请输入手账标题')
  if (!entry.content.trim()) throw new Error('请输入手账内容')
  if (entry.routeId && !entry.routeTitle) entry.routeTitle = '未命名旅行'
  return entry
}

export function readJournal(ownerId) {
  const owner = String(ownerId ?? '').trim()
  if (!owner) return { ...emptyJournal(''), corrupted: false }
  try {
    const raw = globalThis.localStorage?.getItem(journalKey(owner))
    if (!raw) return { ...emptyJournal(owner), corrupted: false }
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || data.ownerId !== owner || !Array.isArray(data.entries)) {
      return { ...emptyJournal(owner), corrupted: true }
    }
    return {
      version: JOURNAL_VERSION,
      ownerId: owner,
      entries: data.entries.filter(item => item && typeof item === 'object').map(normalizeJournalEntry),
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      corrupted: false
    }
  } catch {
    return { ...emptyJournal(owner), corrupted: true }
  }
}

// 草稿只保存表单原文（字符串），不做字段规范化，恢复后仍需正常校验才能保存。
export function readJournalDraft(ownerId, scope = 'page') {
  const owner = String(ownerId ?? '').trim()
  if (!owner) return null
  try {
    const raw = globalThis.localStorage?.getItem(journalDraftKey(owner, scope))
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || data.ownerId !== owner) return null
    const text = value => (typeof value === 'string' ? value : '')
    const draft = {
      id: text(data.id), date: text(data.date), routeId: text(data.routeId), routeTitle: text(data.routeTitle),
      title: text(data.title), content: text(data.content), mood: text(data.mood), placeName: text(data.placeName),
      lat: text(data.lat), lng: text(data.lng), tags: text(data.tags), savedAt: text(data.savedAt)
    }
    if (!draft.title.trim() && !draft.content.trim()) return null
    return draft
  } catch {
    return null
  }
}

export function saveJournalDraft(ownerId, input = {}, scope = 'page') {
  const owner = requireOwner(ownerId)
  const text = (value, limit) => String(value ?? '').slice(0, limit)
  // 标题和正文都为空时视为没有草稿，顺手清掉旧条目，避免留下空壳记录。
  if (!text(input.title, 200).trim() && !text(input.content, 6000).trim()) {
    clearJournalDraft(owner, scope)
    return null
  }
  try {
    globalThis.localStorage.setItem(journalDraftKey(owner, scope), JSON.stringify({
      ownerId: owner,
      id: text(input.id, 80),
      date: text(input.date, 10),
      routeId: text(input.routeId, 80),
      routeTitle: text(input.routeTitle, 80),
      title: text(input.title, 200),
      content: text(input.content, 6000),
      mood: text(input.mood, 20),
      placeName: text(input.placeName, 200),
      lat: text(input.lat, 32),
      lng: text(input.lng, 32),
      tags: text(input.tags, 400),
      savedAt: new Date().toISOString()
    }))
  } catch {
    throw new Error('手账草稿保存失败，请检查浏览器存储空间')
  }
  return readJournalDraft(owner, scope)
}

export function clearJournalDraft(ownerId, scope = 'page') {
  const owner = String(ownerId ?? '').trim()
  if (!owner) return false
  try {
    globalThis.localStorage?.removeItem(journalDraftKey(owner, scope))
    return true
  } catch {
    return false
  }
}

function writeJournal(ownerId, journal) {
  const owner = requireOwner(ownerId)
  try {
    globalThis.localStorage.setItem(journalKey(owner), JSON.stringify({
      version: JOURNAL_VERSION, ownerId: owner, entries: journal.entries, updatedAt: new Date().toISOString()
    }))
    return true
  } catch {
    throw new Error('手账保存失败，请检查浏览器存储空间')
  }
}

// 新建或更新手账。更新时保留创建时间，照片 id 由调用方维护。
export function saveJournalEntry(ownerId, input) {
  const owner = requireOwner(ownerId)
  const journal = readJournal(owner)
  if (journal.corrupted) throw new Error('手账数据已损坏，请先备份或清理后重试')
  const entry = validateJournalEntry(input)
  const index = journal.entries.findIndex(item => item.id === entry.id)
  if (index === -1) {
    if (!input.id) entry.id = createId()
    journal.entries.push({ ...entry, createdAt: entry.createdAt || new Date().toISOString() })
  } else {
    const existing = journal.entries[index]
    journal.entries[index] = {
      ...existing,
      ...entry,
      photoIds: Array.isArray(input.photoIds) ? entry.photoIds : existing.photoIds,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    }
  }
  writeJournal(owner, journal)
  return index === -1 ? journal.entries[journal.entries.length - 1] : journal.entries[index]
}

export function deleteJournalEntry(ownerId, id) {
  const owner = requireOwner(ownerId)
  const journal = readJournal(owner)
  if (journal.corrupted) throw new Error('手账数据已损坏，请先备份或清理后重试')
  const index = journal.entries.findIndex(item => item.id === id)
  if (index === -1) throw new Error('这篇手账已不存在，请刷新后重试')
  const [removed] = journal.entries.splice(index, 1)
  writeJournal(owner, journal)
  return removed
}

export function listJournalEntries(ownerId, { routeId } = {}) {
  const journal = readJournal(ownerId)
  const entries = routeId ? journal.entries.filter(item => item.routeId === routeId) : journal.entries
  return sortJournalEntries(entries)
}

export function sortJournalEntries(entries = []) {
  return [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))
}

export function groupEntriesByMonth(entries = []) {
  const groups = []
  for (const entry of sortJournalEntries(entries)) {
    const key = String(entry.date).slice(0, 7)
    let group = groups.find(item => item.key === key)
    if (!group) {
      group = { key, label: `${key.slice(0, 4)} 年 ${Number(key.slice(5, 7))} 月`, entries: [] }
      groups.push(group)
    }
    group.entries.push(entry)
  }
  return groups
}

export function journalStats(entries = []) {
  const routeIds = new Set(entries.map(entry => entry.routeId).filter(Boolean))
  const months = new Set(entries.map(entry => String(entry.date).slice(0, 7)))
  return {
    total: entries.length,
    routes: routeIds.size,
    months: months.size,
    withPhotos: entries.filter(entry => entry.photoIds.length > 0).length
  }
}

// 只有同时具备有效经纬度的地点才算“已确认”，不拿城市名猜坐标。
// 注意 Number('')、Number(null) 都等于 0，必须先把空值挡掉，否则缺坐标的地点会被错放到 (0,0)。
function coordinateNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return NaN
  if (typeof value === 'string' && value.trim() === '') return NaN
  return Number(value)
}

export function confirmedCoordinate(place) {
  if (!place || typeof place !== 'object') return null
  let lat, lng
  if (Array.isArray(place.location) && place.location.length >= 2) {
    lng = coordinateNumber(place.location[0])
    lat = coordinateNumber(place.location[1])
  } else {
    lat = coordinateNumber(place.lat)
    lng = coordinateNumber(place.lng)
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

const coordinateKey = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`

export function collectFootprints(routes = [], entries = []) {
  const places = new Map()
  const add = (name, lat, lng, date, source, routeId, routeTitle) => {
    const key = coordinateKey(lat, lng)
    let place = places.get(key)
    if (!place) {
      place = { key, name: name || '未命名地点', lat, lng, visits: [] }
      places.set(key, place)
    }
    if (name && place.name === '未命名地点') place.name = name
    if (!place.visits.some(visit => visit.date === date && visit.routeId === routeId && visit.source === source)) {
      place.visits.push({ date: date || '', source, routeId: routeId || '', routeTitle: routeTitle || '' })
    }
  }
  for (const route of routes) {
    for (const day of route.days || []) {
      for (const activity of day.activities || []) {
        const coordinate = confirmedCoordinate(activity.place)
        if (!coordinate) continue
        add(activity.place.name || activity.title, coordinate.lat, coordinate.lng, day.date, 'route', route.id, route.title)
      }
    }
  }
  for (const entry of entries) {
    if (entry.lat === null || entry.lng === null) continue
    add(entry.placeName || entry.title, entry.lat, entry.lng, entry.date, 'journal', entry.routeId, entry.routeTitle)
  }
  return [...places.values()]
    .map(place => ({
      ...place,
      visits: place.visits.sort((a, b) => String(b.date).localeCompare(String(a.date))),
      lastDate: place.visits.map(visit => visit.date).sort().at(-1) || ''
    }))
    .sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate)) || a.name.localeCompare(b.name, 'zh-CN'))
}

export function entryRouteState(entry, routes = []) {
  if (!entry.routeId) return 'unlinked'
  return routes.some(route => route.id === entry.routeId) ? 'active' : 'deleted'
}

// 分享/导出只能使用用户显式勾选的手账，默认不导出全部。
export function buildJournalExport(entries = [], selectedIds = []) {
  const selected = new Set(selectedIds)
  const list = sortJournalEntries(entries).filter(entry => selected.has(entry.id))
  if (!list.length) throw new Error('请先勾选要导出的手账')
  const lines = ['旅行手账导出', `导出时间：${localDateString()}`, `共 ${list.length} 篇（仅包含手动勾选的内容）`, '说明：文字导出不包含照片文件，照片请在应用中逐张下载。', '']
  for (const entry of [...list].reverse()) {
    lines.push(`## ${entry.title}`)
    lines.push(`日期：${entry.date}`)
    if (entry.routeTitle) lines.push(`行程：${entry.routeTitle}`)
    if (entry.placeName) lines.push(`地点：${entry.placeName}`)
    if (entry.mood) lines.push(`心情：${entry.mood}`)
    if (entry.tags.length) lines.push(`标签：${entry.tags.join('、')}`)
    if (entry.photoIds.length) lines.push(`照片：${entry.photoIds.length} 张（未包含在文字导出中）`)
    lines.push('', entry.content, '', '---', '')
  }
  return lines.join('\n')
}
