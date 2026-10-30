<template><div class="add-travel"><button @click="open = !open">安排到旅行</button><small v-if="arrangedCount">已关联 {{ arrangedCount }} 次旅行（含待安排）</small><form v-if="open" @submit.prevent="save"><p v-if="!travel.ownerId">请登录后保存旅行；当前可继续浏览。</p><label>旅行 <select v-model="selected"><option value="">新建旅行</option><option v-for="r in travel.routes" :value="String(r.id)" :key="r.id">{{ r.title }}</option></select></label><label v-if="!selected">旅行名称 <input v-model="title" required></label><label><input type="checkbox" v-model="pending">暂不安排日期，加入候选池</label><label>旅行 / 安排日期 <input type="date" v-model="date" required></label><button>确认添加</button><p role="status">{{ message }}</p></form></div></template>
<script setup>
import { ref, watch, computed } from 'vue'
import { useTravelContext } from '../composables/useTravelContext.js'
import { useRouter } from 'vue-router'
import { useTravelStore } from '../stores/travel.js'
import { localDateString, inclusiveDayCount, addCalendarDays } from '../utils/date.js'
const props=defineProps({item:{type:Object,required:true},category:{type:String,default:'景点'}})
const travel=useTravelStore(),router=useRouter(),open=ref(false),selected=ref(''),date=ref(localDateString()),title=ref('我的旅行'),message=ref(''),pending=ref(false)
const arrangedCount=computed(()=>travel.routes.filter(r=>[...(r.pendingActivities||[]),...(r.days||[]).flatMap(d=>d.activities||[])].some(a=>a.sourceId===String(props.item.id)&&a.category===props.category)).length)
const context = useTravelContext()
watch(context, value => {
  if (value) { selected.value=String(value.id); date.value=value.startDate }
  else { selected.value=''; date.value=localDateString() }
}, {immediate:true})
watch(selected, id => {
  const target=travel.routes.find(item=>String(item.id)===id)
  if(target && (date.value<target.startDate || date.value>target.endDate)) date.value=target.startDate
})
function save(){
 if(!travel.ownerId){router.push({path:'/login',query:{redirect:router.currentRoute.value.fullPath}});return}
 try {
 const source=travel.routes.find(r=>String(r.id)===selected.value)
 if(selected.value&&!source) throw new Error('旅行已被删除，请重新选择')
 const draft=source?JSON.parse(JSON.stringify(source)):{title:title.value.trim(),startDate:date.value,endDate:date.value,themes:[],preferences:{},days:[],destinations:[]}
 if(!pending.value && (date.value<draft.startDate||date.value>draft.endDate)) throw new Error('请选择旅行日期范围内的一天')
 draft.days ||= []
 for(let i=0;i<inclusiveDayCount(draft.startDate,draft.endDate);i++) {
  const ds=addCalendarDays(draft.startDate,i)
  if(!draft.days.some(d=>d.date===ds)) draft.days.push({date:ds,activities:[],budget:null})
 }
 draft.days.sort((a,b)=>a.date.localeCompare(b.date))
 const day=draft.days.find(d=>d.date===date.value)
 if(day) day.activities ||= []
 const activity = {title:props.item.name,time:'',description:props.item.description||'',sourceId:String(props.item.id),category:props.category,durationMinutes:null}
 if(props.item.place)activity.place=JSON.parse(JSON.stringify(props.item.place))
 if(pending.value){draft.pendingActivities ||= [];draft.pendingActivities.push(activity)}else{day.activities.push(activity)}
 const saved=travel.saveRoute(draft)
 message.value='已添加，可以继续添加其他日期或旅行'
 router.push({name:'route-detail',params:{id:String(saved.id)}})
 }catch(e){message.value=e.message}
}
</script>
<style scoped>form{display:flex;flex-wrap:wrap;gap:10px;padding:12px;background:#f2f6fa}label{display:grid;gap:4px}input,select,button{padding:8px;max-width:100%}</style>
