<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <AppHeader v-if="showHeader" />
    <main id="main-content" tabindex="-1">
      <router-view v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" :key="route.path" />
        </transition>
      </router-view>
    </main>
    <FeedbackHost />
  </div>
</template>

<script>
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import FeedbackHost from './components/FeedbackHost.vue'
const AppHeader = defineAsyncComponent(() => import('./components/AppHeader.vue'))
export default {
  components: { FeedbackHost, AppHeader },
  setup() {
    const route = useRoute()
    const showHeader = computed(() => Boolean(route.meta.header))
    return { route, showHeader }
  }
}
</script>

<style>
#app {
  font-family: inherit;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  min-height: 100vh;
  background-color: #f5f7fa;
}

/* 全局按钮样式 */
.btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background-color: #4361ee;
  color: white;
}

.btn-primary:hover {
  background-color: #3a0ca3;
}

.btn-secondary {
  background-color: #f8f9fa;
  color: #4361ee;
  border: 1px solid #4361ee;
}

.btn-secondary:hover {
  background-color: #edf2ff;
}

/* 表单样式 */
.form-group {
  margin-bottom: 20px;
  text-align: left;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
}

.form-input {
  box-sizing: border-box;
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
}

/* 卡片样式 */
.demo-notice {
  padding: 12px 16px;
  border-radius: 8px;
  background: #edf2ff;
  color: #354b7a;
  line-height: 1.6;
  text-align: left;
}

.card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 24px;
  margin: 20px auto;
  max-width: 800px;
}

/* 导航按钮容器 */
.nav-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 40px;
}

/* 路由切换过渡 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .fade-slide-enter-active,
  .fade-slide-leave-active {
    transition: none;
  }
}
</style>
