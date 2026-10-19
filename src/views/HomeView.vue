<template>
  <div class="home">
    <!-- 全屏摄影背景 + 精细深色叠层，营造安静、可沉浸的旅行氛围 -->
    <app-image
      class="backdrop"
      :src="currentBackgroundImage"
      fallback="/images/home-backdrop.svg"
      alt=""
      loading="eager"
      fetchpriority="high"
      width="1600"
      height="1000"
    />
    <div class="vignette" aria-hidden="true"></div>
    <div class="grain" aria-hidden="true"></div>

    <!-- 顶部：换景 + 动作区 -->
    <header class="topbar">
      <button class="icon-btn" @click="switchBackground" title="切换背景" aria-label="切换背景">
        <font-awesome-icon class="fas fa-palette" />
        <span>换景</span>
      </button>

      <div class="actions">
        <template v-if="isAuthenticated">
          <div class="user-chip" @click="navigateTo('profile')" title="进入个人中心">
            <app-image :src="auth.user.avatar" alt="用户头像" class="avatar" kind="avatar" loading="eager" />
            <span class="username">{{ username }}</span>
          </div>
          <button class="icon-btn" @click="logout" title="退出登录">
            <font-awesome-icon class="fas fa-right-left" />
            <span>退出</span>
          </button>
        </template>
        <template v-else>
          <router-link to="/login" class="link">登录</router-link>
          <router-link to="/register" class="link link-primary">注册</router-link>
        </template>
      </div>
    </header>

    <!-- Hero：考究、留白充足，一句主文案 + 单一行动入口 -->
    <section class="hero">
      <p class="eyebrow">智绘旅游 · 新的一年，去更远的地方</p>
      <h1 class="title">
        探索没有见过的
        <em>风景</em>
      </h1>
      <p class="subtitle">AI 帮你把每一次出发，都安排得恰到好处。</p>

      <button class="cta" @click="navigateTo('routes')">
        规划行程
        <font-awesome-icon class="fas fa-arrow-right" />
      </button>
    </section>

    <!-- 时钟与天气：轻量信息，安静地放在右下角 -->
    <aside class="meta">
      <div class="meta-item">
        <span class="meta-label">此刻</span>
        <span class="time">{{ currentTime }}</span>
        <span class="sub">{{ currentDate }}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">天气</span>
        <span class="temp">{{ weather.temp }}°</span>
        <span class="sub">{{ weather.desc }} · {{ weather.location }}</span>
      </div>
    </aside>

    <!-- 导航：简洁的图文入口 -->
    <nav class="modules" aria-label="功能入口">
      <NavButton
        v-for="m in modules"
        :key="m.name"
        :icon="m.icon"
        :title="m.title"
        :description="m.desc"
        :image="m.image"
        @click="navigateTo(m.route)"
      />
    </nav>

    <footer class="foot">
      <span>© 2026 智绘旅游</span>
      <span class="foot-tag">AI 驱动 · 懂你的旅行</span>
    </footer>
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
  components: { AppImage, FontAwesomeIcon, NavButton },
  data() {
    return {
      backgroundImages: [
        '/images/web/home-bg-1.jpg',
        '/images/web/home-bg-2.jpg',
        '/images/web/home-bg-3.webp',
        '/images/web/home-bg-4.webp'
      ],
      currentBackgroundIndex: 0,
      currentTime: '',
      currentDate: '',
      weather: { temp: 22, desc: '晴朗', location: '北京', icon: '' },
      timeInterval: null,
      modules: [
        { name: 'attractions', icon: 'camera', title: '景点推荐', desc: '按你的喜好，发现值得一去的地方', route: 'attractions', image: '/images/web/nav-1.png' },
        { name: 'routes', icon: 'route', title: '线路制定', desc: '智能规划一条顺路的旅程', route: 'routes', image: '/images/web/nav-2.jpg' },
        { name: 'tickets', icon: 'ticket-simple', title: '出行购票', desc: '一站搞定各类交通票', route: 'tickets', image: '/images/web/nav-3.jpg' },
        { name: 'hotels', icon: 'hotel', title: '酒店订购', desc: '精选住宿，安心预订', route: 'hotels', image: '/images/web/nav-4.jpg' },
        { name: 'customer-service', icon: 'headset', title: '人工客服', desc: '有疑问时，随时有人在', route: 'customer-service', image: '/images/web/nav-5.png' },
        { name: 'chat', icon: 'comments', title: '驴友Chat', desc: '和同路人聊聊这一路的见闻', route: 'chat', image: '/images/web/nav-6.jpg' }
      ]
    }
  },
  mounted() {
    this.updateTime()
    this.timeInterval = setInterval(this.updateTime, 1000)
  },
  beforeUnmount() {
    if (this.timeInterval) clearInterval(this.timeInterval)
  },
  computed: {
    isAuthenticated() { return this.auth.isAuthenticated },
    username() { return this.auth.user?.nickname || '' },
    currentBackgroundImage() {
      return this.backgroundImages[this.currentBackgroundIndex]
    }
  },
  methods: {
    navigateTo(routeName) { this.$router.push({ name: routeName }) },
    logout() {
      this.auth.logout()
      this.$router.replace('/login')
    },
    switchBackground() {
      this.currentBackgroundIndex = (this.currentBackgroundIndex + 1) % this.backgroundImages.length
    },
    updateTime() {
      const now = new Date()
      this.currentTime = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      this.currentDate = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
    }
  }
}
</script>

<style scoped>
/* ================================================================
   首页 · 安静、克制、有质感的沉浸式排版
   ================================================================ */
.home {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  color: #f5f6fa;
  background: #0d0f16;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
  isolation: isolate;
  padding: 20px clamp(20px, 4vw, 56px) 28px;
  display: flex;
  flex-direction: column;
}

/* —— 背景 —— */
.backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: -3;
  filter: saturate(0.85) brightness(0.78);
  transform: scale(1.02);
  transition: opacity 0.5s ease;
}
.vignette {
  position: absolute;
  inset: 0;
  z-index: -2;
  background:
    radial-gradient(120% 90% at 50% 0%, transparent 0%, rgba(7, 9, 15, 0.55) 62%, rgba(7, 9, 15, 0.92) 100%),
    linear-gradient(180deg, rgba(8, 10, 16, 0.35) 0%, rgba(8, 10, 16, 0.05) 30%, rgba(8, 10, 16, 0.85) 100%);
}
.grain {
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.05;
  background-image: radial-gradient(rgba(255,255,255,0.5) 0.6px, transparent 0.6px);
  background-size: 5px 5px;
}

/* —— 顶部 —— */
.topbar {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 999px;
  background: rgba(255,255,255,0.05);
  color: #eef0f6;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.25s ease;
  backdrop-filter: blur(8px);
}
.icon-btn:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.3); }
.actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
  padding: 4px 12px 4px 4px;
  border-radius: 999px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(8px);
  transition: background 0.25s ease;
}
.user-chip:hover { background: rgba(255,255,255,0.12); }
.avatar {
  width: 34px; height: 34px; border-radius: 50%;
  object-fit: cover; border: 1px solid rgba(255,255,255,0.35);
}
.username { font-size: 14px; font-weight: 600; }
.link {
  font-size: 14px; color: #eef0f6; text-decoration: none;
  padding: 8px 14px; border-radius: 999px; transition: background 0.25s ease;
}
.link:hover { background: rgba(255,255,255,0.1); }
.link-primary { background: rgba(255,255,255,0.92); color: #171922; font-weight: 600; }
.link-primary:hover { background: #fff; }

/* —— Hero —— */
.hero {
  max-width: 1200px;
  width: 100%;
  margin: clamp(48px, 10vh, 110px) auto 0;
  z-index: 4;
}
.eyebrow {
  margin: 0 0 14px;
  font-size: 13px;
  letter-spacing: 0.14em;
  color: rgba(238, 240, 246, 0.75);
  font-weight: 500;
}
.title {
  margin: 0;
  font-size: clamp(2.4rem, 6.5vw, 4.6rem);
  font-weight: 650;
  line-height: 1.12;
  letter-spacing: -0.01em;
  color: #fff;
}
.title em {
  font-style: normal;
  font-weight: 650;
  color: #cdd3ff;
}
.subtitle {
  margin: 18px 0 0;
  max-width: 340px;
  font-size: clamp(1rem, 1.6vw, 1.15rem);
  line-height: 1.7;
  color: rgba(238, 240, 246, 0.78);
  font-weight: 400;
}
.cta {
  margin-top: 34px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 13px 24px;
  border: 1px solid rgba(255,255,255,0.85);
  border-radius: 999px;
  background: rgba(255,255,255,0.96);
  color: #171922;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
}
.cta:hover { background: #fff; transform: translateY(-1px); }
.cta .svg-inline--fa { transition: transform 0.25s ease; }
.cta:hover .svg-inline--fa { transform: translateX(3px); }

/* —— 时钟 / 天气 —— */
.meta {
  position: absolute;
  right: clamp(20px, 4vw, 56px);
  bottom: clamp(24px, 5vh, 48px);
  z-index: 4;
  display: flex;
  gap: 26px;
}
.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 18px;
  border-radius: 14px;
  background: rgba(12, 14, 22, 0.4);
  border: 1px solid rgba(255,255,255,0.1);
  backdrop-filter: blur(10px);
  min-width: 132px;
}
.meta-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  color: rgba(238, 240, 246, 0.5);
  text-transform: uppercase;
}
.time, .temp {
  font-size: 26px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #fff;
  line-height: 1.2;
}
.sub { font-size: 12px; color: rgba(238, 240, 246, 0.66); }

/* —— 导航 —— */
.modules {
  position: relative;
  z-index: 4;
  max-width: 1200px;
  width: 100%;
  margin: auto auto 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

/* —— 页脚 —— */
.foot {
  position: relative;
  z-index: 4;
  max-width: 1200px;
  width: 100%;
  margin: 22px auto 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12.5px;
  color: rgba(238, 240, 246, 0.5);
}
.foot-tag { color: rgba(238, 240, 246, 0.7); }

@media (max-width: 820px) {
  .hero { margin-top: 40px; }
  .modules { grid-template-columns: 1fr 1fr; }
  .meta { position: static; margin: 24px auto 0; max-width: 1200px; width: 100%; }
  .foot { flex-direction: column; gap: 6px; text-align: center; }
}
@media (max-width: 520px) {
  .modules { grid-template-columns: 1fr; }
  .username { display: none; }
  .meta { flex-direction: column; }
}
</style>
