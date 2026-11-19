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
.page-header { margin:0 0 16px; color:var(--text-main); text-align:left; }
.page-header-inner { display:flex; flex-wrap:wrap; align-items:center; column-gap:18px; row-gap:6px; padding:4px 0 12px; border-bottom:1px solid var(--border); }
.page-title { display:flex; align-items:center; gap:10px; font-size:clamp(22px,2.4vw,30px); margin:0; color:inherit; }
.page-title-icon { color:var(--primary); font-size:.8em; }
.page-subtitle { color:var(--text-secondary); font-size:13px; margin:0; }
.page-header-extra { margin-left:auto; max-width:100%; }
@media(max-width:640px){.page-header-extra { margin-left:0; }}
</style>
