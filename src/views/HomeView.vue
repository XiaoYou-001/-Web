<template>
  <div class="home-container">
    <app-image class="home-background" :src="currentBackgroundImage" fallback="/images/home-backdrop.svg" alt="" loading="eager" fetchpriority="high" width="1600" height="1000" />
    <!-- 动态粒子背景 -->
    <div class="particle-background">
      <div v-for="i in 50" :key="i" class="particle" :style="getParticleStyle(i)"></div>
    </div>

    <!-- 主题切换按钮 -->
    <button class="theme-switch-btn" @click="switchBackground" title="切换背景" aria-label="切换背景">
      <font-awesome-icon class="fas fa-palette"></font-awesome-icon>
      <span class="theme-text">换景</span>
    </button>
    <!-- 背景图指示器 -->
    <div class="theme-indicator">
      背景 {{ currentBackgroundIndex + 1 }} / {{ backgroundImages.length }}
    </div>
    
    <header class="header">
      <h1 class="animated-title">智绘旅游，智行未来</h1>
      <p class="animated-subtitle">为您提供非同凡响的旅游体验</p>
    </header>

    <!-- 天气与时钟组件区域 -->
    <div class="info-widgets">
      <!-- 时钟组件 -->
      <div class="clock-widget">
        <div class="time">{{ currentTime }}</div>
        <div class="date">{{ currentDate }}</div>
      </div>

      <!-- 天气组件 -->
      <div class="weather-widget">
        <div class="weather-icon">☀️</div>
        <div class="temperature">{{ weather.temp }}°C</div>
        <div class="weather-desc">{{ weather.desc }}</div>
        <div class="location">{{ weather.location }}</div>
      </div>
    </div>
    
    <div class="user-info" v-if="isAuthenticated">
      <div class="user-profile-circle" @click="navigateTo('profile')" title="进入个人中心">
        <app-image :src="auth.user.avatar" alt="用户头像" class="avatar" kind="avatar" loading="eager" />
        <div class="profile-badge">
          <font-awesome-icon class="fas fa-user-circle"></font-awesome-icon>
        </div>
      </div>
      <span class="username">{{ username }}</span>
      <button class="btn btn-secondary logout-btn" @click="logout">退出登录</button>
    </div>
    
    <div class="nav-container">
      <NavButton 
        icon="camera"
        title="景点推荐"
        description="根据您的喜好推荐热门景点"
        @click="navigateTo('attractions')"
        class="attractions-button"
        image="/images/web/nav-1.png"
      />
      
      <NavButton 
        icon="map"
        title="线路制定"
        description="智能规划最佳旅游路线"
        @click="navigateTo('routes')"
        class="routes-button"
        image="/images/web/nav-2.jpg"
      />
      
      <NavButton 
        icon="plane"
        title="出行购票"
        description="一站式购买各类交通票"
        @click="navigateTo('tickets')"
        class="tickets-button"
        image="/images/web/nav-3.jpg"
      />
      
      <NavButton 
        icon="home" 
        title="酒店订购"
        description="精选住宿，优惠预订"
        @click="navigateTo('hotels')"
        class="hotel-button"
        image="/images/web/nav-4.jpg"
      />
      
      <NavButton 
        icon="phone"
        title="人工客服"
        description="24小时在线为您服务"
        @click="navigateTo('customer-service')"
        class="customer-service-button"
        image="/images/web/nav-5.png"
      />
      
      <NavButton 
        icon="comment"
        title="驴友Chat"
        description="与其他旅行者实时交流"
        @click="navigateTo('chat')"
        class="chat-button"
        image="/images/web/nav-6.jpg"
      />
      
      <NavButton 
        icon="user"
        title="个人中心"
        description="管理个人信息和订单"
        @click="navigateTo('profile')"
        class="profile-button"
        image="/images/web/nav-7.jpg"
      />
    </div>
  </div>
</template>


<script>
import AppImage from '../ui/AppImage.js'
import { FontAwesomeIcon } from '../ui/fontAwesome.js'
import NavButton from '../components/NavButton.vue'
import { useAuthStore } from '../stores/auth.js'

export default {
  name: 'HomeView',
  setup() { return { auth: useAuthStore() } },
  components: { AppImage, FontAwesomeIcon,
    NavButton
  },
  data() {
    return {
      // 背景图片数组（模拟数据，用户可以自行替换）
      backgroundImages: [
        '/images/web/home-bg-1.jpg', // 默认第一张
        '/images/web/home-bg-2.jpg',
        '/images/web/home-bg-3.webp',
        '/images/web/home-bg-4.webp'
      ],
      currentBackgroundIndex: 0,
      currentTime: '',
      currentDate: '',
      weather: {
        temp: 22,
        desc: '晴朗',
        location: '北京',
        icon: '☀️'
      },
      timeInterval: null
    }
  },
  mounted() {
    this.updateTime()
    this.timeInterval = setInterval(this.updateTime, 1000)
    this.fetchWeather()
  },
  beforeUnmount() {
    if (this.timeInterval) {
      clearInterval(this.timeInterval)
    }
  },
  computed: {
    isAuthenticated() { return this.auth.isAuthenticated },
    username() { return this.auth.user?.nickname || '' },
    currentBackgroundImage() {
      return this.backgroundImages[this.currentBackgroundIndex]
    }
  },
  methods: {
    navigateTo(routeName) {
      this.$router.push({ name: routeName })
    },
    logout() {
      this.auth.logout()
      this.$router.replace('/login')
    },
    // 切换背景图
    switchBackground() {
      this.currentBackgroundIndex = (this.currentBackgroundIndex + 1) % this.backgroundImages.length
    },
    // 更新时间
    updateTime() {
      const now = new Date()
      this.currentTime = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      this.currentDate = now.toLocaleDateString('zh-CN', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
      })
    },
    // 获取天气信息（模拟数据）
    fetchWeather() {
      // 这里可以集成真实的天气API
      const weathers = [
        { temp: 22, desc: '晴朗', icon: '☀️' },
        { temp: 18, desc: '多云', icon: '⛅' },
        { temp: 15, desc: '小雨', icon: '🌧️' }
      ]
      const random = Math.floor(Math.random() * weathers.length)
      this.weather = { ...this.weather, ...weathers[random] }
    },
    // 粒子样式
    getParticleStyle(index) {
      return {
        left: Math.random() * 100 + '%',
        top: Math.random() * 100 + '%',
        animationDelay: Math.random() * 5 + 's',
        animationDuration: (5 + Math.random() * 10) + 's'
      }
    }
  }
}
</script>

<style scoped>
.home-container {
  isolation: isolate;
  max-width: 1300px;
  margin: 0 auto;
  padding: 20px;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  min-height: 100vh;
  background-image: url('/images/home-backdrop.svg');
  position: relative;
  overflow: hidden;
}

.home-background {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: -1;
  pointer-events: none;
}

/* 粒子背景 */
.particle-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  animation: float infinite ease-in-out;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) translateX(0);
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: translateY(-100vh) translateX(50px);
    opacity: 0;
  }
}

/* 信息组件区域 */
.info-widgets {
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: row;
  gap: 15px;
  z-index: 10;
}

/* 时钟组件 */
.clock-widget {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  min-width: 200px;
  text-align: center;
  transition: all 0.3s ease;
}

.clock-widget:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}

.clock-widget .time {
  font-size: 32px;
  font-weight: bold;
  color: #fff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  margin-bottom: 5px;
  font-family: 'Courier New', monospace;
}

.clock-widget .date {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
}

/* 天气组件 */
.weather-widget {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  min-width: 200px;
  text-align: center;
  transition: all 0.3s ease;
}

.weather-widget:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}

.weather-icon {
  font-size: 48px;
  margin-bottom: 10px;
}

.temperature {
  font-size: 28px;
  font-weight: bold;
  color: #fff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  margin-bottom: 5px;
}

.weather-desc {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  margin-bottom: 5px;
}

.location {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
}

/* 主题切换按钮样式 - 增强版 */
.theme-switch-btn {
  position: fixed;
  top: 20px;
  left: 20px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: white;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.5);
  z-index: 1001;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  position: relative;
  flex-direction: column;
  padding: 5px;
}

/* 按钮文字样式 */
.theme-text {
  font-size: 10px;
  margin-top: 2px;
  font-weight: 500;
  text-align: center;
}

/* 按钮发光效果 */
.theme-switch-btn::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%);
  transform: scale(0);
  transition: transform 0.6s ease-out;
}

/* 悬停效果 */
.theme-switch-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.theme-switch-btn:hover::before {
  transform: scale(1);
}

/* 点击效果 */
.theme-switch-btn:active {
  transform: scale(0.95);
  box-shadow: 0 2px 10px rgba(102, 126, 234, 0.4);
}

/* 按钮图标动画 */
.theme-switch-btn .svg-inline--fa {
  transition: transform 0.3s ease;
}

.theme-switch-btn:hover .svg-inline--fa {
  transform: rotate(15deg);
}

.theme-switch-btn:active .svg-inline--fa {
  transform: rotate(360deg);
  transition: transform 0.6s ease;
}

/* 指示器样式 - 显示当前背景图序号 */
.theme-indicator {
  position: fixed;
  top: 80px;
  left: 20px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  font-size: 12px;
  font-weight: bold;
  color: #4361ee;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1001;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.theme-switch-btn:hover + .theme-indicator {
  opacity: 1;
}

.header {
  margin-bottom: 40px;
  position: relative;
  z-index: 10;
}

.animated-title {
  font-size: 3rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 10px;
  animation: titleGlow 3s ease-in-out infinite;
  text-shadow: 0 0 20px rgba(102, 126, 234, 0.5);
}

@keyframes titleGlow {
  0%, 100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.3);
  }
}

.animated-subtitle {
  font-size: 1.3rem;
  color: #fff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  animation: subtitleFade 2s ease-in-out infinite;
}

@keyframes subtitleFade {
  0%, 100% {
    opacity: 0.8;
  }
  50% {
    opacity: 1;
  }
}

.user-info {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 15px;
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
  padding: 10px 15px;
  border-radius: 20px;
}

.user-profile-circle {
  position: relative;
  cursor: pointer;
  transition: all 0.3s ease;
}

.user-profile-circle:hover {
  transform: scale(1.1) rotate(5deg);
}

.user-profile-circle:hover .profile-badge {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 3px solid #667eea;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  object-fit: cover;
}

.user-profile-circle:hover .avatar {
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
  border-color: #764ba2;
}

.profile-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0);
  background: rgba(102, 126, 234, 0.95);
  color: white;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  opacity: 0;
  transition: all 0.3s ease;
  pointer-events: none;
}

.username {
  font-weight: bold;
}

.logout-btn {
  padding: 8px 16px;
  font-size: 14px;
}

/* 导航按钮容器 */
.nav-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 40px;
  position: relative;
  z-index: 10;
  animation: fadeInUp 0.8s ease-out;
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

:deep(.attractions-button),
:deep(.routes-button),
:deep(.tickets-button),
:deep(.hotel-button),
:deep(.customer-service-button),
:deep(.chat-button) {
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* 景点推荐 - 蓝色主题 */
:deep(.attractions-button .icon-container) {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  box-shadow: 0 4px 15px rgba(79, 172, 254, 0.4);
}

:deep(.attractions-button:hover .icon-container) {
  box-shadow: 0 6px 25px rgba(79, 172, 254, 0.6);
}

:deep(.attractions-button *) {
  color: #2e6fb0;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* 线路制定 - 橙色主题 */
:deep(.routes-button .icon-container) {
  background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
  box-shadow: 0 4px 15px rgba(250, 112, 154, 0.4);
}

:deep(.routes-button:hover .icon-container) {
  box-shadow: 0 6px 25px rgba(250, 112, 154, 0.6);
}

:deep(.routes-button *) {
  color: #b05a10;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* 出行购票 - 绿色主题 */
:deep(.tickets-button .icon-container) {
  background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);
  box-shadow: 0 4px 15px rgba(48, 207, 208, 0.4);
}

:deep(.tickets-button:hover .icon-container) {
  box-shadow: 0 6px 25px rgba(48, 207, 208, 0.6);
}

:deep(.tickets-button *) {
  color: #1e8e5a;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* 酒店订购 - 红色主题 */
:deep(.hotel-button .icon-container) {
  background: linear-gradient(135deg, #ff6a00 0%, #ee0979 100%);
  box-shadow: 0 4px 15px rgba(255, 106, 0, 0.4);
}

:deep(.hotel-button:hover .icon-container) {
  box-shadow: 0 6px 25px rgba(255, 106, 0, 0.6);
}

:deep(.hotel-button *) {
  color: #c0392b;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* 人工客服 - 紫红主题 */
:deep(.customer-service-button .icon-container) {
  background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
  box-shadow: 0 4px 15px rgba(168, 237, 234, 0.4);
}

:deep(.customer-service-button:hover .icon-container) {
  box-shadow: 0 6px 25px rgba(168, 237, 234, 0.6);
}

:deep(.customer-service-button *) {
  color: #b03a8a;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* 驴友Chat - 深紫主题 */
:deep(.chat-button .icon-container) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

:deep(.chat-button:hover .icon-container) {
  box-shadow: 0 6px 25px rgba(102, 126, 234, 0.6);
}

:deep(.chat-button *) {
  color: #4361ee;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* 个人中心 - 青绿主题 */
:deep(.profile-button .icon-container) {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  box-shadow: 0 4px 15px rgba(17, 153, 142, 0.4);
}

:deep(.profile-button:hover .icon-container) {
  box-shadow: 0 6px 25px rgba(17, 153, 142, 0.6);
}

:deep(.profile-button *) {
  color: #0d8a80;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* ===== 移动端/小屏响应式 ===== */
@media (max-width: 768px) {
  .home-container {
    padding: 12px;
  }

  .animated-title {
    font-size: 2rem;
  }

  .animated-subtitle {
    font-size: 1.05rem;
  }

  /* 时钟/天气从固定右下角改为跟随内容流，避免被裁切或遮挡导航 */
  .info-widgets {
    position: static;
    flex-direction: column;
    width: 100%;
    margin-top: 12px;
    gap: 10px;
  }

  .clock-widget,
  .weather-widget {
    min-width: 0;
  }

  .nav-container {
    grid-template-columns: 1fr;
    gap: 14px;
    margin-top: 24px;
  }

  .user-info {
    top: 12px;
    right: 12px;
    padding: 6px 10px;
  }

  .avatar {
    width: 42px;
    height: 42px;
  }

  .theme-indicator {
    top: 84px;
    left: 12px;
  }
}
</style>
