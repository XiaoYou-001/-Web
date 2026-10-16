<template>
  <div class="register-container">
    <div class="register-brand">
      <div class="brand-logo">✈️</div>
      <h1>智绘旅游</h1>
      <p class="brand-slogan">加入我们，智行未来</p>
    </div>
    <div class="card">
      <h2 class="register-title">创建账号</h2>
      <p class="register-subtitle">当前为本地演示，账号仅保存在此浏览器，请勿使用真实密码。</p>
      
      <form ref="accountForm" class="tab-content" novalidate @submit.prevent="register">
        <div class="form-group">
          <label for="register-phone" class="form-label">手机号</label>
          <input 
            v-model="phone"
            id="register-phone"
            :aria-invalid="Boolean(fieldErrors.phone)"
            :aria-describedby="fieldErrors.phone ? 'register-phone-error' : undefined"
            @input="clearFieldError('phone')"
            autocomplete="tel"
            type="tel" 
            class="form-input" 
            placeholder="请输入手机号"
          >
          <p v-if="fieldErrors.phone" id="register-phone-error" class="field-error">{{ fieldErrors.phone }}</p>
        </div>
        
        <div class="form-group">
          <label for="register-password" class="form-label">设置密码</label>
          <input 
            v-model="password"
            id="register-password"
            :aria-invalid="Boolean(fieldErrors.password)"
            :aria-describedby="fieldErrors.password ? 'register-password-error' : undefined"
            @input="clearFieldError('password')"
            autocomplete="new-password"
            type="password" 
            class="form-input" 
            placeholder="请设置6-20位密码"
          >
          <p v-if="fieldErrors.password" id="register-password-error" class="field-error">{{ fieldErrors.password }}</p>
        </div>
        
        <div class="form-group">
          <label for="register-confirmPassword" class="form-label">确认密码</label>
          <input 
            v-model="confirmPassword"
            id="register-confirmPassword"
            :aria-invalid="Boolean(fieldErrors.confirmPassword)"
            :aria-describedby="fieldErrors.confirmPassword ? 'register-confirmPassword-error' : undefined"
            @input="clearFieldError('confirmPassword')"
            autocomplete="new-password"
            type="password" 
            class="form-input" 
            placeholder="请再次输入密码"
          >
          <p v-if="fieldErrors.confirmPassword" id="register-confirmPassword-error" class="field-error">{{ fieldErrors.confirmPassword }}</p>
        </div>
        
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <button type="submit" class="btn btn-primary">注册</button>
      </form>
      
      <div class="footer">
        已有账号？<router-link to="/login">立即登录</router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { validateAccountFields } from '../utils/validation.js'
import { useFeedback } from '../composables/useFeedback.js'
import { registerUser } from '../services/authService'

export default {
  name: 'RegisterView',
  setup() { return { feedback: useFeedback() } },
  data() {
    return {
      fieldErrors: {},
      formError: '',
      phone: '',
      password: '',
      confirmPassword: ''
    }
  },
  methods: {
    clearFieldError(field) {
      delete this.fieldErrors[field]
      if (field === 'password') delete this.fieldErrors.confirmPassword
      this.formError = ''
    },
    register() {
      this.formError = ''
      this.fieldErrors = validateAccountFields(this, { registration: true })
      if (Object.keys(this.fieldErrors).length) {
        this.$nextTick(() => this.$refs.accountForm?.querySelector('[aria-invalid="true"]')?.focus())
        return
      }
      try {
        const result = registerUser(this.phone.trim(), this.password)
        if (result.success) {
          this.feedback.success('注册成功，请登录。')
          this.$router.push('/login')
        } else this.formError = result.message
      } catch {
        this.formError = '注册失败，请稍后重试'
      }
    }
  }
}
</script>

<style scoped>
.register-container {
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
.register-container::before,
.register-container::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.5;
  pointer-events: none;
}
.register-container::before {
  width: 380px;
  height: 380px;
  background: rgba(255, 255, 255, 0.18);
  top: -120px;
  right: -100px;
}
.register-container::after {
  width: 300px;
  height: 300px;
  background: rgba(255, 255, 255, 0.12);
  bottom: -100px;
  left: -80px;
}

.register-brand {
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

.register-brand h1 {
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

/* 注册卡片：毛玻璃质感 */
.register-container .card {
  width: 100%;
  max-width: 500px;
  margin: 0;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  position: relative;
  z-index: 1;
}

.register-title {
  margin: 0 0 6px;
  font-size: 24px;
  color: var(--text-main);
  text-align: center;
}

.register-subtitle {
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

.footer {
  margin-top: 20px;
  color: #666;
}

.footer a {
  color: var(--primary);
  text-decoration: none;
}
</style>
