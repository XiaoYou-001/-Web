<template>
  <div class="food-view">
    <TravelContextBanner />
    <p v-if="travel.storageError" role="alert">{{ travel.storageError }}</p>
    <PageHeader icon="utensils" title="美食探索与用餐安排" subtitle="搜索真实餐厅，记录口味与人均预算，再把用餐加入旅行日程">
      <div class="food-stats">
        <div class="stat-chip"><font-awesome-icon :icon="['fas', 'heart']" /><span>{{ favorites.length }}</span><em>收藏餐厅</em></div>
        <div class="stat-chip"><font-awesome-icon :icon="['fas', 'utensils']" /><span>{{ plannedMeals.count }}</span><em>已安排用餐</em></div>
        <div class="stat-chip"><font-awesome-icon :icon="['fas', 'circle-dollar-to-slot']" /><span>{{ plannedMeals.unknownCost }}</span><em>费用待确认</em></div>
      </div>
    </PageHeader>

    <section class="search-panel" aria-label="搜索真实餐厅">
      <div class="search-row">
        <label>城市 <input v-model="city" placeholder="例如：杭州" @keydown.enter.prevent="search"></label>
        <label class="keyword">餐厅或菜品 <input v-model="keyword" placeholder="输入餐厅、菜系或地标，例如：西湖边 杭帮菜" @keydown.enter.prevent="search"></label>
        <button type="button" class="search-btn" :disabled="searching" @click="search">
          <font-awesome-icon :icon="['fas', searching ? 'spinner' : 'magnifying-glass']" :class="{ spinning: searching }" />
          {{ searching ? '搜索中…' : '搜索真实地点' }}
        </button>
      </div>
      <div class="keyword-chips" role="group" aria-label="常用搜索词">
        <button v-for="word in FOOD_KEYWORDS" :key="word" type="button" @click="applyKeyword(word)">{{ word }}</button>
      </div>
      <p class="search-hint">结果来自高德地图真实地点检索，需明确选择具体餐厅；来源未提供的价格不会自动生成，人均预算请自行填写。</p>
      <p v-if="searchError" class="error-line" role="alert">{{ searchError }} <button type="button" @click="search">重试</button></p>
    </section>

    <section v-if="results.length" class="result-section" aria-label="搜索结果">
      <h2>搜索结果（{{ results.length }}）</h2>
      <ul class="restaurant-list">
        <li v-for="item in results" :key="item.id" class="restaurant-card">
          <div class="restaurant-head">
            <h3>{{ item.name }}</h3>
            <small>{{ item.city }} · 来源 {{ item.source }}</small>
          </div>
          <p class="restaurant-address">{{ item.address || '地址未提供' }}</p>
          <div class="restaurant-actions">
            <button type="button" @click="openPlan(item)">安排到行程</button>
            <button type="button" :class="{ saved: isFavorite(item.id) }" @click="toggleFavorite(item)">
              {{ isFavorite(item.id) ? '已收藏' : '收藏' }}
            </button>
            <a v-if="placeLink(item)" :href="placeLink(item)" target="_blank" rel="noopener noreferrer">在高德查看</a>
          </div>
          <div v-if="activePlanId === item.id" class="plan-box">
            <p v-if="!travel.ownerId" class="error-line">请登录后把用餐加入旅行。</p>
            <AddMealToTravel v-else :restaurant="item" @added="onMealAdded" />
          </div>
        </li>
      </ul>
    </section>

    <section class="favorites-section" aria-label="我的餐厅收藏">
      <div class="section-head">
        <h2>我的餐厅收藏（{{ favorites.length }}）</h2>
        <p v-if="favoriteError" class="error-line" role="alert">{{ favoriteError }}</p>
      </div>
      <p v-if="!travel.ownerId" class="muted">登录后可保存餐厅收藏与口味备注；当前只能浏览与搜索。</p>
      <p v-else-if="!favorites.length" class="muted">还没有收藏。搜索餐厅后点「收藏」，就能记录口味、人均预算并安排用餐。</p>
      <ul v-else class="restaurant-list">
        <li v-for="favorite in favorites" :key="favorite.id" class="restaurant-card favorite-card">
          <div class="restaurant-head">
            <h3>{{ favorite.name }}</h3>
            <small>{{ favorite.city || '城市待确认' }} · 人均 {{ favorite.budgetPerPerson == null ? '待确认' : `¥${favorite.budgetPerPerson}` }}</small>
          </div>
          <p class="restaurant-address">{{ favorite.address || '地址未提供' }}</p>
          <p v-if="favorite.taste" class="taste">口味：{{ favorite.taste }}</p>
          <p v-if="favorite.note" class="note-line">备注：{{ favorite.note }}</p>
          <form v-if="editingFavoriteId === favorite.id" class="favorite-form" @submit.prevent="saveFavoriteEdit(favorite)">
            <label>口味或菜系 <input v-model="editDraft.taste" maxlength="120" placeholder="例如：微辣、杭帮菜"></label>
            <label>人均预算（元，可留空）<input v-model="editDraft.budgetPerPerson" type="number" min="0" step="0.01" placeholder="待确认"></label>
            <label>备注 <input v-model="editDraft.note" maxlength="240" placeholder="例如：适合带长辈"></label>
            <div class="favorite-form-actions">
              <button type="submit">保存</button>
              <button type="button" @click="editingFavoriteId = ''">取消</button>
            </div>
          </form>
          <div class="restaurant-actions">
            <button type="button" @click="openPlan(favoriteToRestaurant(favorite), favorite.id)">安排到行程</button>
            <button type="button" @click="startEdit(favorite)">编辑备注</button>
            <button type="button" class="danger" @click="remove(favorite)">删除收藏</button>
            <a v-if="placeLink(favorite)" :href="placeLink(favorite)" target="_blank" rel="noopener noreferrer">在高德查看</a>
          </div>
          <div v-if="activePlanId === `fav-${favorite.id}`" class="plan-box">
            <AddMealToTravel :restaurant="favoriteToRestaurant(favorite)" @added="onMealAdded" />
          </div>
        </li>
      </ul>
    </section>

    <section v-if="travel.ownerId" class="planned-section" aria-label="已安排的用餐">
      <div class="section-head">
        <h2>旅行用餐概览</h2>
        <label>旅行
          <select v-model="overviewRouteId">
            <option value="">请选择旅行</option>
            <option v-for="item in travel.routes" :key="item.id" :value="String(item.id)">{{ item.title }}</option>
          </select>
        </label>
      </div>
      <template v-if="overviewRoute">
        <p class="muted">
          已安排 {{ overviewMeals.count }} 项 · 预计用餐费用 {{ mealCostLabel(overviewMeals) }}
          · <router-link :to="{ name: 'route-detail', params: { id: String(overviewRoute.id) } }">在旅行工作台替换餐厅或移回候选池</router-link>
        </p>
        <p v-if="overviewMeals.missingDates.length" class="warn-line">{{ overviewMeals.missingDates.length }} 天还没有用餐安排：{{ overviewMeals.missingDates.slice(0, 5).join('、') }}</p>
        <ul class="meal-planned-list">
          <li v-for="meal in overviewMeals.meals" :key="meal.activity.id">
            <strong>{{ meal.date }} {{ meal.activity.time }}</strong> {{ meal.activity.slotLabel }} · {{ meal.activity.title }}
            <small>人均 {{ meal.activity.meal?.budgetPerPerson == null ? '待确认' : `¥${meal.activity.meal.budgetPerPerson}` }}</small>
          </li>
        </ul>
        <p v-if="!overviewMeals.count" class="muted">这个旅行还没有安排用餐。</p>
      </template>
      <p v-else class="muted">选择一次旅行查看每天的用餐安排。</p>
    </section>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import TravelContextBanner from '../components/TravelContextBanner.vue'
import AddMealToTravel from '../components/AddMealToTravel.vue'
import { FontAwesomeIcon } from '../ui/fontAwesome.js'
import { useTravelStore } from '../stores/travel.js'
import { useTravelContext } from '../composables/useTravelContext.js'
import { searchPlaces, placeLink } from '../services/mapPlaces.js'
import { listFavorites, saveFavorite, updateFavorite, removeFavorite } from '../services/foodService.js'
import { FOOD_KEYWORDS, mealCoverage, mealCostLabel } from '../utils/dining.js'

const travel = useTravelStore()
const context = useTravelContext()
const keyword = ref('')
const city = ref('')
const results = ref([])
const searching = ref(false)
const searchError = ref('')
const favorites = ref([])
const favoriteError = ref('')
const editDraft = ref({ taste: '', budgetPerPerson: '', note: '' })
const editingFavoriteId = ref('')
const activePlanId = ref('')
const overviewRouteId = ref('')
let controller = null

const overviewRoute = computed(() => travel.routes.find(item => String(item.id) === overviewRouteId.value) || null)
const overviewMeals = computed(() => overviewRoute.value ? mealCoverage(overviewRoute.value) : { count: 0, meals: [], estimatedTotal: 0, missingDates: [], unknownCost: 0 })
const plannedMeals = computed(() => {
  const totals = { count: 0, unknownCost: 0 }
  for (const route of travel.routes) {
    const coverage = mealCoverage(route)
    totals.count += coverage.count
    totals.unknownCost += coverage.unknownCost
  }
  return totals
})

function loadFavorites() {
  if (!travel.ownerId) { favorites.value = []; return }
  try {
    favorites.value = listFavorites(travel.ownerId)
    favoriteError.value = ''
  } catch (cause) {
    favoriteError.value = cause.message || '餐厅收藏读取失败'
    favorites.value = []
  }
}

function applyKeyword(word) {
  keyword.value = word
  search()
}

async function search() {
  if (!keyword.value.trim()) { searchError.value = '请输入餐厅、菜系或地标名称'; return }
  controller?.abort()
  const current = new AbortController()
  controller = current
  searching.value = true
  searchError.value = ''
  results.value = []
  try {
    const found = await searchPlaces(keyword.value, city.value, { signal: current.signal })
    if (current.signal.aborted) return
    results.value = found
    if (!found.length) searchError.value = '没有找到匹配地点，请补充城市或换个关键词。'
  } catch (cause) {
    if (!current.signal.aborted) searchError.value = cause.message || '地点查询失败，请重试'
  } finally {
    if (controller === current) searching.value = false
  }
}

function isFavorite(restaurantId) {
  return favorites.value.some(item => item.restaurantId === restaurantId)
}

function toggleFavorite(item) {
  if (!travel.ownerId) { favoriteError.value = '请登录后再收藏餐厅'; return }
  try {
    if (isFavorite(item.id)) {
      const existing = favorites.value.find(favorite => favorite.restaurantId === item.id)
      removeFavorite(travel.ownerId, existing.id)
    } else {
      saveFavorite(travel.ownerId, item)
    }
    loadFavorites()
  } catch (cause) {
    favoriteError.value = cause.message || '收藏失败'
  }
}

function openPlan(restaurant, favoriteId = '') {
  const restaurantId = restaurant?.id || ''
  const key = favoriteId ? `fav-${favoriteId}` : restaurantId
  activePlanId.value = activePlanId.value === key ? '' : key
}

function onMealAdded() {
  activePlanId.value = ''
}

function favoriteToRestaurant(favorite) {
  return {
    id: favorite.restaurantId,
    name: favorite.name,
    address: favorite.address,
    city: favorite.city,
    location: favorite.location,
    coordinateSystem: favorite.coordinateSystem,
    source: favorite.source
  }
}

function startEdit(favorite) {
  editingFavoriteId.value = favorite.id
  editDraft.value = {
    taste: favorite.taste || '',
    budgetPerPerson: favorite.budgetPerPerson == null ? '' : String(favorite.budgetPerPerson),
    note: favorite.note || ''
  }
}

function saveFavoriteEdit(favorite) {
  try {
    updateFavorite(travel.ownerId, favorite.id, {
      taste: editDraft.value.taste,
      budgetPerPerson: editDraft.value.budgetPerPerson === '' ? null : editDraft.value.budgetPerPerson,
      note: editDraft.value.note
    })
    editingFavoriteId.value = ''
    loadFavorites()
  } catch (cause) {
    favoriteError.value = cause.message || '保存失败'
  }
}

function remove(favorite) {
  try {
    removeFavorite(travel.ownerId, favorite.id)
    if (editingFavoriteId.value === favorite.id) editingFavoriteId.value = ''
    loadFavorites()
  } catch (cause) {
    favoriteError.value = cause.message || '删除失败'
  }
}

// 在 setup 阶段读取本账号收藏，SSR 与首屏都能直接展示。
const initialRoute = context.value
city.value = initialRoute?.destinations?.[0] || initialRoute?.destination || ''
overviewRouteId.value = initialRoute ? String(initialRoute.id) : (travel.routes[0] ? String(travel.routes[0].id) : '')
loadFavorites()
</script>
<style scoped>
.food-view{max-width:1280px;margin:0 auto;padding:20px}
.food-stats{display:flex;flex-wrap:wrap;gap:10px}
.stat-chip{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#fff;border:1px solid #e1e8ef;border-radius:10px;color:#2f6fed}
.stat-chip em{font-style:normal;color:#5c6b7a;font-size:12px}
.search-panel{margin:18px 0;padding:16px;background:#f7fbff;border:1px solid #dbe6f1;border-radius:12px}
.search-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.search-row label{display:grid;gap:4px;font-size:13px;color:#3d4f61}
.search-row .keyword{flex:1 1 320px}
.search-row input{padding:10px;border:1px solid #c9d6e2;border-radius:8px;min-width:0}
.search-btn{display:flex;align-items:center;gap:6px;padding:10px 16px;background:#2f6fed;color:#fff;border:none;border-radius:8px;cursor:pointer;min-height:42px}
.search-btn:disabled{opacity:.65;cursor:progress}
.keyword-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.keyword-chips button{padding:6px 12px;border:1px solid #c9d6e2;background:#fff;border-radius:999px;cursor:pointer;color:#3d4f61}
.search-hint{margin:10px 0 0;font-size:12px;color:#5c6b7a}
.error-line{margin:8px 0 0;color:#c92a2a}
.warn-line{color:#a34a00}
.muted{color:#5c6b7a}
.restaurant-list{list-style:none;padding:0;margin:12px 0;display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.restaurant-card{padding:14px;background:#fff;border:1px solid #e1e8ef;border-radius:12px}
.restaurant-head{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:baseline}
.restaurant-head h3{margin:0;font-size:17px;color:#243449}
.restaurant-head small{color:#6b7a89}
.restaurant-address{margin:6px 0;color:#4b5b6b;font-size:13px}
.restaurant-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.restaurant-actions button,.favorite-form button{padding:7px 12px;border:1px solid #c9d6e2;background:#fff;border-radius:8px;cursor:pointer;color:#2f4b66}
.restaurant-actions button.saved{background:#e8f5ee;border-color:#9fd0b4;color:#1f6f43}
.restaurant-actions button.danger{color:#c92a2a}
.restaurant-actions a{font-size:13px;color:#2f6fed;align-self:center}
.plan-box{margin-top:10px}
.taste{margin:4px 0;color:#2f6fed;font-size:13px}
.note-line{margin:4px 0;color:#4b5b6b;font-size:13px}
.favorite-form{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0}
.favorite-form label{display:grid;gap:4px;font-size:13px;color:#3d4f61}
.favorite-form input{padding:8px;border:1px solid #c9d6e2;border-radius:6px}
.favorite-form-actions{display:flex;gap:8px;align-items:flex-end}
.section-head{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:baseline}
.section-head label{display:flex;gap:8px;align-items:center;font-size:13px;color:#3d4f61}
.section-head select{padding:8px;border:1px solid #c9d6e2;border-radius:6px;max-width:100%}
.meal-planned-list{list-style:none;padding:0;margin:10px 0;display:grid;gap:6px}
.meal-planned-list li{padding:8px 10px;background:#fff;border:1px solid #e1e8ef;border-radius:8px;font-size:14px}
.meal-planned-list small{margin-left:8px;color:#6b7a89}
.favorites-section,.planned-section{margin-top:28px}
.spinning{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media (max-width:640px){.food-view{padding:12px}.restaurant-list{grid-template-columns:1fr}}
</style>
