<script setup>
import { defineAsyncComponent, ref } from 'vue'
import { Splide, SplideSlide } from '@splidejs/vue-splide'
import '@splidejs/vue-splide/css/core'
import AppImage from '../../ui/AppImage.js'
import Pin from '~icons/lucide/map-pin'
import Arrow from '~icons/lucide/arrow-up-right'

defineProps({ places: { type: Array, required: true } })
const selected = defineModel({ type: Number, required: true })
defineEmits(['plan'])
const gallery = ref(null)
const Reveal = defineAsyncComponent(() => import('./BlurReveal.vue'))
const visited = ref(false)
function onMove(_, index) {
  visited.value = true
  selected.value = index
}
const options = { arrows: false, pagination: false, rewind: true, speed: 450, keyboard: 'focused', reducedMotion: { speed: 0 } }
</script>

<template>
  <section class="gallery">
    <Splide ref="gallery" :options="options" aria-label="精选目的地画册" @splide:move="onMove">
      <SplideSlide v-for="(place, index) in places" :key="place.short">
        <article class="spread">
          <AppImage class="photo" :src="place.image" alt="" :loading="index ? 'lazy' : 'eager'" :fetchpriority="index ? 'auto' : 'high'" />
          <div class="layout">
            <div class="story">
              <p class="region"><Pin aria-hidden="true" /> {{ place.region }}</p>
              <component :is="index === selected ? 'h1' : 'h2'">{{ place.title }}</component>
              <p class="intro">{{ place.description }}</p>
              <button class="plan" @click="$emit('plan')">规划{{ place.short }}行程 <Arrow aria-hidden="true" /></button>
              <router-link class="explore" :to="{name:'attractions', query:{q:place.keyword}}">探索景点 ↗</router-link>
            </div>
            <aside class="route-card">
              <h3>{{ place.short }}一日漫游</h3>
              <component :is="visited && selected === index ? Reveal : 'div'" :key="selected === index">
                <ol><li v-for="(stop, i) in place.stops" :key="stop"><small>{{ ['上午','午后','傍晚'][i] }}</small>{{ stop }}</li></ol>
              </component>
            </aside>
          </div>
        </article>
      </SplideSlide>
    </Splide>
    <div class="strip" aria-label="切换目的地">
      <button v-for="(place,index) in places" :key="place.short" :aria-pressed="selected === index" @click="gallery.go(index)">
        <AppImage :src="place.image" alt="" /><span>{{ place.short }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.gallery { background:#192d2b; color:#fff; }
.spread { position:relative; isolation:isolate; display:grid; align-items:end; min-height:clamp(440px,62vh,700px); }
.photo,.spread::after { position:absolute; inset:0; width:100%; height:100%; }
.photo { object-fit:cover; z-index:-2; }
.spread::after { content:''; z-index:-1; background:linear-gradient(0deg,#102324e8,transparent 90%),linear-gradient(90deg,#0d252b91,transparent); }
.layout,.strip { width:min(1200px,91%); margin:auto; }
.layout { display:grid; grid-template-columns: minmax(0,1fr) minmax(220px,29%); align-items:end; gap:32px; margin-block:auto 0; padding-block:44px; }
.story h1,.story h2 { color:#fffdf5; font:600 clamp(38px,5.8vw,84px)/1.2 "Songti SC","SimSun",serif; letter-spacing:-.045em; margin:12px 0; }
.region,.plan { display:inline-flex; align-items:center; gap:8px; }
.region { letter-spacing:.12em; margin:0; }
.intro { line-height:1.7; margin:0 0 24px; }
.plan { background:#fcf6e7; color:#19382c; border:0; border-radius:30px; padding:12px 20px; font:inherit; cursor:pointer; }
.explore { margin-left:18px; color:white; text-decoration:underline; text-underline-offset:5px; }
.route-card { padding:24px; background:#162e2dcc; border:1px solid #ffffff52; border-radius:18px; backdrop-filter:blur(14px); }
.route-card h3 { color:#fffdf5; margin:0 0 12px; font-size:22px; }
.route-card ol { list-style:none; margin:0; padding:0; }
.route-card li { display:flex; align-items:center; gap:16px; padding:7px 0; }
.route-card small { color:#e8d7ad; }
.strip { display:flex; gap:24px; }
.strip button { display:flex; align-items:center; gap:10px; padding:12px 2px; border:0; border-bottom:3px solid transparent; background:transparent; color:white; cursor:pointer; font:inherit; }
.strip button[aria-pressed=true] { border-color:#e6c88b; }
.strip img { width:48px; height:32px; object-fit:cover; border-radius:4px; }
@media(max-width:700px) {
  .layout { grid-template-columns:1fr; padding-block:70px 20px; gap:24px; }
  .route-card { padding:14px 16px; }
  .route-card h3 { font-size:17px; }
  .route-card ol { display:flex; gap:12px; }
  .route-card li { flex:1; display:grid; gap:3px; padding:0; font-size:13px; }
  .strip { justify-content:space-between; gap:4px; }
  .strip img { width:30px; height:24px; }
}
</style>
