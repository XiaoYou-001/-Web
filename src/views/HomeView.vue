<template>
  <div class="home">
    <header class="topbar">
      <strong class="brand"><span class="brand-mark" aria-hidden="true">◈</span> 智绘旅游</strong>
      <div class="actions">
        <template v-if="isAuthenticated">
          <router-link class="user-chip" to="/profile" title="进入个人中心">
            <app-image :src="auth.user.avatar" alt="用户头像" class="avatar" kind="avatar" loading="eager" />
            <span class="username">{{ username }}</span>
          </router-link>
          <button class="icon-btn" @click="logout" title="退出登录">
            <span>退出</span>
          </button>
        </template>
        <template v-else>
          <router-link to="/login" class="link">登录</router-link>
          <router-link to="/register" class="link link-primary">注册</router-link>
        </template>
      </div>
    </header>

    <DestinationGallery :places="places" v-model="selected" @plan="planning = true" />
    <PlanDialog v-if="planning" :place="place" @close="planning = false" />
    <div class="content">
      <section class="planner">
        <div class="planner-copy">
          <h2>我的行程</h2>
          <p>{{ travel.routes.length ? '接着安排你的下一段旅程。' : '选好目的地和日期，让 AI 帮你安排每天的路线。' }}</p>
          <router-link class="plan-link" to="/routes">规划行程 <span aria-hidden="true">→</span></router-link>
        </div>
        <div class="itinerary" v-if="travel.routes.length">
          <h3>继续规划</h3>
          <router-link class="stop" v-for="trip in travel.routes.slice(0, 3)" :key="trip.id" :to="'/routes/' + trip.id">
            <small>{{ trip.startDate }}</small><b>{{ trip.title }}</b><span aria-hidden="true">↗</span>
          </router-link>
        </div>
        <div v-else class="assistant-link">
          <h3>旅行助手</h3>
          <p>出发前，聊聊当地怎么玩。</p>
          <router-link to="/customer-service">咨询旅行助手 ↗</router-link>
        </div>
      </section>
      <TravelTools />
      <footer>© 2026 智绘旅游</footer>
    </div>
  </div>
</template>

<script>
import AppImage from '../ui/AppImage.js'
import { defineAsyncComponent } from 'vue'
import { useTravelStore } from '../stores/travel.js'
import { useAuthStore } from '../stores/auth.js'

export default {
  name: 'HomeView',
  components: {
    AppImage,
    DestinationGallery: defineAsyncComponent(() => import('../components/home/DestinationGallery.vue')),
    PlanDialog: defineAsyncComponent(() => import('../components/home/PlanDialog.vue')),
    TravelTools: defineAsyncComponent(() => import('../components/home/TravelTools.vue'))
  },
  setup() { return { auth: useAuthStore(), travel: useTravelStore() } },
  data() {
    return {
      selected: 0,
      planning: false,
      places: [
        { short: '杭州', region: '浙江 · 杭州', keyword: '西湖', title: '沿着西湖，慢慢走。',
          description: '从苏堤的树影走到湖边，留一段黄昏给西湖。', image: '/images/web/attr-4.webp',
          stops: ['漫步苏堤', '在花港观鱼看湖', '南山路等日落'] },
        { short: '张家界', region: '湖南 · 张家界', keyword: '张家界', title: '走进峰林深处。',
          description: '循着山间步道，在观景台看石峰从云间露出来。', image: '/images/web/attr-6.webp',
          stops: ['袁家界看峰林', '天子山观景', '沿山间步道返程'] },
        { short: '桂林', region: '广西 · 桂林', keyword: '漓江', title: '在漓江，顺水而行。',
          description: '从兴坪古镇走向江岸，看群峰的倒影随水推开。', image: '/images/web/attr-12.webp',
          stops: ['逛兴坪古镇', '沿漓江散步', '江边看暮色'] }
      ]
    }
  },
  computed: {
    place() { return this.places[this.selected] },
    isAuthenticated() { return this.auth.isAuthenticated },
    username() { return this.auth.user?.nickname || '' }
  },
  methods: {
    logout() {
      this.auth.logout()
      this.$router.replace('/login')
    }
  }
}
</script>

<style scoped>
.home { background: #f8f7f2; color: #1d322d; text-align: left; }
.home a { color: inherit; text-decoration: none; }
.home button { font: inherit; cursor: pointer; }
.topbar, .content { width: min(1200px, 91%); margin-inline: auto; }
.topbar, .actions, .user-chip { display:flex; align-items:center; }
.topbar { min-height:64px; justify-content:space-between; }
.actions { gap:14px; font-size:14px; }
.brand { font-size:20px; }
.brand-mark { color:#946e3e; }
.link-primary,.icon-btn { background:#203d35; color:white !important; border:0; border-radius:30px; padding:7px 15px; }
.user-chip { gap:8px; }
.avatar { width:30px; height:30px; border-radius:50%; object-fit:cover; }
.username { max-width:24vw; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.planner { display:grid; grid-template-columns:1fr 1fr; align-items:center; gap:30px; padding:clamp(36px,5vw,68px) 0; }
.planner h2 { margin:0; font-size:clamp(30px,4vw,50px); }
.planner p { color:#53655e; }
.plan-link { display:inline-block; padding:10px 18px; background:#204b3e; color:white !important; border-radius:24px; }
.itinerary,.assistant-link { border-left:2px solid #b19363; padding-left:24px; }
.planner h3 { margin:0; }
.assistant-link a { text-decoration:underline; }
.stop { display:flex; gap:12px; padding:8px 0; overflow-wrap:anywhere; }
footer { padding-bottom:24px; font-size:12px; color:#59675d; }
@media (max-width: 680px) {
  .planner { grid-template-columns: 1fr; }
}
</style>
