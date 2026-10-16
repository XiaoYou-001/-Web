import { getCurrentUser } from './authService.js'
import { createId } from '../utils/id.js'
import { inclusiveDayCount } from '../utils/date.js'

export const USER_DATA_PREFIX = 'travel_data:v1:'
export const userDataKey = ownerId => `${USER_DATA_PREFIX}${encodeURIComponent(ownerId)}`
const clone = value => JSON.parse(JSON.stringify(value))
const record = value => value && typeof value === 'object' && !Array.isArray(value)
const validId = value => (typeof value === 'string' && value.length > 0) || (typeof value === 'number' && Number.isFinite(value))
const identified = value => record(value) && validId(value.id)

export function emptyUserData(ownerId = '') {
  return { version: 1, ownerId, routes: [], favorites: { attractions: [], hotels: [] }, subscriptions: [], itineraries: [] }
}

function requireOwner(expectedOwnerId) {
  const currentId = getCurrentUser()?.id
  if (!currentId) throw new Error('请先登录后再保存个人数据')
  if (expectedOwnerId !== undefined && expectedOwnerId !== currentId) throw new Error('账号已切换，请重新打开页面后操作')
  return currentId
}

function validateData(data, ownerId) {
  const validRoute = route => identified(route) && typeof route.title === 'string' && typeof route.startDate === 'string' && typeof route.endDate === 'string'
    && Array.isArray(route.themes) && route.themes.every(theme => typeof theme === 'string') && record(route.preferences)
  const validSubscription = sub => identified(sub) && ['hotel', 'attraction', 'ticket'].includes(sub.type) && validId(sub.itemId)
    && typeof sub.itemName === 'string' && typeof sub.active === 'boolean' && Number.isFinite(sub.targetPrice) && sub.targetPrice >= 0
  const ids = list => Array.isArray(list) && list.every(id => typeof id === 'string' && id.length > 0) && new Set(list).size === list.length
  if (!record(data) || data.version !== 1 || data.ownerId !== ownerId
    || !Array.isArray(data.routes) || !data.routes.every(validRoute)
    || !record(data.favorites) || !ids(data.favorites.attractions) || !ids(data.favorites.hotels)
    || !Array.isArray(data.subscriptions) || !data.subscriptions.every(validSubscription)
    || !Array.isArray(data.itineraries) || !data.itineraries.every(item => identified(item) && Array.isArray(item.days))) {
    throw new Error('已保存的数据格式异常，原始记录已保留，请勿清除浏览器数据')
  }
}

export function readUserData(expectedOwnerId) {
  const ownerId = requireOwner(expectedOwnerId)
  let raw
  try { raw = localStorage.getItem(userDataKey(ownerId)) } catch { throw new Error('无法读取本地数据，请检查浏览器存储权限') }
  if (raw === null) return emptyUserData(ownerId)
  let data
  try { data = JSON.parse(raw) } catch { throw new Error('已保存的数据无法读取，原始记录已保留，请勿清除浏览器数据') }
  validateData(data, ownerId)
  return data
}

export function updateUserData(mutate, expectedOwnerId) {
  const data = readUserData(expectedOwnerId)
  const result = mutate(data)
  validateData(data, data.ownerId)
  requireOwner(data.ownerId)
  try { localStorage.setItem(userDataKey(data.ownerId), JSON.stringify(data)) } catch { throw new Error('保存失败，请检查浏览器存储权限或剩余空间后重试') }
  return { data, result: result === undefined ? undefined : clone(result) }
}

export function saveUserRoute(route, expectedOwnerId) {
  const draft = clone(route)
  if (typeof draft.title !== 'string' || !draft.title.trim()) throw new Error('请输入线路名称')
  inclusiveDayCount(draft.startDate, draft.endDate)
  return updateUserData(data => {
    draft.title = draft.title.trim()
    const index = draft.id === undefined ? -1 : data.routes.findIndex(item => item.id === draft.id)
    if (draft.id !== undefined && index === -1) throw new Error('该线路已不存在，请重新打开线路列表')
    if (index === -1) {
      const saved = { ...draft, id: createId(), createdAt: new Date().toISOString(), progress: draft.progress || 0, isFavorite: Boolean(draft.isFavorite) }
      data.routes.unshift(saved)
      return saved
    }
    const saved = { ...draft, id: data.routes[index].id, createdAt: data.routes[index].createdAt }
    data.routes[index] = saved
    return saved
  }, expectedOwnerId)
}

export function deleteUserRoute(id, expectedOwnerId) {
  return updateUserData(data => { data.routes = data.routes.filter(route => route.id !== id) }, expectedOwnerId)
}

export function toggleRouteFavorite(id, expectedOwnerId) {
  return updateUserData(data => {
    const route = data.routes.find(item => item.id === id)
    if (!route) throw new Error('该线路已不存在，请刷新后重试')
    route.isFavorite = !route.isFavorite
  }, expectedOwnerId)
}

export function toggleUserFavorite(type, id, expectedOwnerId) {
  if (!['attractions', 'hotels'].includes(type) || !validId(id)) throw new Error('收藏信息无效')
  return updateUserData(data => {
    const key = String(id)
    const index = data.favorites[type].indexOf(key)
    if (index === -1) data.favorites[type].push(key)
    else data.favorites[type].splice(index, 1)
  }, expectedOwnerId)
}

export function createUserSubscription(subscription, expectedOwnerId) {
  const input = clone(subscription)
  return updateUserData(data => {
    const existing = data.subscriptions.find(sub => sub.type === input.type && String(sub.itemId) === String(input.itemId))
    if (existing) { existing.active = true; return existing }
    const saved = { ...input, id: createId(), createdAt: new Date().toISOString(), active: true }
    data.subscriptions.push(saved)
    return saved
  }, expectedOwnerId)
}

export function updateUserSubscription(id, updates, expectedOwnerId) {
  const patch = clone(updates)
  return updateUserData(data => {
    const index = data.subscriptions.findIndex(sub => sub.id === id)
    if (index === -1) return null
    const original = data.subscriptions[index]
    data.subscriptions[index] = { ...original, ...patch, id: original.id, createdAt: original.createdAt, type: original.type, itemId: original.itemId }
    return data.subscriptions[index]
  }, expectedOwnerId)
}

export function deleteUserSubscription(id, expectedOwnerId) {
  return updateUserData(data => { data.subscriptions = data.subscriptions.filter(sub => sub.id !== id) }, expectedOwnerId)
}
