import { loginWithWechat } from './authService.js'
import { createId } from '../utils/id.js'

// 本地演示流程：必须点击模拟授权，不通过随机轮询创建账号。
const sessions = new Map()
const demoUser = { openId: 'demo-wechat-user', nickname: '微信演示用户', avatar: '' }

export const wechatLoginService = {
  pollingTimer: null,
  pollingGeneration: 0,

  async getQRCode() {
    for (const [id, session] of sessions) {
      if (session.expireTime <= Date.now()) sessions.delete(id)
    }
    const loginId = createId()
    const expireTime = Date.now() + 600000
    sessions.set(loginId, { expireTime, confirmed: false })
    return { success: true, data: { loginId, expireTime } }
  },

  async getLoginStatus(loginId) {
    const session = sessions.get(loginId)
    if (!session || session.expireTime <= Date.now()) return { success: true, status: 'expired' }
    return session.confirmed
      ? { success: true, status: 'confirmed', userInfo: { ...demoUser } }
      : { success: true, status: 'waiting' }
  },

  async confirmDemoLogin(loginId) {
    const session = sessions.get(loginId)
    if (!session || session.expireTime <= Date.now()) return { success: false, message: '演示授权已过期，请刷新' }
    session.confirmed = true
    return this.getLoginStatus(loginId)
  },

  async login(info) {
    const result = loginWithWechat(info)
    return result.success ? { success: true, data: { user: result.user } } : result
  },

  startPolling(loginId, callback, interval = 2000) {
    this.stopPolling()
    const generation = this.pollingGeneration
    const poll = async () => {
      try {
        const result = await this.getLoginStatus(loginId)
        if (generation !== this.pollingGeneration) return
        callback(result)
        if (generation === this.pollingGeneration && result.success && ['waiting', 'scanning'].includes(result.status)) {
          this.pollingTimer = setTimeout(poll, interval)
        }
      } catch {
        if (generation === this.pollingGeneration) callback({ success: false, message: '检查演示登录状态失败' })
      }
    }
    this.pollingTimer = setTimeout(poll, 0)
  },

  stopPolling() {
    this.pollingGeneration++
    clearTimeout(this.pollingTimer)
    this.pollingTimer = null
  }
}

export default wechatLoginService
