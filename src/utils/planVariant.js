// 行程方案：从现有旅行复制出的独立可编辑计划；不继承实际支出、账本结算与准备完成状态。
import { reconcileMealExpenses } from './dining.js'

export const PLAN_NAME_PRESETS = ['轻松版', '省钱版', '深度版', '亲子版']

const clone = value => JSON.parse(JSON.stringify(value))
const isObject = value => value && typeof value === 'object' && !Array.isArray(value)

export function planGroupOf(route) {
  if (!isObject(route) || !route.id) throw new Error('旅行信息无效')
  return route.planGroupId || route.id
}

export function planGroupRoutes(routes, baseRoute) {
  if (!isObject(baseRoute) || !baseRoute.id) return []
  const key = planGroupOf(baseRoute)
  const members = (routes || []).filter(route => route.id === key || route.planGroupId === key)
  // 原旅行必须存在，否则无法确定比较基准，不能把某个方案误当成原旅行。
  if (!members.some(route => route.id === key)) return []
  const seen = new Set()
  return members
    .filter(route => {
      if (seen.has(route.id)) return false
      seen.add(route.id)
      return true
    })
    .sort((a, b) => {
      if ((a.id === key) !== (b.id === key)) return a.id === key ? -1 : 1
      return String(a.planName || a.title).localeCompare(String(b.planName || b.title), 'zh-CN')
    })
}

export function createPlanVariant(route, { planName } = {}) {
  if (!isObject(route) || !route.id) throw new Error('旅行信息无效')
  const name = String(planName ?? '').trim()
  if (!name) throw new Error('请填写方案名称，例如：轻松版')
  if (name.length > 20) throw new Error('方案名称需为 20 字以内')
  const copy = clone(route)
  delete copy.id
  delete copy.createdAt
  delete copy.updatedAt
  delete copy.ledger
  delete copy.adoptedFrom
  delete copy.dateAdjustmentArchive
  delete copy.shareToken
  copy.title = route.title
  copy.planName = name
  copy.isPlanVariant = true
  copy.planGroupId = planGroupOf(route)
  copy.sourceRouteId = route.id
  copy.isFavorite = false
  copy.progress = 0
  // 实际花费不随方案复制：保留预计费用，清空实际支出。
  copy.expenses = (Array.isArray(route.expenses) ? route.expenses : []).map(expense => ({ ...expense, actual: null }))
  // 准备完成状态属于真实出行进度，不继承。
  if (copy.preparation && Array.isArray(copy.preparation.items)) {
    copy.preparation = {
      ...copy.preparation,
      items: copy.preparation.items.map(item => ({ ...item, done: false, completedAt: '' })),
      updatedAt: ''
    }
  }
  // 完成/跳过标记属于真实出行记录，不继承。
  for (const day of copy.days || []) {
    for (const activity of day.activities || []) {
      activity.completed = false
      activity.skipped = false
    }
  }
  for (const activity of copy.pendingActivities || []) {
    activity.completed = false
    activity.skipped = false
  }
  return copy
}

export function planMetrics(route) {
  const days = Array.isArray(route?.days) ? route.days : []
  const activities = days.flatMap(day => day.activities || [])
  const expenses = Array.isArray(route?.expenses) ? route.expenses : []
  const knownExpenses = expenses.filter(expense => Number.isFinite(Number(expense?.estimate)) && expense?.estimate !== null && expense?.estimate !== '')
  const estimatedTotal = knownExpenses.reduce((sum, expense) => sum + Number(expense.estimate), 0)
  // 交通耗时记录在“出发站”上，最后一项没有下一站，不计入应查询路段。
  const segments = days.flatMap(day => {
    const list = day.activities || []
    return list.slice(0, Math.max(0, list.length - 1))
  })
  const queried = segments.filter(activity => Number.isFinite(Number(activity?.travelEstimate?.minutes))).length
  const budget = Number.isFinite(Number(route?.budget)) && route?.budget !== null && route?.budget !== '' ? Number(route.budget) : null
  const persons = Number.isFinite(Number(route?.persons)) && route?.persons !== null && route?.persons !== '' ? Number(route.persons) : null
  return {
    id: route?.id || '',
    title: route?.title || '',
    planName: route?.planName || '',
    isPlanVariant: Boolean(route?.isPlanVariant),
    days: days.length,
    activities: activities.length,
    meals: activities.filter(activity => activity?.category === '用餐').length,
    firstDate: route?.startDate || '',
    lastDate: route?.endDate || '',
    persons,
    budget,
    estimatedTotal: knownExpenses.length ? estimatedTotal : null,
    knownCosts: knownExpenses.length,
    unknownCosts: expenses.length - knownExpenses.length,
    overBudget: budget !== null && knownExpenses.length > 0 && estimatedTotal > budget,
    travelQueried: queried,
    travelUnqueried: segments.length - queried,
    pending: Array.isArray(route?.pendingActivities) ? route.pendingActivities.length : 0,
    empty: activities.length === 0
  }
}

export function dayPlanDiff(routes) {
  const dates = [...new Set((routes || []).flatMap(route => (route?.days || []).map(day => day.date)))].sort()
  return dates.map(date => ({
    date,
    cells: (routes || []).map(route => {
      const day = (route?.days || []).find(item => item.date === date)
      const raw = day?.activities || []
      const activities = raw.map((activity, index) => ({
        time: activity?.time || '',
        title: activity?.title || '',
        category: activity?.category || '',
        durationMinutes: Number.isFinite(Number(activity?.durationMinutes)) ? Number(activity.durationMinutes) : null,
        // null = 当天最后一项，无需查询到下一站的交通。
        travelQueried: index < raw.length - 1 ? Number.isFinite(Number(activity?.travelEstimate?.minutes)) : null
      }))
      return {
        date,
        activities,
        count: activities.length,
        minutes: activities.reduce((sum, item) => sum + (item.durationMinutes || 0), 0)
      }
    })
  }))
}

// 比较只展示客观指标和数据缺口，不输出“最优”结论。
export function comparePlans(routes) {
  const list = (routes || []).filter(Boolean)
  const panels = list.map(planMetrics)
  const basis = []
  if (new Set(panels.map(panel => `${panel.firstDate}~${panel.lastDate}`)).size > 1) {
    basis.push('方案日期范围不同，日程与费用口径不完全一致')
  }
  if (new Set(panels.map(panel => panel.persons ?? '未填写')).size > 1) {
    basis.push('方案人数不同，人均相关费用不可直接比较')
  }
  if (panels.some(panel => panel.unknownCosts > 0)) {
    basis.push('部分方案存在未录入的费用，预计费用不完整')
  }
  if (panels.some(panel => panel.estimatedTotal === null)) {
    basis.push('存在未录入任何费用的方案，不能按免费计算')
  }
  if (panels.some(panel => panel.travelUnqueried > 0)) {
    basis.push('部分方案仍有未查询的交通耗时，时间对比不完整')
  }
  if (panels.some(panel => panel.empty)) {
    basis.push('存在空方案，暂时无法比较日程安排')
  }
  return { panels, basis, days: dayPlanDiff(list) }
}

// 采用方案：把所选方案的规划内容写回原旅行，保留原旅行已记录的实际支出与账本。
export function adoptPlan(target, chosen) {
  if (!isObject(target) || !target.id) throw new Error('旅行信息无效')
  if (!isObject(chosen) || !chosen.id) throw new Error('请选择要采用的方案')
  if (target.id === chosen.id) throw new Error('请选择另一个方案采用，而不是原旅行本身')
  const next = clone(target)
  const planningFields = ['days', 'pendingActivities', 'preferences', 'budget', 'persons', 'themes', 'destinations', 'companion']
  for (const field of planningFields) {
    if (Object.hasOwn(chosen, field)) next[field] = clone(chosen[field])
  }
  const originals = Array.isArray(target.expenses) ? target.expenses : []
  const actuals = originals.filter(expense => expense && expense.actual !== null && expense.actual !== undefined && expense.actual !== '')
  // 只填了预计金额、还没有实际支出的费用行是原旅行的规划信息，采用方案时不应被删掉。
  const estimatesOnly = originals.filter(expense => expense && (expense.actual === null || expense.actual === undefined || expense.actual === ''))
  const chosenExpenses = Array.isArray(chosen.expenses) ? chosen.expenses : []
  const nextExpenses = chosenExpenses.map(expense => ({ ...expense, actual: null }))
  for (const expense of estimatesOnly) {
    const exists = nextExpenses.some(item => (item.id && expense.id && item.id === expense.id)
      || (item.category === expense.category && item.title === expense.title))
    if (!exists) nextExpenses.push({ ...expense })
  }
  let matched = 0
  const unmatched = []
  // 同名同类别可能有多笔，必须逐个消费，不能反复命中同一条（否则会把多笔实际支出合并成一笔）。
  const available = nextExpenses.slice()
  for (const actual of actuals) {
    let index = actual.id ? available.findIndex(expense => expense.id === actual.id && expense.actual === null) : -1
    if (index === -1) index = available.findIndex(expense => expense.category === actual.category && expense.title === actual.title && expense.actual === null)
    if (index !== -1) {
      available[index].actual = actual.actual
      matched += 1
    } else {
      nextExpenses.push({ ...actual })
      unmatched.push(actual.title)
    }
  }
  next.expenses = nextExpenses
  // 被采用方案里没有的用餐安排，其自动生成的预计费用要一起消失，否则预计费用会凭空多出一笔。
  reconcileMealExpenses(next)
  next.adoptedFrom = {
    planId: chosen.id,
    planName: chosen.planName || chosen.title || '',
    adoptedAt: new Date().toISOString()
  }
  return { route: next, matchedActuals: matched, unmatchedActuals: unmatched }
}
