const validId = id => typeof id === 'string' && /^[a-f0-9]{36}$/.test(id)
const validEntry = entry => entry && validId(entry.id) && /^[a-f0-9]{64}$/.test(entry.managementToken)

// Each link owns a storage key: independent tabs cannot overwrite other links.
// Legacy arrays remain readable; per-link tombstones override their old entries.
export function shareManagement(storage, prefix) {
 const itemKey = id => `${prefix}:${id}`
 const revokedKey = id => `${prefix}:revoked:${id}`
 function load() {
  const entries = new Map(), legacy = storage.getItem(prefix)
  if (legacy) {
   const value = JSON.parse(legacy)
   if (!Array.isArray(value) || !value.every(validEntry)) throw new Error('分享管理记录格式异常，原始记录已保留')
   for (const entry of value) entries.set(entry.id, entry)
  }
  for (let i=0; i<storage.length; i++) {
   const key = storage.key(i)
   if (!key?.startsWith(prefix+':')) continue
   const id = key.slice(prefix.length+1)
   if (!validId(id)) continue
   const value = JSON.parse(storage.getItem(key))
   if (value?.id !== id || (!value.revoked && !validEntry(value))) throw new Error('分享管理记录格式异常，原始记录已保留')
   if (value.revoked) entries.delete(id)
   else entries.set(id,value)
  }
  for (const id of entries.keys()) if (storage.getItem(revokedKey(id)) !== null) entries.delete(id)
  return [...entries.values()]
 }
 function add(entry) {
  if (!validEntry(entry)) throw new Error('分享管理参数无效')
  const existing=load() // Never write over unreadable records.
  if (existing.some(value=>value.id===entry.id) || storage.getItem(itemKey(entry.id)) !== null || storage.getItem(revokedKey(entry.id)) !== null) throw new Error('分享标识已使用，请重新创建')
  storage.setItem(itemKey(entry.id),JSON.stringify(entry))
  return load()
 }
 function ready(id, expiresAt) {
  const entry = load().find(item=>item.id===id)
  if (entry) storage.setItem(itemKey(id),JSON.stringify({...entry,ready:true,expiresAt}))
  return load()
 }
 function revoke(id) {
  if (!validId(id)) throw new Error('分享标识无效')
  // A separate tombstone cannot be overwritten by an in-flight ready update.
  storage.setItem(revokedKey(id),'true')
  storage.setItem(itemKey(id),JSON.stringify({id,revoked:true}))
  return load()
 }
 return {load,add,ready,revoke}
}
