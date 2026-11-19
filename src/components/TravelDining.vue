<template>
  <details class="travel-dining" open>
    <summary>用餐安排（{{ coverage.count }} 项<span v-if="coverage.unknownCost"> · {{ coverage.unknownCost }} 项费用待确认</span>）</summary>
    <p class="dining-summary">
      已安排 {{ coverage.dates }} 天 · 预计用餐费用 {{ mealCostLabel(coverage) }}
      <span v-if="coverage.missingDates.length"> · {{ coverage.missingDates.length }} 天还没有用餐安排</span>
    </p>
    <p class="dining-policy">餐厅只来自真实地点检索；人均预算由你填写，留空时记为待确认，不会按免费计算。</p>

    <ul v-if="meals.length" class="meal-list">
      <li v-for="meal in meals" :key="meal.activity.id">
        <div>
          <strong>{{ meal.date }} {{ meal.activity.time }} {{ meal.activity.slotLabel }}</strong>
          · {{ meal.activity.title }}
          <small v-if="meal.activity.meal?.persons"> · {{ meal.activity.meal.persons }} 人</small>
          <small> · 人均 {{ meal.activity.meal?.budgetPerPerson == null ? '待确认' : `¥${meal.activity.meal.budgetPerPerson}` }}</small>
          <small v-if="meal.activity.meal?.note"> · {{ meal.activity.meal.note }}</small>
        </div>
        <div class="meal-actions">
          <select v-if="favorites.length" v-model="replaceSelections[meal.activity.id]">
            <option value="">选择收藏餐厅替换</option>
            <option v-for="favorite in favorites" :key="favorite.id" :value="favorite.id">{{ favorite.name }}</option>
          </select>
          <button type="button" :disabled="!replaceSelections[meal.activity.id]" @click="replaceMealWith(meal.activity)">替换</button>
          <button type="button" @click="moveToPool(meal.activity)">移回候选池</button>
        </div>
      </li>
    </ul>
    <p v-else>还没有安排用餐，可从收藏餐厅中选择一家加入指定日期。</p>

    <div v-if="favorites.length">
      <label class="favorite-pick">选择收藏餐厅
        <select v-model="pickedFavoriteId">
          <option value="">请选择</option>
          <option v-for="favorite in favorites" :key="favorite.id" :value="favorite.id">{{ favorite.name }}<template v-if="favorite.budgetPerPerson != null"> · 人均 ¥{{ favorite.budgetPerPerson }}</template></option>
        </select>
      </label>
      <AddMealToTravel v-if="pickedRestaurant" :restaurant="pickedRestaurant" :route="route" @added="onAdded" />
    </div>
    <p v-else>
      还没有收藏餐厅。<router-link :to="{ path: '/food', query: { travel: String(route.id) } }">去美食探索页搜索并收藏真实餐厅</router-link>。
    </p>
  </details>
</template>
<script setup>
import { computed, ref } from 'vue'
import AddMealToTravel from './AddMealToTravel.vue'
import { useTravelStore } from '../stores/travel.js'
import { useFeedback } from '../composables/useFeedback.js'
import { listFavorites } from '../services/foodService.js'
import { mealCoverage, mealCostLabel, replaceMeal, moveMealToPool, restaurantFromFavorite } from '../utils/dining.js'

const props = defineProps({ route: { type: Object, required: true } })
const travel = useTravelStore()
const feedback = useFeedback()
const favorites = ref([])
const pickedFavoriteId = ref('')
const replaceSelections = ref({})

const meals = computed(() => mealCoverage(props.route).meals)
const coverage = computed(() => mealCoverage(props.route))
const pickedRestaurant = computed(() => {
  const favorite = favorites.value.find(item => item.id === pickedFavoriteId.value)
  return favorite ? restaurantFromFavorite(favorite) : null
})

function refresh() {
  try {
    favorites.value = travel.ownerId ? listFavorites(travel.ownerId) : []
  } catch (cause) {
    favorites.value = []
    feedback.error(cause.message || '餐厅收藏读取失败')
  }
}

function onAdded() {
  feedback.success('已加入本次用餐安排，保存旅行后生效')
}

function replaceMealWith(activity) {
  const favorite = favorites.value.find(item => item.id === replaceSelections.value[activity.id])
  if (!favorite) return
  try {
    replaceMeal(props.route, activity.id, { restaurant: restaurantFromFavorite(favorite) })
    feedback.success('已替换餐厅，旧交通估算已失效，请重新查询')
    replaceSelections.value[activity.id] = ''
  } catch (cause) {
    feedback.error(cause.message || '替换失败')
  }
}

function moveToPool(activity) {
  try {
    moveMealToPool(props.route, activity.id)
    feedback.success('已移回候选池；由它生成的预计餐费已移除，已记录的实际花费保留')
  } catch (cause) {
    feedback.error(cause.message || '操作失败')
  }
}

// 在 setup 阶段读取本账号收藏，SSR 与首屏都能展示收藏列表。
refresh()
</script><style scoped>
.travel-dining{margin:16px 0;padding:12px 16px;background:#fffdf6;border:1px solid #ecdfc3;border-radius:10px}
.dining-summary{margin:6px 0;color:#5a4a2c}
.dining-policy{margin:0 0 8px;font-size:12px;color:#6b6350}
.meal-list{list-style:none;padding:0;margin:8px 0}
.meal-list li{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px dashed #e6dcc4}
.meal-list small{color:#6b6350}
.meal-actions{display:flex;flex-wrap:wrap;gap:6px}
.meal-actions select,.meal-actions button,.favorite-pick select{padding:6px;border:1px solid #d9cbaa;border-radius:6px;max-width:100%}
.meal-actions button{cursor:pointer;background:#fff}
.favorite-pick{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0;font-size:13px}
</style>
