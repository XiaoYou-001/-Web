import { validatePhoneNumber } from '../utils/validation.js'

// 仅供本地演示：真实短信发送与验证必须由后端实现。
const SMS_PROVIDERS = { DEMO: 'demo' }
const SMS_CONFIG = { provider: SMS_PROVIDERS.DEMO }
const codes = new Map()
const keyFor = (phone, scope) => JSON.stringify([scope, phone])

async function sendVerificationCode(phone, scope = 'public') {
  if (!validatePhoneNumber(phone)) throw new Error('手机号格式不正确')
  const key = keyFor(phone, scope)
  const previous = codes.get(key)
  if (previous && Date.now() - previous.timestamp < 60000) {
    throw new Error('请等待60秒后再获取验证码')
  }
  const code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
  codes.set(key, { code, timestamp: Date.now(), expiresAt: Date.now() + 600000, attempts: 0 })
  return { success: true, message: '演示验证码已生成，未发送真实短信', code, provider: 'demo' }
}

function verifyCode(phone, inputCode, scope = 'public', consume = true) {
  const key = keyFor(phone, scope)
  const stored = codes.get(key)
  if (!stored || Date.now() >= stored.expiresAt) {
    codes.delete(key)
    return { success: false, message: '验证码已过期或未获取' }
  }
  if (stored.attempts >= 5) return { success: false, message: '验证失败次数过多，请重新获取验证码' }
  if (stored.code !== inputCode) {
    stored.attempts++
    return { success: false, message: `验证码不正确，还剩${5 - stored.attempts}次尝试机会` }
  }
  if (consume) codes.delete(key)
  return { success: true, message: '验证成功' }
}

function getRemainingTime(phone, scope = 'public') {
  return Math.max(0, Math.ceil(((codes.get(keyFor(phone, scope))?.expiresAt || 0) - Date.now()) / 1000))
}

function clearVerificationCodes() { codes.clear() }

export { sendVerificationCode, verifyCode, validatePhoneNumber, getRemainingTime, clearVerificationCodes, SMS_PROVIDERS, SMS_CONFIG }
