<template>
  <section v-if="progress.inProgress" class="today-trip" aria-labelledby="today-trip-heading">
    <header>
      <div><h2 id="today-trip-heading">今日行程</h2><small>{{ progress.date }} · {{ progress.zone }}</small></div>
      <button type="button" @click="$emit('open-day')">查看当天安排</button>
    </header>
    <div v-if="progress.current" class="stop">
      <div>
        <strong>当前活动</strong><p>{{ progress.current.activity.time }} {{ progress.current.activity.title }}</p>
        <p v-if="progress.current.activity.place?.address">{{ progress.current.activity.place.address }}</p>
        <small v-if="progress.current.timingNote">{{ progress.current.timingNote }}</small>
      </div>
      <div>
        <a :href="navigationLink(progress.current.activity.place) || placeSearchLink(progress.current.activity.title)" target="_blank" rel="noopener noreferrer">
          {{ navigationLink(progress.current.activity.place) ? '步行导航' : '搜索地点' }}
        </a>
        <button type="button" @click="progress.current.activity.completed = true">标记完成</button>
      </div>
    </div>
    <p v-else>当前没有进行中的活动。</p>
    <div v-for="stop in upcoming" :key="stop.row.index" class="stop">
      <div>
        <strong>{{ stop.label }}</strong><p>{{ stop.row.activity.time }} {{ stop.row.activity.title }}</p>
        <p v-if="stop.row.activity.place?.address">{{ stop.row.activity.place.address }}</p>
        <small v-if="stop.row === progress.nextBooking">
          {{ progress.latestDeparture ? '最晚 ' + progress.latestDeparture.time + ' 从「' + progress.latestDeparture.from + '」出发' : '上一站或交通耗时待确认，最晚出发时间待定' }}
        </small>
      </div>
      <a :href="navigationLink(stop.row.activity.place) || placeSearchLink(stop.row.activity.title)" target="_blank" rel="noopener noreferrer">
        {{ navigationLink(stop.row.activity.place) ? '步行导航' : '搜索地点' }}
      </a>
    </div>
    <p v-if="!progress.next">今天没有后续定时活动。</p>
    <p v-if="progress.untimed.length">今天另有 {{ progress.untimed.length }} 项活动待定时间。</p>
    <details v-if="progress.overdue.length"><summary>待补记（{{ progress.overdue.length }}）</summary>
      <div v-for="row in progress.overdue" :key="row.date + '-' + row.index" class="record">
        <span>{{ row.date === progress.date ? '' : row.date }} {{ row.activity.time }} {{ row.activity.title }}</span>
        <button type="button" @click="row.activity.completed = true">已完成</button>
        <button type="button" @click="row.activity.skipped = true">已跳过</button>
      </div>
    </details>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { navigationLink, placeSearchLink } from '../services/mapPlaces.js'
const props = defineProps({ progress: { type: Object, required: true } })
defineEmits(['open-day'])
const upcoming = computed(() => {
  const { next, nextBooking } = props.progress
  const stops = []
  if (next) stops.push({ row: next, label: next === nextBooking ? '下一站 · 固定预约' : '下一站' })
  if (nextBooking && nextBooking !== next) stops.push({ row: nextBooking, label: '下一固定预约' })
  return stops
})
</script>
<style scoped>
.today-trip { background:#f3f8f5; border:1px solid #b8d3c5; border-radius:14px; color:#234238; padding:16px; margin:0 0 16px; overflow-wrap:anywhere; }
.today-trip header,.today-trip .stop,.today-trip .record { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
.today-trip h2 { font-size:1.25rem; margin:0; }
.today-trip p { margin:5px 0; }
.today-trip .stop { margin-top:10px; border-top:1px solid #ceded5; padding-top:8px; }
.today-trip small { color:#486257; }
.today-trip button,.today-trip a,.today-trip summary { cursor:pointer; min-height:40px; padding:8px; }
.today-trip summary { margin-top:8px; }
.today-trip .record span { flex:1; }
</style>
