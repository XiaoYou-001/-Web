<template>
  <details class="travel-journal" :open="open">
    <summary>
      旅行手账
      <span class="summary-meta" v-if="entries.length">已写 {{ entries.length }} 篇 · 最近 {{ entries[0].date }}</span>
      <span class="summary-meta" v-else>还没有记录</span>
    </summary>

    <p class="hint">手账按账号单独保存在本机，删除旅行不会删除已写内容；照片保存在浏览器 IndexedDB。</p>

    <div class="links">
      <router-link to="/journal">打开全部手账与足迹</router-link>
      <span class="muted">写下的内容不会自动分享给同行人。</span>
    </div>

    <ol v-if="entries.length" class="entries">
      <li v-for="entry in entries.slice(0, 3)" :key="entry.id">
        <strong>{{ entry.date }} · {{ entry.title }}</strong>
        <p>{{ excerpt(entry.content) }}</p>
      </li>
    </ol>

    <form class="quick-form" @submit.prevent="quickSave">
      <div class="row">
        <label>日期 <input v-model="form.date" type="date" required /></label>
        <label class="grow">标题 <input v-model="form.title" maxlength="80" placeholder="今天的标题" required /></label>
      </div>
      <label>内容 <textarea v-model="form.content" maxlength="2000" rows="3" placeholder="记录此刻的见闻与感受…" required></textarea></label>
      <div class="row">
        <button type="submit" class="btn primary">保存手账</button>
        <span v-if="error" class="error" role="alert">{{ error }}</span>
      </div>
    </form>
  </details>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useFeedback } from '../composables/useFeedback.js'
import { localDateString } from '../utils/date.js'
import { readJournal, saveJournalEntry, readJournalDraft, saveJournalDraft, clearJournalDraft } from '../services/journalService.js'

const props = defineProps({ route: { type: Object, required: true }, open: { type: Boolean, default: false } })
const auth = useAuthStore()
const feedback = useFeedback()
const revision = ref(0)
const error = ref('')
const form = reactive({ date: localDateString(), title: '', content: '' })
const draftScope = `route:${props.route.id}`
let draftTimer

const ownerId = computed(() => auth.user?.id || '')
const entries = computed(() => {
  void revision.value
  return readJournal(ownerId.value).entries
    .filter(entry => entry.routeId === props.route.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))
})

watch(() => props.route.id, () => { revision.value += 1; error.value = '' })
watch(form, () => {
  if (!ownerId.value) return
  clearTimeout(draftTimer)
  draftTimer = setTimeout(persistDraft, 400)
}, { deep: true })
// 工作台的快速记录也保留草稿：切到别的页面再回来，标题和正文不会白写。
function persistDraft() {
  clearTimeout(draftTimer)
  draftTimer = undefined
  if (!ownerId.value) return
  try {
    if (!form.title.trim() && !form.content.trim()) {
      clearJournalDraft(ownerId.value, draftScope)
      return
    }
    saveJournalDraft(ownerId.value, { ...form, routeId: props.route.id, routeTitle: props.route.title }, draftScope)
  } catch (caught) {
    error.value = caught.message
  }
}
function restoreDraft() {
  const draft = readJournalDraft(ownerId.value, draftScope)
  if (!draft) return
  Object.assign(form, { date: draft.date || localDateString(), title: draft.title, content: draft.content })
  feedback.info('已恢复上次未保存的手账草稿')
}
onMounted(() => { revision.value += 1; restoreDraft() })
onBeforeUnmount(() => { if (form.title.trim() || form.content.trim()) persistDraft() })

function excerpt(text) {
  return text.length > 90 ? `${text.slice(0, 90)}…` : text
}
function quickSave() {
  error.value = ''
  try {
    saveJournalEntry(ownerId.value, {
      date: form.date,
      routeId: props.route.id,
      routeTitle: props.route.title,
      title: form.title,
      content: form.content
    })
    form.title = ''
    form.content = ''
    clearTimeout(draftTimer)
    draftTimer = undefined
    clearJournalDraft(ownerId.value, draftScope)
    revision.value += 1
    feedback.success('已保存到手账')
  } catch (caught) {
    error.value = caught.message
    feedback.error(caught.message)
  }
}
</script>

<style scoped>
.travel-journal { border: 1px solid #d7e1eb; background: #fff; border-radius: 12px; padding: 14px; margin: 12px 0; color: #243449; }
summary { cursor: pointer; font-weight: 700; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 4px 0; }
.summary-meta { font-weight: 500; font-size: 13px; color: #4b647d; }
.hint { font-size: 12px; color: #546374; }
.links { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; margin: 6px 0 10px; }
.links a { color: #3a5bd9; font-size: 14px; }
.entries { margin: 8px 0; padding-left: 20px; display: grid; gap: 8px; }
.entries p { margin: 2px 0 0; font-size: 13px; color: #4b647d; white-space: pre-wrap; }
.quick-form { display: grid; gap: 8px; border-top: 1px dashed #dde6ef; padding-top: 10px; }
.row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.grow { flex: 1; min-width: 160px; }
input, textarea, button { font: inherit; padding: 7px 9px; border: 1px solid #c7d3e0; border-radius: 8px; background: #fff; max-width: 100%; }
button { cursor: pointer; }
.btn { background: #eef3fb; }
.btn.primary { background: #243449; border-color: #243449; color: #fff; }
.muted { color: #546374; font-size: 12px; }
.error { color: #c92a2a; font-size: 13px; }
</style>
