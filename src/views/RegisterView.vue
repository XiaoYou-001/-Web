<template>
  <div class="register-background">
    <!-- 科技感背景元素 -->
    <div class="tech-background">
      <!-- 粒子效果 -->
      <div class="particles"></div>
      
      <!-- 扫描线 -->
      <div class="scan-line"></div>
      
      <!-- 数字流 -->
      <div class="digital-stream stream-1"></div>
      <div class="digital-stream stream-2"></div>
      <div class="digital-stream stream-3"></div>
      
      <!-- 几何图形 -->
      <div class="geometric-shapes">
        <div class="hexagon hexagon-1"></div>
        <div class="hexagon hexagon-2"></div>
        <div class="triangle triangle-1"></div>
        <div class="triangle triangle-2"></div>
        <div class="circle circle-1"></div>
        <div class="circle circle-2"></div>
      </div>
      
      <!-- 网格线 -->
      <div class="grid-lines"></div>
    </div>
    
    <!-- 原有的旅游主题动画元素 -->
    <div class="background-elements">
      <div class="cloud cloud-1"></div>
      <div class="cloud cloud-2"></div>
      <div class="cloud cloud-3"></div>
      <div class="airplane"></div>
      <div class="globe"></div>
      <div class="hot-air-balloon"></div>
    </div>
    
    <div class="register-container">
      <div class="card">
        <div class="tech-header">
          <h1 class="tech-title">用户注册</h1>
          <div class="tech-accent"></div>
        </div>
        
        <div class="tab-content">
          <div class="form-group">
            <label class="form-label">手机号</label>
            <input 
              v-model="phone" 
              type="tel" 
              class="form-input tech-input" 
              placeholder="请输入手机号"
            >
          </div>
          
          <div class="form-group">
            <label class="form-label">设置密码</label>
            <input 
              v-model="password" 
              type="password" 
              class="form-input tech-input" 
              placeholder="请设置6-20位密码"
            >
          </div>
          
          <div class="form-group">
            <label class="form-label">确认密码</label>
            <input 
              v-model="confirmPassword" 
              type="password" 
              class="form-input tech-input" 
              placeholder="请再次输入密码"
            >
          </div>
          
          <button class="btn btn-primary tech-button" @click="register">注册</button>
        </div>
        
        <div class="footer">
          已有账号？<router-link to="/login" class="tech-link">立即登录</router-link>
        </div>
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
/* 背景动画 */
.register-background {
  position: relative;
  min-height: 100vh;
  background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
  overflow: hidden;
}

.tech-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

/* 粒子效果 */
.particles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    radial-gradient(2px 2px at 20px 30px, #00c6ff, transparent),
    radial-gradient(2px 2px at 40px 70px, #0072ff, transparent),
    radial-gradient(1px 1px at 90px 40px, #00c6ff, transparent),
    radial-gradient(1px 1px at 130px 80px, #0072ff, transparent),
    radial-gradient(2px 2px at 160px 30px, #00c6ff, transparent);
  background-repeat: repeat;
  background-size: 200px 100px;
  animation: particles-move 12s linear infinite;
  opacity: 0.6;
}

@keyframes particles-move {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(-100px);
  }
}

/* 扫描线 */
.scan-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00c6ff, #0072ff, transparent);
  box-shadow: 0 0 10px #00c6ff, 0 0 20px #0072ff;
  animation: scan 4s linear infinite;
}

@keyframes scan {
  0% {
    top: 0;
  }
  100% {
    top: 100%;
  }
}

/* 数字流 */
.digital-stream {
  position: absolute;
  top: -100%;
  font-family: 'Courier New', monospace;
  color: rgba(0, 198, 255, 0.7);
  font-size: 14px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  animation: stream-flow 15s linear infinite;
  text-shadow: 0 0 5px #00c6ff;
}

.stream-1 {
  left: 10%;
  animation-delay: 0s;
}

.stream-2 {
  left: 30%;
  animation-delay: -5s;
}

.stream-3 {
  left: 70%;
  animation-delay: -10s;
}

@keyframes stream-flow {
  0% {
    top: -100%;
  }
  100% {
    top: 100%;
  }
}

/* 几何图形 */
.geometric-shapes {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.hexagon {
  position: absolute;
  width: 40px;
  height: 40px;
  background: transparent;
  border: 1px solid rgba(0, 198, 255, 0.3);
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  animation: rotate 20s linear infinite;
}

.hexagon-1 {
  top: 20%;
  left: 15%;
}

.hexagon-2 {
  bottom: 30%;
  right: 20%;
  animation-duration: 25s;
  animation-direction: reverse;
}

.triangle {
  position: absolute;
  width: 0;
  height: 0;
  border-left: 20px solid transparent;
  border-right: 20px solid transparent;
  border-bottom: 35px solid rgba(0, 114, 255, 0.2);
  animation: pulse 3s ease-in-out infinite;
}

.triangle-1 {
  top: 40%;
  right: 10%;
}

.triangle-2 {
  bottom: 20%;
  left: 25%;
  animation-delay: 1.5s;
}

.circle {
  position: absolute;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(0, 198, 255, 0.3);
  border-radius: 50%;
  animation: pulse-border 4s ease-in-out infinite;
}

.circle-1 {
  top: 15%;
  right: 25%;
}

.circle-2 {
  bottom: 40%;
  left: 10%;
  animation-delay: 2s;
}

/* 网格线 */
.grid-lines {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(0, 198, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 198, 255, 0.1) 1px, transparent 1px);
  background-size: 30px 30px;
  animation: grid-move 20s linear infinite;
}

@keyframes grid-move {
  0% {
    transform: translate(0, 0);
  }
  100% {
    transform: translate(30px, 30px);
  }
}

/* 动画关键帧 */
@keyframes pulse {
  0%, 100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.2);
  }
}

@keyframes pulse-border {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 5px rgba(0, 198, 255, 0.5);
  }
  50% {
    transform: scale(1.3);
    box-shadow: 0 0 20px rgba(0, 198, 255, 0.8);
  }
}

@keyframes rotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* 原有背景元素保持不变 */
.background-elements {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

/* 云朵动画 */
.cloud {
  position: absolute;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
}

.cloud-1 {
  top: 15%;
  left: 5%;
  width: 80px;
  height: 30px;
  animation: float 15s infinite ease-in-out;
}

.cloud-2 {
  top: 25%;
  right: 10%;
  width: 120px;
  height: 40px;
  animation: float 18s infinite ease-in-out;
  animation-delay: 2s;
}

.cloud-3 {
  bottom: 20%;
  left: 15%;
  width: 100px;
  height: 35px;
  animation: float 20s infinite ease-in-out;
  animation-delay: 5s;
}

/* 飞机动画 */
.airplane {
  position: absolute;
  top: 40%;
  right: -100px;
  width: 60px;
  height: 20px;
  background: linear-gradient(45deg, #ffd700, #ffa500);
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  animation: fly 25s linear infinite;
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.7);
  z-index: 2;
}

.airplane::before {
  content: '';
  position: absolute;
  top: 5px;
  left: -15px;
  width: 30px;
  height: 10px;
  background: linear-gradient(45deg, #ffd700, #ffa500);
  border-radius: 50%;
}

/* 地球动画 */
.globe {
  position: absolute;
  bottom: 10%;
  right: 15%;
  width: 80px;
  height: 80px;
  background: radial-gradient(circle at 30% 30%, #4da6ff, #0066cc);
  border-radius: 50%;
  animation: rotate 30s linear infinite;
  box-shadow: 0 0 20px rgba(0, 102, 204, 0.7);
  z-index: 2;
}

.globe::before {
  content: '';
  position: absolute;
  top: 20px;
  left: 20px;
  width: 40px;
  height: 40px;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
}

.globe::after {
  content: '';
  position: absolute;
  top: 40px;
  left: 10px;
  width: 60px;
  height: 2px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 50%;
}

/* 热气球动画 */
.hot-air-balloon {
  position: absolute;
  top: 10%;
  left: 30%;
  width: 50px;
  height: 60px;
  background: linear-gradient(45deg, #ff6b6b, #ff8e8e);
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  animation: float-up-down 12s infinite ease-in-out;
  box-shadow: 0 0 15px rgba(255, 107, 107, 0.7);
  z-index: 2;
}

.hot-air-balloon::before {
  content: '';
  position: absolute;
  bottom: -20px;
  left: 20px;
  width: 10px;
  height: 30px;
  background: #ff6b6b;
}

.hot-air-balloon::after {
  content: '';
  position: absolute;
  bottom: -50px;
  left: 15px;
  width: 20px;
  height: 20px;
  background: #ff6b6b;
  border-radius: 50%;
}

/* 动画关键帧 */
@keyframes float {
  0% {
    transform: translateX(0) translateY(0);
  }
  50% {
    transform: translateX(50px) translateY(20px);
  }
  100% {
    transform: translateX(0) translateY(0);
  }
}

@keyframes fly {
  0% {
    transform: translateX(0) translateY(0);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translateX(-200vw) translateY(-50px);
    opacity: 0;
  }
}

@keyframes float-up-down {
  0% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-30px);
  }
  100% {
    transform: translateY(0);
  }
}

/* 注册容器样式调整 */
.register-container {
  position: relative;
  z-index: 3;
  max-width: 500px;
  margin: 0 auto;
  padding: 40px 20px;
}

/* 高对比度卡片样式 */
.card {
  background: rgba(30, 30, 46, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  box-shadow: 0 0 30px rgba(0, 198, 255, 0.5);
  border: 1px solid rgba(0, 198, 255, 0.6);
  padding: 30px;
  animation: fadeInUp 0.8s ease-out;
  position: relative;
  overflow: hidden;
}

.card::before {
  content: '';
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  background: linear-gradient(45deg, #00ffff, #0077ff, #00ffff);
  z-index: -1;
  border-radius: 17px;
  animation: border-animate 3s linear infinite;
}

@keyframes border-animate {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}

.tech-header {
  position: relative;
  margin-bottom: 20px;
}

.tech-title {
  color: #ffffff;
  text-align: center;
  font-weight: 400;
  letter-spacing: 2px;
  text-shadow: 0 0 10px rgba(0, 198, 255, 0.9);
  font-size: 28px;
}

.tech-accent {
  width: 60px;
  height: 4px;
  background: linear-gradient(90deg, #00ffff, #0077ff);
  margin: 15px auto;
  border-radius: 2px;
  box-shadow: 0 0 15px rgba(0, 198, 255, 0.9);
}

.tab-content {
  padding: 25px 0;
}

.form-group {
  margin-bottom: 25px;
}

.form-label {
  display: block;
  margin-bottom: 10px;
  color: #ffffff;
  font-size: 16px;
  font-weight: 500;
}

.tech-input {
  width: 100%;
  padding: 15px 20px;
  background: rgba(20, 20, 35, 0.8);
  border: 2px solid rgba(0, 198, 255, 0.5);
  border-radius: 8px;
  color: #ffffff;
  font-size: 16px;
  transition: all 0.3s ease;
  box-sizing: border-box;
  font-weight: 400;
}

.tech-input:focus {
  outline: none;
  border-color: #00ffff;
  box-shadow: 0 0 15px rgba(0, 198, 255, 0.7);
  background: rgba(25, 25, 45, 0.9);
}

.tech-input::placeholder {
  color: rgba(255, 255, 255, 0.6);
}

.tech-button {
  width: 100%;
  padding: 15px;
  background: linear-gradient(45deg, #0077ff, #00ffff);
  border: none;
  border-radius: 8px;
  color: #ffffff;
  font-size: 17px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 0 20px rgba(0, 198, 255, 0.6);
  letter-spacing: 1px;
}

.tech-button:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 8px 25px rgba(0, 198, 255, 0.8);
  background: linear-gradient(45deg, #00aaff, #00ffff);
}

.footer {
  margin-top: 25px;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  font-size: 16px;
}

.tech-link {
  color: #00ffff;
  text-decoration: none;
  transition: all 0.3s ease;
  font-weight: 500;
}

.tech-link:hover {
  color: #0077ff;
  text-shadow: 0 0 10px rgba(0, 198, 255, 0.9);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .register-container {
    padding: 20px 10px;
  }
  
  .card {
    padding: 20px;
  }
  
  .cloud-1, .cloud-2, .cloud-3 {
    display: none;
  }
  
  .digital-stream {
    font-size: 10px;
  }
  
  .hexagon, .triangle, .circle {
    transform: scale(0.7);
  }
  
  .tech-title {
    font-size: 24px;
  }
  
  .form-label {
    font-size: 15px;
  }
  
  .tech-input {
    padding: 12px 15px;
    font-size: 15px;
  }
  
  .tech-button {
    padding: 12px;
    font-size: 16px;
  }
}
</style>