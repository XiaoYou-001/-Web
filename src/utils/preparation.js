import { parseDateOnly } from './date.js'
import { createId } from './id.js'

// 出行准备清单：模板只生成建议，用户可自由增删改；数据随旅行一起保存。
export const PREPARATION_CATEGORIES = ['行李', '证件', '预约', '其他']

const TEMPLATES = [
  {
    id: 'general',
    name: '通用出行',
    description: '适合大多数城市旅行，覆盖证件、衣物与常用预约',
    groups: [
      { category: '证件', items: ['身份证', '驾驶证/行驶证', '现金与银行卡', '行程与住宿确认单'] },
      { category: '行李', items: ['换洗衣物', '洗漱用品', '手机充电器与充电宝', '常用药品', '雨具', '水杯'] },
      { category: '预约', items: ['往返交通票', '住宿预订确认', '景点门票预约'] },
      { category: '其他', items: ['购买旅行保险', '告知家人行程'] }
    ]
  },
  {
    id: 'beach',
    name: '海边度假',
    description: '防晒、涉水与海边安全相关物品',
    groups: [
      { category: '行李', items: ['泳衣与泳镜', '防晒霜与晒后修复', '沙滩巾与拖鞋', '遮阳帽与太阳镜', '防水袋', '驱蚊液'] },
      { category: '证件', items: ['身份证', '现金与银行卡'] },
      { category: '预约', items: ['住宿预订确认', '涉水项目预约'] },
      { category: '其他', items: ['查看潮汐与天气', '确认海边安全提示'] }
    ]
  },
  {
    id: 'hiking',
    name: '徒步登山',
    description: '按天数准备补给与安全装备，强调离线与应急',
    groups: [
      { category: '行李', items: ['登山鞋', '速干衣物', '登山杖', '头灯与备用电池', '水壶', '能量食品', '急救包', '雨衣与保暖层'] },
      { category: '证件', items: ['身份证', '保险单号'] },
      { category: '预约', items: ['进山许可或预约', '住宿预订确认'] },
      { category: '其他', items: ['下载离线地图', '告知同行人紧急联系方式', '查看天气与封山公告'] }
    ]
  },
  {
    id: 'family',
    name: '亲子出行',
    description: '儿童证件、药品与途中安抚用品',
    groups: [
      { category: '证件', items: ['儿童身份证件', '亲子关系证明（如需）'] },
      { category: '行李', items: ['儿童常用药品', '儿童零食', '安抚玩具', '湿巾与纸巾', '折叠推车或背带', '替换衣物'] },
      { category: '预约', items: ['亲子友好住宿确认', '儿童票预约'] },
      { category: '其他', items: ['确认儿童餐食', '安排途中休息点'] }
    ]
  }
]

export const preparationTemplates = () => TEMPLATES.map(template => ({
  id: template.id,
  name: template.name,
  description: template.description,
  groups: template.groups.map(group => ({ category: group.category, items: [...group.items] }))
}))

export function findPreparationTemplate(templateId) {
  return TEMPLATES.find(template => template.id === templateId) || null
}

const DAY_COUNT_ITEMS = new Set(['换洗衣物', '速干衣物', '替换衣物', '能量食品'])
const PERSON_COUNT_ITEMS = new Set(['现金与银行卡', '儿童零食', '儿童常用药品', '急救包'])

// 数量仅作为建议文案，不参与去重；同名模板项以 templateKey 识别。
function suggestion(title, days, persons) {
  if (DAY_COUNT_ITEMS.has(title)) return `${Math.max(1, days)} 天按需准备`
  if (PERSON_COUNT_ITEMS.has(title) && persons > 1) return `${persons} 人份`
  return ''
}

export function normalizePreparationItem(item) {
  const title = String(item?.title || '').trim().replace(/\s+/g, ' ')
  const category = PREPARATION_CATEGORIES.includes(item?.category) ? item.category : '其他'
  const dueDate = typeof item?.dueDate === 'string' ? item.dueDate : ''
  if (dueDate) parseDateOnly(dueDate)
  return {
    id: typeof item?.id === 'string' && item.id ? item.id : createId(),
    title,
    detail: typeof item?.detail === 'string' ? item.detail.slice(0, 60) : '',
    category,
    done: item?.done === true,
    dueDate: dueDate || '',
    note: typeof item?.note === 'string' ? item.note.slice(0, 300) : '',
    source: typeof item?.source === 'string' ? item.source : 'custom',
    templateKey: typeof item?.templateKey === 'string' ? item.templateKey : '',
    createdAt: typeof item?.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    completedAt: item?.done === true && typeof item?.completedAt === 'string' ? item.completedAt : ''
  }
}

export function ensurePreparation(route) {
  if (!route || typeof route !== 'object') throw new Error('旅行信息无效')
  if (!route.preparation || typeof route.preparation !== 'object' || Array.isArray(route.preparation)) {
    route.preparation = { items: [], appliedTemplates: [], updatedAt: '' }
  }
  if (!Array.isArray(route.preparation.items)) route.preparation.items = []
  if (!Array.isArray(route.preparation.appliedTemplates)) route.preparation.appliedTemplates = []
  route.preparation.items = route.preparation.items.map(item => normalizePreparationItem(item))
  return route.preparation
}

const titleKey = (title, category) => `${category}\u0000${title.trim().toLowerCase()}`

export function buildTemplateItems(templateId, { days = 1, persons = 1 } = {}) {
  const template = findPreparationTemplate(templateId)
  if (!template) throw new Error('未找到该准备模板')
  const dayCount = Number.isFinite(Number(days)) && Number(days) >= 1 ? Math.floor(Number(days)) : 1
  const personCount = Number.isFinite(Number(persons)) && Number(persons) >= 1 ? Math.floor(Number(persons)) : 1
  const items = []
  for (const group of template.groups) {
    for (const title of group.items) {
      items.push(normalizePreparationItem({
        title,
        detail: suggestion(title, dayCount, personCount),
        category: group.category,
        source: `template:${template.id}`,
        templateKey: `${template.id}:${title}`
      }))
    }
  }
  return items
}

// 重复应用模板不会重复添加；用户手动添加的同名项也会被视为已存在。
export function applyPreparationTemplate(route, templateId, options = {}) {
  const preparation = ensurePreparation(route)
  const generated = buildTemplateItems(templateId, options)
  const existingKeys = new Set(preparation.items.map(item => item.templateKey).filter(Boolean))
  const existingTitles = new Set(preparation.items.map(item => titleKey(item.title, item.category)))
  let added = 0
  let skipped = 0
  for (const item of generated) {
    if (existingKeys.has(item.templateKey) || existingTitles.has(titleKey(item.title, item.category))) { skipped += 1; continue }
    preparation.items.push(item)
    existingKeys.add(item.templateKey)
    existingTitles.add(titleKey(item.title, item.category))
    added += 1
  }
  const template = findPreparationTemplate(templateId)
  if (!preparation.appliedTemplates.includes(template.id)) preparation.appliedTemplates.push(template.id)
  preparation.updatedAt = new Date().toISOString()
  return { added, skipped, templateName: template.name }
}

export function addPreparationItem(route, input) {
  const preparation = ensurePreparation(route)
  const item = normalizePreparationItem({ ...input, source: 'custom' })
  if (!item.title) throw new Error('请输入准备事项名称')
  if (item.title.length > 80) throw new Error('准备事项名称需为80字以内')
  if (preparation.items.some(existing => titleKey(existing.title, existing.category) === titleKey(item.title, item.category))) {
    throw new Error('同类别的准备事项已存在')
  }
  preparation.items.push(item)
  preparation.updatedAt = new Date().toISOString()
  return item
}

export function findPreparationItem(route, id) {
  const preparation = ensurePreparation(route)
  const item = preparation.items.find(entry => entry.id === id)
  if (!item) throw new Error('该准备事项已不存在，请刷新后重试')
  return item
}

export function updatePreparationItem(route, id, patch = {}) {
  const preparation = ensurePreparation(route)
  const item = findPreparationItem(route, id)
  const next = normalizePreparationItem({
    ...item,
    title: patch.title === undefined ? item.title : patch.title,
    category: patch.category === undefined ? item.category : patch.category,
    dueDate: patch.dueDate === undefined ? item.dueDate : patch.dueDate,
    note: patch.note === undefined ? item.note : patch.note
  })
  if (!next.title) throw new Error('请输入准备事项名称')
  if (next.title.length > 80) throw new Error('准备事项名称需为80字以内')
  if (preparation.items.some(entry => entry.id !== id && titleKey(entry.title, entry.category) === titleKey(next.title, next.category))) {
    throw new Error('同类别的准备事项已存在')
  }
  Object.assign(item, next)
  preparation.updatedAt = new Date().toISOString()
  return item
}

export function togglePreparationItem(route, id, done) {
  const preparation = ensurePreparation(route)
  const item = findPreparationItem(route, id)
  item.done = typeof done === 'boolean' ? done : !item.done
  item.completedAt = item.done ? new Date().toISOString() : ''
  preparation.updatedAt = new Date().toISOString()
  return item
}

export function removePreparationItem(route, id) {
  const preparation = ensurePreparation(route)
  const index = preparation.items.findIndex(item => item.id === id)
  if (index === -1) throw new Error('该准备事项已不存在，请刷新后重试')
  preparation.items.splice(index, 1)
  preparation.updatedAt = new Date().toISOString()
}

const addDays = (date, offset) => {
  const value = parseDateOnly(date)
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
}

// 只读统计：渲染期间不修改旅行数据，避免触发编辑草稿的循环写入。
export function readPreparationItems(route) {
  const items = route?.preparation?.items
  return Array.isArray(items) ? items.filter(item => item && typeof item === 'object') : []
}

export function preparationStats(route, today = '') {
  const items = readPreparationItems(route)
  if (!items.length) return { total: 0, done: 0, open: 0, percent: 0, overdue: 0, dueSoon: 0, upcoming: [], hasPreparation: false }
  const done = items.filter(item => item.done).length
  const open = items.length - done
  const overdueItems = [], soonItems = []
  const day = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : ''
  if (day) {
    const soonLimit = addDays(day, 7)
    for (const item of items) {
      if (item.done || !item.dueDate) continue
      if (item.dueDate < day) overdueItems.push(item)
      else if (item.dueDate <= soonLimit) soonItems.push(item)
    }
  }
  const byDue = (a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') || String(a.title).localeCompare(String(b.title))
  overdueItems.sort(byDue)
  soonItems.sort(byDue)
  return {
    total: items.length,
    done,
    open,
    percent: items.length ? Math.round(done / items.length * 100) : 0,
    overdue: overdueItems.length,
    dueSoon: soonItems.length,
    upcoming: [...overdueItems, ...soonItems].slice(0, 5),
    hasPreparation: items.length > 0
  }
}

// 旅行列表的轻量提醒：只提示未完成且有截止日期的事项。
export function preparationReminders(route, today = '') {
  const stats = preparationStats(route, today)
  const reminders = []
  if (stats.overdue) reminders.push(`${stats.overdue} 项准备已超过截止日期`)
  if (stats.dueSoon) reminders.push(`${stats.dueSoon} 项准备将在 7 天内截止`)
  return reminders
}

export function sortPreparationItems(items = []) {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.dueDate !== b.dueDate) return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')
    return a.title.localeCompare(b.title, 'zh-CN')
  })
}
