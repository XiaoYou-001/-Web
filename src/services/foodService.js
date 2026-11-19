import { normalizeRestaurant, normalizeBudgetYuan } from '../utils/dining.js'
import { createId } from '../utils/id.js'

// 餐厅收藏按账号隔离保存在本地；只保存真实检索结果，不保存伪造价格。
const VERSION = 1
export const DINING_STORAGE_PREFIX = 'travel_dining:v1:'

export function diningKey(ownerId) {
  return `${DINING_STORAGE_PREFIX}${encodeURIComponent(String(ownerId ?? ''))}`
}

function storage() {
  return globalThis.localStorage
}

function normalizeFavorite(input = {}) {
  const restaurant = normalizeRestaurant({
    id: input.restaurantId || input.id,
    name: input.name,
    address: input.address,
    city: input.city,
    location: input.location,
    coordinateSystem: input.coordinateSystem,
    source: input.source
  })
  const budgetPerPerson = normalizeBudgetYuan(input.budgetPerPerson ?? input.budgetPerPersonYuan)
  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map(tag => String(tag).trim()).filter(Boolean))].slice(0, 8)
    : []
  const createdAt = typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString()
  return {
    id: typeof input.id === 'string' && input.id ? input.id : createId(),
    restaurantId: restaurant.id,
    name: restaurant.name,
    address: restaurant.address,
    city: restaurant.city,
    location: restaurant.location,
    coordinateSystem: restaurant.coordinateSystem,
    source: restaurant.source,
    note: typeof input.note === 'string' ? input.note.slice(0, 240) : '',
    taste: typeof input.taste === 'string' ? input.taste.slice(0, 120) : '',
    budgetPerPerson,
    tags,
    createdAt,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : createdAt
  }
}

function blankState(ownerId) {
  return { version: VERSION, ownerId: String(ownerId ?? ''), favorites: [], updatedAt: '' }
}

export function readDining(ownerId) {
  const key = diningKey(ownerId)
  const raw = storage()?.getItem(key)
  if (raw === null || raw === undefined) return { ...blankState(ownerId), corrupted: false }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...blankState(ownerId), corrupted: true }
  }
  if (!parsed || typeof parsed !== 'object' || parsed.ownerId !== String(ownerId) || parsed.version !== VERSION || !Array.isArray(parsed.favorites)) {
    return { ...blankState(ownerId), corrupted: true }
  }
  const favorites = []
  for (const item of parsed.favorites) {
    try {
      favorites.push(normalizeFavorite(item))
    } catch {
      // 单条损坏不影响其他收藏，写入时会整体重写为有效数据。
    }
  }
  return {
    version: VERSION,
    ownerId: String(ownerId),
    favorites,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    corrupted: false
  }
}

function write(ownerId, state) {
  const current = readDining(ownerId)
  if (current.corrupted) throw new Error('餐厅收藏数据已损坏，已停止覆盖；请先备份或清理浏览器存储。')
  const next = {
    version: VERSION,
    ownerId: String(ownerId),
    favorites: state,
    updatedAt: new Date().toISOString()
  }
  storage()?.setItem(diningKey(ownerId), JSON.stringify(next))
  return next
}

export function listFavorites(ownerId) {
  return readDining(ownerId).favorites.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

export function findFavorite(ownerId, favoriteId) {
  return listFavorites(ownerId).find(item => item.id === favoriteId) || null
}

export function saveFavorite(ownerId, restaurant, patch = {}) {
  const state = readDining(ownerId)
  if (state.corrupted) throw new Error('餐厅收藏数据已损坏，已停止覆盖；请先备份或清理浏览器存储。')
  const normalized = normalizeRestaurant(restaurant)
  const existing = state.favorites.find(item => item.restaurantId === normalized.id)
  if (existing) {
    const merged = normalizeFavorite({ ...existing, ...patch, ...normalized, restaurantId: normalized.id })
    merged.updatedAt = new Date().toISOString()
    write(ownerId, state.favorites.map(item => item.id === existing.id ? merged : item))
    return merged
  }
  const favorite = normalizeFavorite({ ...patch, ...normalized, restaurantId: normalized.id })
  write(ownerId, [...state.favorites, favorite])
  return favorite
}

export function updateFavorite(ownerId, favoriteId, patch = {}) {
  const state = readDining(ownerId)
  if (state.corrupted) throw new Error('餐厅收藏数据已损坏，已停止覆盖；请先备份或清理浏览器存储。')
  const existing = state.favorites.find(item => item.id === favoriteId)
  if (!existing) throw new Error('该收藏已不存在，请刷新后重试')
  const merged = normalizeFavorite({
    ...existing,
    note: patch.note === undefined ? existing.note : patch.note,
    taste: patch.taste === undefined ? existing.taste : patch.taste,
    budgetPerPerson: patch.budgetPerPerson === undefined ? existing.budgetPerPerson : patch.budgetPerPerson
  })
  merged.updatedAt = new Date().toISOString()
  write(ownerId, state.favorites.map(item => item.id === favoriteId ? merged : item))
  return merged
}

export function removeFavorite(ownerId, favoriteId) {
  const state = readDining(ownerId)
  if (state.corrupted) throw new Error('餐厅收藏数据已损坏，已停止覆盖；请先备份或清理浏览器存储。')
  const existing = state.favorites.find(item => item.id === favoriteId)
  if (!existing) throw new Error('该收藏已不存在，请刷新后重试')
  write(ownerId, state.favorites.filter(item => item.id !== favoriteId))
  return existing
}

export function favoriteCount(ownerId) {
  return readDining(ownerId).favorites.length
}
