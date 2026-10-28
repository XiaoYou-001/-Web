<template>
  <header class="app-header">
    <div class="header-inner">
      <router-link to="/" class="brand">
        <span class="brand-logo">✈️</span>
        <span class="brand-name">智绘旅游</span>
      </router-link>

      <nav class="main-nav" aria-label="主导航">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          :aria-label="item.label"
          :aria-current="isActive(item.name) ? 'page' : undefined"
          class="nav-link"
          :class="{ active: isActive(item.name) }"
        >
          <font-awesome-icon :icon="['fas', item.icon]" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="header-actions">
        <template v-if="auth.isAuthenticated">
          <router-link to="/profile" class="user-chip" title="个人中心">
            <app-image
              :src="auth.user?.avatar"
              alt="用户头像"
              class="user-avatar"
              kind="avatar"
              loading="lazy"
            />
            <span class="user-name">{{ auth.user?.nickname || '用户' }}</span>
          </router-link>
          <button class="logout-btn" @click="logout" title="退出登录">
            <font-awesome-icon :icon="['fas', 'right-left']" />
            <span>退出</span>
          </button>
        </template>
        <template v-else>
          <router-link to="/login" class="btn-link">登录</router-link>
          <router-link to="/register" class="btn-link btn-register">注册</router-link>
        </template>
      </div>
    </div>
  </header>
</template>

<script>
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import AppImage from '../ui/AppImage.js'
import { FontAwesomeIcon } from '../ui/navigationIcons.js'

export default {
  name: 'AppHeader',
  components: { AppImage, FontAwesomeIcon },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const auth = useAuthStore()

    const navItems = [
      { name: 'attractions', label: '景点推荐', icon: 'camera' },
      { name: 'routes', label: '线路制定', icon: 'map' },
      { name: 'tickets', label: '票务中心', icon: 'ticket' },
      { name: 'hotels', label: '酒店订购', icon: 'hotel' },
      { name: 'customer-service', label: '人工客服', icon: 'headset' },
      { name: 'chat', label: '驴友Chat', icon: 'comments' }
    ]

    const isActive = (name) => route.name === name || (name === 'routes' && route.name === 'route-detail')

    const logout = () => {
      auth.logout()
      router.replace('/login')
    }

    return { auth, navItems, isActive, logout }
  }
}
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 500;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.header-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 20px;
  height: 62px;
  display: flex;
  align-items: center;
  gap: 24px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  color: var(--text-main);
  text-decoration: none;
}

.brand-logo {
  font-size: 24px;
}

.brand-name {
  font-size: 18px;
  font-weight: 700;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.main-nav {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 14px;
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.nav-link:hover {
  background: #f1f4ff;
  color: var(--primary);
}

.nav-link.active {
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--text-main);
  padding: 4px 8px;
  border-radius: var(--radius-lg);
  transition: background 0.2s;
}

.user-chip:hover {
  background: #f1f4ff;
}

.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--primary-2);
}

.user-name {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #fff;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.btn-link {
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  text-decoration: none;
}

.btn-register {
  background: var(--gradient-primary);
  color: #fff;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .header-inner { flex-wrap: wrap; height: auto; padding-block: 8px; }
  .main-nav { order: 3; flex-basis: 100%; padding: 4px 0; }
  .header-actions { margin-left: auto; }
  .header-inner { gap: 12px; padding: 0 12px; }
  .brand-name { display: none; }
  .user-name { display: none; }
  .nav-link span { display: none; }
  /* 扩大移动端导航/按钮点击区域（≥ 40px 触控目标） */
  .nav-link {
    padding: 10px 12px;
    min-width: 44px;
    min-height: 40px;
    justify-content: center;
  }
  .header-actions { gap: 8px; }
  .logout-btn span { display: none; }
  .logout-btn {
    padding: 10px 12px;
    min-width: 40px;
    min-height: 40px;
    justify-content: center;
  }
  .btn-link {
    padding: 10px 14px;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
  }
  .user-chip {
    padding: 6px;
    min-height: 40px;
    min-width: 40px;
    justify-content: center;
  }
  .main-nav { gap: 2px; }
}
</style>
