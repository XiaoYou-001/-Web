<template>
  <form class="meal-form" @submit.prevent="submit">
    <p class="meal-target">加入用餐：<strong>{{ restaurant.name }}</strong><small v-if="restaurant.address"> · {{ restaurant.address }}</small></p>
    <template v-if="!route">
      <label>旅行
        <select v-model="selectedRouteId" @change="onRouteChange">
          <option value="" disabled>请选择旅行</option>
          <option v-for="item in travel.routes" :key="item.id" :value="String(item.id)">{{ item.title }}</option>
        </select>
      </label>
    </template>
    <label>日期 <input v-model="date" type="date" :min="targetRoute?.startDate || ''" :max="targetRoute?.endDate || ''" required></label>
    <label>用餐时段
      <select v-model="slot" @change="onSlotChange">
        <option v-for="option in MEAL_SLOTS" :key="option.key" :value="option.key">{{ option.label }}</option>
      </select>
    </label>
    <label>时间 <input v-model="time" type="time" required></label>
    <label>人数 <input v-model.number="persons" type="number" min="1" max="99" step="1" required></label>
    <label>人均预算（元，可留空）<input v-model="budget" type="number" min="0" step="0.01" placeholder="待确认"></label>
    <label class="meal-note">口味或备注 <input v-model="note" maxlength="200" placeholder="例如：不吃辣、需要儿童座椅"></label>
    <label class="meal-confirm" v-if="conflicts.length">
      <input v-model="confirmConflict" type="checkbox">
      与「{{ conflicts[0].title }}」{{ conflicts[0].time }} 时间重叠，我已确认仍要添加
    </label>
    <p class="meal-hint">人均预算留空时费用记为“待确认”，不会按免费处理；费用可在费用记录中修改。</p>
    <button type="submit" :disabled="busy">{{ busy ? '添加中…' : '加入行程' }}</button>
    <p role="status" :class="{ 'meal-error': error }">{{ message }}</p>
  </form>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTravelStore } from '../stores/travel.js'
import { useTravelContext } from '../composables/useTravelContext.js'
import { MEAL_SLOTS, addMeal, mealConflicts, parseMealTime } from '../utils/dining.js'
import { localDateString } from '../utils/date.js'

const props = defineProps({
  restaurant: { type: Object, required: true },
  route: { type: Object, default: null },
  travelId: { type: String, default: '' }
})
const emit = defineEmits(['added'])
const travel = useTravelStore()
const router = useRouter()
const context = useTravelContext()

const selectedRouteId = ref('')
const slot = ref('lunch')
const time = ref('12:00')
const persons = ref(1)
const budget = ref('')
const note = ref('')
const date = ref(localDateString())
const confirmConflict = ref(false)
const busy = ref(false)
const message = ref('')
const error = ref(false)

const targetRoute = computed(() => {
  if (props.route) return props.route
  return travel.routes.find(item => String(item.id) === selectedRouteId.value) || null
})
const conflicts = computed(() => {
  const day = (targetRoute.value?.days || []).find(item => item.date === date.value)
  if (!day || parseMealTime(time.value) === null) return []
  return mealConflicts(day, { time: time.value, durationMinutes: MEAL_SLOTS.find(item => item.key === slot.value)?.durationMinutes ?? 60 })
})

function onSlotChange() {
  const option = MEAL_SLOTS.find(item => item.key === slot.value)
  if (option?.defaultTime) time.value = option.defaultTime
  confirmConflict.value = false
}

function onRouteChange() {
  confirmConflict.value = false
  const target = targetRoute.value
  if (!target) return
  const today = localDateString()
  date.value = today >= target.startDate && today <= target.endDate ? today : target.startDate
  persons.value = Number(target.persons) || 1
}

watch(() => [props.restaurant?.id, props.route?.id], () => {
  error.value = false
  message.value = ''
  confirmConflict.value = false
}, { immediate: false })

if (props.route) {
  persons.value = Number(props.route.persons) || 1
  date.value = props.route.startDate || localDateString()
  if ((props.route.days || []).length) {
    const today = localDateString()
    const match = props.route.days.find(day => day.date === today)
    date.value = match ? today : props.route.days[0].date
  }
} else {
  const current = context.value
  selectedRouteId.value = props.travelId || (current ? String(current.id) : (travel.routes[0] ? String(travel.routes[0].id) : ''))
  const target = targetRoute.value
  if (target) {
    const today = localDateString()
    date.value = today >= target.startDate && today <= target.endDate ? today : target.startDate
    persons.value = Number(target.persons) || 1
  }
}

function submit() {
  message.value = ''
  error.value = false
  if (!props.route && !travel.ownerId) {
    router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
    return
  }
  const target = targetRoute.value
  if (!props.route && !target) { error.value = true; message.value = '请先选择旅行，或先在「我的旅行」中创建一次旅行。'; return }
  if (!props.route && (date.value < target.startDate || date.value > target.endDate)) { error.value = true; message.value = '请选择旅行日期范围内的一天'; return }
  busy.value = true
  try {
    if (props.route) {
      const result = addMeal(target, {
        restaurant: props.restaurant, date: date.value, slot: slot.value, time: time.value,
        persons: persons.value, budgetPerPersonYuan: budget.value, note: note.value,
        confirmConflict: confirmConflict.value
      })
      confirmConflict.value = false
      message.value = `已加入 ${date.value} ${target.title}，预计费用${result.estimatedTotal == null ? '待确认' : ` ¥${result.estimatedTotal}`}。保存旅行后生效。`
    } else {
      const draft = JSON.parse(JSON.stringify(target))
      const result = addMeal(draft, {
        restaurant: props.restaurant, date: date.value, slot: slot.value, time: time.value,
        persons: persons.value, budgetPerPersonYuan: budget.value, note: note.value,
        confirmConflict: confirmConflict.value
      })
      travel.saveRoute(draft)
      confirmConflict.value = false
      message.value = `已加入《${draft.title}》，预计费用${result.estimatedTotal == null ? '待确认' : ` ¥${result.estimatedTotal}`}。`
    }
    emit('added', { date: date.value })
  } catch (cause) {
    error.value = true
    message.value = cause.message || '添加失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>
<style scoped>
.meal-form{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;padding:12px;border:1px solid #d7e1eb;border-radius:10px;background:#f8fbff;margin:10px 0}
.meal-target{flex-basis:100%;margin:0;color:#243449}.meal-target small{color:#5c6b7a}
.meal-form label{display:grid;gap:4px;font-size:13px;color:#3d4f61}
.meal-form input,.meal-form select,.meal-form button{padding:8px;border:1px solid #c9d6e2;border-radius:6px;max-width:100%}
.meal-form button{background:#2f6fed;color:#fff;border:none;min-height:38px;cursor:pointer}
.meal-form button:disabled{opacity:.6;cursor:progress}
.meal-note{flex:1 1 240px}.meal-confirm{flex-basis:100%;flex-direction:row;align-items:center;gap:8px;color:#a34a00}
.meal-hint{flex-basis:100%;margin:0;font-size:12px;color:#5c6b7a}
.meal-error{color:#c92a2a}
[role="status"]{flex-basis:100%;margin:0;font-size:13px;color:#1f6f43}
.meal-error[role="status"]{color:#c92a2a}
</style>
