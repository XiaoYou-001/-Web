<template>
<section class="workbench" aria-label="旅行工作台">
  <h2>旅行工作台</h2>
  <p>{{ status }} · {{ saveState }}</p><label>旅行状态 <select v-model="route.lifecycle"><option value="planning">规划中</option><option value="ready">已准备，按日期显示出行状态</option><option value="cancelled">已取消</option></select></label>
  <p class="budget-summary">预算上限：{{ route.budget == null ? '待填写' : '¥' + route.budget }} · 已录入预计费用：¥{{ expected }} · 实际支出：¥{{ actual }}</p>
  <p>未录入费用不计入汇总，不代表免费。交通估算标明查询来源和时间；开放时间请出行前确认。</p>
  <p>出行准备：{{ prep.total ? `${prep.done}/${prep.total} 项已完成（${prep.percent}%）` : '尚未添加清单' }}<span v-if="prep.overdue" class="prep-overdue"> · {{ prep.overdue }} 项已超过截止日期</span><span v-else-if="prep.dueSoon" class="prep-soon"> · {{ prep.dueSoon }} 项 7 天内截止</span></p>
  <p><router-link :to="{path: '/attractions', query: {favorites: '1', travel: String(route.id)}}">从收藏景点中挑选</router-link> · <router-link :to="{path: '/food', query: {travel: String(route.id)}}">搜索真实餐厅</router-link> · <router-link :to="{path: '/hotels', query: {travel: String(route.id)}}">选择住宿方案</router-link> · <router-link :to="{path: '/tickets', query: {travel: String(route.id)}}">查看交通演示</router-link></p>
  <p>跨页面使用已保存的旅行条件，修改日期或人数后请先保存。</p>
  <details class="plan-checks"><summary>规划检查（{{ issues.length }} 项）</summary><p v-if="!issues.length">当前没有待调整项。</p>
    <ul v-else><li v-for="(issue, index) in issues" :key="index">{{ issue.message }}
      <button type="button" :aria-label="'定位并调整：' + issue.message" @click="focusIssue(issue)">定位并调整</button>
    </li></ul></details>
  <TravelPreparation :route="route" />
  <TravelDining :route="route" />
  <TravelMapPlanner :route="route" />
  <TravelShare :route="route" />
  <TravelCollaboration :route="route" :save-plan="saveCurrentPlan" />
  <OfflineTrip :route-id="route.id" :save-plan="saveCurrentPlan" />
  <details><summary>旅行备份</summary>
    <p>将当前行程、地点、准备清单和账本保存为 JSON 文件。在另一浏览器登录后，可到「我的旅行」选择「从备份恢复」。手账与照片由手账页面单独管理。</p>
    <button type="button" @click="backupTrip">下载旅行备份</button>
  </details>
  <div class="actions"><button @click="undo" :disabled="!history.length">撤销修改</button><button @click="exportPlan">导出离线计划</button><button @click="outing = !outing">{{ outing ? '返回规划' : '出行模式' }}</button></div>
  <div v-if="outing" class="outing-plan">
    <h3 ref="outingHeading" tabindex="-1">出行安排</h3>
    <p v-if="nextStop" class="outing-next">下一站：{{ nextStop.date !== progress.date ? nextStop.date : '' }} {{ nextStop.activity.time }} {{ nextStop.activity.title }}</p>
    <p v-else class="outing-next">没有后续定时活动。</p>
    <label><input type="checkbox" v-model="todayOnly">只看今天</label>
    <p>导出的计划是当前快照，修改后请重新导出。</p>
    <p v-if="!outingDays.length">今天没有安排，可关闭「只看今天」查看整次旅行。</p>
    <article v-for="day in outingDays" :key="day.date"><h4>{{ day.date }}</h4>
      <div v-for="(activity, ai) in day.activities" :key="activity.id || ai">
        <label><input type="checkbox" v-model="activity.completed" @change="activity.completed && (activity.skipped = false)">{{ activity.time }} {{ activity.title }}</label>
        <label><input type="checkbox" v-model="activity.skipped" @change="activity.skipped && (activity.completed = false)">跳过</label>
        <ActivityDelay :day="day" :index="ai" />
        <p>{{ activity.description }}</p><p v-if="activity.place">地址：{{ activity.place.address || '地址未提供' }}</p><p v-if="activity.notes">预订备注：{{ activity.notes }}</p>
        <a :href="navigationLink(activity.place) || placeSearchLink(activity.title)" target="_blank" rel="noopener noreferrer">{{ navigationLink(activity.place) ? '打开步行导航' : '地点待确认，搜索位置' }}</a>
      </div>
    </article>
  </div>
  <details><summary>待安排候选池（{{ route.pendingActivities?.length || 0 }}）</summary><label>目标日期 <select v-model="targetDay"><option v-for="day in route.days" :key="day.date" :value="day.date">{{ day.date }}</option></select></label><ul><li v-for="(activity,index) in route.pendingActivities" :key="index">{{ activity.title }} <small v-if="activity.previousDate">（原日期 {{ activity.previousDate }}）</small> <button @click="scheduleCandidate(index)">安排到当天</button><button @click="route.pendingActivities.splice(index,1)">移除</button></li></ul></details>
  <details ref="expensePanel"><summary>住宿、交通与费用记录</summary><p>记录已确认的信息或待比较的方案；不会创建真实预订。</p><label>旅行预算上限 <input data-plan-field="budget" type="number" min="0" step="0.01" :value="route.budget" @change="updateAmount(route, 'budget', $event.target)" /></label><form @submit.prevent="addExpense"><label>类别 <select v-model="entry.category"><option>住宿</option><option>交通</option><option>门票</option><option>餐饮</option><option>其他</option></select></label><label>名称或预订备注 <input v-model="entry.title" data-plan-field="newExpense" required></label><label>预计费用（总额）<input v-model="entry.estimate" type="number" min="0" step="0.01"></label><label>实际支出（总额）<input v-model="entry.actual" type="number" min="0" step="0.01"></label><button>添加记录</button></form><ul><li v-for="(expense,index) in route.expenses" :key="index">{{ expense.category }} · {{ expense.title }} · <label>预计费用 <input :data-expense-index="index" type="number" min="0" step="0.01" :value="expense.estimate" placeholder="待确认" @change="updateAmount(expense, 'estimate', $event.target)" /></label> · 实际 {{ expense.actual ?? '待确认' }} <button @click="route.expenses.splice(index,1)">删除</button></li></ul></details>
  <TravelLedger :route="route" />
  <TravelJournal :route="route" />
  <details v-if="route.dateAdjustmentArchive?.length"><summary>调整日期时保留的原始日程</summary><p>活动已转入待安排；这里保留原日期与当日预算供核对。</p><ul><li v-for="(day,index) in route.dateAdjustmentArchive" :key="index">{{ day.date }} · {{ day.activities?.length || 0 }} 项活动 · 当日预算 {{ day.budget ?? '未填写' }}</li></ul></details>
  <p role="status">{{ message }}</p><template v-if="draftBlocked"><button @click="exportStoredDraft">导出保留草稿</button><button @click="recoverDraft">备份当前编辑并载入最新旅行</button></template>
</section>
</template>
<script setup>
import ActivityDelay from './ActivityDelay.vue'
import { todayItinerary } from '../utils/todayItinerary.js'
import TravelMapPlanner from './TravelMapPlanner.vue'
import TravelShare from './TravelShare.vue'
import TravelCollaboration from './TravelCollaboration.vue'
import OfflineTrip from './OfflineTrip.vue'
import TravelPreparation from './TravelPreparation.vue'
import TravelDining from './TravelDining.vue'
import TravelLedger from './TravelLedger.vue'
import TravelJournal from './TravelJournal.vue'
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useTravelStore } from '../stores/travel.js'
import { useFeedback } from '../composables/useFeedback.js'
import { travelDraft } from '../services/travelDraft.js'
import { downloadTripBackup } from '../services/tripBackup.js'
import { readUserData } from '../services/userDataService.js'
import { navigationLink, placeSearchLink } from '../services/mapPlaces.js'
import { inspectPlan } from '../utils/planning.js'
import { preparationStats } from '../utils/preparation.js'
import { ensureMealExpense } from '../utils/dining.js'
import itineraryService from '../services/itineraryService.js'
const props = defineProps({ route: { type: Object, required: true }, tripProgress: Object })
const emit=defineEmits(['focus-day'])
const travel = useTravelStore(), feedback = useFeedback()
function backupTrip() {
  try { downloadTripBackup(props.route) }
  catch (error) { feedback.error(error.message || '旅行备份导出失败') }
}
const message = ref(''), saveState = ref('草稿保护已启用'), outing = ref(false), history = ref([])
const todayOnly=ref(true)
const progress = computed(() => props.tripProgress || todayItinerary(props.route))
const outingDays=computed(()=>todayOnly.value?(props.route.days||[]).filter(d=>d.date===progress.value.date):(props.route.days||[]))
const nextStop = computed(() => todayOnly.value ? progress.value.next : progress.value.nextOverall)
const outingHeading = ref(null)
async function openToday() {
  todayOnly.value = true
  outing.value = true
  await nextTick()
  outingHeading.value?.focus()
  outingHeading.value?.scrollIntoView({ block: 'center' })
}
const targetDay = ref(props.route.days?.[0]?.date || '')
function scheduleCandidate(index){const day=props.route.days.find(d=>d.date===targetDay.value);if(!day){message.value='请先选择一天';return}day.activities ||= [];const [activity]=props.route.pendingActivities.splice(index,1);day.activities.push(activity);if(activity?.category==='用餐'){try{ensureMealExpense(props.route,activity.id);message.value='用餐已安排，预计费用已补回费用记录'}catch{message.value='用餐已安排，但预计费用未能写入，请检查费用记录'}}}
const entry = ref({ category: '住宿', title: '', estimate: '', actual: '' })
const expected = computed(() => (props.route.expenses || []).reduce((s,e)=>s+(e.estimate ?? 0),0))
const actual = computed(() => (props.route.expenses || []).reduce((s,e)=>s+(e.actual ?? 0),0))
const status = computed(() => { const today = progress.value.date; if(props.route.lifecycle==='cancelled') return '已取消'; if(props.route.endDate && props.route.endDate < today) return '已结束'; if(props.route.lifecycle==='planning'||!props.route.startDate || !props.route.endDate) return '规划中'; return props.route.startDate <= today ? '旅行中' : '待出发' })
const expensePanel = ref(null)
function updateAmount(record, field, input) {
  if (!input.reportValidity()) {
    input.value = record[field] ?? ''
    return
  }
  record[field] = input.value === '' ? null : input.valueAsNumber
}
function focusIssue(issue) {
  if (issue.dayIndex != null) {
    emit('focus-day', issue.dayIndex, issue)
    return
  }
  const panel = expensePanel.value
  if (!panel) return
  panel.open = true
  const selector = issue.field === 'estimate' ? `[data-expense-index="${issue.expenseIndex}"]`
    : `[data-plan-field="${issue.field}"]`
  const input = panel.querySelector(selector)
  input?.focus()
  input?.scrollIntoView({block: 'center'})
}
const issues = computed(() => inspectPlan(props.route))
const prep = computed(() => preparationStats(props.route, progress.value.date))
const owner = travel.ownerId
const key = `travel-draft:${encodeURIComponent(owner)}:${props.route.id}`
const draftBlocked = ref(false)
let snapshot = JSON.stringify(props.route), restoring = false, drafts
function blockDraft(error) {
  draftBlocked.value = true
  saveState.value = '草稿冲突或读取失败，已停止覆盖'
  message.value = error.message || '草稿不可读取，原始记录已保留。'
  // 子面板会先提示“已添加/已记入”，草稿写失败必须立刻用错误提示覆盖，避免用户以为已经保存。
  feedback.error(`改动未能写入本浏览器草稿：${message.value}`)
}
async function beforeSave() {
  await nextTick()
  if (travel.ownerId !== owner) return false
  if (draftBlocked.value) { feedback.error(message.value); return false }
  try { drafts.assertCurrent(); return true } catch (error) { blockDraft(error); feedback.error(message.value); return false }
}
async function markSaved(saved) {
  await nextTick()
  try { drafts.saved(saved); saveState.value='旅行已保存'; return true }
  catch (error) { blockDraft(error); feedback.error('旅行已保存，但草稿状态已变化；原始草稿保留，请核对。'); return false }
}
defineExpose({beforeSave,markSaved,openToday})
function protectUnload(event){if(saveState.value.includes('失败')||draftBlocked.value){event.preventDefault();event.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',protectUnload))
onBeforeUnmount(()=>window.removeEventListener('beforeunload',protectUnload))
try {
  drafts = travelDraft(localStorage,key,()=>readUserData(owner).routes.find(route=>route.id===props.route.id))
  const value = drafts.restore()
  if (value) {
    // The day editor is a sibling. Restore after its first render so its inputs
    // observe the same draft as the workbench when the route is reloaded.
    onMounted(() => {
      Object.assign(props.route,value)
      targetDay.value = value.days?.[0]?.date || ''
      snapshot = JSON.stringify(props.route)
      message.value = '已恢复本账号的编辑草稿，请检查后保存。'
    })
  }
} catch (error) { blockDraft(error) }

watch(() => props.route, value => {
 if (travel.ownerId !== owner || draftBlocked.value) return
 const next=JSON.stringify(value)
 if (next===snapshot) return
 if(!restoring) history.value.push(snapshot)
 if(history.value.length>20) history.value.shift()
 snapshot=next
 try { drafts.write(value); saveState.value='草稿已保存到本浏览器，点击保存修改更新旅行' } catch (error) { blockDraft(error) }
}, {deep:true})
async function undo(){const previous=history.value.pop();if(previous){restoring=true;const old=JSON.parse(previous);for(const k of Object.keys(props.route)) if(!(k in old)) delete props.route[k];Object.assign(props.route,old);await nextTick();restoring=false}}
function addExpense(){ props.route.expenses ||= []; props.route.expenses.push({category:entry.value.category,title:entry.value.title.trim(),estimate:entry.value.estimate===''?null:Number(entry.value.estimate),actual:entry.value.actual===''?null:Number(entry.value.actual)});entry.value={category:'住宿',title:'',estimate:'',actual:''} }
async function recoverDraft() {
  if (!await feedback.confirm('将备份保留草稿和当前编辑，再载入最新已保存的旅行。继续？')) return
  if (travel.ownerId !== owner) return
  try {
    if (!drafts) drafts = travelDraft(localStorage,key,()=>readUserData(owner).routes.find(route=>route.id===props.route.id))
    const latest = drafts.recover(JSON.parse(JSON.stringify(props.route)))
    restoring = true
    for (const field of Object.keys(props.route)) if (!field.startsWith('__') && !(field in latest)) delete props.route[field]
    Object.assign(props.route,latest)
    targetDay.value=latest.days?.[0]?.date||''
    emit('focus-day',0)
    history.value=[]
    snapshot=JSON.stringify(props.route)
    await nextTick()
    draftBlocked.value=false
    saveState.value='已载入最新旅行'
    message.value='原草稿与当前编辑已备份，可以继续编辑。'
  } catch (error) { message.value=error.message || '备份失败，原始记录仍保留，请导出当前计划。' }
  finally { restoring=false }
}
function exportStoredDraft() {
  try {
    const raw=localStorage.getItem(key)
    if(raw===null){feedback.info('没有保留的草稿，可使用导出离线计划保存当前编辑。');return}
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json;charset=utf-8'}))
    const a=document.createElement('a');a.href=url;a.download=props.route.title+'-保留草稿.json';a.click();URL.revokeObjectURL(url)
  } catch { feedback.error('草稿读取失败，请检查浏览器存储权限。') }
}

function exportPlan(){const text=itineraryService.exportRoute(props.route)+'\n导出时间：'+new Date().toLocaleString()+'\n费用记录：\n'+(props.route.expenses||[]).map(e=>`${e.category} ${e.title} 预计：${e.estimate??'待确认'} 实际：${e.actual??'待确认'}`).join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=props.route.title+'.txt';a.click();URL.revokeObjectURL(url)}
// 保存当前草稿；同行协商把云端每日行程写回本机时也复用同一套草稿校验与保存流程。
async function saveCurrentPlan() {
  if (!await beforeSave()) return false
  try {
    const clean = JSON.parse(JSON.stringify(props.route))
    delete clean.__srcId
    delete clean.__id
    const saved = travel.saveRoute(clean, owner)
    if (!await markSaved(saved)) return false
    message.value = '旅行已保存'
    saveState.value = '旅行已保存'
    return true
  } catch (error) {
    feedback.error(error.message || '保存失败，已保留当前编辑，请重试或导出备份')
    return false
  }
}
onBeforeRouteLeave(async () => {
  // Commit before moving to a catalogue, so adding an activity cannot later be
  // overwritten by the previous page's local draft.
  if (travel.ownerId !== owner) return true
  return saveCurrentPlan()
})
</script>
<style scoped>
.workbench{margin:20px 0;padding:20px;background:#f4f8fc;border:1px solid #d7e1eb;border-radius:12px;color:#243449}.actions,form{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}label{display:flex;flex-wrap:wrap;gap:6px;align-items:center}input,select,button{padding:8px;max-width:100%}article{padding:12px;border-bottom:1px solid #ccd6e0}summary{cursor:pointer;padding:10px 0}li{margin:8px 0}.prep-overdue{color:#c92a2a}.prep-soon{color:#b26a00}

.workbench > h2 { border-left:3px solid #4c8474; padding-left:10px; }
.workbench .budget-summary { background:#f2f7f4; padding:10px 12px; border-radius:9px; font-variant-numeric:tabular-nums; }
.workbench > details { border:1px solid #dbe4df; background:#fff; border-radius:10px; padding:10px 12px; margin:8px 0; }
.workbench > details > summary { cursor:pointer; color:#2c5046; font-weight:600; }
</style>
