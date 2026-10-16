<template>
  <div class="login-container">
    <div class="login-brand">
      <div class="brand-logo">✈️</div>
      <h1>智绘旅游</h1>
      <p class="brand-slogan">智行未来 · 尽享旅程</p>
    </div>
    <div class="card">
      <h2 class="login-title">欢迎回来</h2>
      <p class="login-subtitle">当前为本地演示，账号仅保存在此浏览器，请勿使用真实密码。</p>
      
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
          微信演示登录
        </button>
      </div>
      
      <form v-if="activeTab === 'phone'" ref="accountForm" class="tab-content" novalidate @submit.prevent="loginWithPhone">
        <div class="form-group">
          <label for="login-phone" class="form-label">手机号</label>
          <input 
            v-model="phone"
            id="login-phone"
            :aria-invalid="Boolean(fieldErrors.phone)"
            :aria-describedby="fieldErrors.phone ? 'login-phone-error' : undefined"
            @input="clearFieldError('phone')"
            autocomplete="tel"
            type="tel" 
            class="form-input" 
            placeholder="请输入手机号"
          >
          <p v-if="fieldErrors.phone" id="login-phone-error" class="field-error">{{ fieldErrors.phone }}</p>
        </div>
        
        <div class="form-group">
          <label for="login-password" class="form-label">密码</label>
          <input 
            v-model="password"
            id="login-password"
            :aria-invalid="Boolean(fieldErrors.password)"
            :aria-describedby="fieldErrors.password ? 'login-password-error' : undefined"
            @input="clearFieldError('password')"
            autocomplete="current-password"
            type="password" 
            class="form-input" 
            placeholder="请输入密码"
          >
          <p v-if="fieldErrors.password" id="login-password-error" class="field-error">{{ fieldErrors.password }}</p>
        </div>
        
        <div class="terms-agreement">
          <input 
            type="checkbox" 
            id="agreeTerms" 
            v-model="agreeToTerms"
            :aria-invalid="Boolean(fieldErrors.agreeToTerms)"
            :aria-describedby="fieldErrors.agreeToTerms ? 'login-terms-error' : undefined"
            @change="clearFieldError('agreeToTerms')"
            class="terms-checkbox"
          >
          <label for="agreeTerms" class="terms-label">
            我已阅读并同意 <a href="#" @click.prevent>用户协议</a> 和 <a href="#" @click.prevent>隐私政策</a>
          </label>
        </div>
        
        <p v-if="fieldErrors.agreeToTerms" id="login-terms-error" class="field-error">{{ fieldErrors.agreeToTerms }}</p>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <button type="submit" class="btn btn-primary">登录</button>
      </form>
      
      <div v-else class="tab-content">
        <div class="wechat-login">
          <div v-if="isLoading">
            <div class="loading">正在准备演示登录...</div>
          </div>
          <div v-else-if="loginId">
            <p>尚未接入真实微信授权，可使用下方按钮体验演示账号。</p>
            <p class="login-status">{{ loginStatusText }}</p>
            <p class="expire-time">演示授权有效期：{{ remainingTime }}秒</p>
            <button class="btn btn-primary" @click="simulateWechatLogin" :disabled="!isPolling">模拟授权登录</button>
            <button class="btn btn-secondary" @click="refreshQRCode" v-if="!isPolling">
              刷新演示授权
            </button>
          </div>
          <div v-else>
            <p class="error-message">准备演示登录失败，请点击按钮重试</p>
            <button class="btn btn-secondary" @click="getQRCode">
              重试
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
import { validateAccountFields } from '../utils/validation.js'
import { useFeedback } from '../composables/useFeedback.js'
import { useAuthStore } from '../stores/auth.js'
import wechatLoginService from '../services/wechatLoginService'

export default {
  name: 'LoginView',
  setup() { return { auth: useAuthStore(), feedback: useFeedback() } },
  data() {
    return {
      activeTab: 'phone',
      fieldErrors: {},
      formError: '',
      phone: '',
      password: '',
      agreeToTerms: false,
      // 微信登录相关状态
      loginId: '',
      expireTime: 0,
      remainingTime: 600,
      isLoading: false,
      isPolling: false,
      loginStatusText: '等待模拟授权',
      loginProcessId: 0,
      countdownTimer: null
    }
  },
  methods: {
    clearFieldError(field) {
      delete this.fieldErrors[field]
      if (field === 'password') delete this.fieldErrors.confirmPassword
      this.formError = ''
    },
    loginWithPhone() {
      this.formError = ''
      this.fieldErrors = validateAccountFields(this, { requireTerms: true })
      if (Object.keys(this.fieldErrors).length) {
        this.$nextTick(() => this.$refs.accountForm?.querySelector('[aria-invalid="true"]')?.focus())
        return
      }
      try {
        const result = this.auth.login(this.phone.trim(), this.password)
        if (result.success) {
          this.feedback.success('登录成功！')
          this.$router.push('/')
        } else this.formError = result.message
      } catch {
        this.formError = '登录失败，请稍后重试'
      }
    },
    
    // 切换到手机号登录
    switchToPhone() {
      this.activeTab = 'phone'
      this.stopWechatLoginProcess()
    },
    
    // 切换到微信登录
    switchToWechat() {
      this.stopWechatLoginProcess()
      this.activeTab = 'wechat'
      this.getQRCode()
    },
    
    // 获取微信登录二维码
    async getQRCode() {
      const processId = ++this.loginProcessId
      this.isLoading = true
      this.loginId = ''
      
      try {
        const result = await wechatLoginService.getQRCode()
        if (processId !== this.loginProcessId || this.activeTab !== 'wechat') return
        
        if (result.success && result.data) {
          this.loginId = result.data.loginId
          this.expireTime = result.data.expireTime
          this.remainingTime = Math.floor((this.expireTime - Date.now()) / 1000)
          this.loginStatusText = '等待模拟授权'
          
          // 启动轮询检查登录状态
          this.startPollingLoginStatus()
          // 启动倒计时
          this.startCountdown()
        } else {
          this.loginStatusText = result.message || '准备演示登录失败'
          this.feedback.error(this.loginStatusText)
        }
      } catch (error) {
        if (processId !== this.loginProcessId) return
        console.error('准备微信演示登录失败:', error)
        this.loginStatusText = '准备演示登录失败，请稍后重试'
        this.feedback.error(this.loginStatusText)
      } finally {
        if (processId === this.loginProcessId) this.isLoading = false
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
            this.loginStatusText = '等待模拟授权'
            break
          case 'scanning':
            this.loginStatusText = '用户已扫码，请在微信上确认'
            break
          case 'confirmed':
            this.loginStatusText = '登录成功，正在跳转...'
            this.handleWechatLoginSuccess(result.userInfo)
            break
          case 'expired':
            this.loginStatusText = '演示授权已过期，请刷新'
            this.stopWechatLoginProcess()
            break
        }
      })
    },
    
    // 处理微信登录成功
    async handleWechatLoginSuccess(userInfo) {
      this.stopWechatLoginProcess()
      
      try {
        // 进行微信用户认证
        const authResult = this.auth.loginWithWechat(userInfo)
        
        if (authResult.success) {
          this.feedback.success(`登录成功，欢迎 ${authResult.user.nickname}！`)
          this.$router.push('/')
        } else {
          this.feedback.error(authResult.message || '微信登录认证失败')
        }
      } catch (error) {
        console.error('微信登录认证失败:', error)
        this.feedback.error('微信登录认证失败，请稍后重试')
      }
    },

    async simulateWechatLogin() {
      const processId = this.loginProcessId
      const result = await wechatLoginService.confirmDemoLogin(this.loginId)
      if (processId !== this.loginProcessId || this.activeTab !== 'wechat' || !this.isPolling) return
      if (result.success) this.handleWechatLoginSuccess(result.userInfo)
      else this.feedback.error(result.message)
    },
    
    // 开始倒计时
    startCountdown() {
      this.stopCountdown()
      
      this.countdownTimer = setInterval(() => {
        this.remainingTime = Math.floor((this.expireTime - Date.now()) / 1000)
        
        if (this.remainingTime <= 0) {
          this.loginStatusText = '演示授权已过期，请刷新'
          this.stopWechatLoginProcess()
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
      this.loginProcessId++
      this.isLoading = false
      wechatLoginService.stopPolling()
      this.stopCountdown()
      this.isPolling = false
    }
  },
  
  // 组件销毁时清理资源
  beforeUnmount() {
    this.stopWechatLoginProcess()
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  background: var(--gradient-primary);
  position: relative;
  overflow: hidden;
}

/* 背景装饰光斑 */
.login-container::before,
.login-container::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.5;
  pointer-events: none;
}
.login-container::before {
  width: 380px;
  height: 380px;
  background: rgba(255, 255, 255, 0.18);
  top: -120px;
  right: -100px;
}
.login-container::after {
  width: 300px;
  height: 300px;
  background: rgba(255, 255, 255, 0.12);
  bottom: -100px;
  left: -80px;
}

.login-brand {
  text-align: center;
  color: #fff;
  margin-bottom: 28px;
  position: relative;
  z-index: 1;
}

.brand-logo {
  font-size: 46px;
  margin-bottom: 8px;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.2));
}

.login-brand h1 {
  margin: 0;
  font-size: 34px;
  color: #fff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  letter-spacing: 2px;
}

.brand-slogan {
  margin: 6px 0 0;
  font-size: 15px;
  opacity: 0.92;
  letter-spacing: 3px;
}

/* 登录卡片：毛玻璃质感 */
.login-container .card {
  width: 100%;
  max-width: 500px;
  margin: 0;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  position: relative;
  z-index: 1;
}

.login-title {
  margin: 0 0 6px;
  font-size: 24px;
  color: var(--text-main);
  text-align: center;
}

.login-subtitle {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
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
  color: var(--primary);
}

.tabs button.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 3px;
  background-color: var(--primary);
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
  color: var(--primary);
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
  color: var(--primary);
  text-decoration: none;
}

.btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>
