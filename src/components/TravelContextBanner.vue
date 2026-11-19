<template>
  <aside v-if="trip" class="travel-context" aria-label="当前旅行">
    <strong>{{ trip.title }}</strong>
    <span>{{ trip.startDate }} 至 {{ trip.endDate }} · {{ trip.persons || '未填写' }} 人</span>
    <router-link :to="{name:'route-detail',params:{id:String(trip.id)}}">返回旅行工作台</router-link>
    <small>当前使用已保存的旅行条件；查询结果与预订仍为演示。</small>
  </aside>
</template>
<script setup>
import { RouterLink } from 'vue-router'
import { useTravelContext } from '../composables/useTravelContext.js'
const trip=useTravelContext()
</script>
<style scoped>
.travel-context{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:7px 12px;margin:6px 0;border:1px solid #ccddeb;border-radius:10px;background:#f1f7fc;color:#243449}.travel-context small{color:#52666c;font-size:12px}.travel-context a{color:#235da0}
</style>
