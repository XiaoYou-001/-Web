<template>
  <header class="page-header" :class="[`is-${variant}`]">
    <div class="page-header-inner">
      <h1 class="page-title">
        <font-awesome-icon v-if="icon" :icon="['fas', icon]" class="page-title-icon" />
        <slot name="title">{{ title }}</slot>
      </h1>
      <p v-if="subtitle || $slots.subtitle" class="page-subtitle">
        <slot name="subtitle">{{ subtitle }}</slot>
      </p>
      <div v-if="$slots.default" class="page-header-extra">
        <slot />
      </div>
    </div>
  </header>
</template>

<script>
import { FontAwesomeIcon } from '../ui/fontAwesome.js'

export default {
  name: 'PageHeader',
  components: { FontAwesomeIcon },
  props: {
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    icon: { type: String, default: '' },
    variant: { type: String, default: 'gradient' } // gradient | plain
  }
}
</script>

<style scoped>
.page-header {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  margin-bottom: 20px;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);
}

.page-header.is-gradient {
  background: var(--gradient-primary);
  color: #fff;
}

.page-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px 28px;
  position: relative;
  z-index: 1;
  text-align: left;
}

/* 装饰光斑 */
.page-header.is-gradient::before {
  content: '';
  position: absolute;
  top: -60%;
  right: -30%;
  width: 160%;
  height: 220%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.12) 0%, transparent 70%);
  animation: page-header-shimmer 8s infinite;
  pointer-events: none;
}

@keyframes page-header-shimmer {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  50% { transform: translate(-10%, -10%) rotate(180deg); }
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
  line-height: 1.3;
}

.page-title-icon {
  opacity: 0.95;
}

.page-subtitle {
  margin: 8px 0 0;
  font-size: 14px;
  opacity: 0.92;
  line-height: 1.6;
}

.page-header-extra {
  margin-top: 14px;
}

.page-header.is-plain {
  background: #fff;
  border: 1px solid var(--border);
  color: var(--text-main);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.page-header.is-plain .page-title {
  color: var(--text-main);
}

.page-header.is-plain .page-subtitle {
  color: var(--text-secondary);
}
</style>
