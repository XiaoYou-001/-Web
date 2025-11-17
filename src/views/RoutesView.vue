<template>
<div class="routes-container">
<!-- 顶部控制区 -->
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
<font-awesome-icon :icon="['fas', 'magnifying-glass']" />
</div>
</div>
</div>

<!-- 智能推荐区 -->
<div class="recommendation-section">
<h2 class="section-title">
<font-awesome-icon :icon="['fas', 'wand-magic-sparkles']" />
智能推荐线路
</h2>

<div class="recommendation-cards">
<div
v-for="(rec, index) in smartRecommendations"
:key="'rec-'+index"
class="recommendation-card"
@click="applyRecommendation(rec)"
>
<div class="card-header">
<h3>{{ rec.title }}</h3>
<span class="badge" :class="rec.difficulty">
{{ {easy: '轻松', medium: '中等', challenging: '挑战'}[rec.difficulty] }}
</span>
</div>
<div class="card-body">
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
:style="{backgroundColor: tagColors[tag] || '#eee'}"
>
{{ tag }}
</span>
</div>
</div>
<div class="card-footer">
<button class="btn btn-sm" @click.stop="previewRecommendation(rec)">
<font-awesome-icon :icon="['fas', 'eye']" />
预览
</button>
</div>
</div>
</div>
</div>

<!-- 我的线路区 -->
<div class="my-routes-section">
<h2 class="section-title">
<font-awesome-icon :icon="['fas', 'route']" />
我的旅行线路
<span class="counter">{{ filteredRoutes.length }}条</span>
</h2>

<!-- 网格视图 -->
<div v-if="viewMode === 'grid'" class="route-grid">
<div
v-for="route in filteredRoutes"
:key="route.id"
class="route-card"
@click="editRoute(route.id)"
>
<div class="card-image">
<img :src="route.coverImage || getRandomCoverImage()" :alt="route.title">
<div class="favorite-btn" @click.stop="toggleFavorite(route.id)">
<font-awesome-icon
:icon="['fas', route.isFavorite ? 'heart' : 'heart-circle-plus']"
:class="{ 'favorited': route.isFavorite }"
/>
</div>
</div>
<div class="card-content">
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
<div class="progress-bar" :style="{width: route.progress + '%'}"></div>
<span class="progress-text">规划进度: {{ route.progress }}%</span>
</div>
</div>
<div class="card-actions">
<button class="btn btn-sm btn-secondary" @click.stop="shareRoute(route.id)">
<font-awesome-icon :icon="['fas', 'share-nodes']" />
</button>
<button class="btn btn-sm btn-danger" @click.stop="deleteRoute(route.id)">
<font-awesome-icon :icon="['fas', 'trash']" />
</button>
</div>
</div>

<div class="empty-card" @click="showCreateModal">
<font-awesome-icon :icon="['fas', 'plus']" size="2x" />
<p>创建新线路</p>
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

<div
v-for="route in filteredRoutes"
:key="route.id"
class="list-item"
@click="editRoute(route.id)"
>
<div class="col col-title">
<font-awesome-icon
:icon="['fas', route.isFavorite ? 'heart' : 'heart-circle-plus']"
:class="{ 'favorited': route.isFavorite }"
@click.stop="toggleFavorite(route.id)"
/>
<span>{{ route.title }}</span>
</div>
<div class="col col-date">
{{ formatDate(route.startDate) }} - {{ formatDate(route.endDate) }}
</div>
<div class="col col-duration">
{{ calculateDuration(route.startDate, route.endDate) }}天
</div>
<div class="col col-progress">
<div class="progress-container">
<div class="progress-bar" :style="{width: route.progress + '%'}"></div>
<span class="progress-text">{{ route.progress }}%</span>
</div>
</div>
<div class="col col-actions">
<button class="btn btn-sm btn-secondary" @click.stop="shareRoute(route.id)">
<font-awesome-icon :icon="['fas', 'share-nodes']" />
</button>
<button class="btn btn-sm btn-danger" @click.stop="deleteRoute(route.id)">
<font-awesome-icon :icon="['fas', 'trash']" />
</button>
</div>
</div>
</div>
</div>

<!-- 创建/编辑线路模态框 -->
<div v-if="showModal" class="modal-overlay" @click.self="closeModal">
<div class="route-modal">
<button class="close-btn" @click="closeModal">
<font-awesome-icon :icon="['fas', 'xmark']" />
</button>

<h2>{{ isEditing ? '编辑线路' : '创建新线路' }}</h2>

<div class="modal-body">
<div class="form-group">
<label>线路名称</label>
<input v-model="currentRoute.title" type="text" placeholder="例如: 北京三日文化之旅">
</div>

<div class="form-row">
<div class="form-group">
<label>出发日期</label>
<input v-model="currentRoute.startDate" type="date">
</div>
<div class="form-group">
<label>结束日期</label>
<input v-model="currentRoute.endDate" type="date">
</div>
</div>

<div class="form-group">
<label>旅行主题</label>
<div class="theme-tags">
<span
v-for="theme in travelThemes"
:key="theme"
class="tag"
:class="{active: currentRoute.themes.includes(theme)}"
@click="toggleTheme(theme)"
>
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

<!-- 线路预览模态框 -->
<div v-if="previewData" class="modal-overlay" @click.self="previewData = null">
<div class="preview-modal">
<button class="close-btn" @click="previewData = null">
<font-awesome-icon :icon="['fas', 'xmark']" />
</button>

<h2>{{ previewData.title }}</h2>
<p class="subtitle">{{ previewData.description }}</p>

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
<img :src="item.image" :alt="item.name">
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
<div v-if="showItineraryModal" class="modal-overlay" @click.self="closeItineraryModal">
  <div class="itinerary-modal">
    <button class="close-btn" @click="closeItineraryModal">
      <font-awesome-icon :icon="['fas', 'xmark']" />
    </button>

    <h2>智能行程规划</h2>
    <p class="modal-subtitle">AI为您定制完美旅行计划</p>

    <div class="itinerary-form">
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
          <input v-model="itineraryPlan.endDate" type="date" required />
        </div>
      </div>

      <div class="form-group">
        <label>旅行预算（元）</label>
        <input v-model.number="itineraryPlan.budget" type="number" min="0" placeholder="5000" required />
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { routeService } from '../services/routeService'
import itineraryService from '../services/itineraryService'

export default {
setup() {
const router = useRouter()

// 视图模式控制
const viewMode = ref('grid') // 'grid' 或 'list'
const toggleViewMode = () => {
viewMode.value = viewMode.value === 'grid' ? 'list' : 'grid'
}

// 搜索功能
const searchQuery = ref('')

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

// 模拟数据 - 我的线路
const myRoutes = ref([
{
id: 1,
title: '北京经典三日游',
startDate: '2023-10-01',
endDate: '2023-10-03',
coverImage: 'https://copyright.bdstatic.com/vcg/creative/1aceea7f204b2475d79dc874233bbd82.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw==',
themes: ['历史文化', '城市探索'],
companion: 'family',
preferences: {
culture: 80,
relaxation: 40,
budget: 60
},
progress: 75,
isFavorite: true,
createdAt: '2023-09-15'
},
// 更多线路数据...
])

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
coverImage: 'https://copyright.bdstatic.com/vcg/creative/1aceea7f204b2475d79dc874233bbd82.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw=='
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
coverImage: 'https://copyright.bdstatic.com/vcg/creative/fa3d00f2dd0d2d2fc5b7f6e5d8ce63a1.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw=='
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
coverImage: 'https://copyright.bdstatic.com/vcg/creative/10f2f032f8b98f0778c11ae5c7d5d8e6.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw=='
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
coverImage: 'https://copyright.bdstatic.com/vcg/creative/6fbe34e3cf19cecf03b10c9736f66e00.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw=='
}
])

// 标签和主题数据
const travelThemes = ref([
'历史文化', '自然风光', '美食之旅', '亲子游乐',
'摄影之旅', '户外探险', '城市探索', '乡村度假'
])

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
return myRoutes.value.filter(route =>
route.title.toLowerCase().includes(searchQuery.value.toLowerCase())
)
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
image: `https://example.com/images/${attraction.name.replace(/\s+/g, '-').toLowerCase()}.jpg`,
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
currentRoute.value = createNewRoute()
isEditing.value = false
showModal.value = true
}

function editRoute(id) {
const route = myRoutes.value.find(r => r.id === id)
if (route) {
currentRoute.value = {...route}
isEditing.value = true
showModal.value = true
}
}

function closeModal() {
showModal.value = false
}

function saveRoute() {
if (isEditing.value) {
// 更新现有线路
const index = myRoutes.value.findIndex(r => r.id === currentRoute.value.id)
if (index !== -1) {
myRoutes.value[index] = {...currentRoute.value}
}
} else {
// 添加新线路
const newRoute = {
...currentRoute.value,
id: Date.now(),
progress: 0,
isFavorite: false,
createdAt: new Date().toISOString().split('T')[0]
}
myRoutes.value.unshift(newRoute)
}
closeModal()
}

function deleteRoute(id) {
if (confirm('确定要删除这条线路吗？')) {
myRoutes.value = myRoutes.value.filter(r => r.id !== id)
}
}

function toggleFavorite(id) {
const route = myRoutes.value.find(r => r.id === id)
if (route) {
route.isFavorite = !route.isFavorite
}
}

function shareRoute(id) {
const route = myRoutes.value.find(r => r.id === id)
if (route) {
alert(`已生成线路 "${route.title}" 的分享链接，已复制到剪贴板`)
// 实际应用中这里会生成真正的分享链接
}
}

function applyRecommendation(rec) {
const newRoute = {
...createNewRoute(),
title: rec.title,
themes: rec.tags,
coverImage: rec.coverImage,
progress: 30 // 应用推荐线路后初始进度
}
myRoutes.value.unshift({
...newRoute,
id: Date.now(),
isFavorite: false,
createdAt: new Date().toISOString().split('T')[0]
})
previewData.value = null
// 实际应用中这里会导航到线路编辑页面
router.push({ name: 'route-edit', params: { id: newRoute.id } })
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
const date = new Date(dateStr)
return `${date.getMonth() + 1}月${date.getDate()}日`
}

function calculateDuration(startDate, endDate) {
if (!startDate || !endDate) return 0
const start = new Date(startDate)
const end = new Date(endDate)
return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1
}

function getRandomCoverImage() {
const covers = [
'https://example.com/images/cover-1.jpg',
'https://example.com/images/cover-2.jpg',
'https://example.com/images/cover-3.jpg'
]
return covers[Math.floor(Math.random() * covers.length)]
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
  if (!itineraryPlan.value.destination || !itineraryPlan.value.startDate || 
      !itineraryPlan.value.endDate || !itineraryPlan.value.budget ||
      itineraryPlan.value.preferences.length === 0) {
    alert('请填写完整信息')
    return
  }
  
  const days = Math.ceil((new Date(itineraryPlan.value.endDate) - new Date(itineraryPlan.value.startDate)) / (1000 * 60 * 60 * 24)) + 1
  
  const dailyPlan = itineraryService.generateDailyPlan(
    itineraryPlan.value.destination,
    itineraryPlan.value.preferences,
    itineraryPlan.value.budget,
    days
  )
  
  generatedItinerary.value = {
    ...itineraryPlan.value,
    days: dailyPlan
  }
}

function exportItineraryPlan() {
  if (!generatedItinerary.value) return
  
  const itinerary = itineraryService.createItinerary(generatedItinerary.value)
  const text = itineraryService.exportItinerary(itinerary)
  
  const blob = new Blob([text], { type: 'text/plain' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${generatedItinerary.value.destination}行程计划.txt`
  a.click()
  window.URL.revokeObjectURL(url)
  
  alert('行程已导出!')
}

function saveAsRoute() {
  if (!generatedItinerary.value) return
  
  const newRoute = {
    title: `${generatedItinerary.value.destination}${generatedItinerary.value.days.length}日游`,
    startDate: generatedItinerary.value.startDate,
    endDate: generatedItinerary.value.endDate,
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
    preferences: {
      culture: 50,
      relaxation: 50,
      budget: generatedItinerary.value.budget / 100
    },
    progress: 30,
    isFavorite: false,
    createdAt: new Date().toISOString().split('T')[0],
    id: Date.now()
  }
  
  myRoutes.value.unshift(newRoute)
  closeItineraryModal()
  alert('已保存为线路!')
}

// 生命周期钩子
onMounted(() => {
// 可以在这里加载真实数据
})

return {
  viewMode,
  toggleViewMode,
  searchQuery,
  myRoutes,
  smartRecommendations,
  filteredRoutes,
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
  closeModal,
  saveRoute,
  deleteRoute,
  toggleFavorite,
  shareRoute,
  applyRecommendation,
  previewRecommendation,
  toggleTheme,
  formatDate,
  calculateDuration,
  getRandomCoverImage
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
font-size: 24px;
cursor: pointer;
color: #666;
}

.close-btn:hover {
color: #333;
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
.form-group input[type="date"] {
width: 100%;
padding: 12px;
border: 1px solid #ddd;
border-radius: 8px;
font-size: 16px;
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
cursor: pointer;
transition: all 0.2s;
}

.theme-tags .tag.active {
background: #4361ee;
color: white;
}

.companion-selector {
display: grid;
grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
gap: 10px;
}

.companion-option {
padding: 15px;
border: 1px solid #ddd;
border-radius: 8px;
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
color: #666;
}

.companion-option.active {
border-color: #4361ee;
background: #edf2ff;
}

.companion-option.active svg {
color: #4361ee;
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
color: #666;
min-width: 60px;
}

.slider-item input[type="range"] {
flex: 1;
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
</style>
