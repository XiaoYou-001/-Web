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
  return { version: 1, ownerId, routes: [], favorites: { attractions: [], hotels: [] }, subscriptions: [], itineraries: [], orders: [], alerts: [] }
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
  const validOrder = order => identified(order) && ['attraction', 'hotel', 'travel'].includes(order.type)
    && ['pending', 'paid', 'confirmed', 'completed', 'cancelled'].includes(order.status)
    && typeof order.name === 'string' && Number.isFinite(order.totalPrice) && order.totalPrice >= 0
    && typeof order.bookingDate === 'string'
    && (order.review === undefined || (record(order.review) && Number.isInteger(order.review.rating)
      && order.review.rating >= 1 && order.review.rating <= 5
      && typeof order.review.comment === 'string' && typeof order.review.reviewedAt === 'string'))
  const validAlert = alert => identified(alert) && ['hotel', 'attraction', 'ticket', 'travel'].includes(alert.type)
    && typeof alert.itemName === 'string' && typeof alert.message === 'string'
    && typeof alert.triggeredAt === 'string'
  const ids = list => Array.isArray(list) && list.every(id => typeof id === 'string' && id.length > 0) && new Set(list).size === list.length
  if (!record(data) || data.version !== 1 || data.ownerId !== ownerId
    || !Array.isArray(data.routes) || !data.routes.every(validRoute)
    || !record(data.favorites) || !ids(data.favorites.attractions) || !ids(data.favorites.hotels)
    || !Array.isArray(data.subscriptions) || !data.subscriptions.every(validSubscription)
    || !Array.isArray(data.itineraries) || !data.itineraries.every(item => identified(item) && Array.isArray(item.days))
    || (data.orders !== undefined && (!Array.isArray(data.orders) || !data.orders.every(validOrder)))
    || (data.alerts !== undefined && (!Array.isArray(data.alerts) || !data.alerts.every(validAlert)))) {
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
  if (data.orders === undefined) data.orders = []
  if (data.alerts === undefined) data.alerts = []
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

export const ORDER_STATUSES = ['pending', 'paid', 'confirmed', 'completed', 'cancelled']

function validateOrderInput(order) {
  if (!record(order)) throw new Error('订单信息无效')
  if (!['attraction', 'hotel', 'travel'].includes(order.type)) throw new Error('订单类型无效')
  if (typeof order.name !== 'string' || !order.name.trim()) throw new Error('订单名称不能为空')
  if (!Number.isFinite(order.totalPrice) || order.totalPrice < 0) throw new Error('订单金额无效')
  if (typeof order.bookingDate !== 'string' || !order.bookingDate) throw new Error('预订日期无效')
}

export function createUserOrder(order, expectedOwnerId) {
  const input = clone(order)
  validateOrderInput(input)
  return updateUserData(data => {
    const saved = {
      ...input,
      name: input.name.trim(),
      id: createId(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    if (!ORDER_STATUSES.includes(saved.status)) saved.status = 'pending'
    data.orders.unshift(saved)
    return saved
  }, expectedOwnerId)
}

export function updateUserOrder(id, updates, expectedOwnerId) {
  const patch = clone(updates)
  if (patch.totalPrice !== undefined && (!Number.isFinite(patch.totalPrice) || patch.totalPrice < 0)) throw new Error('订单金额无效')
  if (patch.status !== undefined && !ORDER_STATUSES.includes(patch.status)) throw new Error('订单状态无效')
  return updateUserData(data => {
    const index = data.orders.findIndex(order => order.id === id)
    if (index === -1) return null
    const original = data.orders[index]
    data.orders[index] = { ...original, ...patch, id: original.id, createdAt: original.createdAt, updatedAt: new Date().toISOString() }
    return data.orders[index]
  }, expectedOwnerId)
}

export function cancelUserOrder(id, expectedOwnerId) {
  return updateUserData(data => {
    const order = data.orders.find(item => item.id === id)
    if (!order) throw new Error('该订单已不存在，请刷新后重试')
    if (order.status === 'completed' || order.status === 'cancelled') throw new Error('该订单当前状态无法取消')
    order.status = 'cancelled'
    order.updatedAt = new Date().toISOString()
  }, expectedOwnerId)
}

// 统一的状态机：按流程推进订单
export const NEXT_ORDER_STATUS = {
  pending: 'paid',
  paid: 'confirmed',
  confirmed: 'completed'
}
export function advanceOrderStatus(id, expectedOwnerId) {
  return updateUserData(data => {
    const order = data.orders.find(item => item.id === id)
    if (!order) throw new Error('该订单已不存在，请刷新后重试')
    const next = NEXT_ORDER_STATUS[order.status]
    if (!next) throw new Error('该订单当前状态无法推进')
    order.status = next
    order.updatedAt = new Date().toISOString()
  }, expectedOwnerId)
}

export function submitOrderReview(id, review, expectedOwnerId) {
  const input = clone(review)
  if (!record(input) || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error('请选择1至5星的评分')
  }
  if (typeof input.comment !== 'string' || input.comment.trim().length > 500) {
    throw new Error('评价内容需为500字以内')
  }
  return updateUserData(data => {
    const order = data.orders.find(item => item.id === id)
    if (!order) throw new Error('该订单已不存在，请刷新后重试')
    if (order.status !== 'completed') throw new Error('仅可对「已完成」的订单进行评价')
    order.review = {
      rating: input.rating,
      comment: input.comment.trim(),
      reviewedAt: new Date().toISOString()
    }
    order.updatedAt = new Date().toISOString()
    return order.review
  }, expectedOwnerId)
}

export function createPriceAlert(alert, expectedOwnerId) {
  const input = clone(alert)
  if (!record(input)) throw new Error('提醒信息无效')
  if (typeof input.itemName !== 'string' || !input.itemName.trim() || typeof input.message !== 'string' || !input.message.trim()) {
    throw new Error('提醒内容无效')
  }
  return updateUserData(data => {
    const saved = { ...input, id: createId(), triggeredAt: input.triggeredAt || new Date().toISOString() }
    data.alerts.unshift(saved)
    return saved
  }, expectedOwnerId)
}

export function deletePriceAlert(id, expectedOwnerId) {
  return updateUserData(data => {
    const index = data.alerts.findIndex(alert => alert.id === id)
    if (index === -1) throw new Error('该提醒已不存在，请刷新后重试')
    data.alerts.splice(index, 1)
  }, expectedOwnerId)
}

export function clearAllPriceAlerts(expectedOwnerId) {
  return updateUserData(data => { data.alerts = [] }, expectedOwnerId)
}
