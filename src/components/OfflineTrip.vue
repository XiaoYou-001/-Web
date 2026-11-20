<template>
  <section class="offline-trip" aria-label="离线行程">
    <button type="button" :disabled="busy" @click="prepare">{{ busy ? '正在准备离线行程…' : '保存到此设备' }}</button>
    <a v-if="readyAt" :href="readerLink">打开离线行程</a>
    <p v-if="readyAt">行程最后保存 {{ format(savedTrip?.savedAt) }} · 离线资源准备 {{ format(readyAt) }}</p>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useTravelStore } from '../stores/travel.js'
import { prepareReader, preparedAt, markPrepared } from '../services/offlineTravel.js'

const props = defineProps({routeId: {type:[String, Number],required:true}, savePlan: {type:Function,required:true}})
const travel = useTravelStore()
const base = import.meta.env?.BASE_URL || '/'
const busy = ref(false), message = ref(''), readyAt = ref(null)
let disposed = false
onBeforeUnmount(() => { disposed = true })
const savedTrip = computed(() => travel.routes.find(trip => String(trip.id) === String(props.routeId)))
const readerLink = computed(() => base + 'offline.html?trip=' + encodeURIComponent(props.routeId))
const format = stamp => stamp ? new Date(stamp).toLocaleString('zh-CN') : '旧记录未记录'
watch(() => [travel.ownerId, props.routeId], ([owner, id]) => {
  message.value = ''
  try { readyAt.value = preparedAt(owner,id) } catch { readyAt.value = null }
}, {immediate:true})

async function prepare() {
  if (busy.value) return
  const owner = travel.ownerId, id = props.routeId
  busy.value = true
  message.value = ''
  try {
    await prepareReader(base)
    if (disposed || travel.ownerId !== owner || props.routeId !== id) return
    if (!await props.savePlan()) { message.value = '请解决保存问题后再准备离线行程。'; return }
    if (disposed || travel.ownerId !== owner || props.routeId !== id) return
    readyAt.value = markPrepared(owner,id)
    message.value = '已保存到此设备，断网后可重新打开这段行程。'
  } catch (error) { message.value = error.message || '离线行程未准备完成，请联网重试。' }
  finally { busy.value = false }
}
</script>
<style scoped>
.offline-trip { margin:12px 0; }
.offline-trip button { min-height: 44px; padding-inline: 12px; }
.offline-trip a { margin-inline-start:12px; }
.offline-trip p { margin:4px 0; }
</style>
