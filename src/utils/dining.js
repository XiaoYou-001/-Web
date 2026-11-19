import { parseDateOnly, localDateString } from './date.js'
import { createId } from './id.js'

// 用餐安排：餐厅只能来自真实地点检索结果（含坐标），价格由用户填写，缺失时保持“待确认”。
export const MEAL_SLOTS = [
  { key: 'lunch', label: '午餐', defaultTime: '12:00', durationMinutes: 60, icon: 'utensils' },
  { key: 'dinner', label: '晚餐', defaultTime: '18:30', durationMinutes: 90, icon: 'utensils' },
  { key: 'custom', label: '自定义时段', defaultTime: '', durationMinutes: 60, icon: 'clock' }
]

export const FOOD_KEYWORDS = ['本地菜', '火锅', '小吃', '咖啡', '素食', '早餐', '夜宵']
export const MEAL_CATEGORY = '用餐'

export function mealSlot(key) {
  return MEAL_SLOTS.find(slot => slot.key === key) || MEAL_SLOTS[2]
}

export function parseMealTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function formatMealTime(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 24 * 60) return ''
  const pad = value => String(value).padStart(2, '0')
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

// 人均预算：'' / null 表示用户没有填写，返回 null；任何非法值都要报错，不能当成 0 元。
export function normalizeBudgetYuan(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(number)) throw new Error('人均预算请填写数字，或留空表示待确认')
  if (number < 0) throw new Error('人均预算不能为负数')
  if (number > 100000) throw new Error('人均预算过大，请检查金额')
  return Math.round(number * 100) / 100
}

// 只接受检索到的真实地点：名称必填，坐标为 [lng, lat] 且必须有效。
export function normalizeRestaurant(poi) {
  const name = String(poi?.name ?? '').trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('请选择检索结果中的餐厅，而不是手动编造名称')
  if (name.length > 80) throw new Error('餐厅名称过长，请重新选择')
  const raw = poi?.location
  const lng = Number(Array.isArray(raw) ? raw[0] : raw?.lng ?? raw?.getLng?.())
  const lat = Number(Array.isArray(raw) ? raw[1] : raw?.lat ?? raw?.getLat?.())
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    throw new Error('该餐厅缺少有效坐标，请重新搜索并选择带位置的结果')
  }
  return {
    id: typeof poi?.id === 'string' && poi.id ? poi.id : `${name}\u0000${lng.toFixed(5)},${lat.toFixed(5)}`,
    name,
    address: typeof poi?.address === 'string' ? poi.address.slice(0, 120) : '',
    city: typeof poi?.city === 'string' ? poi.city.slice(0, 40) : '',
    location: [lng, lat],
    coordinateSystem: poi?.coordinateSystem === 'GCJ-02' || poi?.coordinateSystem === 'WGS-84' ? poi.coordinateSystem : 'GCJ-02',
    source: typeof poi?.source === 'string' && poi.source ? poi.source : '高德地图'
  }
}

export function restaurantFromFavorite(favorite) {
  return normalizeRestaurant({
    id: favorite?.restaurantId || favorite?.id,
    name: favorite?.name,
    address: favorite?.address,
    city: favorite?.city,
    location: favorite?.location,
    coordinateSystem: favorite?.coordinateSystem,
    source: favorite?.source
  })
}

// 判断某天已有活动是否与拟加入的用餐时间重叠（含前一活动的交通缓冲）。
export function mealConflicts(day, { time, durationMinutes, excludeId = '' } = {}) {
  const start = parseMealTime(time)
  const duration = Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) >= 0 ? Number(durationMinutes) : 0
  if (start === null) return []
  const conflicts = []
  for (const activity of day?.activities || []) {
    if (!activity || activity.id === excludeId) continue
    const other = parseMealTime(activity.time)
    if (other === null) continue
    const otherDuration = Number.isFinite(Number(activity.durationMinutes)) && Number(activity.durationMinutes) >= 0 ? Number(activity.durationMinutes) : 0
    const otherTravel = Number.isFinite(Number(activity.travelMinutes)) && Number(activity.travelMinutes) >= 0 ? Number(activity.travelMinutes) : 0
    const end = start + duration
    const otherEnd = other + otherDuration + otherTravel
    if (start < otherEnd && other < end) conflicts.push(activity)
  }
  return conflicts
}

export function ensureMealDay(route, date) {
  if (!route || typeof route !== 'object') throw new Error('旅行信息无效')
  parseDateOnly(date)
  if (route.startDate && date < route.startDate) throw new Error('请选择旅行日期范围内的一天')
  if (route.endDate && date > route.endDate) throw new Error('请选择旅行日期范围内的一天')
  route.days ||= []
  let day = route.days.find(item => item.date === date)
  if (!day) {
    day = { date, activities: [], budget: null }
    route.days.push(day)
    route.days.sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }
  day.activities ||= []
  return day
}

function insertSorted(day, activity) {
  const start = parseMealTime(activity.time)
  const index = day.activities.findIndex(item => {
    const other = parseMealTime(item.time)
    return other !== null && start !== null && other > start
  })
  if (index === -1) day.activities.push(activity)
  else day.activities.splice(index, 0, activity)
}

function mealDescription(restaurant, note) {
  return [restaurant.address, note].filter(Boolean).join(' · ')
}

function linkedExpense(route, mealId) {
  return (route.expenses || []).find(expense => expense && expense.sourceMealId === mealId) || null
}

export function estimatedMealTotal(route) {
  return readMeals(route).reduce((sum, meal) => sum + (Number.isFinite(meal.activity?.meal?.estimatedTotal) ? meal.activity.meal.estimatedTotal : 0), 0)
}

export function addMeal(route, input = {}) {
  const restaurant = normalizeRestaurant(input.restaurant)
  const slot = mealSlot(input.slot)
  const slotTime = parseMealTime(input.time) !== null ? input.time : slot.defaultTime
  const time = String(input.time || slotTime || '').trim()
  if (parseMealTime(time) === null) throw new Error('请填写有效的用餐时间，例如 12:00')
  const durationMinutes = input.durationMinutes === '' || input.durationMinutes == null
    ? slot.durationMinutes
    : Number(input.durationMinutes)
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) throw new Error('用餐时长请填写不小于 0 的分钟数')
  const persons = input.persons == null || input.persons === '' ? (Number(route.persons) || 1) : Number(input.persons)
  if (!Number.isFinite(persons) || persons < 1 || persons > 99) throw new Error('用餐人数请填写 1–99 之间的整数')
  const budgetPerPerson = normalizeBudgetYuan(input.budgetPerPersonYuan)
  const note = String(input.note ?? '').trim().slice(0, 200)
  const date = String(input.date || '').trim()

  const day = ensureMealDay(route, date)
  const conflicts = mealConflicts(day, { time, durationMinutes })
  if (conflicts.length && input.confirmConflict !== true) {
    throw new Error(`与「${conflicts[0].title}」时间重叠，请调整时间或确认仍然添加`)
  }

  const id = createId()
  const estimatedTotal = budgetPerPerson == null ? null : Math.round(budgetPerPerson * persons * 100) / 100
  const activity = {
    id,
    title: restaurant.name,
    time,
    description: mealDescription(restaurant, note),
    category: MEAL_CATEGORY,
    slot: slot.key,
    slotLabel: slot.label,
    durationMinutes,
    travelMinutes: null,
    completed: false,
    skipped: false,
    place: {
      name: restaurant.name,
      address: restaurant.address,
      city: restaurant.city,
      location: [...restaurant.location],
      coordinateSystem: restaurant.coordinateSystem,
      source: restaurant.source
    },
    meal: {
      restaurantId: restaurant.id,
      restaurantSource: restaurant.source,
      note,
      persons,
      budgetPerPerson,
      budgetPerPersonCents: budgetPerPerson == null ? null : Math.round(budgetPerPerson * 100),
      estimatedTotal
    }
  }
  insertSorted(day, activity)

  if (estimatedTotal != null) {
    route.expenses ||= []
    route.expenses.push({
      category: '餐饮',
      title: `${restaurant.name}（${date} ${slot.label}）`,
      estimate: estimatedTotal,
      actual: null,
      sourceMealId: id
    })
  }
  return { activity, conflictsBeforeSave: conflicts, estimatedTotal }
}

export function findMeal(route, activityId) {
  for (const [dayIndex, day] of (route?.days || []).entries()) {
    const index = (day.activities || []).findIndex(activity => activity?.id === activityId && activity.category === MEAL_CATEGORY)
    if (index !== -1) return { day, dayIndex, index, activity: day.activities[index] }
  }
  return null
}

export function readMeals(route) {
  const meals = []
  for (const day of route?.days || []) {
    for (const activity of day.activities || []) {
      if (activity?.category === MEAL_CATEGORY) meals.push({ date: day.date, activity })
    }
  }
  return meals
}

// 替换餐厅：保留原时段，清空与旧地点相关的交通估算，避免继续使用错误耗时。
export function replaceMeal(route, activityId, input = {}) {
  const found = findMeal(route, activityId)
  if (!found) throw new Error('该用餐安排已不存在，请刷新后重试')
  const restaurant = normalizeRestaurant(input.restaurant)
  const { day, activity } = found
  const budgetPerPerson = input.budgetPerPersonYuan === undefined
    ? (activity.meal?.budgetPerPerson ?? null)
    : normalizeBudgetYuan(input.budgetPerPersonYuan)
  if (budgetPerPerson != null) normalizeBudgetYuan(budgetPerPerson)
  const persons = Number(activity.meal?.persons) || Number(route.persons) || 1
  const note = input.note === undefined ? (activity.meal?.note || '') : String(input.note).trim().slice(0, 200)
  const estimatedTotal = budgetPerPerson == null ? null : Math.round(budgetPerPerson * persons * 100) / 100

  activity.title = restaurant.name
  activity.description = mealDescription(restaurant, note)
  activity.place = {
    name: restaurant.name,
    address: restaurant.address,
    city: restaurant.city,
    location: [...restaurant.location],
    coordinateSystem: restaurant.coordinateSystem,
    source: restaurant.source
  }
  activity.meal = {
    ...(activity.meal || {}),
    restaurantId: restaurant.id,
    restaurantSource: restaurant.source,
    note,
    persons,
    budgetPerPerson,
    budgetPerPersonCents: budgetPerPerson == null ? null : Math.round(budgetPerPerson * 100),
    estimatedTotal
  }
  activity.travelMinutes = null
  delete activity.travelEstimate
  // 旧地点的耗时估算（含上一站到这里的估算）全部失效。
  for (const neighbor of day.activities) {
    if (neighbor?.travelEstimate) {
      neighbor.travelMinutes = null
      delete neighbor.travelEstimate
    }
  }

  const expense = linkedExpense(route, activityId)
  if (expense) {
    expense.title = `${restaurant.name}（${day.date} ${activity.slotLabel || mealSlot(activity.slot).label}）`
    expense.estimate = estimatedTotal
  } else if (estimatedTotal != null) {
    route.expenses ||= []
    route.expenses.push({
      category: '餐饮',
      title: `${restaurant.name}（${day.date} ${activity.slotLabel || mealSlot(activity.slot).label}）`,
      estimate: estimatedTotal,
      actual: null,
      sourceMealId: activityId
    })
  }
  return activity
}

// 移回候选池：保留餐厅与人均预算，便于之后重新安排；同时移除由它生成的预计费用记录。
// 用户已填入的真实花费不会被删除：改为解除与用餐安排的关联后保留（见 reconcileMealExpenses）。
export function moveMealToPool(route, activityId) {
  const found = findMeal(route, activityId)
  if (!found) throw new Error('该用餐安排已不存在，请刷新后重试')
  const { day, index, activity } = found
  day.activities.splice(index, 1)
  const candidate = {
    ...JSON.parse(JSON.stringify(activity)),
    previousDate: day.date
  }
  delete candidate.meal?.estimatedTotal
  route.pendingActivities ||= []
  route.pendingActivities.push(candidate)
  reconcileMealExpenses(route)
  return candidate
}

// 人均预算 × 人数 = 预计总额；未填预算返回 null，绝不按 0 元处理。
export function mealEstimate(activity) {
  const perPerson = activity?.meal?.budgetPerPerson
  if (perPerson == null || perPerson === '') return null
  const persons = Number(activity?.meal?.persons)
  if (!Number.isFinite(persons) || persons < 1) return null
  const amount = Number(perPerson) * persons
  if (!Number.isFinite(amount)) return null
  return Math.round(amount * 100) / 100
}

// 重新安排候选池里的用餐时，恢复预计总额并补回关联费用记录（用户手动删除过的那条不会自动重复创建，
// 只补一次：存在关联行就只同步金额）。
export function ensureMealExpense(route, activityId) {
  const found = findMeal(route, activityId)
  if (!found) return null
  const { day, activity } = found
  const estimate = mealEstimate(activity)
  activity.meal ||= {}
  activity.meal.estimatedTotal = estimate
  if (estimate == null) {
    reconcileMealExpenses(route)
    return null
  }
  const expense = linkedExpense(route, activityId)
  if (expense) {
    expense.estimate = estimate
    if (!expense.title) expense.title = `${activity.title}（${day.date} ${activity.slotLabel || mealSlot(activity.slot).label}）`
    return expense
  }
  route.expenses ||= []
  const row = {
    category: '餐饮',
    title: `${activity.title}（${day.date} ${activity.slotLabel || mealSlot(activity.slot).label}）`,
    estimate,
    actual: null,
    sourceMealId: activityId
  }
  route.expenses.push(row)
  return row
}

// 用餐安排被删除/移出后，清理由它自动生成的预计费用，避免费用里留下“幽灵餐费”。
// 若该行已被用户填入真实花费（actual 有值），则保留金额但解除与用餐安排的关联，
// 否则删除用餐安排会把真实支出一起抹掉。同一个用餐安排只保留一条关联费用，
// 重复的关联行同样按上面的规则处理。
export function reconcileMealExpenses(route) {
  if (!route || typeof route !== 'object') return route
  const mealIds = new Set(readMeals(route).map(meal => meal.activity.id))
  const claimed = new Set()
  route.expenses = (route.expenses || []).filter(expense => {
    if (!expense?.sourceMealId) return true
    const mealId = expense.sourceMealId
    const duplicated = claimed.has(mealId)
    claimed.add(mealId)
    if (mealIds.has(mealId) && !duplicated) return true
    if (expense.actual != null && expense.actual !== '') {
      expense.sourceMealId = ''
      return true
    }
    return false
  })
  return route
}

export function mealCoverage(route) {
  const meals = readMeals(route)
  const scheduledDates = new Set(meals.map(meal => meal.date))
  const dates = [...new Set((route?.days || []).map(day => day.date))]
  const missing = dates.filter(date => !scheduledDates.has(date))
  const unknownCost = meals.filter(meal => meal.activity.meal?.budgetPerPerson == null).length
  return {
    count: meals.length,
    dates: scheduledDates.size,
    missingDates: missing,
    unknownCost,
    estimatedTotal: estimatedMealTotal(route),
    meals
  }
}

// 预计用餐费用的展示文案：区分“还没安排”“全部待确认”和真实的 0 元（例如酒店含早餐）。
export function mealCostLabel(coverage) {
  const count = Number(coverage?.count) || 0
  const unknown = Number(coverage?.unknownCost) || 0
  const total = Number(coverage?.estimatedTotal) || 0
  if (!count) return '尚未安排用餐'
  if (unknown >= count) return '待确认'
  return `¥${total}${unknown ? `（另有 ${unknown} 项待确认）` : ''}`
}

export function mealListForDay(route, date) {
  const day = (route?.days || []).find(item => item.date === date)
  return (day?.activities || []).filter(activity => activity?.category === MEAL_CATEGORY)
}

export function latestMealDate(route) {
  const dates = readMeals(route).map(meal => meal.date).sort()
  return dates.length ? dates[dates.length - 1] : localDateString()
}
