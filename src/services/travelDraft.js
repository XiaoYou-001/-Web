// Drafts are tied to the exact saved plan they were edited from.
// Conflicting or legacy drafts remain intact until explicitly backed up.
const copy = value => JSON.parse(JSON.stringify(value))
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter(key => !key.startsWith('__')).sort().map(key => [key, canonical(value[key])]))
  return value
}
export const travelFingerprint = value => JSON.stringify(canonical(value))
const validPlan = value => value && ['string','number'].includes(typeof value.id) && typeof value.title === 'string' && Array.isArray(value.days) && value.days.every(day => day && typeof day.date === 'string' && Array.isArray(day.activities) && day.activities.every(activity => activity && typeof activity.title === 'string'))
const conflict = () => new Error('旅行或草稿已在其他页面更新，已停止覆盖；请备份当前编辑后载入最新旅行。')
export function travelDraft(storage, key, readCurrent) {
  let baseline = travelFingerprint(readCurrent()), observed = storage.getItem(key)
  function assertCurrent() {
    const latest = readCurrent()
    if (!latest || travelFingerprint(latest) !== baseline || storage.getItem(key) !== observed) throw conflict()
  }
  function restore() {
    if (observed === null) return null
    const parsed = JSON.parse(observed)
    if (parsed?.version !== 2) throw new Error('旧版草稿缺少版本信息，已保留原文；请先导出草稿，再备份并载入最新旅行。')
    if (!validPlan(parsed.plan) || parsed.plan.id !== readCurrent()?.id || typeof parsed.base !== 'string') throw new Error('草稿格式异常，原始记录已保留。')
    if (parsed.base !== baseline) throw conflict()
    return copy(parsed.plan)
  }
  function write(plan) {
    assertCurrent()
    const raw = JSON.stringify({version:2,base:baseline,plan:copy(plan)})
    storage.setItem(key,raw)
    observed = raw
  }
  function saved(plan) {
    const next = travelFingerprint(plan)
    if (travelFingerprint(readCurrent()) !== next || storage.getItem(key) !== observed) throw conflict()
    storage.removeItem(key)
    baseline = next
    observed = null
  }
  function recover(plan) {
    const latest = readCurrent()
    if (!latest) throw new Error('旅行已被删除，当前编辑可导出备份，不能覆盖已删除的旅行。')
    const raw = storage.getItem(key)
    storage.setItem(`${key}:backup:${Date.now()}:${Math.random().toString(36).slice(2)}`,JSON.stringify({storedDraft:raw,currentEditing:plan}))
    // Keep both conflicting versions in the backup before replacing the active draft.
    const base = travelFingerprint(latest), replacement = JSON.stringify({version:2,base,plan:latest})
    storage.setItem(key,replacement)
    baseline = base
    observed = replacement
    return copy(latest)
  }
  return {restore,write,assertCurrent,saved,recover,raw:()=>storage.getItem(key)}
}
