<template>
  <div class="plan-compare">
    <PageHeader icon="chart-line" title="行程方案对比" subtitle="并排比较 2–3 个方案的天数、活动、费用与交通数据缺口；不会自动判定哪个方案更好">
      <div class="compare-stats">
        <div class="stat-chip"><font-awesome-icon :icon="['fas', 'layer-group']" /><span>{{ group.length }}</span><em>方案数</em></div>
        <div class="stat-chip"><font-awesome-icon :icon="['fas', 'line-chart']" /><span>{{ selectedRoutes.length }}</span><em>正在比较</em></div>
      </div>
    </PageHeader>

    <div v-if="!baseRoute" class="empty-state">
      <font-awesome-icon :icon="['fas', 'circle-info']" />
      <h2>请从「我的旅行」选择要对比的旅行</h2>
      <p>方案对比入口在每条旅行的操作区，名称为「方案对比」。</p>
      <router-link class="link-btn" to="/routes">返回我的旅行</router-link>
    </div>

    <template v-else>
      <section class="base-card" aria-label="原始旅行">
        <div>
          <h2>{{ baseRoute.title }}</h2>
          <p>
            {{ baseRoute.startDate }} 至 {{ baseRoute.endDate }} · {{ baseRoute.persons || '人数未填写' }} 人
            <span v-if="baseRoute.adoptedFrom" class="adopted">已采用「{{ baseRoute.adoptedFrom.planName }}」，实际支出与账本已保留</span>
          </p>
        </div>
        <div class="copy-box">
          <label>新方案名称
            <input v-model="newPlanName" maxlength="20" placeholder="例如：轻松版" @keydown.enter.prevent="copyPlan">
          </label>
          <div class="preset-chips">
            <button v-for="preset in PLAN_NAME_PRESETS" :key="preset" type="button" @click="newPlanName = preset">{{ preset }}</button>
          </div>
          <button type="button" class="primary" :disabled="copying" @click="copyPlan">{{ copying ? '复制中…' : '复制当前旅行为新方案' }}</button>
          <p class="hint">复制会保留日程与预计费用，不继承实际支出、账本结算、准备完成状态和手账照片。</p>
        </div>
      </section>

      <section aria-label="选择比较方案">
        <h3>选择方案（至少 2 个，最多 3 个）</h3>
        <ul class="plan-picker">
          <li v-for="plan in group" :key="plan.id">
            <label>
              <input type="checkbox" :checked="selectedIds.includes(plan.id)" @change="toggleSelection(plan.id, $event)">
              <strong>{{ plan.planName || '原旅行' }}</strong>
              <small>{{ plan.title }} · {{ plan.startDate }} 至 {{ plan.endDate }}</small>
              <span v-if="plan.id === baseRoute.id" class="badge">原旅行</span>
              <span v-else class="badge variant">方案</span>
            </label>
          </li>
        </ul>
        <p v-if="group.length < 2" class="hint">还没有其他方案，先在上方复制出一个「轻松版」或「省钱版」再比较。</p>
      </section>

      <p v-if="selectionMessage" class="warn-line" role="alert">{{ selectionMessage }}</p>

      <template v-if="comparison">
        <section v-if="comparison.basis.length" class="basis" aria-label="比较口径提示">
          <h3>比较口径提示</h3>
          <ul>
            <li v-for="note in comparison.basis" :key="note">{{ note }}</li>
          </ul>
          <p>没有“最优方案”结论：数据缺口存在时请先补齐费用与交通信息。</p>
        </section>

        <section class="metrics" aria-label="方案指标">
          <h3>指标对比</h3>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">指标</th>
                  <th v-for="panel in comparison.panels" :key="panel.id" scope="col">
                    {{ panel.planName || '原旅行' }}
                    <small>{{ panel.title }}</small>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in metricRows" :key="row.key">
                  <th scope="row">{{ row.label }}</th>
                  <td v-for="(panel, index) in comparison.panels" :key="panel.id">
                    <span :class="{ gap: row.gap && row.gap(panel), over: row.key === 'budgetGap' && panel.overBudget }">{{ row.value(panel) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="hint">预计费用只统计已录入的金额；显示「待确认」表示没有录入或信息不完整，不能按免费处理。预算上限是期望值，不等于预计费用。</p>
        </section>

        <section class="day-diff" aria-label="每日安排差异">
          <h3>每日安排差异</h3>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">日期</th>
                  <th v-for="panel in comparison.panels" :key="panel.id" scope="col">{{ panel.planName || '原旅行' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="day in comparison.days" :key="day.date">
                  <th scope="row">{{ day.date }}</th>
                  <td v-for="(cell, index) in day.cells" :key="comparison.panels[index].id">
                    <p v-if="!cell.activities.length" class="gap">没有安排</p>
                    <ul v-else>
                      <li v-for="activity in cell.activities" :key="activity.time + activity.title">
                        <span class="time">{{ activity.time || '时间待定' }}</span>
                        {{ activity.title }}
                        <span v-if="activity.category === '用餐'" class="meal-tag">用餐</span>
                        <span v-if="activity.travelQueried === false" class="gap-tag">交通未查询</span>
                      </li>
                    </ul>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="adopt" aria-label="采用方案">
          <h3>采用某个方案</h3>
          <p class="hint">采用后会把所选方案的日程、预算与预计费用写入原旅行《{{ baseRoute.title }}》；原旅行已记录的实际支出、账本结算和其他方案都会保留，不会被删除。</p>
          <ul class="adopt-list">
            <li v-for="panel in comparison.panels" :key="panel.id">
              <div>
                <strong>{{ panel.planName || '原旅行' }}</strong>
                <small>{{ panel.activities }} 项活动 · {{ panel.days }} 天</small>
              </div>
              <button type="button" :disabled="panel.id === baseRoute.id || adopting" @click="adopt(panel)">
                {{ panel.id === baseRoute.id ? '当前旅行' : '采用此方案' }}
              </button>
            </li>
          </ul>
        </section>
      </template>
      <p v-else-if="group.length >= 2" class="hint">请选择至少 2 个方案开始比较。</p>
      <p v-if="actionMessage" role="status" class="status-line">{{ actionMessage }}</p>
    </template>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '../components/PageHeader.vue'
import { FontAwesomeIcon } from '../ui/fontAwesome.js'
import { useTravelStore } from '../stores/travel.js'
import { useFeedback } from '../composables/useFeedback.js'
import { PLAN_NAME_PRESETS, planGroupRoutes, comparePlans, createPlanVariant, adoptPlan } from '../utils/planVariant.js'

const route = useRoute()
const router = useRouter()
const travel = useTravelStore()
const feedback = useFeedback()

const baseId = computed(() => String(route?.query?.base || ''))
const openedRoute = computed(() => travel.routes.find(item => String(item.id) === baseId.value) || null)
// 从某个方案进入时，仍然以同组的原旅行作为比较与采用的基准。
const baseRoute = computed(() => {
  const opened = openedRoute.value
  if (!opened) return null
  const rootId = opened.planGroupId || opened.id
  return travel.routes.find(item => item.id === rootId) || opened
})
const group = computed(() => baseRoute.value ? planGroupRoutes(travel.routes, baseRoute.value) : [])
const selectedIds = ref([])
const newPlanName = ref('轻松版')
const copying = ref(false)
const adopting = ref(false)
const selectionMessage = ref('')
const actionMessage = ref('')

const selectedRoutes = computed(() => group.value.filter(plan => selectedIds.value.includes(plan.id)))
const comparison = computed(() => selectedRoutes.value.length >= 2 ? comparePlans(selectedRoutes.value) : null)

watch(group, plans => {
  const ids = plans.map(plan => plan.id)
  const kept = selectedIds.value.filter(id => ids.includes(id))
  if (kept.length < Math.min(2, ids.length)) {
    const base = baseRoute.value ? [baseRoute.value.id] : []
    const others = ids.filter(id => !base.includes(id))
    selectedIds.value = [...base, ...others].slice(0, 3)
  } else {
    selectedIds.value = kept
  }
}, { immediate: true })

function formatMoney(value) {
  if (value === null || value === undefined) return '待确认'
  return `¥${Number(value).toFixed(2)}`
}

const metricRows = [
  { key: 'days', label: '天数', value: panel => `${panel.days} 天` },
  { key: 'activities', label: '活动数量', value: panel => panel.empty ? '空方案' : `${panel.activities} 项` },
  { key: 'meals', label: '用餐安排', value: panel => `${panel.meals} 项` },
  { key: 'pending', label: '待安排候选', value: panel => `${panel.pending} 项` },
  { key: 'persons', label: '人数', value: panel => panel.persons === null ? '未填写' : `${panel.persons} 人` },
  { key: 'dates', label: '日期范围', value: panel => panel.firstDate && panel.lastDate ? `${panel.firstDate} 至 ${panel.lastDate}` : '未填写' },
  { key: 'budget', label: '预算上限', value: panel => panel.budget === null ? '未填写' : formatMoney(panel.budget) },
  {
    key: 'estimated',
    label: '预计费用',
    value: panel => panel.estimatedTotal === null ? '待确认' : formatMoney(panel.estimatedTotal),
    gap: panel => panel.estimatedTotal === null || panel.unknownCosts > 0
  },
  {
    key: 'unknown',
    label: '未录入费用',
    value: panel => panel.unknownCosts ? `${panel.unknownCosts} 项待确认` : '无',
    gap: panel => panel.unknownCosts > 0
  },
  {
    key: 'budgetGap',
    label: '与预算上限',
    value: panel => {
      if (panel.budget === null) return '预算未填写'
      if (panel.estimatedTotal === null) return '费用不完整'
      const gap = panel.estimatedTotal - panel.budget
      return gap > 0 ? `超出 ${formatMoney(gap)}` : `剩余 ${formatMoney(Math.abs(gap))}`
    },
    gap: panel => panel.budget === null || panel.estimatedTotal === null
  },
  {
    key: 'travel',
    label: '已查交通',
    value: panel => `${panel.travelQueried} / ${panel.travelQueried + panel.travelUnqueried} 段`,
    gap: panel => panel.travelUnqueried > 0
  },
  {
    key: 'travelGap',
    label: '未查交通',
    value: panel => panel.travelUnqueried ? `${panel.travelUnqueried} 段未查询` : '无',
    gap: panel => panel.travelUnqueried > 0
  }
]

function toggleSelection(id, event) {
  selectionMessage.value = ''
  // 浏览器在 change 前已经切换了复选框；被拒绝时必须显式写回模型状态，否则界面与实际比较结果不一致。
  const restore = () => { if (event?.target) event.target.checked = selectedIds.value.includes(id) }
  if (selectedIds.value.includes(id)) {
    if (selectedIds.value.length <= 2) {
      selectionMessage.value = '至少选择 2 个方案才能对比。'
      restore()
      return
    }
    selectedIds.value = selectedIds.value.filter(item => item !== id)
    restore()
    return
  }
  if (selectedIds.value.length >= 3) {
    selectionMessage.value = '最多同时比较 3 个方案，请先取消一个。'
    restore()
    return
  }
  selectedIds.value = [...selectedIds.value, id]
  restore()
}

async function copyPlan() {
  if (!baseRoute.value) return
  if (!travel.ownerId) { feedback.error('请先登录后再创建方案'); router.push({ path: '/login', query: { redirect: route.fullPath } }); return }
  copying.value = true
  try {
    const variant = createPlanVariant(baseRoute.value, { planName: newPlanName.value })
    const saved = travel.saveRoute(variant)
    selectedIds.value = [baseRoute.value.id, saved.id, ...selectedIds.value.filter(id => id !== baseRoute.value.id && id !== saved.id)].slice(0, 3)
    actionMessage.value = `已创建方案「${saved.planName}」，不会继承实际支出与准备完成状态。`
    feedback.success(`已创建方案「${saved.planName}」`)
  } catch (cause) {
    actionMessage.value = cause.message || '创建方案失败'
    feedback.error(actionMessage.value)
  } finally {
    copying.value = false
  }
}

async function adopt(panel) {
  if (!baseRoute.value || panel.id === baseRoute.value.id) return
  if (!travel.ownerId) { feedback.error('请先登录后再采用方案'); return }
  const chosen = group.value.find(plan => plan.id === panel.id)
  if (!chosen) return
  if (!await feedback.confirm(`采用「${panel.planName || panel.title}」？原旅行的日程与预算会被更新，实际支出与账本结算保留。`, { title: '采用方案', confirmLabel: '采用方案' })) return
  adopting.value = true
  try {
    const result = adoptPlan(baseRoute.value, chosen)
    travel.saveRoute(result.route)
    actionMessage.value = `已采用「${panel.planName || panel.title}」，保留 ${result.matchedActuals} 项实际支出`
      + (result.unmatchedActuals.length ? `；另有 ${result.unmatchedActuals.length} 项原实际支出因新方案没有对应记录而单独保留。` : '。')
    feedback.success('已采用方案，其他方案仍保留在列表中')
  } catch (cause) {
    actionMessage.value = cause.message || '采用方案失败'
    feedback.error(actionMessage.value)
  } finally {
    adopting.value = false
  }
}
</script>
<style scoped>
.plan-compare{max-width:1280px;margin:0 auto;padding:20px}
.compare-stats{display:flex;flex-wrap:wrap;gap:10px}
.stat-chip{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#fff;border:1px solid #e1e8ef;border-radius:10px;color:#2f6fed}
.stat-chip em{font-style:normal;color:#5c6b7a;font-size:12px}
.empty-state{display:grid;place-items:center;gap:10px;padding:40px 16px;background:#fff;border:1px solid #e1e8ef;border-radius:12px;text-align:center;color:#3d4f61}
.link-btn{display:inline-block;padding:8px 14px;background:#2f6fed;color:#fff;border-radius:8px;text-decoration:none}
.base-card{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;padding:16px;margin:16px 0;background:#f7fbff;border:1px solid #dbe6f1;border-radius:12px}
.base-card h2{margin:0 0 6px;font-size:20px;color:#243449}
.base-card p{margin:0;color:#4b5b6b}
.adopted{display:inline-block;margin-left:8px;padding:2px 8px;background:#e8f5ee;color:#1f6f43;border-radius:999px;font-size:12px}
.copy-box{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.copy-box label{display:grid;gap:4px;font-size:13px;color:#3d4f61}
.copy-box input{padding:8px;border:1px solid #c9d6e2;border-radius:6px}
.preset-chips{display:flex;flex-wrap:wrap;gap:6px}
.preset-chips button{padding:6px 10px;border:1px solid #c9d6e2;background:#fff;border-radius:999px;cursor:pointer;font-size:12px;color:#3d4f61}
.primary{padding:8px 14px;background:#2f6fed;color:#fff;border:none;border-radius:8px;cursor:pointer;min-height:38px}
.primary:disabled{opacity:.6;cursor:progress}
.hint{margin:8px 0 0;font-size:12px;color:#5c6b7a;flex-basis:100%}
.plan-picker{list-style:none;padding:0;margin:10px 0;display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.plan-picker label{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;background:#fff;border:1px solid #e1e8ef;border-radius:10px;cursor:pointer}
.plan-picker small{color:#6b7a89}
.badge{padding:2px 8px;border-radius:999px;background:#eef3ff;color:#2f6fed;font-size:12px}
.badge.variant{background:#fff5e6;color:#a15c00}
.warn-line{color:#a34a00}
.basis{padding:12px 16px;margin:16px 0;background:#fffaf0;border:1px solid #f0dfc0;border-radius:12px}
.basis h3{margin:0 0 8px;font-size:16px;color:#5a4a2c}
.basis ul{margin:0 0 8px;padding-left:20px;color:#5a4a2c}
.basis p{margin:0;font-size:12px;color:#6b6350}
.metrics,.day-diff,.adopt{margin-top:26px}
.metrics h3,.day-diff h3,.adopt h3{margin:0 0 10px;font-size:17px;color:#243449}
.table-scroll{overflow-x:auto;border:1px solid #e1e8ef;border-radius:10px;background:#fff}
table{width:100%;border-collapse:collapse;min-width:560px}
th,td{padding:10px 12px;border-bottom:1px solid #eef2f6;text-align:left;vertical-align:top;font-size:13px;color:#2f4b66}
thead th{background:#f5f8fc;color:#243449}
thead th small{display:block;color:#6b7a89;font-weight:400}
tbody th,td:first-child{white-space:nowrap}
td small{color:#6b7a89}
.gap{color:#a34a00}
.over{color:#c92a2a;font-weight:600}
.time{display:inline-block;min-width:52px;color:#2f6fed}
.meal-tag{margin-left:6px;padding:1px 6px;border-radius:999px;background:#fff5e6;color:#a15c00;font-size:11px}
.gap-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:#fdf0f0;color:#a34a00;font-size:11px}
.day-diff ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.adopt-list{list-style:none;padding:0;margin:10px 0;display:grid;gap:8px}
.adopt-list li{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;padding:10px 12px;background:#fff;border:1px solid #e1e8ef;border-radius:10px}
.adopt-list small{display:block;color:#6b7a89}
.adopt-list button{padding:7px 12px;border:1px solid #c9d6e2;background:#fff;border-radius:8px;cursor:pointer;color:#2f4b66}
.adopt-list button:disabled{opacity:.55;cursor:default}
.status-line{color:#1f6f43}
@media (max-width:640px){.plan-compare{padding:12px}}
</style>
