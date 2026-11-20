<template>
  <section class="restore-trip" aria-label="旅行备份恢复">
    <input ref="picker" type="file" accept=".json,application/json" hidden @change="choose">
    <button type="button" @click="picker.click()">从备份恢复</button>
    <p v-if="reading" role="status">正在读取备份…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="preview" class="backup-preview">
      <h3>{{ preview.title }}</h3>
      <p>{{ preview.startDate }} 至 {{ preview.endDate }}</p>
      <p>{{ activityCount }} 项活动 · {{ preview.pendingActivities?.length || 0 }} 项待安排 · {{ preview.preparation?.items.length || 0 }} 项准备 · {{ preview.ledger?.expenses.length || 0 }} 笔账本支出</p>
      <button type="button" @click="restore">恢复为新旅行</button>
      <button type="button" @click="reset">取消</button>
    </div>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useTravelStore } from '../stores/travel.js'
import { maxBackupBytes, readTripBackup } from '../services/tripBackup.js'

const emit = defineEmits(['restored'])
const travel = useTravelStore()
const picker = ref(null), preview = ref(null), reading = ref(false), error = ref('')
const activityCount = computed(() => preview.value.days.reduce((count, day) => count + day.activities.length, 0))
let generation = 0, owner = ''

function reset() {
  generation++
  reading.value = false
  preview.value = null
  error.value = ''
}

watch(() => travel.ownerId, reset, { flush: 'sync' })
onBeforeUnmount(reset)

async function choose(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  reset()
  if (!file) return
  const current = generation
  owner = travel.ownerId
  reading.value = true
  try {
    if (!owner) throw new Error('请先登录后恢复旅行')
    if (file.size > maxBackupBytes) throw new Error('旅行备份文件超过 16 MB')
    const raw = await file.text()
    if (current === generation) preview.value = readTripBackup(raw)
  } catch (failure) {
    if (current === generation) error.value = failure.message
  } finally {
    if (current === generation) reading.value = false
  }
}

function restore() {
  if (!preview.value || owner !== travel.ownerId) return
  try {
    const saved = travel.saveRoute(preview.value, owner)
    reset()
    emit('restored', saved.id)
  } catch (failure) { error.value = failure.message }
}
</script>
<style scoped>
.restore-trip { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.restore-trip button { padding: 8px 14px; border: 1px solid #bad0c7; border-radius: 8px; background: white; color: #284f41; cursor: pointer; }
.restore-trip p { margin: 6px 0; }
.restore-trip [role=alert] { color: #9e312c; }
.backup-preview { margin: 10px 0; padding: 12px; border: 1px solid #bad0c7; border-radius: 8px; }
.backup-preview h3 { margin: 0; }
.backup-preview button + button { margin-left: 8px; }
</style>
