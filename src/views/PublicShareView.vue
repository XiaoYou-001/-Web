<template>
  <section aria-label="只读旅行分享" class="public-share">
    <p v-if="loading && !plan" role="status">正在读取分享…</p>
    <section v-if="error" role="alert"><h1 v-if="!plan">暂时无法查看分享</h1><strong v-else>刷新失败，正在显示上次读取的行程。</strong><p>{{ error }}</p><button v-if="retryable && !plan" @click="load">重试</button></section>
    <article v-if="plan"><h1>{{ plan.name }}</h1><p>{{ plan.startDate }} 至 {{ plan.endDate }}</p>
      <p><span v-if="updatedAt != null">更新于 {{ new Date(updatedAt).toLocaleString() }} · </span>有效期至 {{ new Date(expiresAt).toLocaleString() }} · 出行信息请自行核实</p>
      <section v-for="(day,index) in plan.days" :key="day.date"><h2>第{{ index+1 }}天 · {{ day.date }}</h2><p v-if="!day.activities.length">当天暂未安排活动</p><ul><li v-for="(activity,i) in day.activities" :key="i">{{ activity.time }} {{ activity.title }}</li></ul></section>
      <button :disabled="loading" @click="load">{{ loading ? '正在刷新…' : '刷新分享' }}</button> <button @click="copy">复制计划</button><p role="status">{{ notice }}</p><textarea v-if="manualCopy" :value="text" readonly aria-label="手动复制计划"></textarea>
    </article>
    <router-link to="/">返回首页</router-link>
  </section>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { apiClient } from '../services/apiClient.js'
const route=useRoute(),plan=ref(null),loading=ref(false),error=ref(''),expiresAt=ref(0),updatedAt=ref(null),notice=ref(''),manualCopy=ref(false)
const retryable = ref(false)
let controller
async function load() {
  controller?.abort()
  const current = new AbortController()
  controller = current
  error.value = ''
  retryable.value = false
  notice.value = ''
  manualCopy.value = false
  const id = route.params.id
  if (typeof id !== 'string' || !/^[a-f0-9]{36}$/.test(id)) {
    loading.value = false
    error.value = '分享地址无效，请向分享者索取新链接。'
    return
  }
  loading.value = true
  try {
    const result = await apiClient.request(`/travel-shares/${id}`, { signal: current.signal })
    if (current.signal.aborted) return
    plan.value = result.plan
    expiresAt.value = result.expiresAt
    updatedAt.value = result.updatedAt ?? null
  } catch (e) {
    if (current.signal.aborted) return
    retryable.value = !e.status || e.status < 400 || e.status >= 500 || [408, 429].includes(e.status)
    if (!retryable.value || Date.now() >= expiresAt.value) plan.value = null
    error.value = retryable.value ? e.message : '分享不可用，请向分享者索取新链接。'
    if (e.status === 404) error.value = '分享不存在、已过期或已被撤销，请向分享者索取新链接。'
  } finally {
    if (!current.signal.aborted) loading.value = false
  }
}
watch(() => route.params.id, () => {
  plan.value = null
  load()
}, { immediate: true })
onBeforeUnmount(()=>controller?.abort())
const text=computed(()=>plan.value?[plan.value.name,`${plan.value.startDate} 至 ${plan.value.endDate}`,...plan.value.days.map(day=>day.date+'\n'+day.activities.map(a=>a.time+' '+a.title).join('\n'))].join('\n\n'):'')
async function copy(){try{await navigator.clipboard.writeText(text.value);notice.value='已复制计划'}catch{manualCopy.value=true;notice.value='无法自动复制，请从下方文本框手动复制'}}
</script>
<style scoped>.public-share{max-width:760px;margin:24px auto;padding:24px;line-height:1.8;overflow-wrap:anywhere}textarea{width:100%;min-height:200px}button{padding:10px 16px}section{margin:20px 0}
.public-share article { text-align:left; }
.public-share article > section { border-left:2px solid #86aa99; padding:4px 0 8px 16px; margin:16px 0; }
.public-share article > section h2 { font-size:18px; }
.public-share article > section ul { padding-left:18px; line-height:1.8; }
</style>
