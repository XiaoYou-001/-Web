<template>
  <div
    class="nav-card"
    @click="$emit('click')"
    role="button"
    tabindex="0"
    @keydown.enter="$emit('click')"
  >
    <app-image v-if="image" :src="image" alt="" class="card-photo" />
    <div class="scrim"></div>

    <div class="top">
      <div class="icon">
        <font-awesome-icon :icon="['fas', icon]" class="nav-icon" />
      </div>
      <font-awesome-icon :icon="['fas', 'arrow-right']" class="go" />
    </div>

    <div class="text">
      <h3>{{ title }}</h3>
      <p>{{ description }}</p>
    </div>
  </div>
</template>

<script>
import { FontAwesomeIcon } from '../ui/fontAwesome.js'
import AppImage from '../ui/AppImage.js'

export default {
  name: 'NavButton',
  components: { FontAwesomeIcon, AppImage },
  props: {
    image: { type: String, default: '' },
    icon: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true }
  }
}
</script>

<style scoped>
.nav-card {
  position: relative;
  isolation: isolate;
  min-height: 156px;
  border-radius: 16px;
  padding: 20px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
  transition: transform 0.3s ease, border-color 0.3s ease, background 0.3s ease;
}
.nav-card:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

.card-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: -2;
  opacity: 0.6;
  transition: transform 0.6s ease, opacity 0.3s ease;
}
.nav-card:hover .card-photo { transform: scale(1.05); opacity: 0.75; }

.scrim {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(180deg, rgba(10, 12, 20, 0.25) 0%, rgba(10, 12, 20, 0.66) 100%);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.92);
  color: #1c2230;
  transition: transform 0.3s ease;
}
.nav-icon { font-size: 18px; }
.nav-card:hover .icon { transform: translateY(-2px); }

.go {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.7);
  transition: transform 0.3s ease, color 0.3s ease;
}
.nav-card:hover .go { transform: translateX(3px); color: #fff; }

.text h3 {
  margin: 0 0 4px;
  font-size: 1.05rem;
  font-weight: 600;
  color: #fff;
}
.text p {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: rgba(238, 240, 246, 0.72);
}
</style>
