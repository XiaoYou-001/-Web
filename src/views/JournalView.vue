<template>
  <div class="journal-page">
    <header class="journal-hero">
      <div>
        <h1>旅行手账与足迹</h1>
        <p>记录旅途里的细节，按账号保存在本机；只有你勾选的内容才会导出或分享。</p>
      </div>
      <dl class="stats">
        <div><dt>手账</dt><dd>{{ stats.total }}</dd></div>
        <div><dt>关联旅行</dt><dd>{{ stats.routes }}</dd></div>
        <div><dt>足迹地点</dt><dd>{{ footprints.length }}</dd></div>
        <div><dt>含照片</dt><dd>{{ stats.withPhotos }}</dd></div>
      </dl>
    </header>

    <p v-if="corrupted" class="alert" role="alert">手账数据无法读取（本机存储内容损坏）。为避免覆盖原内容，已停止写入：请先备份浏览器数据，再清除本站的手账存储后重试。</p>

    <section class="toolbar" aria-label="手账操作">
      <label>按旅行筛选
        <select v-model="filterRoute">
          <option value="all">全部旅行</option>
          <option v-for="route in routes" :key="route.id" :value="route.id">{{ route.title }}</option>
        </select>
      </label>
      <button type="button" class="btn primary" @click="startCreate">写一篇手账</button>
      <button type="button" class="btn" :disabled="!selectedIds.length" @click="exportSelected">导出所选（{{ selectedIds.length }}）</button>
      <span class="hint">导出只包含手动勾选的手账；文字导出不含照片文件。</span>
    </section>

    <p v-if="draftNotice" class="draft-bar" role="status">
      有未保存的手账草稿<template v-if="draftSavedAt">（{{ draftSavedAt }}）</template>，关闭页面或弹窗后仍可恢复。
      <button type="button" class="link" @click="resumeDraft">继续编辑</button>
      <button type="button" class="link danger-text" @click="discardDraft">丢弃草稿</button>
    </p>

    <p v-if="!entries.length" class="empty">
      {{ filterRoute === 'all' ? '还没有手账。写下第一篇，记录这次旅行的细节。' : '这次旅行还没有手账。' }}
    </p>

    <section v-for="group in groups" :key="group.key" class="month">
      <h2>{{ group.label }}</h2>
      <ul class="entries">
        <li v-for="entry in group.entries" :key="entry.id" class="entry">
          <label class="select">
            <input v-model="selectedIds" type="checkbox" :value="entry.id" :aria-label="`选择手账 ${entry.title}`" />
          </label>
          <article>
            <header>
              <h3>{{ entry.title }}</h3>
              <span class="meta">{{ entry.date }}<template v-if="entry.mood"> · 心情：{{ entry.mood }}</template></span>
            </header>
            <p class="trip">
              <template v-if="entry.routeTitle">
                <router-link v-if="routeExists(entry.routeId)" :to="`/routes/${entry.routeId}`">{{ entry.routeTitle }}</router-link>
                <span v-else>{{ entry.routeTitle }}</span>
                <span v-if="entry.routeId && !routeExists(entry.routeId)" class="deleted">行程已删除，手账保留</span>
              </template>
              <span v-else class="muted">未关联旅行</span>
              <span v-if="entry.placeName"> · {{ entry.placeName }}</span>
            </p>
            <p class="content">{{ entry.content }}</p>
            <p v-if="entry.tags.length" class="tags">
              <span v-for="tag in entry.tags" :key="tag">#{{ tag }}</span>
            </p>
            <div v-if="photos[entry.id]?.length" class="photos">
              <figure v-for="photo in photos[entry.id]" :key="photo.id">
                <img :src="photo.url" :alt="photo.name" loading="lazy" />
                <figcaption>
                  <button type="button" class="link" @click="downloadPhoto(photo)">下载照片</button>
                </figcaption>
              </figure>
            </div>
            <div class="actions">
              <button type="button" class="link" @click="startEdit(entry)">编辑</button>
              <button type="button" class="link danger-text" @click="removeEntry(entry)">删除</button>
              <label v-if="photoSupported" class="link upload">
                添加照片
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple @change="event => uploadPhotos(entry, event)" />
              </label>
            </div>
            <p v-if="entry.photoIds.length && !photos[entry.id]?.length" class="muted">照片读取中或当前浏览器不支持照片存储。</p>
          </article>
        </li>
      </ul>
    </section>

    <section class="footprints">
      <h2>足迹地图</h2>
      <p class="hint">仅统计已确认经纬度的地点（地图选点或手账坐标），不会用城市名猜测位置。</p>
      <p v-if="!footprints.length" class="empty">还没有可确认的足迹。在手账中填写经纬度，或在地图规划里确认行程地点。</p>
      <template v-else>
        <div ref="mapContainer" class="map-canvas" aria-label="足迹地图"></div>
        <p v-if="mapLoading" class="muted">地图加载中…</p>
        <p v-if="mapError" class="alert" role="alert">{{ mapError }} <button type="button" class="link" @click="retryMap">重试</button></p>
        <ul>
          <li v-for="place in footprints" :key="place.key">
            <div>
              <strong>{{ place.name }}</strong>
              <span class="muted">{{ place.visits.length }} 次记录 · 最近 {{ place.lastDate || '日期未知' }}</span>
            </div>
            <a :href="mapLink(place)" target="_blank" rel="noopener noreferrer">在高德地图查看</a>
          </li>
        </ul>
      </template>
    </section>

    <div v-if="editing" class="modal-overlay" v-modal-focus role="dialog" aria-modal="true" aria-label="编辑手账" @keydown.esc.stop.prevent="closeEditor" @click="closeEditor">
      <form class="modal" @submit.prevent="saveEntry" @click.stop>
        <header>
          <h2>{{ form.id ? '编辑手账' : '写一篇手账' }}</h2>
          <button type="button" class="close" aria-label="关闭" @click="closeEditor">×</button>
        </header>
        <div class="row">
          <label>日期 <input v-model="form.date" type="date" required /></label>
          <label>关联旅行
            <select v-model="form.routeId" @change="syncRouteTitle">
              <option value="">不关联旅行</option>
              <option v-for="route in routes" :key="route.id" :value="route.id">{{ route.title }}</option>
              <option v-if="form.routeId && !routeExists(form.routeId)" :value="form.routeId">{{ form.routeTitle || '已删除的旅行' }}（已删除）</option>
            </select>
          </label>
          <label>心情
            <select v-model="form.mood">
              <option value="">不记录</option>
              <option v-for="mood in moods" :key="mood" :value="mood">{{ mood }}</option>
            </select>
          </label>
        </div>
        <label>标题 <input v-model="form.title" maxlength="80" required placeholder="例如：西湖边的清晨" /></label>
        <div class="row">
          <label>地点名称 <input v-model="form.placeName" maxlength="80" placeholder="可选，例如：苏堤" /></label>
          <label>纬度 <input v-model="form.lat" inputmode="decimal" placeholder="可选，例如 30.2501" /></label>
          <label>经度 <input v-model="form.lng" inputmode="decimal" placeholder="可选，例如 120.1501" /></label>
        </div>
        <p class="hint">经纬度都填写时才会生成足迹；可在地图应用中长按地点查看坐标。</p>
        <label>标签 <input v-model="form.tags" maxlength="200" placeholder="用逗号或空格分隔，最多 10 个" /></label>
        <label>内容 <textarea v-model="form.content" maxlength="5000" rows="7" required placeholder="记录看到、听到、吃到的一切…"></textarea></label>
        <p v-if="!form.id" class="hint">保存后可继续添加照片。</p>
        <footer>
          <span v-if="formError" class="error" role="alert">{{ formError }}</span>
          <button type="submit" class="btn primary">保存手账</button>
          <button type="button" class="btn ghost" @click="closeEditor">取消</button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useTravelStore } from '../stores/travel.js'
import { useFeedback } from '../composables/useFeedback.js'
import { localDateString } from '../utils/date.js'
import {
  JOURNAL_MOODS, readJournal, saveJournalEntry, deleteJournalEntry, sortJournalEntries, groupEntriesByMonth,
  journalStats, collectFootprints, buildJournalExport, parseTags,
  readJournalDraft, saveJournalDraft, clearJournalDraft
} from '../services/journalService.js'
import { isPhotoStorageAvailable, listPhotos, savePhoto, deletePhotosForEntry, getPhoto } from '../services/photoStore.js'
import { useAttractionMap } from '../composables/useAttractionMap.js'

const auth = useAuthStore()
const travel = useTravelStore()
const feedback = useFeedback()
const moods = JOURNAL_MOODS
const filterRoute = ref('all')
const selectedIds = ref([])
const revision = ref(0)
const editing = ref(false)
const formError = ref('')
const form = reactive(createForm())
const photos = reactive({})
const photoSupported = ref(false)
const photoUrls = []
const draftNotice = ref(false)
const draftSavedAt = ref('')
let draftTimer

const ownerId = computed(() => auth.user?.id || '')
const routes = computed(() => travel.routes || [])
const journal = computed(() => { void revision.value; return readJournal(ownerId.value) })
const corrupted = computed(() => journal.value.corrupted)
const entries = computed(() => {
  const list = journal.value.entries
  return sortJournalEntries(filterRoute.value === 'all' ? list : list.filter(entry => entry.routeId === filterRoute.value))
})
const groups = computed(() => groupEntriesByMonth(entries.value))
const stats = computed(() => journalStats(journal.value.entries))
const footprints = computed(() => collectFootprints(routes.value, journal.value.entries))
// 足迹用真实地图展示（高德 SDK）；地图不可用时列表仍可查看并跳转高德链接。
const { mapContainer, mapLoading, mapError, retryMap } = useAttractionMap({
  viewMode: computed(() => 'map'),
  items: computed(() => footprints.value.map(place => ({ id: place.key, name: place.name, coordinates: [place.lng, place.lat] }))),
  onSelect: () => {}
})

watch(ownerId, () => {
  selectedIds.value = []
  clearPhotoUrls()
  for (const key of Object.keys(photos)) delete photos[key]
  editing.value = false
  resetForm()
  refreshDraftNotice()
  revision.value += 1
})
watch(entries, list => {
  selectedIds.value = selectedIds.value.filter(id => list.some(entry => entry.id === id))
})
// 输入停顿 400ms 后写入草稿；弹窗关闭或页面刷新后仍能找回未提交的文字。
watch(form, () => {
  if (!editing.value || !ownerId.value) return
  clearTimeout(draftTimer)
  draftTimer = setTimeout(persistDraft, 400)
}, { deep: true })

function createForm() {
  return {
    id: '', date: localDateString(), routeId: '', routeTitle: '', title: '', content: '',
    mood: '', placeName: '', lat: '', lng: '', tags: ''
  }
}
function resetForm() {
  Object.assign(form, createForm())
  formError.value = ''
}
function syncRouteTitle() {
  const route = routes.value.find(item => item.id === form.routeId)
  form.routeTitle = route ? route.title : (form.routeId ? form.routeTitle : '')
}
function refreshDraftNotice() {
  const draft = readJournalDraft(ownerId.value)
  draftNotice.value = Boolean(draft)
  draftSavedAt.value = draft?.savedAt ? new Date(draft.savedAt).toLocaleString() : ''
}
function persistDraft() {
  clearTimeout(draftTimer)
  draftTimer = undefined
  if (!ownerId.value) return
  try {
    if (!form.title.trim() && !form.content.trim()) {
      clearJournalDraft(ownerId.value)
      return
    }
    saveJournalDraft(ownerId.value, form)
  } catch (error) {
    formError.value = error.message
  }
}
function resumeDraft() {
  const draft = readJournalDraft(ownerId.value)
  if (!draft) {
    draftNotice.value = false
    feedback.info('草稿已不存在')
    return
  }
  Object.assign(form, {
    id: draft.id, date: draft.date || localDateString(), routeId: draft.routeId, routeTitle: draft.routeTitle,
    title: draft.title, content: draft.content, mood: draft.mood, placeName: draft.placeName,
    lat: draft.lat, lng: draft.lng, tags: draft.tags
  })
  formError.value = ''
  editing.value = true
  draftNotice.value = false
}
function discardDraft() {
  clearJournalDraft(ownerId.value)
  draftNotice.value = false
  draftSavedAt.value = ''
  if (editing.value) closeEditor(true)
}
function dropDraft() {
  clearTimeout(draftTimer)
  draftTimer = undefined
  clearJournalDraft(ownerId.value)
  draftNotice.value = false
  draftSavedAt.value = ''
}
function routeExists(routeId) {
  return Boolean(routeId) && routes.value.some(route => route.id === routeId)
}
function startCreate() {
  resetForm()
  editing.value = true
}
function startEdit(entry) {
  Object.assign(form, {
    id: entry.id, date: entry.date, routeId: entry.routeId, routeTitle: entry.routeTitle,
    title: entry.title, content: entry.content, mood: entry.mood, placeName: entry.placeName,
    lat: entry.lat ?? '', lng: entry.lng ?? '', tags: entry.tags.join('、')
  })
  formError.value = ''
  editing.value = true
}
function closeEditor(force) {
  // 主动关闭（取消/×/Esc）时保留草稿；只有“丢弃草稿”会传明确的 true 跳过写入。
  if (editing.value && force !== true) persistDraft()
  editing.value = false
  resetForm()
  refreshDraftNotice()
}
function saveEntry() {
  formError.value = ''
  try {
    const saved = saveJournalEntry(ownerId.value, {
      id: form.id || undefined,
      date: form.date,
      routeId: form.routeId,
      routeTitle: form.routeTitle,
      title: form.title,
      content: form.content,
      mood: form.mood,
      placeName: form.placeName,
      lat: form.lat === '' ? null : form.lat,
      lng: form.lng === '' ? null : form.lng,
      tags: parseTags(form.tags),
      photoIds: form.id ? journal.value.entries.find(item => item.id === form.id)?.photoIds : []
    })
    editing.value = false
    dropDraft()
    revision.value += 1
    feedback.success(form.id ? '手账已更新' : '手账已保存')
    if (saved.photoIds.length) loadPhotos()
    resetForm()
  } catch (error) {
    formError.value = error.message
    feedback.error(error.message)
  }
}
async function removeEntry(entry) {
  if (!await feedback.confirm(`删除手账「${entry.title}」及其照片？此操作不可撤销。`, { title: '删除手账', confirmLabel: '删除', danger: true })) return
  try {
    deleteJournalEntry(ownerId.value, entry.id)
    revision.value += 1
    selectedIds.value = selectedIds.value.filter(id => id !== entry.id)
    feedback.success('手账已删除')
    if (photoSupported.value) {
      try { await deletePhotosForEntry(ownerId.value, entry.id) } catch { feedback.warning('手账已删除，但照片清理失败，请稍后在浏览器设置中清理站点数据') }
    }
    revokeEntryUrls(entry.id)
    delete photos[entry.id]
  } catch (error) { feedback.error(error.message) }
}

function exportSelected() {
  try {
    const text = buildJournalExport(journal.value.entries, selectedIds.value)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `旅行手账-${localDateString()}.txt`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    feedback.success(`已导出 ${selectedIds.value.length} 篇手账`)
  } catch (error) { feedback.error(error.message) }
}

function mapLink(place) {
  return `https://uri.amap.com/marker?position=${place.lng},${place.lat}&name=${encodeURIComponent(place.name)}&src=travel-journal`
}

function clearPhotoUrls() {
  while (photoUrls.length) {
    try { URL.revokeObjectURL(photoUrls.pop()) } catch { /* 忽略环境不支持 */ }
  }
}
// 重新读取某篇手账的照片前，先释放上一批 object URL，避免反复上传/刷新时内存持续增长。
function revokeEntryUrls(entryId) {
  const rows = photos[entryId]
  if (!rows) return
  for (const row of rows) {
    if (!row.url) continue
    try { URL.revokeObjectURL(row.url) } catch { /* 忽略环境不支持 */ }
    const index = photoUrls.indexOf(row.url)
    if (index !== -1) photoUrls.splice(index, 1)
  }
}
async function loadPhotos() {
  if (!photoSupported.value) return
  for (const entry of journal.value.entries) {
    if (!entry.photoIds.length) continue
    try {
      const rows = await listPhotos(ownerId.value, entry.id)
      revokeEntryUrls(entry.id)
      for (const row of rows) {
        const url = URL.createObjectURL(row.blob)
        photoUrls.push(url)
        row.url = url
      }
      photos[entry.id] = rows
    } catch (error) {
      feedback.warning(`照片读取失败：${error.message}`)
    }
  }
}
async function uploadPhotos(entry, event) {
  const input = event.target
  const files = [...(input.files || [])]
  input.value = ''
  if (!files.length) return
  try {
    const added = []
    for (const file of files) {
      const photo = await savePhoto({ ownerId: ownerId.value, entryId: entry.id, file })
      added.push(photo)
    }
    const latest = journal.value.entries.find(item => item.id === entry.id)
    if (!latest) throw new Error('这篇手账已不存在，请刷新后重试')
    saveJournalEntry(ownerId.value, { ...latest, photoIds: [...latest.photoIds, ...added.map(photo => photo.id)] })
    revision.value += 1
    feedback.success(`已添加 ${added.length} 张照片`)
    loadPhotos()
  } catch (error) { feedback.error(error.message) }
}
async function downloadPhoto(photo) {
  try {
    const row = await getPhoto(photo.id)
    if (!row) throw new Error('照片已不存在')
    const url = URL.createObjectURL(row.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = row.name || '手账照片.jpg'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) { feedback.error(error.message) }
}

onMounted(() => {
  photoSupported.value = isPhotoStorageAvailable()
  refreshDraftNotice()
  loadPhotos()
})
onBeforeUnmount(() => {
  // 离开页面时把正在写的内容落成草稿，避免导航/刷新丢掉未提交的文字。
  if (editing.value) persistDraft()
  clearTimeout(draftTimer)
  draftTimer = undefined
  clearPhotoUrls()
})
</script>

<style scoped>
.journal-page { max-width: 1100px; margin: 0 auto; padding: 24px 16px 60px; color: #243449; }
.journal-hero { display: flex; flex-wrap: wrap; gap: 18px; justify-content: space-between; align-items: flex-start; padding: 22px; border-radius: 16px; background: linear-gradient(135deg, #eef3ff, #f7f1ff); }
.journal-hero h1 { margin: 0 0 6px; font-size: 26px; }
.journal-hero p { margin: 0; color: #4b647d; max-width: 560px; }
.stats { display: grid; grid-template-columns: repeat(4, minmax(72px, 1fr)); gap: 10px; margin: 0; }
.stats div { background: #fff; border-radius: 10px; padding: 8px 12px; text-align: center; }
.stats dt { font-size: 12px; color: #71808f; }
.stats dd { margin: 2px 0 0; font-size: 22px; font-weight: 700; }
.alert { background: #fff4f4; border: 1px solid #f2b8b5; color: #a32020; padding: 10px 12px; border-radius: 10px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin: 16px 0; }
.toolbar label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
select, input, textarea, button { font: inherit; }
select, input, textarea { padding: 8px 10px; border: 1px solid #c7d3e0; border-radius: 8px; background: #fff; max-width: 100%; }
.btn { padding: 9px 14px; border-radius: 8px; border: 1px solid #c7d3e0; background: #eef3fb; cursor: pointer; }
.btn.primary { background: #243449; border-color: #243449; color: #fff; }
.btn:disabled { opacity: .55; cursor: not-allowed; }
.btn.ghost { background: transparent; }
.hint { font-size: 12px; color: #71808f; }
.empty { color: #71808f; background: #f7fafc; border: 1px dashed #d7e1eb; border-radius: 12px; padding: 18px; }
.map-canvas { height: 320px; border-radius: 12px; border: 1px solid #d7e1eb; background: #eef3f8; margin: 8px 0; }
.draft-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; background: #fffbe8; border: 1px solid #f0e0a8; color: #6b551f; padding: 10px 12px; border-radius: 10px; margin: 0 0 12px; font-size: 13px; }
.month { margin-top: 22px; }
.month h2 { font-size: 18px; border-left: 4px solid #667eea; padding-left: 10px; }
.entries { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.entry { display: flex; gap: 10px; background: #fff; border: 1px solid #e2eaf3; border-radius: 12px; padding: 14px; }
.select { padding-top: 4px; }
.entry article { flex: 1; min-width: 0; }
.entry header { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.entry h3 { margin: 0; font-size: 17px; }
.meta, .trip { font-size: 13px; color: #71808f; margin: 4px 0; }
.trip a { color: #3a5bd9; }
.deleted { color: #b26a00; margin-left: 6px; }
.content { white-space: pre-wrap; line-height: 1.7; margin: 8px 0; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.tags span { font-size: 12px; background: #eef3fb; color: #3d5771; border-radius: 999px; padding: 2px 8px; }
.photos { display: flex; flex-wrap: wrap; gap: 10px; margin: 8px 0; }
.photos figure { margin: 0; width: 150px; }
.photos img { width: 150px; height: 110px; object-fit: cover; border-radius: 8px; }
.photos figcaption { text-align: center; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; font-size: 13px; }
.link { background: none; border: none; color: #3a5bd9; cursor: pointer; padding: 0; }
.danger-text { color: #c92a2a; }
.upload input { display: none; }
.footprints { margin-top: 34px; background: #fff; border: 1px solid #e2eaf3; border-radius: 14px; padding: 18px; }
.footprints h2 { margin-top: 0; }
.footprints ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.footprints li { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; border-top: 1px solid #eef2f7; padding-top: 8px; }
.footprints .muted { margin-left: 8px; font-size: 12px; }
.footprints a { color: #3a5bd9; font-size: 13px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(20, 30, 45, .45); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 900; }
.modal { background: #fff; border-radius: 14px; width: min(760px, 100%); max-height: 90vh; overflow: auto; padding: 18px; display: grid; gap: 12px; }
.modal header { display: flex; justify-content: space-between; align-items: center; }
.modal h2 { margin: 0; font-size: 20px; }
.close { background: none; border: none; font-size: 26px; line-height: 1; cursor: pointer; }
.modal label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.row { display: flex; flex-wrap: wrap; gap: 10px; }
.row label { flex: 1; min-width: 150px; }
.modal footer { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; align-items: center; }
.error { color: #c92a2a; margin-right: auto; }
@media (max-width: 640px) {
  .journal-hero { padding: 16px; }
  .stats { grid-template-columns: repeat(2, 1fr); width: 100%; }
  .entry { padding: 10px; }
  .photos figure, .photos img { width: 120px; }
  .photos img { height: 90px; }
}
</style>
