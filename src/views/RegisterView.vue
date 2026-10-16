<template>
  <div class="register-container">
    <div class="card">
      <h1>用户注册</h1>
      <p>当前为本地演示，账号仅保存在此浏览器，请勿使用真实密码。</p>
      
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

.footer {
  margin-top: 20px;
  color: #666;
}

.footer a {
  color: #4361ee;
  text-decoration: none;
}
</style>
