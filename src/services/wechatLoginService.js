// 微信登录服务

import { loginWithWechat } from './authService'

// 模拟微信开放平台接口（实际项目中应替换为真实接口）
const WECHAT_API = {
  // 获取微信登录二维码
  generateQRCode: async () => {
    try {
      // 在实际项目中，这里应该调用微信开放平台的接口获取二维码
      // 为了演示，我们返回一个模拟的二维码信息
      // 真实接口可能类似于：https://api.weixin.qq.com/sns/qrconnect
      
      // 模拟网络延迟
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // 生成一个模拟的登录ID，用于后续轮询检查登录状态
      const loginId = `wx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // 模拟二维码图片URL（实际应该是从微信接口获取的）
      // 这里使用一个在线二维码生成API来演示
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`wechat_login:${loginId}`)}`
      
      return {
        success: true,
        data: {
          loginId,
          qrCodeUrl,
          expireTime: Date.now() + 600000, // 10分钟过期
        }
      }
    } catch (error) {
      console.error('生成微信二维码失败:', error)
      return {
        success: false,
        message: '获取微信登录二维码失败，请稍后重试'
      }
    }
  },
  
  // 轮询检查微信登录状态
  checkLoginStatus: async (loginId) => {
    try {
      // 在实际项目中，这里应该调用后端接口检查登录状态
      // 真实接口可能是你们后端提供的，用于查询用户是否已扫码并授权
      
      // 模拟网络延迟
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // 模拟随机的登录状态
      // 在真实场景中，这个状态应该由后端根据微信回调更新
      const random = Math.random()
      
      if (random < 0.7) {
        // 70%的概率返回未扫码状态
        return {
          success: true,
          status: 'waiting', // waiting: 等待扫码, scanning: 已扫码, confirmed: 已确认, expired: 已过期
          message: '等待用户扫码'
        }
      } else if (random < 0.9) {
        // 20%的概率返回已扫码状态
        return {
          success: true,
          status: 'scanning',
          message: '用户已扫码，请在微信上确认'
        }
      } else {
        // 10%的概率返回登录成功状态
        // 生成模拟的微信用户信息
        const wxUserInfo = {
          openId: `wx_${Math.random().toString(36).substr(2, 15)}`,
          unionId: `union_${Math.random().toString(36).substr(2, 15)}`,
          nickname: '微信用户' + Math.floor(Math.random() * 1000),
          avatar: `https://api.dicebear.com/7.x/personas/svg?seed=${Math.random()}`,
          gender: Math.random() > 0.5 ? 1 : 0,
          // 其他用户信息...
        }
        
        return {
          success: true,
          status: 'confirmed',
          message: '登录成功',
          userInfo: wxUserInfo
        }
      }
    } catch (error) {
      console.error('检查微信登录状态失败:', error)
      return {
        success: false,
        message: '检查登录状态失败，请稍后重试'
      }
    }
  },
  
  // 微信登录认证，创建用户会话
  authenticate: async (wxUserInfo) => {
    try {
      // 使用 authService 处理微信用户登录
      const result = loginWithWechat(wxUserInfo)
      
      if (result.success) {
        // 生成模拟的认证信息
        const authInfo = {
          token: `wx_token_${Date.now()}_${Math.random().toString(36).substr(2, 15)}`,
          user: result.user
        }
        
        return {
          success: true,
          data: authInfo
        }
      } else {
        return {
          success: false,
          message: result.message || '微信登录认证失败'
        }
      }
    } catch (error) {
      console.error('微信用户认证失败:', error)
      return {
        success: false,
        message: '微信登录认证失败，请稍后重试'
      }
    }
  }
}

// 导出服务方法
export const wechatLoginService = {
  // 生成微信登录二维码
  async getQRCode() {
    return WECHAT_API.generateQRCode()
  },
  
  // 检查微信登录状态
  async getLoginStatus(loginId) {
    return WECHAT_API.checkLoginStatus(loginId)
  },
  
  // 微信登录认证
  async login(wxUserInfo) {
    return WECHAT_API.authenticate(wxUserInfo)
  },
  
  // 启动轮询检查登录状态
  startPolling(loginId, callback, interval = 2000) {
    const poll = async () => {
      try {
        const result = await this.getLoginStatus(loginId)
        callback(result)
        
        // 如果还在等待状态，继续轮询
        if (result.success && result.status === 'waiting' || result.status === 'scanning') {
          this.pollingTimer = setTimeout(poll, interval)
        }
      } catch (error) {
        console.error('轮询登录状态失败:', error)
        callback({
          success: false,
          message: '检查登录状态失败'
        })
      }
    }
    
    // 开始第一轮轮询
    this.pollingTimer = setTimeout(poll, 0)
  },
  
  // 停止轮询
  stopPolling() {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer)
      this.pollingTimer = null
    }
  }
}

export default wechatLoginService