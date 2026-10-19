<template>
  <div class="route-detail">
    <div v-if="notFound" class="detail-empty">
      <span class="empty-icon"><font-awesome-icon :icon="['fas', 'route']" /></span>
      <h1>未找到该线路</h1>
      <p>线路不存在或已被删除。</p>
      <button class="btn btn-primary" @click="goBack">返回线路列表</button>
    </div>

    <template v-else-if="route">
      <!-- 顶部 Hero -->
      <div class="detail-hero" :style="{ backgroundImage: 'url(' + heroImage + ')' }">
        <div class="hero-shade"></div>
        <div class="hero-back">
          <button class="back-btn" @click="goBack" title="返回线路列表">
            <font-awesome-icon :icon="['fas', 'arrow-left']" />
            返回
          </button>
          <button class="fav-btn" @click="toggleFavorite" title="收藏">
            <font-awesome-icon :icon="['fas', route.isFavorite ? 'heart' : 'heart-circle-plus']" :class="{ favorited: route.isFavorite }" />
          </button>
        </div>
        <div class="hero-info">
          <span v-if="route.progress >= 100" class="hero-badge done"><font-awesome-icon :icon="['fas', 'check']" /> 已完成</span>
          <span v-else class="hero-badge"><font-awesome-icon :icon="['fas', 'pen-to-square']" /> 规划中</span>
          <h1>{{ route.title }}</h1>
          <p class="hero-sub">
            <font-awesome-icon :icon="['fas', 'calendar-days']" />
            {{ formatFullDate(route.startDate) }} — {{ formatFullDate(route.endDate) }} · {{ duration }} 天
          </p>
          <div class="hero-chips">
            <span v-if="departureCountdown" class="chip countdown" :class="'tone-' + departureCountdown.tone">
              <font-awesome-icon :icon="['fas', 'clock']" /> {{ departureCountdown.label }}
            </span>
            <span v-if="destinationLabel" class="chip"><font-awesome-icon :icon="['fas', 'location-dot']" /> {{ destinationLabel }}</span>
            <span v-if="route.budget != null" class="chip"><font-awesome-icon :icon="['fas', 'coins']" /> 总预算 ¥{{ formatMoney(route.budget) }}</span>
            <span v-for="t in route.themes" :key="t" class="chip theme">{{ t }}</span>
          </div>
        </div>
        <div class="hero-progress">
          <span class="progress-label">规划进度</span>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: route.progress + '%' }" :class="{ full: route.progress >= 100 }"></div>
          </div>
          <span class="progress-value">{{ route.progress }}%</span>
        </div>
      </div>

      <!-- 概览统计条 -->
      <div class="overview-bar">
        <div class="ov-item"><span class="ov-num">{{ duration }}</span><span class="ov-label">天数</span></div>
        <div class="ov-item"><span class="ov-num">{{ totalAttractions }}</span><span class="ov-label">景点/活动</span></div>
        <div class="ov-item"><span class="ov-num">¥{{ formatMoney(totalBudget) }}</span><span class="ov-label">总预算</span></div>
        <div class="ov-item"><span class="ov-num">{{ companionLabel }}</span><span class="ov-label">同行</span></div>
      </div>

      <!-- 行程视图切换 -->
      <div class="detail-tabs">
        <button :class="{ active: detailView === 'schedule' }" @click="detailView = 'schedule'">
          <font-awesome-icon :icon="['fas', 'list-check']" /> 日程编辑
        </button>
        <button :class="{ active: detailView === 'map' }" @click="detailView = 'map'">
          <font-awesome-icon :icon="['fas', 'route']" /> 动线地图
        </button>
        <button :class="{ active: detailView === 'budget' }" @click="detailView = 'budget'">
          <font-awesome-icon :icon="['fas', 'chart-pie']" /> 预算明细
        </button>
        <button :class="{ active: detailView === 'calendar' }" @click="detailView = 'calendar'">
          <font-awesome-icon :icon="['fas', 'calendar-alt']" /> 行程日历
        </button>
      </div>

      <!-- 日程编辑器 -->
      <div v-if="detailView === 'schedule'" class="schedule-panel">
        <div class="editor-head">
          <h2><font-awesome-icon :icon="['fas', 'calendar-days']" /> 每日行程安排</h2>
          <p class="editor-sub">按天添加、排序并管理你的行程细节</p>
        </div>

        <div class="editor-layout">
          <!-- 左侧：天数导航 -->
          <nav class="day-nav" aria-label="选择天数">
            <button
              v-for="(day, di) in route.days"
              :key="day.date || di"
              class="day-tab"
              :class="{ active: activeDay === di }"
              @click="activeDay = di"
            >
              <span class="day-badge">D{{ di + 1 }}</span>
              <span class="day-info">
                <span class="day-date">{{ shortDate(day.date) }}</span>
                <span class="day-count">{{ day.activities.length }} 项活动</span>
              </span>
            </button>
            <button class="day-add-tab" @click="addDay" title="添加一天">
              <font-awesome-icon :icon="['fas', 'plus']" />
            </button>
          </nav>

          <!-- 右侧：当天日程 -->
          <div v-if="route.days.length" class="day-panel">
            <div class="day-panel-head">
              <h3>第 {{ activeDay + 1 }} 天 <span class="day-date-full">{{ fullDate(route.days[activeDay].date) }}</span></h3>
              <div class="day-budget-input">
                <label>当日预算</label>
                <div class="budget-wrap">
                  <span>¥</span>
                  <input v-model.number="route.days[activeDay].budget" type="number" min="0" placeholder="可选" />
                </div>
              </div>
            </div>

            <div v-if="route.days[activeDay].activities.length" class="activity-timeline">
              <div
                v-for="(act, ai) in route.days[activeDay].activities"
                :key="ai"
                class="activity-row"
                :class="{ editing: editingIndex === ai }"
              >
                <div class="row-drag" title="拖动排序（↑↓）">
                  <font-awesome-icon :icon="['fas', 'grip-vertical']" />
                </div>
                <div class="row-time">
                  <font-awesome-icon :icon="['fas', 'clock']" />
                  <input
                    v-model="act.time"
                    placeholder="时间"
                    @blur="editingIndex = -1"
                  />
                </div>
                <div class="row-main">
                  <div class="row-title-row">
                    <input v-model="act.title" class="row-title" placeholder="活动名称" />
                    <button class="icon-action move-up" :disabled="ai === 0" @click="moveActivity(activeDay, ai, -1)" title="上移">
                      <font-awesome-icon :icon="['fas', 'arrow-up']" />
                    </button>
                    <button class="icon-action move-down" :disabled="ai === route.days[activeDay].activities.length - 1" @click="moveActivity(activeDay, ai, 1)" title="下移">
                      <font-awesome-icon :icon="['fas', 'arrow-down']" />
                    </button>
                    <button class="icon-action delete" @click="removeActivity(activeDay, ai)" title="删除">
                      <font-awesome-icon :icon="['fas', 'trash']" />
                    </button>
                  </div>
                  <input
                    v-model="act.description"
                    class="row-desc"
                    placeholder="备注（可选）：建议停留、交通提示等"
                  />
                </div>
              </div>
            </div>
            <div v-else class="day-empty">
              <font-awesome-icon :icon="['fas', 'compass']" />
              <p>这一天还没有安排行程</p>
            </div>

            <!-- 添加活动 -->
            <div class="add-activity">
              <div class="add-quick">
                <input
                  v-model="quickTitle"
                  placeholder="快速添加活动名称"
                  @keydown.enter="addQuickActivity"
                />
                <button class="btn btn-secondary" @click="addQuickActivity">
                  <font-awesome-icon :icon="['fas', 'plus']" /> 添加
                </button>
              </div>
              <div class="suggestion-box">
                <p class="suggestion-title"><font-awesome-icon :icon="['fas', 'lightbulb']" /> 灵感推荐</p>
                <div class="suggestion-chips">
                  <button
                    v-for="s in suggestions"
                    :key="s"
                    class="suggestion-chip"
                    @click="addSuggestedActivity(s)"
                  >
                    {{ s }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 动线地图 -->
      <div v-if="detailView === 'map'" class="map-panel">
        <div class="map-head">
          <h2><font-awesome-icon :icon="['fas', 'route']" /> 行程动线可视化</h2>
          <p class="editor-sub">按访问顺序串联各日行程节点，直观查看路线走向</p>
        </div>

        <div v-if="mapPlan.nodes.length" class="map-wrap">
          <svg class="itinerary-map" viewBox="0 0 100 70" preserveAspectRatio="xMidYMid meet" role="img" aria-label="行程动线地图">
            <defs>
              <linearGradient id="routeMapBg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#eef2ff"/>
                <stop offset="100%" stop-color="#f7f2ff"/>
              </linearGradient>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#667eea"/>
                <stop offset="100%" stop-color="#f7971e"/>
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="100" height="70" rx="4" fill="url(#routeMapBg)"/>
            <g stroke="#dde3f5" stroke-width="0.15">
              <line x1="0" y1="14" x2="100" y2="14"/>
              <line x1="0" y1="28" x2="100" y2="28"/>
              <line x1="0" y1="42" x2="100" y2="42"/>
              <line x1="0" y1="56" x2="100" y2="56"/>
            </g>
            <polyline :points="mapPlan.path" fill="none" stroke="url(#lineGrad)" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>
            <g v-for="(n, i) in mapPlan.nodes" :key="n.key" class="map-node" :class="{ dimmed: activeMapDay !== null && activeMapDay !== n.di }">
              <circle :cx="n.x" :cy="n.y" r="3.2" :fill="n.color" stroke="#fff" stroke-width="0.7"/>
              <text :x="n.x" :y="n.y + 1.1" text-anchor="middle" font-size="3" fill="#fff" font-weight="700">{{ i + 1 }}</text>
              <text :x="n.x" :y="n.y - 4" text-anchor="middle" font-size="2.8" fill="#5b647b">{{ n.label }}</text>
            </g>
          </svg>

          <div class="map-legend">
            <button
              v-for="g in mapPlan.dayGroups"
              :key="g.di"
              class="legend-chip"
              :class="{ active: activeMapDay === g.di }"
              @click="activeMapDay = activeMapDay === g.di ? null : g.di"
            >
              <span class="legend-dot" :style="{ background: g.color }"></span>
              第{{ g.di + 1 }}天 · {{ g.count }}站
            </button>
            <p class="legend-hint">节点按访问顺序编号，点击图例可高亮对应一天</p>
          </div>
        </div>
        <div v-else class="map-empty">
          <font-awesome-icon :icon="['fas', 'map-location-dot']" />
          <p>还没有可展示的节点，先回到「日程编辑」为线路添加行程吧</p>
        </div>
      </div>

      <!-- 预算明细 -->
      <div v-if="detailView === 'budget'" class="budget-panel">
        <div class="editor-head">
          <h2><font-awesome-icon :icon="['fas', 'chart-pie']" /> 预算明细</h2>
          <p class="editor-sub">逐日查看花费分配，并按出行人数估算人均花费</p>
        </div>

        <div class="budget-summary-row">
          <div class="budget-summary-card total">
            <span class="bs-label">总预算</span>
            <span class="bs-value">¥{{ formatMoney(totalBudget) }}</span>
          </div>
          <div class="budget-summary-card per-person">
            <span class="bs-label">人均花费</span>
            <span class="bs-value">¥{{ formatMoney(perPersonBudget) }}</span>
            <span class="bs-note">按 {{ persons }} 人分摊</span>
          </div>
          <div class="budget-summary-card days">
            <span class="bs-label">出行天数</span>
            <span class="bs-value">{{ duration }} 天</span>
          </div>
          <div class="budget-summary-card daily-avg">
            <span class="bs-label">日均花费</span>
            <span class="bs-value">¥{{ formatMoney(dailyAvgBudget) }}</span>
          </div>
        </div>

        <div class="budget-row-head">
          <h3>逐日预算</h3>
          <div class="persons-input">
            <label>出行人数</label>
            <div class="persons-stepper">
              <button @click="stepPersons(-1)" :disabled="persons <= 1" title="减少人数"><font-awesome-icon :icon="['fas', 'minus']" /></button>
              <span class="persons-num">{{ persons }}</span>
              <button @click="stepPersons(1)" :disabled="persons >= 99" title="增加人数"><font-awesome-icon :icon="['fas', 'plus']" /></button>
            </div>
          </div>
        </div>

        <div v-if="dailyBudgetRows.length" class="budget-days">
          <div
            v-for="(row, di) in dailyBudgetRows"
            :key="di"
            class="budget-day-row"
            :class="{ unset: !row.budget }"
          >
            <div class="bd-left">
              <span class="bd-badge">D{{ di + 1 }}</span>
              <div class="bd-info">
                <span class="bd-date">{{ shortDate(row.date) }}</span>
                <span class="bd-activities">{{ row.activities }} 项活动</span>
              </div>
            </div>
            <div class="bd-bars">
              <div class="bd-track">
                <div class="bd-fill" :style="{ width: row.pct + '%' }"></div>
              </div>
              <div class="bd-meta">
                <span v-if="row.budget" class="bd-amount">¥{{ formatMoney(row.budget) }}<small> · 人均 ¥{{ formatMoney(row.budget / persons) }}</small></span>
                <span v-else class="bd-amount muted">未设置</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="budget-empty">
          <font-awesome-icon :icon="['fas', 'coins']" />
          <p>暂无每日预算数据，可在「日程编辑」中为每天设置当日预算。</p>
        </div>
      </div>

      <!-- 行程日历 -->
      <div v-if="detailView === 'calendar'" class="calendar-panel">
        <div class="editor-head">
          <h2><font-awesome-icon :icon="['fas', 'calendar-alt']" /> 出行日历</h2>
          <p class="editor-sub">把每日安排映射到日历，直观查看出行节奏</p>
        </div>
        <div class="mini-calendar">
          <div class="cal-head">
            <span class="cal-month">{{ monthTitle(routeView.startDate) }}</span>
            <div class="cal-legend">
              <span class="legend-sample travel"><i></i>行程日</span>
              <span class="legend-sample today"><i></i>今天</span>
            </div>
          </div>
          <div class="cal-grid">
            <span v-for="w in ['日','一','二','三','四','五','六']" :key="'w'+w" class="cal-weekday">{{ w }}</span>
            <span
              v-for="(cell, ci) in calendarCells"
              :key="ci"
              class="cal-cell"
              :class="{ travel: cell.travel, today: cell.today, out: cell.out }"
            >
              <span class="cal-daynum">{{ cell.day || '' }}</span>
              <span v-if="cell.travel" class="cal-dot"></span>
            </span>
          </div>
        </div>
        <div v-if="routeView.days && routeView.days.length" class="cal-day-summaries">
          <div v-for="(day, di) in routeView.days" :key="di" class="cal-day-summary">
            <span class="cds-badge">D{{ di + 1 }}</span>
            <span class="cds-date">{{ shortDate(day.date) }} · {{ day.activities?.length || 0 }} 项活动</span>
            <button class="cds-link" @click="jumpToDay(di)">编辑</button>
          </div>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="detail-actions">
        <button class="btn btn-secondary" @click="goBack"><font-awesome-icon :icon="['fas', 'arrow-left']" /> 返回</button>
        <button class="btn btn-ghost" @click="duplicateRoute"><font-awesome-icon :icon="['fas', 'clone']" /> 复制为新线路</button>
        <button class="btn btn-ghost" @click="shareImage"><font-awesome-icon :icon="['fas', 'image']" /> 分享卡片</button>
        <button class="btn btn-ghost" @click="printRoute"><font-awesome-icon :icon="['fas', 'print']" /> 打印/导出PDF</button>
        <button class="btn btn-ghost" @click="shareRoute"><font-awesome-icon :icon="['fas', 'share-nodes']" /> 分享</button>
        <button class="btn btn-primary" @click="saveRoute"><font-awesome-icon :icon="['fas', 'save']" /> 保存修改</button>
      </div>
    </template>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTravelStore } from '../stores/travel.js'
import { useFeedback } from '../composables/useFeedback.js'
import itineraryService from '../services/itineraryService.js'
import { inclusiveDayCount, parseDateOnly, addCalendarDays, localDateString } from '../utils/date.js'
import { defaultPersons, dailyBudgetRows as routeStatsDailyRows, perPerson, dailyAverage, calendarCells as routeStatsCalendarCells, monthTitle as routeStatsMonthTitle, destinationLabel as routeDestinationLabel } from '../utils/routeStats.js'
import AppImage from '../ui/AppImage.js'
import { FontAwesomeIcon } from '../ui/fontAwesome.js'
import { storeToRefs } from 'pinia'

// 灵感推荐库（可与 itineraryService 的景点库呼应）
const SUGGESTION_LIBRARY = [
  '天安门广场', '故宫博物院', '八达岭长城', '颐和园', '天坛公园',
  '南锣鼓巷', '798艺术区', '国家博物馆', '什刹海', '北海公园',
  '圆明园遗址公园', '国家大剧院', '798艺术区', '慕田峪长城', '红螺寺',
  '西湖', '灵隐寺', '西溪湿地', '外滩', '迪士尼乐园', '田子坊',
  '大熊猫基地', '宽窄巷子', '武侯祠', '都江堰', '兵马俑', '大雁塔'
]
// 去重
const suggestionSet = [...new Set(SUGGESTION_LIBRARY)]

const COMPANION_LABELS = {
  solo: '独自旅行', couple: '情侣出游', family: '家庭亲子', friends: '朋友结伴'
}

export default {
  name: 'RouteDetailView',
  components: { AppImage, FontAwesomeIcon },
  setup() {
    const routeParam = useRoute()
    const router = useRouter()
    const feedback = useFeedback()
    const travel = useTravelStore()
    const { routes } = storeToRefs(travel)

    // SSR / 测试环境下 useRoute 可能为空
    const routeId = computed(() => {
      if (!routeParam || !routeParam.params) return ''
      return String(routeParam.params.id || '')
    })
    const routeData = computed(() => routes.value.find(r => String(r.id) === routeId.value) || null)
    const notFound = computed(() => routes.value.length > 0 && !routeData.value)
    const ready = computed(() => routes.value.length >= 0)

    // 编辑用副本（避免直接污染 store，直到点击保存）
    const draft = ref(null)

    const activeDay = ref(0)
    const quickTitle = ref('')
    const editingIndex = ref(-1)

    // ---- 当源数据变化时初始化副本 ----
    const routeView = computed(() => {
      const src = routeData.value
      if (!src) return draft.value || null
      if (!draft.value || draft.value.__srcId !== src.id) {
        const copy = JSON.parse(JSON.stringify(src))
        copy.__srcId = src.id
        copy.__id = src.id
        // 补齐每日占位，保证日程编辑器有可操作的天数
        if (!Array.isArray(copy.days)) copy.days = []
        let days;
        try { days = inclusiveDayCount(copy.startDate, copy.endDate) } catch { days = copy.days.length || 0 }
        while (copy.days.length < Math.max(days, 1)) {
          const di = copy.days.length
          copy.days.push({ date: addCalendarDays(copy.startDate, di), activities: [], budget: null })
        }
        draft.value = copy
        activeDay.value = 0
      }
      return draft.value
    })

    // 切换线路 / 重新加载时重置
    watch(routeId, () => { draft.value = null; activeDay.value = 0 })

    // 出发倒计时定时刷新
    function refreshToday() { today.value = localDateString() }
    onMounted(() => { if (typeof window !== 'undefined') clockTimer = window.setInterval(refreshToday, 60000) })
    onBeforeUnmount(() => { if (typeof window !== 'undefined' && clockTimer) window.clearInterval(clockTimer) })

    const duration = computed(() => {
      try { return inclusiveDayCount(routeData.value?.startDate, routeData.value?.endDate) } catch { return 0 }
    })

    const totalAttractions = computed(() =>
      (routeView.value?.days || []).reduce((sum, d) => sum + (d.activities || []).length, 0)
    )

    const totalBudget = computed(() => {
      const days = routeView.value?.days || []
      if (!days.length) return routeView.value?.budget || 0
      return days.reduce((sum, d) => sum + (Number(d.budget) || 0), 0)
    })

    const companionLabel = computed(() => COMPANION_LABELS[routeView.value?.companion] || routeView.value?.companion || '—')

    const destinationLabel = computed(() => routeDestinationLabel(routeView.value))

    const heroImage = computed(() => routeView.value?.coverImage || '/images/home-backdrop.svg')

    // 出发倒计时
    const today = ref(localDateString())
    let clockTimer = null
    const departureCountdown = computed(() => {
      try {
        const nowTs = parseDateOnly(today.value).getTime()
        const startTs = parseDateOnly(routeView.value?.startDate).getTime()
        const endTs = parseDateOnly(routeView.value?.endDate).getTime()
        const diff = Math.round((startTs - nowTs) / 86400000)
        if (startTs <= nowTs && endTs >= nowTs) return { days: 0, label: '正在旅行中', tone: 'active' }
        if (startTs < nowTs) return { days: diff, label: '该行程已结束', tone: 'past' }
        if (diff <= 0) return { days: 0, label: '今天出发', tone: 'soon' }
        return { days: diff, label: `${diff} 天后出发`, tone: diff <= 7 ? 'soon' : 'normal' }
      } catch {
        return null
      }
    })

    const suggestions = suggestionSet

    // ---- 预算明细 / 人均 ----
    const persons = ref(1)
    watch(
      routeView,
      v => {
        const raw = Number(v?.persons)
        if (Number.isFinite(raw) && raw >= 1) persons.value = Math.min(99, Math.floor(raw))
        else persons.value = defaultPersons(v?.companion)
      },
      { immediate: true }
    )

    function stepPersons(dir) {
      const next = clamp(persons.value + dir, 1, 99)
      persons.value = next
      if (draft.value) draft.value.persons = next
    }

    const perPersonBudget = computed(() => perPerson(totalBudget.value, persons.value))

    const dailyAvgBudget = computed(() => dailyAverage(totalBudget.value, duration.value || 1))

    const dailyBudgetRows = computed(() => routeStatsDailyRows(routeView.value?.days || []))

    // ---- 行程日历 ----
    const calendarCells = computed(() => {
      const r = routeView.value
      if (!r) return []
      return routeStatsCalendarCells(r.startDate, r.endDate, today.value)
    })

    function monthTitle(dateStr) {
      return routeStatsMonthTitle(dateStr)
    }

    function jumpToDay(di) {
      activeDay.value = di
      detailView.value = 'schedule'
    }

    // ---- 分享卡片（Canvas 生成图片）----
    function shareImage() {
      const r = draft.value || routeData.value
      if (!r) return
      if (typeof document === 'undefined' || typeof window === 'undefined') { feedback.info('当前环境不支持生成图片卡片'); return }
      try { buildShareCard(r) } catch (e) { feedback.error('生成分享卡片失败：' + e.message) }
    }

    function buildShareCard(r) {
      const W = 1080, H = 1520, P = 56
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas 不可用')

      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, '#667eea'); grad.addColorStop(1, '#764ba2')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // 装饰圆
      ctx.globalAlpha = 0.12
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.arc(W - 40, 80, 220, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(-60, H - 100, 240, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1

      // 标题
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.font = 'bold 58px "PingFang SC","Microsoft YaHei",sans-serif'
      wrapText(ctx, r.title || '旅行线路', W - P * 2, P, 78, 62)

      // 副标题
      const dest = Array.isArray(r.destinations) && r.destinations.length ? r.destinations.join(' · ') : (r.destination || '')
      const by = dest ? `目的地：${dest}` : ''
      ctx.font = '30px "PingFang SC","Microsoft YaHei",sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      let y = P + 150
      if (r.startDate && r.endDate) {
        ctx.fillText(`行程：${r.startDate} 至 ${r.endDate}（${duration}天）`, P, y); y += 46
      }
      if (by) { ctx.fillText(by, P, y); y += 46 }

      // 统计块
      y += 20
      const stats = [
        { label: '天数', value: `${duration}` },
        { label: '景点/活动', value: `${totalAttractions.value}` },
        { label: '总预算', value: `¥${formatMoney(totalBudget.value)}` }
      ]
      const bw = (W - P * 2 - 24) / 3
      stats.forEach((s, i) => {
        const x = P + i * (bw + 12)
        roundRect(ctx, x, y, bw, 120, 18)
        ctx.fillStyle = 'rgba(255,255,255,0.16)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5; ctx.stroke()
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'
        ctx.font = 'bold 40px "PingFang SC","Microsoft YaHei",sans-serif'
        ctx.fillText(s.value, x + bw / 2, y + 58)
        ctx.font = '24px "PingFang SC","Microsoft YaHei",sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText(s.label, x + bw / 2, y + 100)
      })
      ctx.textAlign = 'left'

      // 每日行程
      y += 170
      const daysList = (Array.isArray(r.days) ? r.days : []).filter(d => (d.activities || []).length)
      if (daysList.length) {
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif'
        ctx.fillText('每日行程', P, y); y += 46
        const maxDays = 6
        daysList.slice(0, maxDays).forEach((day, di) => {
          const lineY = y + 34
          ctx.fillStyle = 'rgba(255,255,255,0.95)'
          ctx.font = 'bold 28px "PingFang SC","Microsoft YaHei",sans-serif'
          ctx.fillText(`D${di + 1}`, P, lineY)
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.font = '26px "PingFang SC","Microsoft YaHei",sans-serif'
          const acts = (day.activities || []).map(a => a.title).filter(Boolean).slice(0, 3).join('、')
          ctx.fillText(acts || '暂无安排', P + 64, lineY)
          y += 44
        })
        if (daysList.length > maxDays) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)'
          ctx.font = '24px "PingFang SC","Microsoft YaHei",sans-serif'
          ctx.fillText(`…… 共 ${daysList.length} 天，更多请查看完整线路`, P, y + 6)
        }
      }

      // 底部
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '24px "PingFang SC","Microsoft YaHei",sans-serif'
      ctx.fillText('智绘旅游 · 我的旅行线路', P, H - 44)

      const url = canvas.toDataURL('image/png')
      downloadDataUrl(url, `${(r.title || '线路')}分享卡.png`)
      feedback.success('分享卡片已生成')
    }

    function wrapText(ctx, text, maxWidth, x, startY, lineHeight) {
      const chars = Array.from(text)
      let line = ''
      let y = startY
      for (const ch of chars) {
        if (ctx.measureText(line + ch).width > maxWidth) {
          ctx.fillText(line, x, y); line = ch; y += lineHeight
        } else line += ch
      }
      ctx.fillText(line, x, y)
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
    }

    function downloadDataUrl(dataUrl, filename) {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }

    // ---- 打印 / 导出 PDF ----
    function printRoute() {
      if (typeof window === 'undefined' || typeof document === 'undefined') { feedback.info('当前环境不支持打印'); return }
      window.print()
    }

    // ---- 动线地图视图 ----
    const detailView = ref('schedule') // schedule | map
    const activeMapDay = ref(null) // 高亮的某天（null = 全部）

    const DAY_PALETTE = ['#667eea', '#764ba2', '#f7971e', '#2bb3a3', '#e0535b', '#3f7de0', '#8e6bd8', '#d95cb3']
    const dayColor = di => DAY_PALETTE[di % DAY_PALETTE.length]

    // 序列化坐标的确定性哈希，保证同一线路每次布局稳定
    function hashNum(str, salt) {
      let h = 0
      const s = `${salt}:${str}`
      for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
      return h / 0xFFFFFFFF // 0..1
    }

    // 生成动线节点与连线路径（viewBox 0 0 100 70，serpentine 排布）
    const mapPlan = computed(() => {
      const r = routeView.value
      const nodes = []
      let globalIndex = 0
      const days = (r && Array.isArray(r.days)) ? r.days : []
      const all = []
      days.forEach((day, di) => {
        ;(day.activities || []).forEach((act, ai) => {
          all.push({ di, ai, act })
        })
      })
      if (!all.length) return { nodes: [], path: '', dayGroups: [] }

      const columns = 5
      const total = all.length
      const rows = Math.max(1, Math.ceil(total / columns))
      const colStep = 84 / (columns - 1 || 1) // 8..92
      const rowGap = Math.min(22, 60 / (rows || 1))

      // 按访问顺序蛇形排布，保证清晰不重叠；颜色按天区分
      all.forEach((item, i) => {
        const { di, act } = item
        const row = Math.floor(i / columns)
        const col = i % columns
        const x = 10 + (row % 2 === 1 ? (columns - 1 - col) : col) * colStep
        const y = 14 + row * rowGap
        // 用哈希在格子内加小幅抖动，避免完全对齐
        const jx = (hashNum(`${di}-${i}`, 7) - 0.5) * 5
        const jy = (hashNum(`${di}-${i}`, 9) - 0.5) * 4
        nodes.push({
          di, col, row, x: clamp(x + jx, 5, 95), y: clamp(y + jy, 8, 62),
          label: act.title || `活动${i + 1}`, time: act.time || '',
          index: i, color: dayColor(di), key: `${di}-${i}-${act.title}`
        })
      })

      // 依次连线的路径
      const path = nodes.map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ')

      // 天分组（用于图例）
      const dayGroups = days.map((day, di) => ({
        di,
        color: dayColor(di),
        date: day.date || '',
        count: (day.activities || []).length
      })).filter(g => g.count > 0)

      return { nodes, path, dayGroups }
    })

    function clamp(v, min, max) { return Math.min(max, Math.max(min, v)) }

    // ---- 天数管理 ----
    function ensureDraft() {
      routeView.value // 触发 draft 初始化
      return draft.value
    }
    function ensureDays() {
      if (!ensureDraft()) return
      if (!Array.isArray(draft.value.days)) draft.value.days = []
      const target = duration.value
      while (draft.value.days.length < target) {
        const di = draft.value.days.length
        const date = addCalendarDays(draft.value.startDate, di)
        draft.value.days.push({ date, activities: [], budget: null })
      }
    }

    function addDay() {
      ensureDraft()
      ensureDays()
      if (draft.value.days.length) activeDay.value = draft.value.days.length - 1
    }

    // ---- 活动管理 ----
    function addSuggestedActivity(name) {
      ensureDraft(); ensureDays()
      if (activeDay.value >= draft.value.days.length) activeDay.value = draft.value.days.length - 1
      draft.value.days[activeDay.value].activities.push({
        time: '',
        title: name,
        description: '',
        type: ''
      })
    }

    function addQuickActivity() {
      const name = quickTitle.value.trim()
      if (!name) { feedback.info('请输入活动名称'); return }
      ensureDraft(); ensureDays()
      if (activeDay.value >= draft.value.days.length) activeDay.value = draft.value.days.length - 1
      draft.value.days[activeDay.value].activities.push({
        time: '',
        title: name,
        description: '',
        type: ''
      })
      quickTitle.value = ''
    }

    function removeActivity(di, ai) {
      draft.value.days[di].activities.splice(ai, 1)
    }

    function moveActivity(di, ai, dir) {
      const acts = draft.value.days[di].activities
      const to = ai + dir
      if (to < 0 || to >= acts.length) return
      const [item] = acts.splice(ai, 1)
      acts.splice(to, 0, item)
    }

    // ---- 保存 ----
    function saveRoute() {
      ensureDraft()
      if (!draft.value.title.trim()) { feedback.error('请输入线路名称'); return }
      ensureDays()
      // 保留原始 id 以便更新而非新增
      const originalId = draft.value.__id ?? routeId.value
      const cleaned = JSON.parse(JSON.stringify(draft.value))
      delete cleaned.__srcId
      delete cleaned.__id
      delete cleaned.createdAt
      if (originalId) cleaned.id = originalId
      try {
        // 汇总每日预算写入总预算
        const dayBudget = (cleaned.days || []).reduce((s, d) => s + (Number(d.budget) || 0), 0)
        if (dayBudget > 0) cleaned.budget = dayBudget
        travel.saveRoute(cleaned)
        feedback.success('线路已保存')
        const saved = routes.value.find(r => String(r.id) === String(originalId))
        if (saved) { draft.value.id = saved.id; draft.value.__id = saved.id; draft.value.__srcId = saved.id }
      } catch (e) {
        feedback.error(e.message)
      }
    }

    function toggleFavorite() {
      if (!routeId.value) return
      try { travel.toggleRouteFavorite(routeId.value) } catch (e) { feedback.error(e.message) }
    }

    function duplicateRoute() {
      const src = routeData.value
      if (!src) return
      const copy = JSON.parse(JSON.stringify(src))
      delete copy.id
      delete copy.createdAt
      delete copy.updatedAt
      copy.isFavorite = false
      copy.title = `${src.title}（副本）`
      let saved = null
      try { saved = travel.saveRoute(copy) } catch (e) { feedback.error(e.message); return }
      const newId = saved && saved.id ? saved.id : null
      feedback.success('已复制为新线路')
      if (newId) {
        router.replace({ name: 'route-detail', params: { id: String(newId) } })
      }
    }

    function shareRoute() {
      const r = draft.value || routeData.value
      if (!r) return
      const text = itineraryService.exportRoute(r)
      if (!text) { feedback.info('该线路信息不完整，暂无可分享内容。'); return }
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => feedback.success('线路计划已复制到剪贴板'))
          .catch(() => downloadShareText(text, r))
      } else {
        downloadShareText(text, r)
      }
    }

    function downloadShareText(text, r) {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(r.title || '线路')}计划.txt`
      a.click()
      window.URL.revokeObjectURL(url)
      feedback.success('线路计划已导出。')
    }

    function goBack() { router.push({ name: 'routes' }) }

    // ---- 日期格式化 ----
    function formatFullDate(s) {
      if (!s) return ''
      try {
        const d = parseDateOnly(s)
        return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`
      } catch { return s }
    }
    function fullDate(s) {
      if (!s) return ''
      try {
        const d = parseDateOnly(s)
        return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`
      } catch { return s }
    }
    function shortDate(s) {
      if (!s) return ''
      try {
        const d = parseDateOnly(s)
        return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
      } catch { return s }
    }
    function formatMoney(v) {
      const n = Number(v)
      if (!Number.isFinite(n)) return '0'
      return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    }

    return {
      notFound, ready, route: routeView, routeData, activeDay, quickTitle, editingIndex,
      duration, totalAttractions, totalBudget, companionLabel, heroImage, suggestions,
      detailView, activeMapDay, mapPlan, dayColor, departureCountdown, destinationLabel,
      addDay, addSuggestedActivity, addQuickActivity, removeActivity, moveActivity,
      saveRoute, toggleFavorite, shareRoute, duplicateRoute, goBack, shareImage, printRoute,
      persons, stepPersons, perPersonBudget, dailyAvgBudget, dailyBudgetRows,
      calendarCells, monthTitle, jumpToDay,
      formatFullDate, fullDate, shortDate, formatMoney
    }
  }
}
</script>

<style scoped>
.route-detail {
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px 20px 60px;
}

.detail-empty {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  color: var(--text-secondary);
}
.detail-empty .empty-icon {
  font-size: 44px;
  color: var(--primary-2);
}
.detail-empty h1 { color: var(--text-main); margin: 8px 0 0; }
.detail-empty p { color: var(--text-muted); }

/* 顶部 Hero */
.detail-hero {
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  min-height: 260px;
  background-size: cover;
  background-position: center;
  color: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 34px rgba(0,0,0,0.18);
}
.hero-shade {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(10,10,30,0.35) 0%, rgba(10,10,30,0.6) 55%, rgba(10,10,30,0.88) 100%);
}
.hero-back {
  position: relative; z-index: 2;
  display: flex; justify-content: space-between;
  padding: 16px 20px;
}
.back-btn, .fav-btn {
  border: 1px solid rgba(255,255,255,0.25);
  background: rgba(255,255,255,0.12);
  color: #fff;
  border-radius: 999px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(4px);
  transition: all 0.2s;
}
.back-btn:hover { background: rgba(255,255,255,0.25); }
.fav-btn { width: 40px; height: 40px; padding: 0; justify-content: center; }
.fav-btn .favorited { color: #ff6b6b; }
.hero-info {
  position: relative; z-index: 2;
  padding: 8px 24px 24px;
  margin-top: auto;
}
.hero-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 13px; font-weight: 600;
  background: rgba(255,255,255,0.2);
  backdrop-filter: blur(3px);
  margin-bottom: 12px;
}
.hero-badge.done { background: rgba(40,167,69,0.88); }
.hero-info h1 { margin: 0 0 8px; color: #fff; font-size: 28px; text-shadow: 0 2px 10px rgba(0,0,0,0.4); }
.hero-sub { margin: 0 0 12px; color: rgba(255,255,255,0.92); font-size: 14px; display: flex; align-items: center; gap: 6px; }
.hero-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.18);
  font-size: 13px;
  display: inline-flex; align-items: center; gap: 6px;
  backdrop-filter: blur(3px);
}
.chip.theme { background: rgba(102,126,234,0.55); }
.chip.countdown.tone-soon { background: rgba(238,82,83,0.85); }
.chip.countdown.tone-active { background: rgba(43,179,163,0.85); }
.chip.countdown.tone-past { background: rgba(130,135,160,0.75); }
.chip.countdown { font-weight: 600; }
.hero-progress {
  position: relative; z-index: 2;
  display: flex; align-items: center; gap: 12px;
  padding: 14px 24px;
  width: 100%;
}
.progress-label { font-size: 13px; opacity: 0.9; flex-shrink: 0; }
.progress-track { flex: 1; height: 8px; background: rgba(255,255,255,0.25); border-radius: 8px; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, #fff 0%, #4cc9f0 100%); transition: width 0.4s; }
.progress-fill.full { background: #28a745; }
.progress-value { font-weight: 700; font-size: 14px; }

/* 概览条 */
.overview-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 14px;
  margin: 20px 0;
}
.ov-item {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.ov-num { font-size: 22px; font-weight: 700; color: var(--primary); }
.ov-label { font-size: 13px; color: var(--text-muted); }

/* 编辑器 */
.editor {
  background: #fff;
  border-radius: 20px;
  box-shadow: var(--shadow-card);
  padding: 24px;
}
.editor-head h2 { margin: 0 0 4px; font-size: 20px; display: flex; align-items: center; gap: 8px; }
.editor-head h2 svg { color: var(--primary); }
.editor-sub { margin: 0 0 20px; color: var(--text-muted); font-size: 13.5px; }
.editor-layout { display: grid; grid-template-columns: 220px 1fr; gap: 20px; }

/* 天数导航 */
.day-nav { display: flex; flex-direction: column; gap: 8px; }
.day-tab {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.day-tab:hover { border-color: var(--primary-2); background: #f6f8ff; }
.day-tab.active { border-color: transparent; background: var(--gradient-primary); color: #fff; box-shadow: 0 4px 14px rgba(102,126,234,0.3); }
.day-badge {
  width: 32px; height: 32px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 10px;
  background: #eef0f6; color: var(--text-secondary);
  font-weight: 700; font-size: 13px;
}
.day-tab.active .day-badge { background: rgba(255,255,255,0.25); color: #fff; }
.day-info { display: flex; flex-direction: column; }
.day-date { font-weight: 600; font-size: 14px; }
.day-count { font-size: 12px; opacity: 0.8; }
.day-add-tab {
  padding: 10px;
  border: 2px dashed var(--border-strong, #ccd3e8);
  border-radius: 12px;
  background: transparent;
  color: var(--primary-2);
  cursor: pointer;
  font-size: 16px;
}
.day-add-tab:hover { border-color: var(--primary-2); background: #f6f8ff; }

/* 当天面板 */
.day-panel {
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
}
.day-panel-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.day-panel-head h3 { margin: 0; font-size: 18px; }
.day-date-full { color: var(--text-muted); font-weight: normal; font-size: 14px; }
.day-budget-input { display: flex; align-items: center; gap: 8px; }
.day-budget-input label { font-size: 13px; color: var(--text-muted); }
.budget-wrap {
  display: flex; align-items: center; gap: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 10px;
  background: #fbfcfe;
}
.budget-wrap span { color: var(--text-muted); }
.budget-wrap input {
  border: none; outline: none; background: transparent;
  width: 90px; padding: 6px 0; font-size: 14px;
}
.budget-wrap input:focus { color: var(--primary); }

/* 活动时间线 */
.activity-timeline { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.activity-row {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.activity-row:hover { border-color: var(--primary-2); box-shadow: var(--shadow-card); }
.activity-row.editing { border-color: var(--primary-2); box-shadow: 0 0 0 3px rgba(67,97,238,0.1); }
.row-drag { color: var(--text-muted); padding-top: 10px; cursor: grab; }
.row-time {
  display: flex; align-items: center; gap: 6px;
  min-width: 92px;
  color: var(--primary-2);
}
.row-time input { border: none; outline: none; background: transparent; width: 72px; font-size: 14px; font-weight: 600; color: var(--primary); border-bottom: 1px dashed transparent; }
.row-time input:focus { border-bottom-color: var(--primary-2); }
.row-main { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.row-title-row { display: flex; align-items: center; gap: 6px; }
.row-title {
  flex: 1;
  border: none; outline: none;
  font-size: 15px; font-weight: 600;
  color: var(--text-main);
  background: transparent;
  border-bottom: 1px dashed transparent;
  padding: 2px 0;
}
.row-title:focus { border-bottom-color: var(--primary-2); }
.row-desc {
  border: none; outline: none;
  font-size: 13px; color: var(--text-muted);
  background: #f7f9ff;
  border-radius: 6px;
  padding: 6px 10px;
}
.row-desc:focus { box-shadow: 0 0 0 2px rgba(67,97,238,0.12); }
.icon-action {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}
.icon-action:hover:not(:disabled) { color: var(--primary); border-color: var(--primary-2); background: #f4f6ff; }
.icon-action.delete:hover:not(:disabled) { color: var(--danger); border-color: var(--danger); background: #fff4f4; }
.icon-action:disabled { opacity: 0.35; cursor: not-allowed; }

.day-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 30px; color: var(--text-muted);
}
.day-empty svg { font-size: 30px; color: var(--primary-2); }
.day-empty p { margin: 0; }

/* 添加活动 */
.add-activity { border-top: 1px dashed var(--border); padding-top: 16px; }
.add-quick { display: flex; gap: 10px; margin-bottom: 14px; }
.add-quick input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  outline: none;
}
.add-quick input:focus { border-color: var(--primary-2); box-shadow: 0 0 0 3px rgba(67,97,238,0.1); }
.suggestion-box { background: #fafbff; border: 1px dashed var(--border-strong, #ccd3e8); border-radius: 12px; padding: 12px 14px; }
.suggestion-title { margin: 0 0 10px; font-size: 13px; color: var(--primary-2); font-weight: 600; display: flex; align-items: center; gap: 6px; }
.suggestion-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.suggestion-chip {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #fff;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.suggestion-chip:hover { border-color: var(--primary-2); color: var(--primary); background: #f4f6ff; }

/* 底部操作 */
.detail-actions {
  display: flex; justify-content: flex-end; gap: 12px;
  margin-top: 24px;
  flex-wrap: wrap;
}
.btn-ghost {
  background: #fff;
  color: var(--primary);
  border: 1px solid var(--border-strong, #d8ddf0);
}
.btn-ghost:hover { border-color: var(--primary-2); background: #f4f6ff; }

/* —— 视图切换标签 —— */
.detail-tabs {
  display: inline-flex;
  gap: 6px;
  padding: 5px;
  background: #eef0f6;
  border-radius: 14px;
  margin-bottom: 18px;
}
.detail-tabs button {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 20px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.detail-tabs button.active {
  background: #fff;
  color: var(--primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

/* —— 日程面板 / 地图面板（替代原 .editor 卡片） —— */
.schedule-panel,
.map-panel {
  background: #fff;
  border-radius: 20px;
  box-shadow: var(--shadow-card);
  padding: 24px;
}
.editor-head h2, .map-head h2 {
  margin: 0 0 4px; font-size: 20px;
  display: flex; align-items: center; gap: 8px;
}
.editor-head h2 svg, .map-head h2 svg { color: var(--primary); }
.editor-sub { margin: 0 0 20px; color: var(--text-muted); font-size: 13.5px; }

/* —— 动线地图 —— */
.map-head { margin-bottom: 16px; }
.map-wrap { display: flex; flex-direction: column; gap: 16px; }
.itinerary-map {
  width: 100%;
  height: auto;
  border-radius: 14px;
  box-shadow: inset 0 0 0 1px var(--border);
  background: #f4f6ff;
}
.map-node {
  transition: opacity 0.25s;
  cursor: default;
}
.map-node.dimmed { opacity: 0.22; }
.map-legend { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.legend-chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: #fff;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.legend-chip:hover { border-color: var(--primary-2); color: var(--primary); }
.legend-chip.active { background: #f4f6ff; border-color: var(--primary-2); color: var(--primary); }
.legend-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.legend-hint { margin: 0; font-size: 12.5px; color: var(--text-muted); width: 100%; }
.map-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 44px; color: var(--text-muted); text-align: center;
}
.map-empty svg { font-size: 36px; color: var(--primary-2); }
.map-empty p { margin: 0; }

/* —— 预算明细 —— */
.budget-panel,
.calendar-panel {
  background: #fff;
  border-radius: 20px;
  box-shadow: var(--shadow-card);
  padding: 24px;
}
.budget-summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}
.budget-summary-card {
  border-radius: 14px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #f6f8ff;
  border: 1px solid var(--border);
}
.budget-summary-card.total { background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; border: none; }
.budget-summary-card.per-person { background: linear-gradient(135deg, #f7971e, #ffc53d); color: #fff; border: none; }
.bs-label { font-size: 13px; opacity: 0.9; }
.budget-summary-card.total .bs-label { color: rgba(255,255,255,0.9); }
.budget-summary-card.per-person .bs-label { color: rgba(255,255,255,0.92); }
.bs-value { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.budget-summary-card.total .bs-value { color: #fff; }
.budget-summary-card.per-person .bs-value { color: #fff; }
.bs-note { font-size: 12px; opacity: 0.8; }
.budget-summary-card.per-person .bs-note { color: rgba(255,255,255,0.85); }
.budget-row-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
  margin-bottom: 16px;
}
.budget-row-head h3 { margin: 0; font-size: 16px; }
.persons-input { display: flex; align-items: center; gap: 10px; }
.persons-input label { font-size: 13px; color: var(--text-muted); }
.persons-stepper {
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid var(--border); border-radius: 10px; padding: 4px;
  background: #fbfcfe;
}
.persons-stepper button {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 8px;
  background: #eef0f6; color: var(--text-secondary);
  cursor: pointer; font-size: 12px;
}
.persons-stepper button:hover:not(:disabled) { background: var(--primary); color: #fff; }
.persons-stepper button:disabled { opacity: 0.4; cursor: not-allowed; }
.persons-num { min-width: 32px; text-align: center; font-weight: 700; font-size: 16px; }
.budget-days { display: flex; flex-direction: column; gap: 12px; }
.budget-day-row {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
}
.budget-day-row.unset { opacity: 0.7; }
.bd-left { display: flex; align-items: center; gap: 12px; min-width: 150px; }
.bd-badge {
  width: 36px; height: 36px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 10px;
  background: var(--gradient-primary); color: #fff;
  font-weight: 700; font-size: 13px;
}
.bd-info { display: flex; flex-direction: column; }
.bd-date { font-weight: 600; font-size: 14px; }
.bd-activities { font-size: 12px; color: var(--text-muted); }
.bd-bars { flex: 1; }
.bd-track { height: 8px; background: #eef0f6; border-radius: 8px; overflow: hidden; margin-bottom: 6px; }
.bd-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, #667eea, #f7971e); transition: width 0.4s; }
.bd-meta { display: flex; justify-content: flex-end; }
.bd-amount { font-size: 13px; font-weight: 600; color: var(--primary); }
.bd-amount.muted { color: var(--text-muted); font-weight: normal; }
.bd-amount small { color: var(--text-muted); font-weight: normal; margin-left: 6px; }
.budget-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 40px; color: var(--text-muted); text-align: center;
}
.budget-empty svg { font-size: 34px; color: var(--primary-2); }
.budget-empty p { margin: 0; }

/* —— 行程日历 —— */
.mini-calendar {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 20px;
  background: #fbfcfe;
}
.cal-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
  margin-bottom: 12px;
}
.cal-month { font-size: 17px; font-weight: 700; }
.cal-legend { display: flex; gap: 14px; font-size: 12.5px; color: var(--text-muted); }
.legend-sample { display: inline-flex; align-items: center; gap: 6px; }
.legend-sample i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.legend-sample.travel i { background: var(--gradient-primary); }
.legend-sample.today i { background: #f7971e; border-radius: 50%; }
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.cal-weekday {
  text-align: center; font-size: 12px; color: var(--text-muted);
  padding: 4px 0;
}
.cal-cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px;
  color: var(--text-main);
}
.cal-cell.out { opacity: 0; }
.cal-cell.today { background: #f7971e; color: #fff; font-weight: 700; }
.cal-cell.travel { background: var(--gradient-primary); color: #fff; font-weight: 700; }
.cal-daynum { line-height: 1; }
.cal-dot {
  position: absolute; bottom: 5px;
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(255,255,255,0.9);
}
.cal-day-summaries { display: flex; flex-direction: column; gap: 8px; }
.cal-day-summary {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border); border-radius: 10px;
  background: #fff;
}
.cds-badge {
  width: 30px; height: 30px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px; background: #eef0f6; color: var(--text-secondary);
  font-weight: 700; font-size: 12px;
}
.cds-date { flex: 1; font-size: 13.5px; color: var(--text-secondary); }
.cds-link {
  border: none; background: none; color: var(--primary);
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.cds-link:hover { text-decoration: underline; }

/* —— 打印样式 —— */
@media print {
  .detail-hero .hero-back { display: none; }
  .detail-tabs, .detail-actions, .row-drag .icon-action,
  .add-activity, .cds-link, .fav-btn, .suggestion-box { display: none !important; }
  .route-detail { max-width: 100%; padding: 0; }
  .detail-hero { min-height: auto; }
}

@media (max-width: 820px) {
  .editor-layout { grid-template-columns: 1fr; }
  .day-nav { flex-direction: row; overflow-x: auto; padding-bottom: 6px; }
  .day-tab { min-width: 150px; }
  .detail-hero { min-height: 220px; }
}
</style>
