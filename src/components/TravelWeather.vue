<template>
  <section class="travel-weather">
    <header class="tw-head">
      <h4>
        <font-awesome-icon :icon="['fas', 'tower-broadcast']" />
        天气与备选方案
        <span v-if="dayDate" class="tw-date">第 {{ dayIndex + 1 }} 天 · {{ dayDate }}</span>
      </h4>
      <div class="tw-head-actions">
        <span v-if="rainSuggested" class="tw-rain-badge"><font-awesome-icon :icon="['fas', 'triangle-exclamation']" /> 预报有雨</span>
        <button type="button" class="tw-refresh" :disabled="loading" @click="reload(true)">
          <font-awesome-icon :icon="['fas', 'arrows-rotate']" />
          {{ loading ? '刷新中…' : '刷新天气' }}
        </button>
      </div>
    </header>

    <div v-if="loading && !dayInfo" class="tw-state">
      <font-awesome-icon :icon="['fas', 'spinner']" /> 正在获取天气…
    </div>

    <template v-else-if="dayInfo">
      <div v-if="dayInfo.status === 'ok'" class="tw-card" :class="{ rain: rainSuggested }">
        <div class="tw-main">
          <span class="tw-desc">{{ dayInfo.weather.description }}</span>
          <span v-if="temperatureLabel" class="tw-temp">{{ temperatureLabel }}</span>
          <span v-if="precipitationLabel" class="tw-precip">{{ precipitationLabel }}</span>
        </div>
        <p class="tw-meta">
          <span>{{ dayInfo.location.name || '已确认地点' }}</span>
          <span>来源 {{ dayInfo.source }}</span>
          <span v-if="updatedLabel">更新于 {{ updatedLabel }}</span>
          <span v-if="dayInfo.timezone">时区 {{ dayInfo.timezone }}</span>
          <span v-if="dayInfo.cached" class="tw-cached">本地缓存</span>
        </p>
        <p v-if="dayInfo.stale" class="tw-stale">
          <font-awesome-icon :icon="['fas', 'triangle-exclamation']" />
          接口暂时不可用，显示的是过期缓存{{ dayInfo.error ? `（${dayInfo.error}）` : '' }}，请稍后刷新。
        </p>
        <p v-else-if="dayInfo.error" class="tw-stale">
          <font-awesome-icon :icon="['fas', 'triangle-exclamation']" />
          接口暂时不可用，显示的是本地缓存（{{ dayInfo.error }}），请稍后刷新。
        </p>
        <p v-if="rainSuggested" class="tw-rain-tip">
          <font-awesome-icon :icon="['fas', 'triangle-exclamation']" />
          预报有雨，可在下方查看或添加室内备选。天气只做提示，不会自动修改行程。
        </p>
        <p v-else class="tw-tip">天气只做提示；如需调整，请在下方手动选择备选并确认替换。</p>
      </div>

      <div v-else-if="dayInfo.status === 'error'" class="tw-state error">
        <p><font-awesome-icon :icon="['fas', 'triangle-exclamation']" /> 天气获取失败：{{ dayInfo.error }}</p>
        <button type="button" class="tw-inline-btn" :disabled="loading" @click="reload(true)">重试</button>
      </div>

      <div v-else-if="dayInfo.status === 'out-of-range'" class="tw-state">
        <p>该日期超出未来 {{ maxForecastDays }} 天的预报范围，暂无天气预报。仍可在下方手动添加室内/雨天备选。</p>
      </div>

      <div v-else-if="dayInfo.status === 'no-location'" class="tw-state">
        <p>当天活动还没有确认坐标，无法匹配天气。为活动选择地点后会自动匹配；仍可在下方手动添加备选。</p>
      </div>

      <div v-else class="tw-state">
        <p>该日期暂无天气预报。仍可在下方手动添加室内/雨天备选。</p>
      </div>
    </template>

    <div v-else class="tw-state">
      <p>暂无天气数据；可点击刷新重试，或直接添加手动备选。</p>
    </div>

    <details class="tw-backups" open>
      <summary>
        <font-awesome-icon :icon="['fas', 'layer-group']" />
        室内/雨天备选（{{ backupCount }}）
      </summary>
      <p class="tw-policy">
        备选只作为建议保存，替换前会展示前后差异；确认后仅修改当前草稿，保存旅行后生效。用餐活动请使用替换餐厅功能。
      </p>

      <div v-if="rows.length" class="tw-activity-list">
        <div v-for="row in rows" :key="row.key" class="tw-activity">
          <div class="tw-activity-head">
            <strong>{{ row.act.time }} {{ row.act.title || '未命名活动' }}</strong>
            <span v-if="row.act.weatherBackupApplied" class="tw-applied">
              已替换自「{{ row.act.swappedFromTitle || '原活动' }}」
            </span>
            <button v-if="hasBackupUndo(row.act)" type="button" class="tw-inline-btn" @click="undoSwap(row.act)">
              撤销替换
            </button>
          </div>

          <ul v-if="backupsOf(row.act).length" class="tw-backup-list">
            <li v-for="backup in backupsOf(row.act)" :key="backup.id">
              <span class="tw-backup-name">
                {{ backup.title }}
                <small v-if="backup.place">· {{ backup.place.name }}</small>
                <small v-if="backup.indoor">· 室内</small>
                <small v-if="backup.note">· {{ backup.note }}</small>
              </span>
              <span class="tw-backup-actions">
                <button type="button" class="tw-inline-btn" @click="startSwap(row.act, backup)">替换</button>
                <button type="button" class="tw-inline-btn danger" @click="removeBackupAction(row.act, backup)">删除</button>
              </span>
            </li>
          </ul>
          <p v-else class="tw-empty">该活动还没有备选。</p>

          <p v-if="hasBackupUndo(row.act)" class="tw-undo-hint">已替换，撤销后才能再尝试其他备选。</p>

          <details class="tw-add">
            <summary>添加备选</summary>
            <form class="tw-form" @submit.prevent="addManual(row.act)">
              <label>
                备选名称
                <input v-model="manualFor(row.act).title" maxlength="60" placeholder="例如：博物馆、商场" />
              </label>
              <label>
                备注
                <input v-model="manualFor(row.act).note" maxlength="200" placeholder="可选：地址、预约提示" />
              </label>
              <label>
                停留分钟
                <input v-model="manualFor(row.act).durationMinutes" type="number" min="0" max="1440" placeholder="沿用原活动" />
              </label>
              <label class="tw-checkbox">
                <input v-model="manualFor(row.act).indoor" type="checkbox" />
                室内备选
              </label>
              <button type="submit" class="tw-inline-btn primary">
                <font-awesome-icon :icon="['fas', 'plus']" /> 添加手动备选
              </button>
            </form>

            <div v-if="poolCandidates.length" class="tw-pool">
              <label>
                从候选池选择
                <select v-model="poolPicks[row.act.id || row.key]">
                  <option value="">请选择</option>
                  <option v-for="(candidate, index) in poolCandidates" :key="candidate.id || index" :value="index">
                    {{ candidate.title || candidate.name || `候选 ${index + 1}` }}
                  </option>
                </select>
              </label>
              <button
                type="button"
                class="tw-inline-btn"
                :disabled="poolPicks[row.act.id || row.key] === '' || poolPicks[row.act.id || row.key] === undefined"
                @click="addFromPool(row.act, row.key)"
              >
                添加候选池备选
              </button>
            </div>
            <p v-else class="tw-empty">候选池为空，可在工作台先收集备选地点。</p>
          </details>
        </div>
      </div>
      <p v-else class="tw-empty">
        当天还没有可添加备选的活动；用餐请使用替换餐厅功能。
      </p>
    </details>

    <div v-if="pendingSwap" class="tw-swap">
      <h5>确认替换</h5>
      <div class="tw-swap-grid">
        <div class="tw-swap-col">
          <span class="tw-swap-label">替换前</span>
          <strong>{{ pendingSwap.preview.current.title || '未命名活动' }}</strong>
          <small>{{ pendingSwap.preview.current.time || '时间待确认' }} · {{ durationLabel(pendingSwap.preview.current.durationMinutes) }}</small>
          <small>地点：{{ pendingSwap.preview.current.placeName || '未确认' }}</small>
        </div>
        <div class="tw-swap-col next">
          <span class="tw-swap-label">替换后</span>
          <strong>{{ pendingSwap.preview.next.title }}</strong>
          <small>{{ pendingSwap.preview.next.time || '时间待确认' }} · {{ durationLabel(pendingSwap.preview.next.durationMinutes) }}</small>
          <small>地点：{{ pendingSwap.preview.next.placeName || '未确认' }}</small>
        </div>
      </div>
      <ul class="tw-warnings">
        <li v-for="warning in pendingSwap.preview.warnings" :key="warning">{{ warning }}</li>
      </ul>
      <div class="tw-swap-actions">
        <button type="button" class="tw-inline-btn primary" @click="confirmSwap">确认替换</button>
        <button type="button" class="tw-inline-btn" @click="pendingSwap = null">取消</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { FontAwesomeIcon } from '../ui/fontAwesome.js'
import { useFeedback } from '../composables/useFeedback.js'
import { apiClient, apiErrorMessage, isRequestCancelled } from '../services/apiClient.js'
import { MAX_FORECAST_DAYS, loadRouteWeather } from '../services/weatherService.js'
import {
  addBackup,
  applyBackupSwap,
  backupFromCandidate,
  backupsOf,
  hasBackupUndo,
  planBackupSwap,
  removeBackup,
  undoBackupSwap
} from '../utils/weatherBackup.js'
import { createId } from '../utils/id.js'

const props = defineProps({
  route: { type: Object, default: null },
  day: { type: Object, default: null },
  dayIndex: { type: Number, default: 0 },
  // 测试或嵌入场景可注入客户端与缓存存储；正常使用时走默认实现。
  weatherClient: { type: Object, default: null },
  storage: { type: Object, default: null }
})

const feedback = useFeedback()
const dayInfo = ref(null)
const loading = ref(false)
const pendingSwap = ref(null)
// 表单状态按活动对象保存，避免没有 id 的活动互相串用。
const manuals = new WeakMap()
const poolPicks = reactive({})
const maxForecastDays = MAX_FORECAST_DAYS

const dayDate = computed(() => props.day?.date || '')
const activities = computed(() => Array.isArray(props.day?.activities) ? props.day.activities : [])
const editableActivities = computed(() =>
  activities.value.filter(activity => activity && activity.category !== '用餐' && !activity.meal)
)
const rows = computed(() => editableActivities.value.map((act, index) => ({
  act,
  key: act.id ? String(act.id) : `idx-${index}`
})))
const backupCount = computed(() =>
  editableActivities.value.reduce((sum, act) => sum + backupsOf(act).length, 0)
)
const poolCandidates = computed(() =>
  Array.isArray(props.route?.pendingActivities) ? props.route.pendingActivities.filter(Boolean) : []
)
const rainSuggested = computed(() =>
  dayInfo.value?.status === 'ok' && dayInfo.value.weather?.isRain === true
)
const temperatureLabel = computed(() => {
  const weather = dayInfo.value?.weather
  if (!weather) return ''
  const min = Number.isFinite(weather.tempMin) ? Math.round(weather.tempMin) : null
  const max = Number.isFinite(weather.tempMax) ? Math.round(weather.tempMax) : null
  if (min === null && max === null) return '温度待确认'
  if (min === null) return `最高 ${max}℃`
  if (max === null) return `最低 ${min}℃`
  return `${min}~${max}℃`
})
const precipitationLabel = computed(() => {
  const value = dayInfo.value?.weather?.precipitationProbability
  return Number.isFinite(value) ? `降水概率 ${Math.round(value)}%` : ''
})
const updatedLabel = computed(() => formatUpdated(dayInfo.value?.fetchedAt))

function formatUpdated(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function durationLabel(minutes) {
  if (minutes === null || minutes === undefined || minutes === '') return '停留待确认'
  const value = Number(minutes)
  return Number.isFinite(value) ? `停留 ${Math.round(value)} 分钟` : '停留待确认'
}

function manualFor(act) {
  let manual = manuals.get(act)
  if (!manual) {
    manual = reactive({ title: '', note: '', durationMinutes: '', indoor: true })
    manuals.set(act, manual)
  }
  return manual
}

function ensureActivityId(act) {
  if (!act.id) act.id = createId()
  return act.id
}

let controller = null
let mounted = false

async function reload(force = false) {
  if (!props.day || typeof props.day.date !== 'string') return
  controller?.abort()
  controller = new AbortController()
  const current = controller
  loading.value = true
  try {
    const result = await loadRouteWeather({ days: [props.day] }, {
      client: props.weatherClient || apiClient,
      storage: props.storage || undefined,
      force,
      signal: current.signal
    })
    if (current !== controller) return
    dayInfo.value = result.byDate[props.day.date] || { status: 'unavailable' }
  } catch (error) {
    if (current !== controller) return
    if (!isRequestCancelled(error)) {
      dayInfo.value = { status: 'error', error: apiErrorMessage(error) }
    }
  } finally {
    if (current === controller) loading.value = false
  }
}

function addManual(act) {
  const manual = manualFor(act)
  try {
    const backup = addBackup(act, { ...manual, source: 'manual' })
    feedback.success(`已添加${backup.indoor ? '室内' : ''}备选，保存旅行后生效`)
    manual.title = ''
    manual.note = ''
    manual.durationMinutes = ''
    manual.indoor = true
  } catch (error) {
    feedback.error(error.message || '添加备选失败')
  }
}

function addFromPool(act, rowKey) {
  const pickKey = act.id || rowKey
  const index = poolPicks[pickKey]
  const candidate = poolCandidates.value[Number(index)]
  if (!candidate) return
  try {
    addBackup(act, backupFromCandidate(candidate))
    feedback.success('已从候选池添加备选，保存旅行后生效')
    poolPicks[pickKey] = ''
  } catch (error) {
    feedback.error(error.message || '添加候选池备选失败')
  }
}

function removeBackupAction(act, backup) {
  try {
    removeBackup(act, backup.id)
    feedback.success('已删除备选，保存旅行后生效')
  } catch (error) {
    feedback.error(error.message || '删除备选失败')
  }
}

function startSwap(act, backup) {
  try {
    ensureActivityId(act)
    pendingSwap.value = { activityId: act.id, backupId: backup.id, preview: planBackupSwap(act, backup.id) }
  } catch (error) {
    pendingSwap.value = null
    feedback.error(error.message || '无法替换该备选')
  }
}

function confirmSwap() {
  const swap = pendingSwap.value
  if (!swap) return
  try {
    applyBackupSwap(props.day, swap.activityId, swap.backupId)
    pendingSwap.value = null
    feedback.success('已替换活动，交通估算已失效；保存旅行后生效')
  } catch (error) {
    feedback.error(error.message || '替换失败')
  }
}

function undoSwap(act) {
  try {
    ensureActivityId(act)
    undoBackupSwap(props.day, act.id)
    feedback.success('已撤销替换，保存旅行后生效')
  } catch (error) {
    feedback.error(error.message || '撤销失败')
  }
}

function locationKey() {
  const first = activities.value.find(activity => Array.isArray(activity?.place?.location) && activity.place.location.length >= 2)
  if (!first) return ''
  return `${first.place.location[0]},${first.place.location[1]}`
}

watch(() => props.day, () => {
  pendingSwap.value = null
  dayInfo.value = null
  if (mounted) reload()
})
watch(() => `${dayDate.value}|${locationKey()}`, () => {
  if (mounted) reload()
})

onMounted(() => {
  mounted = true
  reload()
})
onBeforeUnmount(() => {
  mounted = false
  controller?.abort()
})
</script>

<style scoped>
.travel-weather {
  margin: 12px 0 16px;
  padding: 12px 14px;
  background: #f6f9ff;
  border: 1px solid #d9e3f7;
  border-radius: 10px;
}
.tw-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}
.tw-head h4 {
  margin: 0;
  font-size: 15px;
  color: #2f3a56;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.tw-date { font-weight: 500; color: #65708c; }
.tw-head-actions { display: flex; gap: 8px; align-items: center; }
.tw-rain-badge {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fdecec;
  color: #b42318;
  font-size: 12px;
}
.tw-refresh,
.tw-inline-btn {
  padding: 5px 9px;
  border: 1px solid #c9d5ee;
  border-radius: 6px;
  background: #fff;
  color: #33405e;
  cursor: pointer;
  font-size: 12px;
}
.tw-refresh:disabled,
.tw-inline-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.tw-inline-btn.primary { background: #4059d6; border-color: #4059d6; color: #fff; }
.tw-inline-btn.danger { color: #b42318; border-color: #f0c4c0; }
.tw-state {
  margin: 8px 0;
  color: #56617c;
  font-size: 13px;
}
.tw-state p { margin: 0 0 6px; }
.tw-state.error { color: #b42318; }
.tw-card {
  margin: 8px 0;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #dde5f5;
  border-radius: 8px;
}
.tw-card.rain { border-color: #f0c4c0; background: #fff9f8; }
.tw-main {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: baseline;
}
.tw-desc { font-size: 20px; font-weight: 700; color: #24304d; }
.tw-temp { font-size: 16px; color: #33405e; }
.tw-precip { font-size: 13px; color: #4f628c; }
.tw-meta {
  margin: 6px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: #65708c;
  font-size: 12px;
}
.tw-cached { color: #8a6d1f; }
.tw-stale {
  margin: 8px 0 0;
  color: #b54708;
  font-size: 12px;
}
.tw-rain-tip,
.tw-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: #56617c;
}
.tw-rain-tip { color: #b42318; }
.tw-backups { margin-top: 10px; }
.tw-backups summary {
  cursor: pointer;
  font-weight: 600;
  color: #2f3a56;
  font-size: 13px;
}
.tw-policy {
  margin: 8px 0;
  color: #65708c;
  font-size: 12px;
}
.tw-activity-list { display: grid; gap: 8px; }
.tw-activity {
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #e0e7f5;
  border-radius: 8px;
}
.tw-activity-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}
.tw-applied {
  padding: 1px 7px;
  border-radius: 999px;
  background: #eaf1ff;
  color: #33405e;
  font-size: 11px;
}
.tw-backup-list {
  list-style: none;
  margin: 6px 0;
  padding: 0;
}
.tw-backup-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
  border-bottom: 1px dashed #e4eaf7;
  font-size: 13px;
}
.tw-backup-name small,
.tw-empty,
.tw-undo-hint { color: #65708c; font-size: 12px; }
.tw-empty { margin: 6px 0; }
.tw-undo-hint { margin: 4px 0; color: #8a6d1f; }
.tw-backup-actions { display: inline-flex; gap: 6px; }
.tw-add { margin-top: 6px; }
.tw-add summary { cursor: pointer; color: #4059d6; font-size: 12px; }
.tw-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
  margin: 8px 0;
}
.tw-form label,
.tw-pool label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: #56617c;
}
.tw-form input,
.tw-pool select {
  padding: 5px 7px;
  border: 1px solid #c9d5ee;
  border-radius: 6px;
  min-width: 0;
  max-width: 100%;
}
.tw-checkbox { flex-direction: row !important; align-items: center; gap: 5px !important; }
.tw-pool {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
  margin: 6px 0;
}
.tw-swap {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #f0d9a8;
  background: #fffdf4;
  border-radius: 8px;
}
.tw-swap h5 { margin: 0 0 8px; font-size: 14px; color: #5a4a2c; }
.tw-swap-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.tw-swap-col {
  flex: 1 1 200px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #ecdfc3;
  border-radius: 6px;
  font-size: 13px;
}
.tw-swap-col.next { border-color: #b9d4b1; background: #f7fff4; }
.tw-swap-label { color: #8a7a58; font-size: 11px; }
.tw-swap-col small { color: #65708c; }
.tw-warnings {
  margin: 8px 0;
  padding-left: 18px;
  color: #8a6d1f;
  font-size: 12px;
}
.tw-swap-actions { display: flex; gap: 8px; }
@media (max-width: 640px) {
  .travel-weather { padding: 10px; }
  .tw-form label,
  .tw-pool label { flex: 1 1 100%; }
}
</style>
