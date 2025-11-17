<template>
  <div class="login-container">
    <div class="card">
      <h1>欢迎登录</h1>
      
      <div class="tabs">
        <button 
          @click="switchToPhone"
          :class="{ active: activeTab === 'phone' }"
        >
          手机号登录
        </button>
        <button 
          @click="switchToWechat"
          :class="{ active: activeTab === 'wechat' }"
        >
          微信登录
        </button>
      </div>
      
      <div v-if="activeTab === 'phone'" class="tab-content">
        <div class="form-group">
          <label class="form-label">手机号</label>
          <input 
            v-model="phone"
            type="tel" 
            class="form-input" 
            placeholder="请输入手机号"
          >
        </div>
        
        <div class="form-group">
          <label class="form-label">密码</label>
          <input 
            v-model="password" 
            type="password" 
            class="form-input" 
            placeholder="请输入密码"
          >
        </div>
        
        <div class="terms-agreement">
          <input 
            type="checkbox" 
            id="agreeTerms" 
            v-model="agreeToTerms"
            class="terms-checkbox"
          >
          <label for="agreeTerms" class="terms-label">
            我已阅读并同意 <a href="#" @click.prevent>用户协议</a> 和 <a href="#" @click.prevent>隐私政策</a>
          </label>
        </div>
        
        <button class="btn btn-primary" @click="loginWithPhone" :disabled="!agreeToTerms">登录</button>
      </div>
      
      <div v-else class="tab-content">
        <div class="wechat-login">
          <div v-if="isLoading">
            <div class="loading">正在生成登录二维码...</div>
          </div>
          <div v-else-if="qrCodeUrl">
            <img :src="qrCodeUrl" alt="微信扫码登录" class="qr-code">
            <p class="login-status">{{ loginStatusText }}</p>
            <p class="expire-time">二维码有效期：{{ remainingTime }}秒</p>
            <button class="btn btn-secondary" @click="refreshQRCode" v-if="!isPolling">
              刷新二维码
            </button>
          </div>
          <div v-else>
            <p class="error-message">获取二维码失败，请点击按钮重试</p>
            <button class="btn btn-secondary" @click="getQRCode">
              重新获取二维码
            </button>
          </div>
        </div>
      </div>
      
      <div class="footer">
        还没有账号？<router-link to="/register">立即注册</router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { validatePhoneNumber } from '../services/smsService'
import { loginUser } from '../services/authService'
import wechatLoginService from '../services/wechatLoginService'

export default {
  name: 'LoginView',
  data() {
    return {
      activeTab: 'phone',
      phone: '',
      password: '',
      agreeToTerms: false,
      // 微信登录相关状态
      qrCodeUrl: '',
      loginId: '',
      expireTime: 0,
      remainingTime: 600,
      isLoading: false,
      isPolling: false,
      loginStatusText: '请使用微信扫描二维码登录',
      pollingTimer: null,
      countdownTimer: null
    }
  },
  methods: {
    loginWithPhone() {
      if (!this.phone || !this.password) {
        alert('请输入手机号和密码')
        return
      }
      
      // 验证是否同意协议
      if (!this.agreeToTerms) {
        alert('请阅读并同意用户协议和隐私政策')
        return
      }
      
      // 验证手机号格式
      if (!validatePhoneNumber(this.phone)) {
        alert('手机号格式不正确，请输入正确的11位手机号')
        return
      }
      
      // 验证密码长度
      if (this.password.length < 6 || this.password.length > 20) {
        alert('密码长度应为6-20位')
        return
      }
      
      try {
        // 使用真实的用户认证服务进行登录
        const result = loginUser(this.phone, this.password)
        
        if (result.success) {
          alert('登录成功！')
          this.$router.push('/')
        } else {
          alert(result.message)
        }
      } catch (error) {
        console.error('登录失败:', error)
        alert('登录失败，请稍后重试')
      }
    },
    
    // 切换到手机号登录
    switchToPhone() {
      this.activeTab = 'phone'
      this.stopWechatLoginProcess()
    },
    
    // 切换到微信登录
    switchToWechat() {
      this.activeTab = 'wechat'
      this.getQRCode()
    },
    
    // 获取微信登录二维码
    async getQRCode() {
      this.isLoading = true
      this.qrCodeUrl = ''
      
      try {
        const result = await wechatLoginService.getQRCode()
        
        if (result.success && result.data) {
          this.qrCodeUrl = result.data.qrCodeUrl
          this.loginId = result.data.loginId
          this.expireTime = result.data.expireTime
          this.remainingTime = Math.floor((this.expireTime - Date.now()) / 1000)
          this.loginStatusText = '请使用微信扫描二维码登录'
          
          // 启动轮询检查登录状态
          this.startPollingLoginStatus()
          // 启动倒计时
          this.startCountdown()
        } else {
          this.loginStatusText = result.message || '获取二维码失败'
          alert(this.loginStatusText)
        }
      } catch (error) {
        console.error('获取二维码失败:', error)
        this.loginStatusText = '获取二维码失败，请稍后重试'
        alert(this.loginStatusText)
      } finally {
        this.isLoading = false
      }
    },
    
    // 刷新二维码
    refreshQRCode() {
      this.stopWechatLoginProcess()
      this.getQRCode()
    },
    
    // 开始轮询登录状态
    startPollingLoginStatus() {
      this.isPolling = true
      
      wechatLoginService.startPolling(this.loginId, (result) => {
        if (!result.success) {
          this.loginStatusText = result.message || '检查登录状态失败'
          this.isPolling = false
          return
        }
        
        // 更新登录状态文本
        switch (result.status) {
          case 'waiting':
            this.loginStatusText = '请使用微信扫描二维码登录'
            break
          case 'scanning':
            this.loginStatusText = '用户已扫码，请在微信上确认'
            break
          case 'confirmed':
            this.loginStatusText = '登录成功，正在跳转...'
            this.handleWechatLoginSuccess(result.userInfo)
            break
          case 'expired':
            this.loginStatusText = '二维码已过期，请刷新'
            this.isPolling = false
            break
        }
      })
    },
    
    // 处理微信登录成功
    async handleWechatLoginSuccess(userInfo) {
      this.isPolling = false
      
      try {
        // 进行微信用户认证
        const authResult = await wechatLoginService.login(userInfo)
        
        if (authResult.success && authResult.data) {
          // 保存认证信息到本地存储
          localStorage.setItem('userInfo', JSON.stringify(authResult.data.user))
          localStorage.setItem('authToken', authResult.data.token)
          
          alert(`登录成功，欢迎 ${authResult.data.user.nickname}！`)
          this.$router.push('/')
        } else {
          alert(authResult.message || '微信登录认证失败')
        }
      } catch (error) {
        console.error('微信登录认证失败:', error)
        alert('微信登录认证失败，请稍后重试')
      }
    },
    
    // 开始倒计时
    startCountdown() {
      this.stopCountdown()
      
      this.countdownTimer = setInterval(() => {
        this.remainingTime = Math.floor((this.expireTime - Date.now()) / 1000)
        
        if (this.remainingTime <= 0) {
          this.loginStatusText = '二维码已过期，请刷新'
          this.isPolling = false
          this.stopCountdown()
        }
      }, 1000)
    },
    
    // 停止倒计时
    stopCountdown() {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer)
        this.countdownTimer = null
      }
    },
    
    // 停止微信登录流程
    stopWechatLoginProcess() {
      wechatLoginService.stopPolling()
      this.stopCountdown()
      this.isPolling = false
    }
  },
  
  // 组件销毁时清理资源
  beforeDestroy() {
    this.stopWechatLoginProcess()
  }
}
</script>

<style scoped>
.login-container {
  max-width: 500px;
  margin: 0 auto;
  padding: 40px 20px;
}

.tabs {
  display: flex;
  margin: 20px 0;
  border-bottom: 1px solid #ddd;
}

.tabs button {
  flex: 1;
  padding: 12px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  position: relative;
}

.tabs button.active {
  font-weight: bold;
  color: #4361ee;
}

.tabs button.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 3px;
  background-color: #4361ee;
}

.tab-content {
  padding: 20px 0;
}

.code-input {
  display: flex;
  gap: 10px;
}

.send-code-btn {
  min-width: 120px;
}

.wechat-login {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.qr-code {
  width: 200px;
  height: 200px;
  margin-bottom: 20px;
}

.footer {
  margin-top: 20px;
  color: #666;
}

.footer a {
  color: #4361ee;
  text-decoration: none;
}

.terms-agreement {
  display: flex;
  align-items: flex-start;
  margin: 20px 0;
}

.terms-checkbox {
  margin-right: 8px;
  margin-top: 2px;
}

.terms-label {
  font-size: 14px;
  color: #666;
}

.terms-label a {
  color: #4361ee;
  text-decoration: none;
}

.btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>