import { validatePhoneNumber, validatePassword } from '../utils/validation.js'
import { clearVerificationCodes, verifyCode } from './smsService.js'
import { createId } from '../utils/id.js'

// 本地演示账号仓库。正式认证和密码哈希需迁至服务端。
export const DEFAULT_AVATAR = '/default-avatar.svg'
const legacyKeys = ['authToken', 'userInfo', 'userNickname', 'userAvatar', 'userPhone', 'userPassword', 'username', 'userId']

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

function readUsers() {
  const users = readJSON('users', [])
  return Array.isArray(users) ? users.filter(user => user && typeof user.id === 'string') : []
}

function publicUser(user) {
  return {
    id: user.id,
    phone: user.phone || '',
    nickname: user.nickname || (user.phone ? `用户${user.phone.slice(-4)}` : '微信用户'),
    avatar: user.avatar || DEFAULT_AVATAR,
    createdAt: user.createdAt || '',
    isWechatUser: Boolean(user.isWechatUser),
    hasPassword: Boolean(user.password)
  }
}

function clearLegacyKeys() { legacyKeys.forEach(key => localStorage.removeItem(key)) }

function startSession(user, loginType) {
  try {
    localStorage.removeItem('isAuthenticated')
    localStorage.setItem('currentUser', JSON.stringify({ id: user.id, loginType, loggedInAt: new Date().toISOString() }))
    localStorage.setItem('isAuthenticated', 'true')
    clearLegacyKeys()
    return { success: true, user: getCurrentUser() }
  } catch {
    logout()
    return { success: false, message: '无法保存登录状态，请释放浏览器存储空间后重试' }
  }
}

export function getCurrentUser() {
  try {
    if (localStorage.getItem('isAuthenticated') !== 'true') return null
    const session = readJSON('currentUser', null)
    const user = session && readUsers().find(user => user.id === session.id)
    return user ? { ...publicUser(user), loginType: session.loginType, loggedInAt: session.loggedInAt } : null
  } catch { return null }
}

export const isLoggedIn = () => Boolean(getCurrentUser())

export function logout() {
  localStorage.removeItem('isAuthenticated')
  localStorage.removeItem('currentUser')
  clearLegacyKeys()
  clearVerificationCodes()
}

function writeUsers(users) {
  try {
    localStorage.setItem('users', JSON.stringify(users))
    return { success: true }
  } catch {
    return { success: false, message: '本地数据保存失败，请释放浏览器存储空间后重试' }
  }
}

export function registerUser(phone, password) {
  if (!validatePhoneNumber(phone)) return { success: false, message: '手机号格式不正确' }
  if (!validatePassword(password)) return { success: false, message: '密码长度应为6-20位' }
  const users = readUsers()
  if (users.some(user => user.phone === phone)) return { success: false, message: '该手机号已注册' }
  const user = { id: createId(), phone, password, createdAt: new Date().toISOString(), isWechatUser: false }
  const result = writeUsers([...users, user])
  return result.success ? { success: true, message: '注册成功', user: publicUser(user) } : result
}

export function loginUser(phone, password) {
  const user = readUsers().find(user => user.phone === phone)
  if (!user || !validatePassword(password) || user.password !== password) return { success: false, message: '手机号或密码错误' }
  return { message: '登录成功', ...startSession(user, 'phone') }
}

export function loginWithWechat(info) {
  if (!info || typeof info.openId !== 'string' || !info.openId) return { success: false, message: '微信用户信息无效' }
  const users = readUsers()
  let user = users.find(user => user.openId === info.openId || (info.unionId && user.unionId === info.unionId))
  if (!user) {
    user = { id: createId(), openId: info.openId, unionId: info.unionId || '', nickname: info.nickname || '微信用户', avatar: info.avatar || '', isWechatUser: true, phone: '', createdAt: new Date().toISOString() }
    const result = writeUsers([...users, user])
    if (!result.success) return result
  }
  return { message: '微信演示登录成功', ...startSession(user, 'wechat') }
}

export function updateCurrentUserProfile(patch) {
  const current = getCurrentUser()
  if (!current) return { success: false, message: '请先登录' }
  const users = readUsers()
  const user = users.find(user => user.id === current.id)
  if ('nickname' in patch) {
    if (typeof patch.nickname !== 'string' || !patch.nickname.trim() || patch.nickname.trim().length > 30) {
      return { success: false, message: '昵称需为1至30个字符' }
    }
    user.nickname = patch.nickname.trim()
  }
  if ('avatar' in patch) {
    if (typeof patch.avatar !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(patch.avatar) || patch.avatar.length > 1500000) {
      return { success: false, message: '请上传1MB以内的 PNG、JPEG、WebP 或 GIF 图片' }
    }
    user.avatar = patch.avatar
  }
  const result = writeUsers(users)
  return result.success ? { success: true, user: getCurrentUser() } : result
}

export function bindCurrentPhone(phone, code) {
  const current = getCurrentUser()
  if (!current) return { success: false, message: '请先登录' }
  if (!validatePhoneNumber(phone)) return { success: false, message: '手机号格式不正确' }
  const users = readUsers()
  if (users.some(user => user.phone === phone && user.id !== current.id)) return { success: false, message: '该手机号已被其他账号绑定' }
  const verified = verifyCode(phone, code, current.id, false)
  if (!verified.success) return verified
  users.find(user => user.id === current.id).phone = phone
  const result = writeUsers(users)
  if (result.success) verifyCode(phone, code, current.id)
  return result.success ? { success: true, message: '手机号绑定成功', user: getCurrentUser() } : result
}

export function changeCurrentPassword(oldPassword, newPassword) {
  const current = getCurrentUser()
  if (!current) return { success: false, message: '请先登录' }
  if (!current.phone) return { success: false, message: '请先绑定手机号，再设置登录密码' }
  const users = readUsers()
  const user = users.find(user => user.id === current.id)
  if (user.password && user.password !== oldPassword) return { success: false, message: '当前密码错误' }
  if (!validatePassword(newPassword)) return { success: false, message: '新密码长度必须在6-20位之间' }
  if (user.password === newPassword) return { success: false, message: '新密码不能与当前密码相同' }
  user.password = newPassword
  const result = writeUsers(users)
  if (result.success) logout()
  return result.success ? { success: true, message: '密码修改成功，请重新登录' } : result
}
