<template>
  <details class="travel-share">
    <summary>只读链接分享</summary>
    <p>链接有效期7天，持有链接的人无需登录即可查看旅行名称、日期、活动名称与时间。不包含私人备注、预算、费用及预订信息。</p>
    <p>分享是当前计划的快照，后续编辑不会自动更新。撤销不能删除收件人已经复制的内容。</p>
    <button :disabled="busy || !readable || !serviceAvailable" @click="publish">创建只读分享</button>
    <ul><li v-for="entry in entries" :key="entry.id">
      <a v-if="entry.ready" :href="link(entry.id)" target="_blank" rel="noopener noreferrer">打开分享</a>
      <input v-if="entry.ready" :value="link(entry.id)" readonly aria-label="分享地址">
      <span v-else>分享结果待确认，可撤销后重建</span><span v-if="entry.expiresAt">到期：{{ new Date(entry.expiresAt).toLocaleString() }}</span>
      <button :disabled="busy" @click="revoke(entry)">撤销链接</button>
    </li></ul>
    <p role="status">{{ message }}</p>
  </details>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { apiClient } from '../services/apiClient.js'
import { useTravelStore } from '../stores/travel.js'
import { shareManagement } from '../services/shareManagement.js'
import { useFeedback } from '../composables/useFeedback.js'
const props=defineProps({route:{type:Object,required:true}})
const travel=useTravelStore(), feedback=useFeedback(), owner=travel.ownerId
const entries=ref([]),busy=ref(false),message=ref('')
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
 try{entries.value=management.load()}catch{readable.value=false;message.value='分享管理记录无法读取，原始记录保留，创建已停用。'}
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
  const plan={title:props.route.title,startDate:props.route.startDate,endDate:props.route.endDate,days:(props.route.days||[]).map(day=>({date:day.date,activities:(day.activities||[]).map(activity=>({title:activity.title,time:activity.time||''}))}))}
  // Store the capability before sending. A timeout must not orphan a public link.
  const entry={id,managementToken,ready:false}
  entries.value=management.add(entry)
  const response=await apiClient.request('/travel-shares',{method:'POST',json:{id,managementToken,plan}})
  entries.value=management.ready(id,response.expiresAt)
  message.value='分享已创建，有效期7天。清除浏览器数据将丢失撤销凭据。'
 }catch(error){message.value=error.message || '分享创建失败；如结果不确定，请撤销后重建'}finally{busy.value=false}
}
async function revoke(entry){
 if(busy.value||travel.ownerId!==owner)return
 busy.value=true
 try {
  await apiClient.request(`/travel-shares/${entry.id}`,{method:'DELETE',json:{managementToken:entry.managementToken}})
  try {entries.value=management.revoke(entry.id);message.value='链接已撤销'}
  catch {entries.value=entries.value.filter(item=>item.id!==entry.id);message.value='链接已撤销，但本地管理记录更新失败，请保留当前浏览器数据。'}
 }catch(error){message.value=error.message||'撤销失败，请重试'}finally{busy.value=false}
}
</script>
<style scoped>.travel-share{padding:16px;border:1px solid #ccddeb;border-radius:10px;margin:12px 0}li{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}input{min-width:0;flex:1}button,input{padding:8px}summary{cursor:pointer}</style>
