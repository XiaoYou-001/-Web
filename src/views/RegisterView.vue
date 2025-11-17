<template>
  <div class="register-container">
    <div class="card">
      <h1>用户注册</h1>
      
      <div class="tab-content">
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
          <label class="form-label">设置密码</label>
          <input 
            v-model="password" 
            type="password" 
            class="form-input" 
            placeholder="请设置6-20位密码"
          >
        </div>
        
        <div class="form-group">
          <label class="form-label">确认密码</label>
          <input 
            v-model="confirmPassword" 
            type="password" 
            class="form-input" 
            placeholder="请再次输入密码"
          >
        </div>
        
        <button class="btn btn-primary" @click="register">注册</button>
      </div>
      
      <div class="footer">
        已有账号？<router-link to="/login">立即登录</router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { validatePhoneNumber } from '../services/smsService'
import { registerUser } from '../services/authService'

export default {
  name: 'RegisterView',
  data() {
    return {
      phone: '',
      password: '',
      confirmPassword: ''
    }
  },
  methods: {
    register() {
      // 验证手机号
      if (!this.phone) {
        alert('请输入手机号')
        return
      }
      
      if (!validatePhoneNumber(this.phone)) {
        alert('手机号格式不正确，请输入正确的11位手机号')
        return
      }
      
      // 验证密码
      if (!this.password) {
        alert('请设置密码')
        return
      }
      
      if (this.password.length < 6 || this.password.length > 20) {
        alert('密码长度应为6-20位')
        return
      }
      
      // 确认密码
      if (this.password !== this.confirmPassword) {
        alert('两次输入的密码不一致')
        return
      }
      
      try {
        // 注册用户
        const result = registerUser(this.phone, this.password)
        if (result.success) {
          alert('注册成功！')
          this.$router.push('/login')
        } else {
          alert(result.message)
        }
      } catch (error) {
        console.error('注册失败:', error)
        alert('注册失败，请稍后重试')
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