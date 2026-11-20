<template>
  <details class="travel-share">
    <summary>只读链接分享</summary>
    <p>链接有效期7天，持有链接的人无需登录即可查看旅行名称、日期、活动名称与时间。不包含私人备注、预算、费用及预订信息。</p>
    <p>编辑旅行后，可预览改动并更新原链接。收件人再次打开或刷新即可查看新版。</p>
    <button :disabled="busy || !readable || !serviceAvailable" @click="publish">创建只读分享</button>
    <ul><li v-for="entry in entries" :key="entry.id">
      <a v-if="entry.ready" :href="link(entry.id)" target="_blank" rel="noopener noreferrer">打开分享</a>
      <input v-if="entry.ready" :value="link(entry.id)" readonly aria-label="分享地址">
      <span v-else>分享结果待确认，可撤销后重建</span><span v-if="entry.expiresAt">到期：{{ new Date(entry.expiresAt).toLocaleString() }}</span>
      <span v-if="entry.updatedAt != null">最近发布 {{ new Date(entry.updatedAt).toLocaleString() }}</span>
      <button v-if="entry.ready" :disabled="busy || !serviceAvailable || !readable" @click="previewUpdate(entry.id)">预览更新</button>
      <button :disabled="busy" @click="revoke(entry)">撤销链接</button>
    </li></ul>
    <section v-if="preview" class="share-preview" aria-label="原链接更新预览">
      <h4>原链接更新预览</h4>
      <p>最近发布于 {{ new Date(preview.updatedAt).toLocaleString() }}，有效期至 {{ new Date(preview.expiresAt).toLocaleString() }}。</p>
      <p v-if="!preview.changes.length">当前公开内容与链接一致。</p>
      <article v-for="change in preview.changes" :key="change.label">
        <h5>{{ change.label }}</h5>
        <div class="versions"><div v-for="side in ['before', 'after']" :key="side">
          <strong>{{ side === 'before' ? '当前链接' : '准备发布' }}</strong>
          <p v-if="change[side] === null">无此日期</p>
          <p v-else-if="!change[side].length">{{ change.activitiesOnly ? '无对应改动' : '暂无安排' }}</p>
          <ul v-else><li v-for="(line, index) in change[side]" :key="index">{{ line }}</li></ul>
        </div></div>
      </article>
      <button v-if="preview.changes.length" :disabled="busy" @click="updateShare">确认更新原链接</button>
      <button :disabled="busy" @click="preview = null">关闭预览</button>
    </section>
    <p role="status">{{ message }}</p>
  </details>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { apiClient } from '../services/apiClient.js'
import { useTravelStore } from '../stores/travel.js'
import { sharePayload, shareChanges } from '../services/publicSharePlan.js'
import { shareManagement } from '../services/shareManagement.js'
import { useFeedback } from '../composables/useFeedback.js'
const props=defineProps({route:{type:Object,required:true}})
const travel=useTravelStore(), feedback=useFeedback(), owner=travel.ownerId
const entries=ref([]),busy=ref(false),message=ref('')
const routeId = props.route.id
const preview = ref(null)
const active = () => !disposed && travel.ownerId === owner && props.route.id === routeId
const key=`travel-share-management:${encodeURIComponent(owner)}:${props.route.id}`
const serviceAvailable=ref(false)
const statusController=new AbortController()
onMounted(async()=>{
 try {
  const status=await apiClient.request('/travel-shares/status',{signal:statusController.signal})
  if(statusController.signal.aborted)return
  serviceAvailable.value=status.enabled===true
  if(!serviceAvailable.value && readable.value)message.value='当前站点未启用链接分享，可先使用离线导出。'
 }catch {if(!statusController.signal.aborted && readable.value)message.value='无法连接分享服务，可先使用离线导出。'}
})
onMounted(()=>window.addEventListener('storage',refreshEntries))
onBeforeUnmount(()=>{disposed=true;statusController.abort();window.removeEventListener('storage',refreshEntries)})
const readable=ref(true)
let disposed=false,management
function refreshEntries(event){
 if(event && event.key!==null && event.key!==key && !event.key.startsWith(key+':'))return
 try{
  entries.value=management.load()
  if(preview.value && !entries.value.some(entry => entry.id === preview.value.id)) preview.value=null
 }catch{readable.value=false;preview.value=null;message.value='分享管理记录无法读取，原始记录保留，创建已停用。'}
}
try {management=shareManagement(localStorage,key);refreshEntries()}catch{readable.value=false;message.value='分享管理记录无法读取，原始记录保留，创建已停用。'}
const link=id=>new URL(`${import.meta.env.BASE_URL || '/'}share/${id}`,window.location.origin).href
async function publish(){
 if(!readable.value || !serviceAvailable.value || busy.value || travel.ownerId!==owner)return
 busy.value=true
 try {
  if(!await feedback.confirm('创建后，持有链接的人可以查看旅行名称、日期、活动名称和时间。确认分享当前快照？'))return
  if(disposed||travel.ownerId!==owner)return
  const bytes=crypto.getRandomValues(new Uint8Array(32))
  const managementToken=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(managementToken))
  const id=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('').slice(0,36)
  if(disposed||travel.ownerId!==owner)return
  const plan=sharePayload(props.route)
  // Store the capability before sending. A timeout must not orphan a public link.
  const entry={id,managementToken,ready:false}
  entries.value=management.add(entry)
  const response=await apiClient.request('/travel-shares',{method:'POST',json:{id,managementToken,plan}})
  entries.value=management.ready(id,response.expiresAt,response)
  message.value='分享已创建，有效期7天。清除浏览器数据将丢失撤销凭据。'
 }catch(error){message.value=error.message || '分享创建失败；如结果不确定，请撤销后重建'}finally{busy.value=false}
}
async function loadPreview(id) {
 const response = await apiClient.request(`/travel-shares/${id}`, { signal: statusController.signal })
 if (!active() || !management.load().some(entry => entry.id === id)) return
 if (!Number.isSafeInteger(response.version)) throw new Error('当前服务版本暂不支持更新原链接。')
 const plan = sharePayload(props.route)
 preview.value = { id, version: response.version, updatedAt: response.updatedAt, expiresAt: response.expiresAt, plan, changes: shareChanges(response.plan, plan) }
}

async function previewUpdate(id) {
 if (busy.value || !active() || !readable.value || !serviceAvailable.value) return
 busy.value = true
 preview.value = null
 message.value = ''
 try {
  await loadPreview(id)
 } catch (error) {
  if (active()) message.value = error.status === 404 ? '链接已撤销或过期。' : error.message
 } finally { busy.value = false }
}

async function updateShare() {
 const reviewed = preview.value
 if (busy.value || !active() || !readable.value || !reviewed?.changes.length) return
 busy.value = true
 try {
  const entry = management.load().find(item => item.id === reviewed.id && item.ready)
  if (!entry) { preview.value = null; message.value = '本机已无该链接的管理凭据。'; return }
  if (JSON.stringify(sharePayload(props.route)) !== JSON.stringify(reviewed.plan)) {
   preview.value = null
   await loadPreview(entry.id)
   message.value = '本机行程已变化，请核对新的预览。'
   return
  }
  const result = await apiClient.request(`/travel-shares/${entry.id}`, {
   method: 'PUT', json: { managementToken: entry.managementToken, version: reviewed.version, plan: reviewed.plan }
  })
  if (!active()) return
  preview.value = null
  try {
   entries.value = management.ready(entry.id, result.expiresAt, result)
   message.value = entries.value.some(item => item.id === entry.id)
    ? '原链接已更新，收件人刷新即可查看。' : '链接已撤销。'
  } catch { message.value = '原链接已更新，本机未能记录发布时间。' }
 } catch (error) {
  if (!active()) return
  preview.value = null
  if (error.status === 409) {
   try { await loadPreview(reviewed.id); message.value = '其他窗口更新了链接，请重新核对差异。' }
   catch { message.value = '分享已变化，请重新预览。' }
  } else {
   const errors = {
    400: '更新失败，请检查行程日期与活动内容。每个链接最多分享 60 天，每天最多 50 项活动。',
    403: '此浏览器的管理凭据无效。',
    404: '链接已撤销或过期。'
   }
   message.value = errors[error.status] || '更新结果待确认，请重新预览已发布内容。'
  }
 } finally { busy.value = false }
}

async function revoke(entry){
 if(busy.value||travel.ownerId!==owner)return
 busy.value=true
 try {
  await apiClient.request(`/travel-shares/${entry.id}`,{method:'DELETE',json:{managementToken:entry.managementToken}})
  if(preview.value?.id===entry.id)preview.value=null
  try {entries.value=management.revoke(entry.id);message.value='链接已撤销'}
  catch {entries.value=entries.value.filter(item=>item.id!==entry.id);message.value='链接已撤销，但本地管理记录更新失败，请保留当前浏览器数据。'}
 }catch(error){message.value=error.message||'撤销失败，请重试'}finally{busy.value=false}
}
</script>
<style scoped>.travel-share{padding:16px;border:1px solid #ccddeb;border-radius:10px;margin:12px 0}.travel-share>ul>li{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}input{min-width:0;flex:1}button,input{padding:8px}summary{cursor:pointer}.share-preview{margin:12px 0;padding:12px;border:1px solid #ccddeb;border-radius:8px;overflow-wrap:anywhere}.share-preview h4,.share-preview h5{margin:.5em 0}.versions{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(12rem,100%),1fr));gap:10px}.versions>div{padding:8px;background:#f3f6f8}.versions ul{list-style:none;padding:0}
</style>
