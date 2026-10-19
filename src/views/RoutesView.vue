<template>
<div class="routes-container">
<p v-if="travel.storageError" role="alert" class="storage-error">{{ travel.storageError }}</p>
<PageHeader icon="route" title="线路制定" subtitle="智能规划你的专属旅游路线，或浏览为你推荐的热门行程" />

<!-- 顶部统计横幅 -->
<div class="stats-banner">
  <div class="stats-banner-bg" aria-hidden="true">
    <span class="orb orb-1"></span>
    <span class="orb orb-2"></span>
    <span class="orb orb-3"></span>
  </div>
  <div class="stats-banner-inner">
    <div class="stat-block">
      <span class="stat-icon"><font-awesome-icon :icon="['fas', 'route']" /></span>
      <div class="stat-text">
        <span class="stat-value">{{ myRoutes.length }}</span>
        <span class="stat-label">我的线路</span>
      </div>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-block">
      <span class="stat-icon"><font-awesome-icon :icon="['fas', 'heart']" /></span>
      <div class="stat-text">
        <span class="stat-value">{{ favoriteCount }}</span>
        <span class="stat-label">收藏线路</span>
      </div>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-block">
      <span class="stat-icon"><font-awesome-icon :icon="['fas', 'calendar-check']" /></span>
      <div class="stat-text">
        <span class="stat-value">{{ plannedDayCount }}</span>
        <span class="stat-label">规划天数</span>
      </div>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-block">
      <span class="stat-icon"><font-awesome-icon :icon="['fas', 'wand-magic-sparkles']" /></span>
      <div class="stat-text">
        <span class="stat-value">{{ smartRecommendations.length }}</span>
        <span class="stat-label">智能推荐</span>
      </div>
    </div>
  </div>
</div>

<!-- 即将出行 -->
<div v-if="upcomingRoutes.length" class="upcoming-section">
  <div class="section-head">
    <h2 class="section-title"><font-awesome-icon :icon="['fas', 'rocket']" /> 即将出行</h2>
    <p class="section-sub">按出发日期，先看到最近要出发的旅程</p>
  </div>
  <div class="upcoming-strip">
    <div
      v-for="route in upcomingRoutes"
      :key="route.id"
      class="upcoming-card"
      :class="'tone-' + ((countdownInfo(route) || {}).tone || 'normal')"
      @click="openRoute(route.id)"
    >
      <div class="upcoming-countdown">
        <span class="count-label">{{ (countdownInfo(route) || {}).label }}</span>
      </div>
      <div class="upcoming-info">
        <h3>{{ route.title }}</h3>
        <p class="upcoming-meta">
          <font-awesome-icon :icon="['fas', 'calendar-days']" />
          {{ formatDate(route.startDate) }} — {{ formatDate(route.endDate) }}
        </p>
      </div>
      <span class="upcoming-arrow"><font-awesome-icon :icon="['fas', 'chevron-right']" /></span>
    </div>
  </div>
</div>

<!-- 顶部控制区 -->
<div class="control-bar">
<div class="control-panel">
<div class="left-controls">
<button class="btn btn-primary" @click="showCreateModal">
<font-awesome-icon :icon="['fas', 'plus']" />
新建线路
</button>
<button class="btn btn-secondary" @click="toggleViewMode">
<font-awesome-icon :icon="['fas', viewMode === 'grid' ? 'list' : 'th-large']" />
{{ viewMode === 'grid' ? '列表视图' : '网格视图' }}
</button>
</div>

<div class="right-controls">
<div class="search-box">
<input
v-model="searchQuery"
type="text"
placeholder="搜索我的线路..."
>
<font-awesome-icon :icon="['fas', 'magnifying-glass']" class="search-icon" />
</div>
</div>
</div>

<!-- 我的线路筛选 -->
<div class="filter-tabs">
  <button
    v-for="f in filterTabs"
    :key="f.key"
    class="filter-tab"
    :class="{ active: routeFilter === f.key }"
    @click="routeFilter = f.key"
  >
    <font-awesome-icon :icon="['fas', f.icon]" />
    {{ f.label }}
    <span class="filter-count">{{ getFilterCount(f.key) }}</span>
  </button>
</div>
</div>

<!-- 智能推荐区 -->
<div class="recommendation-section">
<div class="section-head">
<h2 class="section-title">
<font-awesome-icon :icon="['fas', 'wand-magic-sparkles']" />
智能推荐线路
</h2>
<p class="section-sub">精选热门行程，点击即可一键采用</p>
</div>

<div class="recommendation-cards">
<div
v-for="(rec, index) in smartRecommendations"
:key="'rec-'+index"
class="recommendation-card"
:style="{ animationDelay: (index * 0.08) + 's' }"
@click="applyRecommendation(rec)"
>
<div class="card-cover" :style="{ backgroundImage: 'url(' + rec.coverImage + ')' }">
<div class="cover-shade"></div>
<div class="card-header">
<h3>{{ rec.title }}</h3>
<span class="badge" :class="rec.difficulty">
{{ {easy: '轻松', medium: '中等', challenging: '挑战'}[rec.difficulty] }}
</span>
</div>
</div>
<div class="card-body">
<p class="rec-desc">{{ rec.description }}</p>
<div class="stats">
<div class="stat-item">
<font-awesome-icon :icon="['fas', 'clock']" />
<span>{{ rec.duration }}天</span>
</div>
<div class="stat-item">
<font-awesome-icon :icon="['fas', 'location-dot']" />
<span>{{ rec.attractions.length }}个景点</span>
</div>
<div class="stat-item">
<font-awesome-icon :icon="['fas', 'walking']" />
<span>{{ rec.distance }}公里</span>
</div>
</div>
<div class="tags">
<span
v-for="tag in rec.tags"
:key="tag"
class="tag"
:style="{backgroundColor: tagColors[tag] || '#eee', color: tagColors[tag] ? '#fff' : '#666'}"
>
{{ tag }}
</span>
</div>
</div>
<div class="card-footer">
<button class="btn btn-sm btn-ghost" @click.stop="previewRecommendation(rec)">
<font-awesome-icon :icon="['fas', 'eye']" />
预览详情
</button>
<button class="btn btn-sm btn-primary" @click.stop="applyRecommendation(rec)">
<font-awesome-icon :icon="['fas', 'plus']" />
采用此线路
</button>
</div>
</div>
</div>
</div>

<!-- 我的线路区 -->
<div class="my-routes-section">
<div class="section-head">
<h2 class="section-title">
<font-awesome-icon :icon="['fas', 'route']" />
我的旅行线路
<span class="counter">{{ filteredRoutes.length }}</span>
</h2>
<div class="section-head-actions">
<p v-if="filteredRoutes.length" class="section-sub">
共 {{ filteredRoutes.length }} 条线路 · 规划旅途 × {{ plannedDayCount }} 天
</p>
</div>
</div>

<!-- 网格视图 -->
<div v-if="viewMode === 'grid'" class="route-grid">
<div
v-for="route in filteredRoutes"
:key="route.id"
class="route-card"
@click="openRoute(route.id)"
>
<div class="card-image">
<app-image :src="route.coverImage" :alt="route.title" />
<div class="favorite-btn" @click.stop="toggleFavorite(route.id)">
<font-awesome-icon
:icon="['fas', route.isFavorite ? 'heart' : 'heart-circle-plus']"
:class="{ 'favorited': route.isFavorite }"
/>
</div>
<span v-if="route.progress >= 100" class="done-badge">
<font-awesome-icon :icon="['fas', 'check']" /> 已完成
</span>
<span
v-else-if="countdownShort(route)"
class="upcoming-badge"
:class="'tone-' + ((countdownInfo(route) || {}).tone || 'normal')"
>
<font-awesome-icon :icon="['fas', 'clock']" /> {{ countdownShort(route) }}
</span>
</div>
<div class="card-content">
<span v-if="route.themes && route.themes.length" class="theme-chip">{{ route.themes[0] }}</span>
<h3>{{ route.title }}</h3>
<div class="meta">
<span class="date">
<font-awesome-icon :icon="['fas', 'calendar-days']" />
{{ formatDate(route.startDate) }} - {{ formatDate(route.endDate) }}
</span>
<span class="duration">
<font-awesome-icon :icon="['fas', 'clock']" />
{{ calculateDuration(route.startDate, route.endDate) }}天
</span>
</div>
<div class="progress-container">
<div class="progress-bar" :style="{width: route.progress + '%'}" :class="{ full: route.progress >= 100 }"></div>
<span class="progress-text">规划进度 {{ route.progress }}%</span>
</div>
</div>
<div class="card-actions">
<button class="btn btn-sm btn-ghost icon-btn-sm" title="编辑日程" @click.stop="openRoute(route.id)">
<font-awesome-icon :icon="['fas', 'pen-to-square']" />
</button>
<button class="btn btn-sm btn-ghost icon-btn-sm" title="分享" @click.stop="shareRoute(route.id)">
<font-awesome-icon :icon="['fas', 'share-nodes']" />
</button>
<button class="btn btn-sm btn-ghost icon-btn-sm" title="复制为新线路" @click.stop="duplicateRoute(route.id)">
<font-awesome-icon :icon="['fas', 'clone']" />
</button>
<button class="btn btn-sm btn-ghost icon-btn-sm danger" title="删除" @click.stop="deleteRoute(route.id)">
<font-awesome-icon :icon="['fas', 'trash']" />
</button>
</div>
</div>

<div class="empty-card" @click="showCreateModal">
<font-awesome-icon :icon="['fas', 'plus']" size="2x" />
<p>创建新线路</p>
<small>规划属于你的专属旅程</small>
</div>
</div>

<!-- 列表视图 -->
<div v-else class="route-list">
<div class="list-header">
<div class="col col-title">线路名称</div>
<div class="col col-date">出行日期</div>
<div class="col col-duration">天数</div>
<div class="col col-progress">进度</div>
<div class="col col-actions">操作</div>
</div>

<div v-if="filteredRoutes.length === 0" class="list-empty">
<span class="empty-illustration"><font-awesome-icon :icon="['fas', 'route']" /></span>
<p>暂无线路</p>
<small>还没有规划任何旅程，点击下方按钮开始吧</small>
<button class="btn btn-primary btn-sm" @click="showCreateModal">去创建</button>
</div>

<div
v-for="route in filteredRoutes"
:key="route.id"
class="list-item"
@click="openRoute(route.id)"
>
<div class="col col-title">
<font-awesome-icon
:icon="['fas', route.isFavorite ? 'heart' : 'heart-circle-plus']"
:class="{ 'favorited': route.isFavorite }"
@click.stop="toggleFavorite(route.id)"
/>
<span>{{ route.title }}</span>
<span v-if="route.progress >= 100" class="mini-done"><font-awesome-icon :icon="['fas', 'check']" /></span>
</div>
<div class="col col-date">
<font-awesome-icon :icon="['fas', 'calendar-days']" class="col-icon" />
{{ formatDate(route.startDate) }} - {{ formatDate(route.endDate) }}
</div>
<div class="col col-duration">
<font-awesome-icon :icon="['fas', 'clock']" class="col-icon" />
{{ calculateDuration(route.startDate, route.endDate) }}天
</div>
<div class="col col-progress">
<div class="progress-container">
<div class="progress-bar" :style="{width: route.progress + '%'}" :class="{ full: route.progress >= 100 }"></div>
<span class="progress-text">{{ route.progress }}%</span>
</div>
</div>
<div class="col col-actions">
<button class="btn btn-sm btn-ghost icon-btn-sm" title="编辑日程" @click.stop="openRoute(route.id)">
<font-awesome-icon :icon="['fas', 'pen-to-square']" />
</button>
<button class="btn btn-sm btn-ghost icon-btn-sm" title="分享" @click.stop="shareRoute(route.id)">
<font-awesome-icon :icon="['fas', 'share-nodes']" />
</button>
<button class="btn btn-sm btn-ghost icon-btn-sm" title="复制为新线路" @click.stop="duplicateRoute(route.id)">
<font-awesome-icon :icon="['fas', 'clone']" />
</button>
<button class="btn btn-sm btn-ghost icon-btn-sm danger" title="删除" @click.stop="deleteRoute(route.id)">
<font-awesome-icon :icon="['fas', 'trash']" />
</button>
</div>
</div>
</div>
</div>

<!-- 创建/编辑线路模态框 -->
<div v-if="showModal" class="modal-overlay" @click.self="closeModal" role="dialog" aria-modal="true" :aria-label="isEditing ? '编辑线路' : '创建新线路'">
<div class="route-modal">
<div class="modal-head">
<span class="modal-head-icon"><font-awesome-icon :icon="['fas', isEditing ? 'pen-to-square' : 'plus']" /></span>
<div>
<h2>{{ isEditing ? '编辑线路' : '创建新线路' }}</h2>
<p class="modal-subtitle-sm">{{ isEditing ? '调整你的旅程安排' : '开始规划一段专属旅程' }}</p>
</div>
</div>
<button class="close-btn" @click="closeModal">
<font-awesome-icon :icon="['fas', 'xmark']" />
</button>

<div class="modal-body">
<div class="form-section">
<div class="form-section-title"><span>基本资料</span></div>
<div class="form-group">
<label>线路名称</label>
<div class="input-wrap">
<font-awesome-icon :icon="['fas', 'signature']" class="input-icon" />
<input v-model="currentRoute.title" type="text" placeholder="例如: 北京三日文化之旅">
</div>
</div>

<div class="form-row">
<div class="form-group">
<label>出发日期</label>
<div class="input-wrap">
<font-awesome-icon :icon="['fas', 'calendar-day']" class="input-icon" />
<input v-model="currentRoute.startDate" type="date">
</div>
</div>
<div class="form-group">
<label>结束日期</label>
<div class="input-wrap">
<font-awesome-icon :icon="['fas', 'calendar-check']" class="input-icon" />
<input v-model="currentRoute.endDate" type="date" :min="currentRoute.startDate">
</div>
</div>
</div>

<div class="form-group">
<label>目的地（可添加多个城市）</label>
<div class="destination-input">
<div class="dest-add-row">
<select v-model="pendingDestination" class="dest-select">
<option value="">选择目的地</option>
<option v-for="d in destinationOptions" :key="d" :value="d">{{ d }}</option>
</select>
<button class="btn btn-sm btn-ghost" type="button" @click="addDestination">+ 添加</button>
</div>
<div v-if="currentRoute.destinations.length" class="dest-tags">
<span v-for="(d, di) in currentRoute.destinations" :key="d + di" class="dest-tag">
{{ d }}
<font-awesome-icon :icon="['fas', 'xmark']" class="dest-remove" @click="removeDestination(di)" />
</span>
</div>
<p v-else class="dest-hint">可选，用于标记「多城市」行程</p>
</div>
</div>
</div>

<div class="form-section">
<div class="form-section-title"><span>风格与偏好</span></div>
<div class="form-group">
<label>旅行主题（可多选）</label>
<div class="theme-tags">
<span
v-for="theme in travelThemes"
:key="theme"
class="tag"
:class="{active: currentRoute.themes.includes(theme)}"
@click="toggleTheme(theme)"
>
<font-awesome-icon v-if="currentRoute.themes.includes(theme)" :icon="['fas', 'check']" class="tag-check" />
{{ theme }}
</span>
</div>
</div>

<div class="form-group">
<label>同行人员</label>
<div class="companion-selector">
<div
v-for="type in companionTypes"
:key="type.value"
class="companion-option"
:class="{active: currentRoute.companion === type.value}"
@click="currentRoute.companion = type.value"
>
<font-awesome-icon :icon="['fas', type.icon]" />
<span>{{ type.label }}</span>
</div>
</div>
</div>

<div class="form-group">
<label>行程偏好</label>
<div class="preference-sliders">
<div class="slider-item">
<span>文化历史</span>
<input
v-model="currentRoute.preferences.culture"
type="range"
min="0"
max="100"
>
<span>自然风光</span>
</div>
<div class="slider-item">
<span>轻松休闲</span>
<input
v-model="currentRoute.preferences.relaxation"
type="range"
min="0"
max="100"
>
<span>冒险刺激</span>
</div>
<div class="slider-item">
<span>经济实惠</span>
<input
v-model="currentRoute.preferences.budget"
type="range"
min="0"
max="100"
>
<span>高端奢华</span>
</div>
</div>
</div>
</div>

<div class="modal-footer">
<button class="btn btn-secondary" @click="closeModal">取消</button>
<button class="btn btn-primary" @click="saveRoute">
{{ isEditing ? '保存更改' : '创建线路' }}
</button>
</div>
</div>
</div>
</div>

<!-- 线路预览模态框 -->
<div v-if="previewData" class="modal-overlay" @click.self="previewData = null" role="dialog" aria-modal="true" aria-label="线路预览">
<div class="preview-modal">
<button class="close-btn" @click="previewData = null">
<font-awesome-icon :icon="['fas', 'xmark']" />
</button>

<div class="preview-hero" :style="{ backgroundImage: 'url(' + previewData.coverImage + ')' }">
<div class="preview-hero-shade"></div>
<span class="preview-badge" :class="previewData.difficulty">
{{ {easy: '轻松', medium: '中等', challenging: '挑战'}[previewData.difficulty] }}
</span>
<div class="preview-hero-info">
<h2>{{ previewData.title }}</h2>
<p class="subtitle">{{ previewData.description }}</p>
<div class="preview-stats">
<span><font-awesome-icon :icon="['fas', 'clock']" /> {{ previewData.duration }}天</span>
<span><font-awesome-icon :icon="['fas', 'location-dot']" /> {{ previewData.attractions.length }}个景点</span>
<span><font-awesome-icon :icon="['fas', 'walking']" /> {{ previewData.distance }}公里</span>
</div>
</div>
</div>

<div class="preview-content">
<div class="day-tabs">
<button
v-for="(day, index) in previewDays"
:key="index"
:class="{active: activeDay === index}"
@click="activeDay = index"
>
第{{ index + 1 }}天
</button>
</div>

<div class="day-content">
<h3>第{{ activeDay + 1 }}天行程</h3>

<div class="attraction-list">
<div
v-for="(item, idx) in previewDays[activeDay]"
:key="idx"
class="attraction-item"
>
<div class="time-badge">{{ item.time }}</div>
<div class="attraction-card">
<app-image :src="item.image" :alt="item.name" />
<div class="attraction-info">
<h4>{{ item.name }}</h4>
<div class="attraction-meta">
<span class="rating">
<font-awesome-icon :icon="['fas', 'star']" />
{{ item.rating }}
</span>
<span class="duration">
<font-awesome-icon :icon="['fas', 'clock']" />
建议停留: {{ item.duration }}
</span>
</div>
<p class="description">{{ item.description }}</p>
</div>
</div>
</div>
</div>
</div>
</div>

<div class="preview-footer">
<button class="btn btn-secondary" @click="previewData = null">关闭</button>
<button class="btn btn-primary" @click="applyRecommendation(previewData)">
<font-awesome-icon :icon="['fas', 'wand-magic-sparkles']" />
应用此线路
</button>
</div>
</div>
</div>

<!-- 智能行程规划按钮 -->
<div class="smart-itinerary-section">
  <button class="smart-itinerary-btn" @click="showItineraryModal = true">
    <font-awesome-icon :icon="['fas', 'wand-magic-sparkles']" />
    智能行程规划
  </button>
</div>

<!-- 智能行程规划模态框 -->
<div v-if="showItineraryModal" class="modal-overlay" @click.self="closeItineraryModal" role="dialog" aria-modal="true" aria-label="智能行程规划">
  <div class="itinerary-modal">
    <button class="close-btn" @click="closeItineraryModal">
      <font-awesome-icon :icon="['fas', 'xmark']" />
    </button>

    <div class="itinerary-head">
      <span class="itinerary-head-icon"><font-awesome-icon :icon="['fas', 'wand-magic-sparkles']" /></span>
      <div>
        <h2>智能行程规划</h2>
        <p class="modal-subtitle">AI 为您定制完美旅行计划</p>
      </div>
    </div>

    <div class="itinerary-form">
      <div class="form-section">
      <div class="form-group">
        <label>目的地</label>
        <select v-model="itineraryPlan.destination" required>
          <option value="">请选择目的地</option>
          <option value="北京">北京</option>
          <option value="上海">上海</option>
          <option value="广州">广州</option>
          <option value="深圳">深圳</option>
          <option value="成都">成都</option>
          <option value="杭州">杭州</option>
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>出发日期</label>
          <input v-model="itineraryPlan.startDate" type="date" required />
        </div>
        <div class="form-group">
          <label>返回日期</label>
          <input v-model="itineraryPlan.endDate" type="date" :min="itineraryPlan.startDate" required />
        </div>
      </div>

      <div class="form-group">
        <label>旅行预算（元）</label>
        <div class="input-wrap">
          <font-awesome-icon :icon="['fas', 'yen-sign']" class="input-icon" />
          <input v-model.number="itineraryPlan.budget" type="number" min="0.01" step="0.01" placeholder="5000" required />
        </div>
      </div>

      <div class="form-group">
        <label>兴趣偏好（多选）</label>
        <div class="preference-checkboxes">
          <label v-for="pref in preferences" :key="pref.value" class="checkbox-item">
            <input type="checkbox" :value="pref.value" v-model="itineraryPlan.preferences" />
            <span>{{ pref.label }}</span>
          </label>
        </div>
      </div>
      </div>

      <button class="btn btn-primary generate-btn" @click="generateItinerary">
        <font-awesome-icon :icon="['fas', 'wand-magic-sparkles']" />
        生成智能行程
      </button>
    </div>

    <!-- 生成的行程展示 -->
    <div v-if="generatedItinerary" class="generated-itinerary">
      <h3>推荐行程方案</h3>
      <div class="itinerary-summary">
        <div class="summary-item">
          <font-awesome-icon :icon="['fas', 'calendar-days']" />
          <span>{{ generatedItinerary.days?.length || 0 }}天行程</span>
        </div>
        <div class="summary-item">
          <font-awesome-icon :icon="['fas', 'location-dot']" />
          <span>{{ generatedItinerary.destination }}</span>
        </div>
        <div class="summary-item">
          <font-awesome-icon :icon="['fas', 'dollar-sign']" />
          <span>预算: ¥{{ generatedItinerary.budget }}</span>
        </div>
      </div>

      <div class="daily-plans">
        <div v-for="(day, index) in generatedItinerary.days" :key="index" class="day-plan">
          <h4>第{{ index + 1 }}天 - {{ day.date }}</h4>
          <div class="activities-list">
            <p v-if="day.activities.length === 0">暂无匹配活动，可自行补充。</p>
            <div v-for="(activity, idx) in day.activities" :key="idx" class="activity">
              <span class="activity-time">{{ activity.time }}</span>
              <div class="activity-details">
                <strong>{{ activity.title }}</strong>
                <p>{{ activity.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="itinerary-actions">
        <button class="btn btn-secondary" @click="exportItineraryPlan">
          <font-awesome-icon :icon="['fas', 'download']" />
          导出行程
        </button>
        <button class="btn btn-primary" @click="saveAsRoute">
          <font-awesome-icon :icon="['fas', 'save']" />
          保存为线路
        </button>
      </div>
    </div>
  </div>
</div>
</div>
</template>

<script>
import { useFeedback } from '../composables/useFeedback.js'
import AppImage from '../ui/AppImage.js'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useTravelStore } from '../stores/travel.js'
import itineraryService from '../services/itineraryService'
import { inclusiveDayCount, parseDateOnly, localDateString } from '../utils/date.js'
import { FontAwesomeIcon } from '../ui/fontAwesome.js'
import PageHeader from '../components/PageHeader.vue'

export default {
components: { AppImage, FontAwesomeIcon, PageHeader },
setup() {
    const feedback = useFeedback()
const router = useRouter()
const travel = useTravelStore()
const { routes: myRoutes } = storeToRefs(travel)
let draftOwnerId = travel.ownerId
let itineraryOwnerId = travel.ownerId
// 视图模式控制
const viewMode = ref('grid') // 'grid' 或 'list'
const toggleViewMode = () => {
viewMode.value = viewMode.value === 'grid' ? 'list' : 'grid'
}

// 搜索功能
const searchQuery = ref('')
// 我的线路筛选
const routeFilter = ref('all') // all | favorite | inProgress | completed
const filterTabs = ref([
  { key: 'all', label: '全部', icon: 'layer-group' },
  { key: 'favorite', label: '我的收藏', icon: 'heart' },
  { key: 'inProgress', label: '规划中', icon: 'pen' },
  { key: 'completed', label: '已完成', icon: 'circle-check' }
])

// 出行倒计时
const today = ref(localDateString())
let clockTimer = null
function refreshToday() {
  today.value = localDateString()
}

// 模态框控制
const showModal = ref(false)
const isEditing = ref(false)
const currentRoute = ref(createNewRoute())

// 预览控制
const previewData = ref(null)
const activeDay = ref(0)

// 智能行程规划新增状态
const showItineraryModal = ref(false)
const itineraryPlan = ref({
  destination: '',
  startDate: '',
  endDate: '',
  budget: null,
  preferences: []
})
const preferences = ref([
  { value: 'culture', label: '文化古迹' },
  { value: 'nature', label: '自然风光' },
  { value: 'food', label: '美食体验' },
  { value: 'art', label: '艺术展览' },
  { value: 'shopping', label: '购物娱乐' }
])
const generatedItinerary = ref(null)

// 键盘可达性：Esc 关闭任意已打开的模态框
function handleKeydown(e) {
  if (e.key !== 'Escape') return
  if (showModal.value) { closeModal(); return }
  if (previewData.value) { previewData.value = null; return }
  if (showItineraryModal.value) { closeItineraryModal(); return }
}
onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown)
    clockTimer = window.setInterval(refreshToday, 60000)
  }
})
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
    if (clockTimer) window.clearInterval(clockTimer)
  }
})

// 智能推荐线路
const smartRecommendations = ref([
{
id: 'rec-1',
title: '故宫长城一日精华游',
description: '适合时间有限的游客，一天内体验北京两大世界遗产',
difficulty: 'medium',
duration: 1,
distance: 12,
attractions: [
{name: '天安门广场', time: '08:00-09:00', rating: 4.7},
{name: '故宫博物院', time: '09:30-12:30', rating: 4.8},
{name: '八达岭长城', time: '14:00-17:00', rating: 4.9}
],
tags: ['世界遗产', '经典路线', '一日游'],
coverImage: '/images/web/route-1.jpg'
},
{
id: 'rec-2',
title: '皇家园林二日游',
description: '深度体验北京最著名的皇家园林，感受皇家气派与园林艺术',
difficulty: 'easy',
duration: 2,
distance: 8,
attractions: [
{name: '颐和园', time: '09:00-12:00', rating: 4.8},
{name: '圆明园遗址公园', time: '13:30-16:30', rating: 4.6},
{name: '北海公园', time: '09:00-11:30', rating: 4.7},
{name: '什刹海', time: '14:00-17:00', rating: 4.5}
],
tags: ['皇家园林', '自然风光', '深度游'],
coverImage: '/images/web/route-2.jpg'
},
{
id: 'rec-3',
title: '北京文化艺术三日行',
description: '探访北京的艺术区、博物馆和文化地标，感受现代与传统的交融',
difficulty: 'medium',
duration: 3,
distance: 15,
attractions: [
{name: '中国国家博物馆', time: '09:00-12:00', rating: 4.9},
{name: '798艺术区', time: '14:00-17:00', rating: 4.6},
{name: '南锣鼓巷', time: '19:00-21:00', rating: 4.4},
{name: '故宫博物院', time: '09:00-13:00', rating: 4.8},
{name: '国家大剧院', time: '14:30-17:30', rating: 4.7},
{name: '北京艺术博物馆', time: '09:00-12:00', rating: 4.5},
{name: '前门大街', time: '14:00-18:00', rating: 4.5}
],
tags: ['文化艺术', '博物馆', '城市探索'],
coverImage: '/images/web/route-3.jpg'
},
{
id: 'rec-4',
title: '北京周边自然风光之旅',
description: '远离城市喧嚣，探索北京周边的自然风光和历史古迹',
difficulty: 'challenging',
duration: 2,
distance: 150,
attractions: [
{name: '慕田峪长城', time: '09:00-13:00', rating: 4.9},
{name: '红螺寺', time: '14:30-17:00', rating: 4.6},
{name: '龙庆峡', time: '09:00-12:00', rating: 4.7},
{name: '永宁古城', time: '13:30-16:30', rating: 4.5}
],
tags: ['自然风光', '户外探险', '小众秘境'],
coverImage: '/images/web/route-4.jpg'
}
])

// 标签和主题数据
const travelThemes = ref([
'历史文化', '自然风光', '美食之旅', '亲子游乐',
'摄影之旅', '户外探险', '城市探索', '乡村度假'
])

// 多目的地支持
const destinationOptions = [
'北京', '上海', '广州', '深圳', '成都', '杭州', '重庆', '西安',
'南京', '苏州', '武汉', '长沙', '厦门', '青岛', '三亚', '丽江',
'大理', '桂林', '哈尔滨', '乌鲁木齐'
]
const pendingDestination = ref('')
function addDestination() {
  const d = (pendingDestination.value || '').trim()
  if (!d) { feedback.info('请先选择目的地'); return }
  if (!Array.isArray(currentRoute.value.destinations)) currentRoute.value.destinations = []
  if (currentRoute.value.destinations.includes(d)) { feedback.info('该目的地已在列表中'); return }
  currentRoute.value.destinations.push(d)
  pendingDestination.value = ''
}
function removeDestination(index) {
  if (Array.isArray(currentRoute.value.destinations)) currentRoute.value.destinations.splice(index, 1)
}

const companionTypes = ref([
{value: 'solo', label: '独自旅行', icon: 'person'},
{value: 'couple', label: '情侣出游', icon: 'heart'},
{value: 'family', label: '家庭亲子', icon: 'children'},
{value: 'friends', label: '朋友结伴', icon: 'user-group'}
])

const tagColors = ref({
'世界遗产': '#ff6b6b',
'经典路线': '#48dbfb',
'一日游': '#1dd1a1',
'深度游': '#feca57',
'网红打卡': '#5f27cd',
'小众秘境': '#00d2d3'
})

// 计算属性
const filteredRoutes = computed(() => {
const q = searchQuery.value.toLowerCase()
return myRoutes.value.filter(route => {
  if (!route.title.toLowerCase().includes(q)) return false
  switch (routeFilter.value) {
    case 'favorite': return !!route.isFavorite
    case 'inProgress': return (route.progress || 0) < 100
    case 'completed': return (route.progress || 0) >= 100
    default: return true
  }
})
})

// 全部收藏线路数（含首页收藏与线路收藏）
const favoriteCount = computed(() => travel.favoriteCount)

// 已规划的总天数
const plannedDayCount = computed(() =>
  myRoutes.value.reduce((sum, route) => {
    try { return sum + inclusiveDayCount(route.startDate, route.endDate) } catch { return sum }
  }, 0)
)

// 各筛选标签对应的计数
const getFilterCount = (key) => {
  const q = searchQuery.value.toLowerCase()
  return myRoutes.value.filter(route => {
    if (!route.title.toLowerCase().includes(q)) return false
    switch (key) {
      case 'favorite': return !!route.isFavorite
      case 'inProgress': return (route.progress || 0) < 100
      case 'completed': return (route.progress || 0) >= 100
      default: return true
    }
  }).length
}

// 返回线路的出行状态与倒计时信息
function countdownInfo(route) {
  try {
    const nowTs = parseDateOnly(today.value).getTime()
    const startTs = parseDateOnly(route.startDate).getTime()
    const endTs = parseDateOnly(route.endDate).getTime()
    const diff = Math.round((startTs - nowTs) / 86400000) // 距出发天数（0=今天出发，负=已过出发）
    if (startTs <= nowTs && endTs >= nowTs) return { days: 0, label: '正在旅行中', tone: 'active' }
    if (startTs < nowTs) return { days: diff, label: '已出发', tone: 'past' }
    return { days: diff, label: `还有 ${diff} 天出发`, tone: diff <= 7 ? 'soon' : 'normal' }
  } catch {
    return null
  }
}

// 卡片紧凑倒计时文本
function countdownShort(route) {
  const info = countdownInfo(route)
  if (!info) return ''
  if (info.tone === 'active') return '进行中'
  if (info.tone === 'past') return '已出发'
  if (info.days <= 0) return '今天出发'
  return `${info.days}天后出发`
}

// 「即将出行」：按出发日期就近排列的未结束线路
const upcomingRoutes = computed(() => {
  const nowTs = parseDateOnly(today.value).getTime()
  return myRoutes.value
    .filter(route => {
      try { return parseDateOnly(route.endDate).getTime() >= nowTs } catch { return false }
    })
    .sort((a, b) => parseDateOnly(a.startDate) - parseDateOnly(b.startDate))
    .slice(0, 6)
})

const previewDays = computed(() => {
if (!previewData.value) return []

// 将推荐线路的景点分配到每天
const days = []
let currentDay = []
let dayIndex = 0

previewData.value.attractions.forEach((attraction, index) => {
currentDay.push({
...attraction,
image: '/images/placeholder-landscape.svg',
description: getAttractionDescription(attraction.name)
})

// 每3个景点为一天，或到达最后一个景点
if ((index + 1) % 3 === 0 || index === previewData.value.attractions.length - 1) {
days.push(currentDay)
currentDay = []
dayIndex++
}
})

return days
})

// 方法
function createNewRoute() {
return {
title: '',
startDate: '',
endDate: '',
destinations: [],
themes: [],
companion: 'solo',
preferences: {
culture: 50,
relaxation: 50,
budget: 50
},
coverImage: ''
}
}

function showCreateModal() {
draftOwnerId = travel.ownerId
currentRoute.value = createNewRoute()
isEditing.value = false
showModal.value = true
}

function editRoute(id) {
const route = myRoutes.value.find(r => r.id === id)
if (route) {
draftOwnerId = travel.ownerId
currentRoute.value = JSON.parse(JSON.stringify(route))
isEditing.value = true
showModal.value = true
}
}

// 打开线路详情/日程编辑页
function openRoute(id) {
if (!id) return
router.push({ name: 'route-detail', params: { id: String(id) } })
}

function closeModal() {
showModal.value = false
}

function saveRoute() {
if (!currentRoute.value.title.trim()) {
feedback.error('请输入线路名称')
return
}
try {
inclusiveDayCount(currentRoute.value.startDate, currentRoute.value.endDate)
} catch (error) {
feedback.error(error.message)
return
}
const draft = JSON.parse(JSON.stringify(currentRoute.value))
draft.title = draft.title.trim()
try { travel.saveRoute(draft, draftOwnerId) } catch (error) { feedback.error(error.message); return }
closeModal()
}

async function deleteRoute(id) {
const ownerId = travel.ownerId
if (!await feedback.confirm('确定要删除这条线路吗？删除后无法恢复。', { title: '删除线路', confirmLabel: '删除线路', danger: true })) return
if (ownerId !== travel.ownerId) return
try { travel.deleteRoute(id); feedback.success('线路已删除') } catch (error) { feedback.error(error.message) }
}

function toggleFavorite(id) {
try { travel.toggleRouteFavorite(id) } catch (error) { feedback.error(error.message) }
}

function duplicateRoute(id) {
const source = myRoutes.value.find(r => r.id === id)
if (!source) return
const copy = JSON.parse(JSON.stringify(source))
delete copy.id
delete copy.createdAt
delete copy.updatedAt
copy.isFavorite = false
copy.title = `${source.title}（副本）`
try { travel.saveRoute(copy); feedback.success('已复制为新线路') } catch (error) { feedback.error(error.message) }
}

function shareRoute(id) {
const route = myRoutes.value.find(r => r.id === id)
if (!route) return
const text = itineraryService.exportRoute(route)
if (!text) {
feedback.info('该线路信息不完整，暂无可分享内容。')
return
}
if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text)
  .then(() => feedback.success('线路计划已复制到剪贴板，可粘贴发送给好友。'))
  .catch(() => downloadShareText(text, route))
} else {
downloadShareText(text, route)
}
}

function downloadShareText(text, route) {
if (typeof window === 'undefined' || typeof document === 'undefined') {
feedback.success('线路计划已生成。')
return
}
const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
const url = window.URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `${(route.title || '线路')}计划.txt`
a.click()
window.URL.revokeObjectURL(url)
feedback.success('线路计划已导出。')
}

function applyRecommendation(rec) {
draftOwnerId = travel.ownerId
currentRoute.value = {
...createNewRoute(),
title: rec.title,
themes: [...rec.tags],
coverImage: rec.coverImage,
attractions: JSON.parse(JSON.stringify(rec.attractions))
}
isEditing.value = false
previewData.value = null
showModal.value = true
}

function previewRecommendation(rec) {
previewData.value = rec
activeDay.value = 0
}

function toggleTheme(theme) {
const index = currentRoute.value.themes.indexOf(theme)
if (index === -1) {
currentRoute.value.themes.push(theme)
} else {
currentRoute.value.themes.splice(index, 1)
}
}

function formatDate(dateStr) {
if (!dateStr) return ''
try {
const date = parseDateOnly(dateStr)
return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
} catch {
return ''
}
}

function calculateDuration(startDate, endDate) {
try {
return inclusiveDayCount(startDate, endDate)
} catch {
return 0
}
}

function getAttractionDescription(name) {
// 模拟景点描述
const descriptions = {
'故宫博物院': '中国古代宫廷建筑之精华，世界上现存规模最大、保存最完整的木质结构古建筑之一。',
'八达岭长城': '万里长城的精华段，地势险要，历史悠久，是游览长城的首选之地。',
'颐和园': '中国现存规模最大、保存最完整的皇家园林，被誉为"皇家园林博物馆"。',
'天安门广场': '世界上最大的城市广场，位于北京市中心，是中国重要的象征之一。',
'圆明园遗址公园': '曾被誉为"万园之园"，虽遭英法联军洗劫，但仍保留着独特的历史价值和园林风貌。',
'北海公园': '中国现存最古老、最完整、最具综合性和代表性的皇家园林之一。',
'什刹海': '北京城内面积最大、风貌保存最完整的一片历史街区，拥有众多名人故居。',
'中国国家博物馆': '世界上单体建筑面积最大的博物馆，收藏了大量珍贵文物。',
'798艺术区': '中国当代艺术的重要地标，原为工厂区，现已转型为艺术展览空间。',
'南锣鼓巷': '北京最古老的街区之一，保留了大量明清时期的四合院建筑。',
'国家大剧院': '中国国家表演艺术中心，造型独特，是北京的新地标。',
'北京艺术博物馆': '收藏了丰富的艺术品，包括绘画、书法、陶瓷等。',
'前门大街': '北京著名的商业街，保留了许多传统建筑和老字号店铺。',
'慕田峪长城': '万里长城的重要组成部分，以险峻、壮观著称。',
'红螺寺': '千年古刹，环境清幽，寺内有著名的红螺泉。',
'龙庆峡': '有"北方小三峡"之称，自然风光优美，适合避暑。',
'永宁古城': '保存完好的明代古城，具有浓厚的历史氛围。'
}
return descriptions[name] || '这是一个值得一游的著名景点，拥有丰富的历史文化内涵和美丽的自然风光。'
}

// 新增方法:智能行程规划
function closeItineraryModal() {
  showItineraryModal.value = false
  generatedItinerary.value = null
}

function generateItinerary() {
  itineraryOwnerId = travel.ownerId
  generatedItinerary.value = null
  if (!itineraryPlan.value.destination || !itineraryPlan.value.startDate || 
      !itineraryPlan.value.endDate || !itineraryPlan.value.budget ||
      itineraryPlan.value.preferences.length === 0) {
    feedback.error('请填写完整信息')
    return
  }
  
  try {
    const days = inclusiveDayCount(itineraryPlan.value.startDate, itineraryPlan.value.endDate)
    const dailyPlan = itineraryService.generateDailyPlan(
      itineraryPlan.value.destination,
      itineraryPlan.value.preferences,
      itineraryPlan.value.budget,
      days,
      itineraryPlan.value.startDate
    )

    generatedItinerary.value = {
      ...JSON.parse(JSON.stringify(itineraryPlan.value)),
      name: `${itineraryPlan.value.destination}${days}日游`,
      days: dailyPlan
    }
  } catch (error) {
    feedback.error(error.message)
  }
}

function exportItineraryPlan() {
  if (!generatedItinerary.value) return
  
  let itinerary
  try { itinerary = itineraryService.createItinerary(generatedItinerary.value, itineraryOwnerId) } catch (error) { feedback.error(error.message); return }
  const text = itineraryService.exportItinerary(itinerary)

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    feedback.success('行程已导出!')
    return
  }
  const blob = new Blob([text], { type: 'text/plain' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${generatedItinerary.value.destination}行程计划.txt`
  a.click()
  window.URL.revokeObjectURL(url)
  
  feedback.success('行程已导出!')
}

function saveAsRoute() {
  if (!generatedItinerary.value) return
  
  const newRoute = {
    title: `${generatedItinerary.value.destination}${generatedItinerary.value.days.length}日游`,
    startDate: generatedItinerary.value.startDate,
    endDate: generatedItinerary.value.endDate,
    days: JSON.parse(JSON.stringify(generatedItinerary.value.days)),
    themes: generatedItinerary.value.preferences.map(p => {
      const labels = {
        culture: '历史文化',
        nature: '自然风光',
        food: '美食之旅',
        art: '艺术展览',
        shopping: '购物娱乐'
      }
      return labels[p] || p
    }),
    companion: 'solo',
    persons: 2,
    preferences: {
      culture: 50,
      relaxation: 50,
      budget: 50
    },
    progress: 30,
    isFavorite: false,
    budget: generatedItinerary.value.budget
  }
  
  let saved
  try { saved = travel.saveRoute(newRoute, itineraryOwnerId) } catch (error) { feedback.error(error.message); return }
  closeItineraryModal()
  feedback.success('已保存为线路，正在进入日程编辑…')
  const newId = saved && saved.id ? String(saved.id) : null
  if (newId) {
    try { router.push({ name: 'route-detail', params: { id: newId } }) } catch { /* 测试/非路由环境忽略跳转 */ }
  }
}

return {
  travel,
  viewMode,
  toggleViewMode,
  searchQuery,
  myRoutes,
  smartRecommendations,
  filteredRoutes,
  favoriteCount,
  plannedDayCount,
  filterTabs,
  routeFilter,
  getFilterCount,
  upcomingRoutes,
  countdownInfo,
  countdownShort,
  showModal,
  isEditing,
  currentRoute,
  travelThemes,
  companionTypes,
  tagColors,
  previewData,
  activeDay,
  previewDays,
  showItineraryModal,
  itineraryPlan,
  preferences,
  generatedItinerary,
  closeItineraryModal,
  generateItinerary,
  exportItineraryPlan,
  saveAsRoute,
  showCreateModal,
  editRoute,
  openRoute,
  closeModal,
  saveRoute,
  deleteRoute,
  duplicateRoute,
  toggleFavorite,
  shareRoute,
  applyRecommendation,
  previewRecommendation,
  toggleTheme,
  formatDate,
  calculateDuration,
  destinationOptions,
  pendingDestination,
  addDestination,
  removeDestination
}
}
}
</script>

<style scoped>
.routes-container {
max-width: 1200px;
margin: 0 auto;
padding: 20px;
}

.control-panel {
display: flex;
justify-content: space-between;
align-items: center;
margin-bottom: 30px;
flex-wrap: wrap;
gap: 15px;
}

.left-controls, .right-controls {
display: flex;
gap: 15px;
}

.search-box {
position: relative;
}

.search-box input {
padding: 10px 15px 10px 35px;
border: 1px solid #ddd;
border-radius: 20px;
width: 250px;
}

.search-box svg {
position: absolute;
left: 12px;
top: 50%;
transform: translateY(-50%);
color: #999;
}

.section-title {
display: flex;
align-items: center;
gap: 10px;
color: #2b2d42;
margin: 40px 0 20px;
}

.section-title svg {
color: #4361ee;
}

.counter {
background: #4361ee;
color: white;
padding: 2px 8px;
border-radius: 10px;
font-size: 14px;
margin-left: 10px;
}

.recommendation-cards {
display: grid;
grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
gap: 20px;
margin-bottom: 40px;
}

.recommendation-card {
background: white;
border-radius: 12px;
overflow: hidden;
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
transition: transform 0.3s;
cursor: pointer;
}

.recommendation-card:hover {
transform: translateY(-5px);
}

.card-header {
padding: 15px;
background: linear-gradient(135deg, #4361ee 0%, #3a0ca3 100%);
color: white;
display: flex;
justify-content: space-between;
align-items: center;
}

.card-header h3 {
margin: 0;
font-size: 18px;
}

.badge {
padding: 3px 10px;
border-radius: 20px;
font-size: 12px;
font-weight: bold;
}

.badge.easy {
background: #1dd1a1;
}

.badge.medium {
background: #feca57;
}

.badge.challenging {
background: #ff6b6b;
}

.card-body {
padding: 15px;
}

.stats {
display: flex;
justify-content: space-between;
margin-bottom: 15px;
}

.stat-item {
display: flex;
align-items: center;
gap: 5px;
font-size: 14px;
color: #666;
}

.stat-item svg {
color: #4361ee;
}

.tags {
display: flex;
flex-wrap: wrap;
gap: 8px;
}

.tag {
padding: 4px 10px;
border-radius: 20px;
font-size: 12px;
background: #eee;
}

.card-footer {
padding: 10px 15px;
border-top: 1px solid #eee;
display: flex;
justify-content: flex-end;
}

.route-grid {
display: grid;
grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
gap: 25px;
}

.route-card {
background: white;
border-radius: 12px;
overflow: hidden;
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
transition: transform 0.3s;
}

.route-card:hover {
transform: translateY(-5px);
}

.card-image {
height: 160px;
position: relative;
}

.card-image img {
width: 100%;
height: 100%;
object-fit: cover;
}

.favorite-btn {
position: absolute;
top: 10px;
right: 10px;
width: 30px;
height: 30px;
background: rgba(255, 255, 255, 0.8);
border-radius: 50%;
display: flex;
align-items: center;
justify-content: center;
cursor: pointer;
}

.favorite-btn svg {
color: #ff6b6b;
}

.favorite-btn .favorited {
color: #ff6b6b;
}

.card-content {
padding: 15px;
}

.card-content h3 {
margin: 0 0 10px;
font-size: 18px;
color: #2b2d42;
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
}

.meta {
display: flex;
justify-content: space-between;
font-size: 14px;
color: #666;
margin-bottom: 15px;
}

.meta svg {
margin-right: 5px;
color: #4361ee;
}

.progress-container {
height: 20px;
background: #f1f1f1;
border-radius: 10px;
position: relative;
margin-bottom: 10px;
}

.progress-bar {
height: 100%;
border-radius: 10px;
background: linear-gradient(90deg, #4361ee 0%, #4cc9f0 100%);
transition: width 0.5s ease;
}

.progress-text {
position: absolute;
left: 0;
right: 0;
top: 0;
bottom: 0;
display: flex;
align-items: center;
justify-content: center;
font-size: 12px;
color: white;
white-space: nowrap;
text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
overflow: hidden;
}

.card-actions {
padding: 10px 15px;
border-top: 1px solid #eee;
display: flex;
justify-content: flex-end;
gap: 10px;
}

.empty-card {
background: white;
border: 2px dashed #ddd;
border-radius: 12px;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
height: 100%;
min-height: 240px;
cursor: pointer;
transition: all 0.3s;
}

.empty-card:hover {
border-color: #4361ee;
background: #f8f9fa;
}

.empty-card svg {
color: #4361ee;
margin-bottom: 10px;
}

.empty-card p {
margin: 0;
color: #4361ee;
font-weight: bold;
}

/* 列表视图样式 */
.route-list {
background: white;
border-radius: 12px;
overflow: hidden;
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.list-header {
display: flex;
padding: 15px;
background: #f8f9fa;
font-weight: bold;
border-bottom: 1px solid #eee;
}

.list-item {
display: flex;
padding: 15px;
border-bottom: 1px solid #eee;
cursor: pointer;
transition: background 0.2s;
}

.list-item:hover {
background: #f8f9fa;
}

.list-empty {
padding: 48px 20px;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
gap: 12px;
color: var(--text-muted);
text-align: center;
}

.list-empty svg {
font-size: 34px;
color: var(--primary-2);
}

.list-empty p {
margin: 0;
font-size: 16px;
color: var(--text-secondary);
}

.list-empty .btn {
min-width: 110px;
}

.col {
padding: 0 10px;
display: flex;
align-items: center;
}

.col-title {
flex: 3;
min-width: 200px;
}

.col-title svg {
margin-right: 10px;
color: #ccc;
cursor: pointer;
}

.col-title .favorited {
color: #ff6b6b;
}

.col-date {
flex: 2;
min-width: 150px;
}

.col-duration {
flex: 1;
min-width: 80px;
justify-content: center;
}

.col-progress {
flex: 2;
min-width: 150px;
}

.col-actions {
flex: 1;
min-width: 100px;
justify-content: flex-end;
gap: 10px;
}

/* 模态框样式 */
.modal-overlay {
position: fixed;
top: 0;
left: 0;
right: 0;
bottom: 0;
background: rgba(0, 0, 0, 0.5);
display: flex;
justify-content: center;
align-items: center;
z-index: 1000;
}

.route-modal {
background: white;
border-radius: 12px;
width: 90%;
max-width: 700px;
max-height: 90vh;
overflow-y: auto;
padding: 30px;
position: relative;
animation: modalFadeIn 0.3s;
}

@keyframes modalFadeIn {
from {
opacity: 0;
transform: translateY(20px);
}
to {
opacity: 1;
transform: translateY(0);
}
}

.close-btn {
position: absolute;
top: 15px;
right: 15px;
background: none;
border: none;
width: 34px;
height: 34px;
border-radius: 50%;
font-size: 20px;
cursor: pointer;
color: var(--text-secondary);
display: flex;
align-items: center;
justify-content: center;
transition: all 0.2s;
}

.close-btn:hover {
color: #333;
background: #f1f4ff;
}

.modal-body {
margin: 20px 0;
}

.form-group {
margin-bottom: 25px;
}

.form-group label {
display: block;
margin-bottom: 10px;
font-weight: 500;
}

.form-group input[type="text"],
.form-group input[type="date"],
.form-group select {
width: 100%;
padding: 12px;
border: 1px solid var(--border);
border-radius: var(--radius-sm);
font-size: 16px;
background: #fff;
color: var(--text-main);
outline: none;
transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input[type="text"]:focus,
.form-group input[type="date"]:focus,
.form-group select:focus {
border-color: var(--primary);
box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.12);
}

.form-row {
display: flex;
gap: 20px;
}

.form-row .form-group {
flex: 1;
}

.theme-tags {
display: flex;
flex-wrap: wrap;
gap: 10px;
}

.theme-tags .tag {
padding: 8px 15px;
border-radius: 20px;
background: #f1f1f1;
color: var(--text-secondary);
cursor: pointer;
transition: all 0.2s;
border: 1px solid transparent;
user-select: none;
}

.theme-tags .tag:hover {
background: #e7ebff;
color: var(--primary);
border-color: var(--primary-2);
}

.theme-tags .tag.active {
background: var(--gradient-primary);
color: #fff;
border-color: transparent;
box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35);
}

.companion-selector {
display: grid;
grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
gap: 10px;
}

.companion-option {
padding: 15px;
border: 1px solid var(--border);
border-radius: var(--radius-sm);
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
cursor: pointer;
transition: all 0.2s;
}

.companion-option svg {
font-size: 24px;
margin-bottom: 10px;
color: var(--text-muted);
}

.companion-option:hover {
border-color: var(--primary-2);
background: #f8f9ff;
}

.companion-option.active {
border-color: var(--primary);
background: #edf2ff;
box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.12);
}

.companion-option.active svg {
color: var(--primary);
}

.preference-sliders {
display: flex;
flex-direction: column;
gap: 15px;
}

.slider-item {
display: flex;
align-items: center;
gap: 15px;
}

.slider-item span {
font-size: 14px;
color: var(--text-secondary);
min-width: 60px;
text-align: center;
}

.slider-item span:first-child {
text-align: right;
}

.slider-item input[type="range"] {
flex: 1;
accent-color: var(--primary);
cursor: pointer;
height: 6px;
}

.modal-footer {
display: flex;
justify-content: flex-end;
gap: 15px;
padding-top: 20px;
border-top: 1px solid #eee;
}

/* 预览模态框样式 */
.preview-modal {
background: white;
border-radius: 12px;
width: 90%;
max-width: 900px;
max-height: 90vh;
overflow-y: auto;
padding: 30px;
position: relative;
}

.preview-modal h2 {
margin-top: 0;
}

.subtitle {
color: #666;
margin-top: 5px;
}

.preview-content {
margin: 20px 0;
display: flex;
flex-direction: column;
gap: 20px;
}

.day-tabs {
display: flex;
gap: 10px;
overflow-x: auto;
padding-bottom: 10px;
}

.day-tabs button {
padding: 8px 20px;
border: 1px solid #ddd;
background: none;
border-radius: 20px;
cursor: pointer;
transition: all 0.2s;
white-space: nowrap;
}

.day-tabs button.active {
background: #4361ee;
color: white;
border-color: #4361ee;
}

/* 智能行程规划样式 */
.smart-itinerary-section {
  text-align: center;
  margin: 30px 0;
}

.smart-itinerary-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 15px 40px;
  border-radius: 30px;
  font-size: 18px;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.smart-itinerary-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.itinerary-modal {
  background: white;
  border-radius: 20px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 40px;
  position: relative;
}

.modal-subtitle {
  color: #666;
  margin-top: -10px;
  margin-bottom: 30px;
}

.itinerary-form {
  margin-bottom: 30px;
}

.preference-checkboxes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.checkbox-item:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.checkbox-item input[type="checkbox"] {
  cursor: pointer;
}

.generate-btn {
  width: 100%;
  margin-top: 20px;
  padding: 15px;
  font-size: 16px;
}

.generated-itinerary {
  margin-top: 30px;
  padding-top: 30px;
  border-top: 2px solid #e0e0e0;
}

.generated-itinerary h3 {
  color: #2b2d42;
  margin-bottom: 20px;
}

.itinerary-summary {
  display: flex;
  justify-content: space-around;
  margin-bottom: 30px;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 15px;
  color: white;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
}

.summary-item svg {
  font-size: 20px;
}

.daily-plans {
  margin-bottom: 30px;
}

.day-plan {
  margin-bottom: 25px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 12px;
  border-left: 4px solid #667eea;
}

.day-plan h4 {
  color: #2b2d42;
  margin-bottom: 15px;
}

.activities-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.activity {
  display: flex;
  gap: 15px;
  padding: 15px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.activity-time {
  background: #667eea;
  color: white;
  padding: 5px 15px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
  min-width: 80px;
  text-align: center;
  height: fit-content;
}

.activity-details {
  flex: 1;
}

.activity-details strong {
  color: #2b2d42;
  display: block;
  margin-bottom: 5px;
}

.activity-details p {
  color: #666;
  font-size: 14px;
  margin: 0;
}

.itinerary-actions {
  display: flex;
  justify-content: flex-end;
  gap: 15px;
}

/* 移动端：列表横向滚动避免列被压缩/溢出 */
@media (max-width: 768px) {
  .route-list {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .list-header,
  .list-item {
    min-width: 560px;
  }
}

/* ================================================================
   线路制定页 · 视觉增强 v2
   ================================================================ */
.routes-container {
  padding-bottom: 60px;
}
.storage-error {
  background: #fff3f3;
  color: var(--danger);
  border: 1px solid #ffd1d1;
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

/* —— 顶部统计横幅 —— */
.stats-banner {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--gradient-primary);
  color: #fff;
  box-shadow: 0 14px 34px rgba(102, 126, 234, 0.32);
  margin-bottom: 28px;
}
.stats-banner-bg { position: absolute; inset: 0; pointer-events: none; }
.stats-banner-bg .orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(2px);
  opacity: 0.5;
}
.orb-1 { width: 260px; height: 260px; background: rgba(255,255,255,0.12); top: -120px; right: 12%; animation: orb-float 12s ease-in-out infinite; }
.orb-2 { width: 180px; height: 180px; background: rgba(76, 201, 240, 0.25); bottom: -70px; left: 6%; animation: orb-float 16s ease-in-out infinite reverse; }
.orb-3 { width: 90px; height: 90px; background: rgba(255,255,255,0.18); top: 30%; left: 55%; animation: orb-float 10s ease-in-out infinite; }
@keyframes orb-float {
  0%, 100% { transform: translateY(0) translateX(0); }
  50% { transform: translateY(-18px) translateX(12px); }
}
.stats-banner-inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 10px;
  flex-wrap: wrap;
  padding: 26px 28px;
  z-index: 1;
}
.stat-block { display: flex; align-items: center; gap: 14px; }
.stat-icon {
  width: 52px; height: 52px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.16);
  border: 1px solid rgba(255,255,255,0.22);
  border-radius: 16px;
  font-size: 22px;
  backdrop-filter: blur(4px);
}
.stat-text { display: flex; flex-direction: column; }
.stat-value { font-size: 28px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 13px; opacity: 0.85; }
.stat-divider { width: 1px; height: 44px; background: rgba(255,255,255,0.25); }

/* —— 即将出行 —— */
.upcoming-section { margin-bottom: 22px; }
.upcoming-strip {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 8px;
  scroll-snap-type: x proximity;
}
.upcoming-card {
  flex: 0 0 auto;
  min-width: 300px;
  max-width: 360px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  background: #fff;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: transform 0.25s, box-shadow 0.25s;
  scroll-snap-align: start;
}
.upcoming-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-card-hover); }
.upcoming-card .upcoming-countdown {
  flex-shrink: 0;
  min-width: 64px;
  height: 64px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 14px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  padding: 0 8px;
  text-align: center;
}
.count-label {
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.25;
}
.upcoming-card.tone-soon .upcoming-countdown { background: linear-gradient(135deg, #ff6b6b, #ee5a24); }
.upcoming-card.tone-active .upcoming-countdown { background: linear-gradient(135deg, #2bb3a3, #1ca08f); }
.upcoming-card.tone-past .upcoming-countdown { background: #9aa0b5; }
.upcoming-info { flex: 1; min-width: 0; }
.upcoming-info h3 {
  margin: 0 0 6px;
  font-size: 15px;
  color: var(--text-main);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.upcoming-meta {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
  display: flex; align-items: center; gap: 6px;
}
.upcoming-meta svg { color: var(--primary-2); }
.upcoming-arrow { color: #ccd3e8; font-size: 14px; flex-shrink: 0; }

/* 线路卡片上的倒计时徽章 */
.upcoming-badge {
  position: absolute;
  left: 12px;
  bottom: 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(15, 20, 40, 0.78);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  backdrop-filter: blur(3px);
  z-index: 3;
}
.upcoming-badge.tone-soon { background: rgba(238, 82, 83, 0.92); }
.upcoming-badge.tone-active { background: rgba(43, 179, 163, 0.92); }
.upcoming-badge.tone-normal { background: rgba(102, 126, 234, 0.88); }


/* —— 控制条 —— */
.control-bar { margin-bottom: 26px; }
.control-panel { margin-bottom: 16px; }
.search-box input {
  background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  transition: box-shadow 0.2s, border-color 0.2s;
}
.search-box input:focus { border-color: var(--primary-2); box-shadow: 0 0 0 3px rgba(67,97,238,0.14); }
.search-icon { font-size: 14px; }

/* 筛选标签 */
.filter-tabs { display: flex; flex-wrap: wrap; gap: 10px; }
.filter-tab {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}
.filter-tab:hover { border-color: var(--primary-2); color: var(--primary); background: #f4f6ff; }
.filter-tab .filter-count {
  min-width: 20px; height: 20px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 999px;
  background: #eef0f6; color: var(--text-secondary);
  font-size: 12px; font-weight: 600;
}
.filter-tab.active {
  background: var(--gradient-primary);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 4px 14px rgba(102,126,234,0.35);
}
.filter-tab.active .filter-count { background: rgba(255,255,255,0.22); color: #fff; }

/* —— 区块标题 —— */
.recommendation-section { margin-bottom: 20px; }
.section-head { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.section-sub { margin: 0; color: var(--text-muted); font-size: 13px; }
.section-title {
  display: flex; align-items: center; gap: 10px;
  color: #2b2d42; margin: 0;
  font-size: 20px;
}
.section-title svg { color: var(--primary); }
.section-head-actions .section-sub { margin: 0; font-size: 13px; color: var(--text-muted); }

/* —— 推荐卡片 —— */
.recommendation-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 22px; margin-bottom: 40px; }
.recommendation-card {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  animation: card-in 0.4s ease both;
}
@keyframes card-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.recommendation-card:hover { transform: translateY(-6px); box-shadow: var(--shadow-card-hover); }
.card-cover {
  position: relative;
  height: 168px;
  background-size: cover;
  background-position: center;
}
.cover-shade {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(10,10,30,0.18) 0%, rgba(10,10,30,0.55) 100%);
}
.recommendation-card .card-header {
  position: absolute;
  left: 0; right: 0; top: 0;
  padding: 16px;
  background: transparent;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  z-index: 2;
}
.recommendation-card .card-header h3 {
  margin: 0;
  font-size: 17px;
  color: #fff;
  text-shadow: 0 1px 6px rgba(0,0,0,0.4);
  line-height: 1.3;
}
.recommendation-card .badge { flex-shrink: 0; }
.recommendation-card .card-body { padding: 16px; flex: 1; display: flex; flex-direction: column; gap: 12px; }
.rec-desc { margin: 0; color: var(--text-secondary); font-size: 13.5px; line-height: 1.6; min-height: 42px; }
.recommendation-card .stats { margin-bottom: 0; }
.recommendation-card .card-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: #fbfcfe;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.btn-ghost {
  background: #fff;
  color: var(--primary);
  border: 1px solid var(--border-strong, #d8ddf0);
  transition: all 0.2s;
}
.btn-ghost:hover { border-color: var(--primary-2); background: #f4f6ff; }
.btn-ghost.danger { color: var(--danger); }
.btn-ghost.danger:hover { border-color: var(--danger); background: #fff5f5; }

/* 页面级补充按钮尺寸与危险样式（若全局未定义） */
.btn-sm { padding: 6px 14px; font-size: 13px; border-radius: 8px; }
.btn-sm.btn-primary { background: var(--gradient-primary); border: none; color: #fff; gap: 6px; }
.btn-sm.btn-primary:hover { filter: brightness(1.08); background: var(--gradient-primary); }
.btn-danger {
  background: #fff;
  color: var(--danger);
  border: 1px solid #ffd1d1;
  gap: 6px;
}
.btn-danger:hover { background: #fff4f4; border-color: var(--danger); }

/* 通用小按钮 */
.btn-sm.icon-btn-sm { width: 34px; height: 34px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }

/* —— 我的线路卡片 —— */
.route-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
.route-card {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  display: flex;
  flex-direction: column;
}
.route-card:hover { transform: translateY(-6px); box-shadow: var(--shadow-card-hover); }
.route-card .card-image {
  height: 168px;
  position: relative;
  background: linear-gradient(135deg, #eef0f6, #e3e8f4);
}
.route-card .card-image img { width: 100%; height: 100%; object-fit: cover; }
.favorite-btn {
  position: absolute; top: 12px; right: 12px;
  width: 34px; height: 34px;
  background: rgba(255,255,255,0.9);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.14);
  transition: transform 0.2s;
  z-index: 3;
}
.favorite-btn:hover { transform: scale(1.12); }
.favorite-btn svg, .favorite-btn .favorited { color: var(--danger); }
.done-badge {
  position: absolute; left: 12px; top: 12px;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px;
  background: rgba(40,167,69,0.92);
  color: #fff;
  border-radius: 999px;
  font-size: 12px; font-weight: 600;
  z-index: 3;
}
.route-card .card-content { padding: 15px 16px; position: relative; flex: 1; }
.theme-chip {
  position: absolute; top: -12px; left: 16px;
  padding: 3px 12px;
  background: var(--gradient-primary);
  color: #fff;
  border-radius: 999px;
  font-size: 12px; font-weight: 600;
  box-shadow: 0 3px 8px rgba(102,126,234,0.4);
}
.route-card .card-content h3 { margin: 6px 0 10px; font-size: 18px; color: #2b2d42; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.route-card .meta { margin-bottom: 14px; }
.route-card .card-actions {
  padding: 11px 16px;
  border-top: 1px solid var(--border);
  background: #fbfcfe;
  display: flex; justify-content: flex-end; gap: 8px;
}
.progress-bar.full { background: linear-gradient(90deg, #28a745 0%, #4cc9f0 100%); }

/* 空卡片 */
.empty-card {
  background: #fff;
  border: 2px dashed var(--border-strong, #ccd3e8);
  border-radius: 16px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  height: 100%; min-height: 250px;
  cursor: pointer;
  transition: all 0.3s;
  color: var(--primary);
  gap: 4px;
}
.empty-card:hover { border-color: var(--primary-2); background: #f6f8ff; transform: translateY(-4px); box-shadow: var(--shadow-card-hover); }
.empty-card svg { margin-bottom: 8px; }
.empty-card p { margin: 0; font-weight: 700; color: var(--primary); }
.empty-card small { color: var(--text-muted); font-size: 12.5px; }

/* —— 列表视图 —— */
.route-list { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: var(--shadow-card); }
.list-header { background: #f6f8ff; color: var(--text-secondary); font-size: 13.5px; }
.list-item { transition: background 0.2s; }
.list-item:hover { background: #f7f9ff; }
.mini-done { color: var(--success); margin-left: 6px; }
.col-icon { margin-right: 6px; color: var(--primary-2); }
.empty-illustration {
  width: 74px; height: 74px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: #eef2ff;
  color: var(--primary-2);
  font-size: 30px;
  margin-bottom: 4px;
}
.list-empty { padding: 56px 20px; gap: 8px; }
.list-empty p { margin: 0; font-size: 16px; color: var(--text-secondary); }
.list-empty small { color: var(--text-muted); margin-bottom: 8px; }

/* —— 模态框通用 —— */
.modal-overlay { background: rgba(15, 18, 30, 0.55); backdrop-filter: blur(4px); }
.modal-head { display: flex; align-items: center; gap: 14px; padding-right: 40px; margin-bottom: 8px; }
.modal-head-icon {
  width: 46px; height: 46px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--gradient-primary);
  color: #fff; border-radius: 14px; font-size: 20px;
  box-shadow: 0 4px 12px rgba(102,126,234,0.4);
}
.modal-head h2 { margin: 0; font-size: 20px; }
.modal-subtitle-sm { margin: 4px 0 0; color: var(--text-muted); font-size: 13px; }
.form-section { margin-bottom: 8px; }
.form-section-title {
  display: flex; align-items: center; gap: 8px;
  margin: 8px 0 18px;
  font-size: 13px; font-weight: 700; color: var(--text-secondary);
  text-transform: none;
}
.form-section-title span::after {
  content: ''; display: inline-block;
  margin-left: 10px; height: 1px; width: 46px;
  background: linear-gradient(90deg, var(--primary-2), transparent);
  vertical-align: middle;
}
.input-wrap { position: relative; }
.input-wrap .input-icon {
  position: absolute; left: 14px; top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted); font-size: 14px;
  pointer-events: none;
}
.input-wrap input { padding-left: 40px; }
.route-modal h2:first-child { display: none; }
.itinerary-head { display: flex; align-items: center; gap: 14px; padding-right: 40px; margin-bottom: 20px; }
.itinerary-head-icon {
  width: 48px; height: 48px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #f7971e 0%, #ffd200 100%);
  color: #fff; border-radius: 14px; font-size: 22px;
  box-shadow: 0 4px 12px rgba(255,210,0,0.45);
}
.itinerary-head h2 { margin: 0; font-size: 20px; }
.itinerary-head .modal-subtitle { margin: 4px 0 0; }

/* 主题标签选中态勾选 */
.theme-tags .tag { display: inline-flex; align-items: center; gap: 5px; }
.tag-check { font-size: 11px; }

/* —— 预览模态框 —— */
.preview-modal { overflow: hidden; padding: 0; }
.preview-modal .close-btn { top: 14px; right: 14px; z-index: 5; background: rgba(255,255,255,0.85); }
.preview-hero {
  position: relative;
  height: 190px;
  background-size: cover;
  background-position: center;
}
.preview-hero-shade {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(10,10,30,0.25) 0%, rgba(10,10,30,0.72) 100%);
}
.preview-badge {
  position: absolute; top: 16px; right: 56px;
  padding: 5px 14px; border-radius: 999px; font-size: 13px; font-weight: 700;
  z-index: 2;
}
.preview-badge.easy { background: #1dd1a1; color: #fff; }
.preview-badge.medium { background: #feca57; color: #333; }
.preview-badge.challenging { background: #ff6b6b; color: #fff; }
.preview-hero-info {
  position: absolute; left: 28px; right: 28px; bottom: 18px;
  color: #fff; z-index: 2;
}
.preview-hero-info h2 { margin: 0 0 4px; color: #fff; font-size: 22px; text-shadow: 0 1px 6px rgba(0,0,0,0.4); }
.preview-hero-info .subtitle { color: rgba(255,255,255,0.9); font-size: 13.5px; margin: 0 0 12px; }
.preview-stats { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; }
.preview-stats span { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.16); padding: 4px 12px; border-radius: 999px; backdrop-filter: blur(3px); }
.preview-content { padding: 24px 28px 16px; }
.preview-footer { padding: 14px 28px 22px; border-top: 1px solid var(--border); background: #fbfcfe; }
.preview-footer .btn { padding-left: 20px; padding-right: 20px; gap: 8px; }
.day-tabs button.active { background: var(--gradient-primary); border-color: transparent; }

/* 景点卡片 */
.attraction-item { display: flex; gap: 14px; }
.time-badge {
  background: var(--gradient-primary);
  color: #fff;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 13px; font-weight: 600;
  height: fit-content;
  white-space: nowrap;
}
.attraction-card { display: flex; gap: 14px; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-card); flex: 1; }
.attraction-card .app-image, .attraction-card img { width: 96px; height: 96px; object-fit: cover; flex-shrink: 0; }
.attraction-info { padding: 12px 16px; }
.attraction-info h4 { margin: 0 0 6px; font-size: 16px; }
.attraction-meta { display: flex; gap: 16px; margin-bottom: 6px; font-size: 13px; color: var(--text-secondary); }
.attraction-meta .rating { color: #ffb400; }
.attraction-meta .rating svg { color: #ffb400; }
.attraction-meta .duration svg { color: var(--primary-2); }
.attraction-info .description { margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.6; }

/* —— 智能行程 —— */
.smart-itinerary-section { margin: 40px 0 10px; text-align: center; }
.smart-itinerary-btn {
  background: linear-gradient(135deg, #f7971e 0%, #ffd200 100%);
  color: #4a3a00;
  border: none;
  padding: 16px 44px;
  border-radius: 999px;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(255, 170, 0, 0.4);
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.smart-itinerary-btn:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(255, 170, 0, 0.55); }
.itinerary-modal { border-radius: 20px; }
.checkbox-item { border: 2px solid var(--border); }
.checkbox-item:has(input:checked) { border-color: #f7971e; background: #fffaf0; box-shadow: 0 0 0 3px rgba(255,170,0,0.14); }
.checkbox-item input:checked + span { color: #b26a00; font-weight: 600; }
.generate-btn { background: linear-gradient(135deg, #f7971e 0%, #ffd200 100%); border: none; color: #4a3a00; font-weight: 700; box-shadow: 0 4px 14px rgba(255,170,0,0.35); }
.generate-btn:hover { background: linear-gradient(135deg, #ffa014 0%, #ffdd00 100%); }
.itinerary-summary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.day-plan { border-left: 4px solid #f7971e; }

/* —— 多目的地 —— */
.destination-input { display: flex; flex-direction: column; gap: 10px; }
.dest-add-row { display: flex; gap: 10px; }
.dest-select {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  background: #fff;
  outline: none;
}
.dest-add-row .btn { white-space: nowrap; }
.dest-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.dest-tag {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  background: #edf2ff;
  color: var(--primary);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
}
.dest-remove { cursor: pointer; font-size: 11px; opacity: 0.7; }
.dest-remove:hover { opacity: 1; color: var(--danger); }
.dest-hint { margin: 0; font-size: 12.5px; color: var(--text-muted); }

@media (max-width: 768px) {
  .stats-banner-inner { padding: 20px 16px; gap: 16px; }
  .stat-block { gap: 10px; }
  .stat-value { font-size: 22px; }
  .stat-icon { width: 42px; height: 42px; font-size: 18px; }
  .stat-divider { height: 34px; }
  .preview-content { padding: 20px 18px 12px; }
  .preview-footer { padding: 12px 18px 18px; }
  .attraction-card { flex-direction: column; }
  .attraction-card .app-image, .attraction-card img { width: 100%; height: 120px; }
}

/* 减少动效 */
@media (prefers-reduced-motion: reduce) {
  .progress-bar {
    transition: none;
  }
}
</style>
