<template>
  <details class="travel-map">
    <summary>真实地点与交通耗时</summary>
    <p>先逐项确认地点，再查询相邻两站的路线。查询结果来自高德，交通耗时会随路况变化。</p>
    <label>日期 <select v-model="dayIndex"><option v-for="(day,index) in route.days" :key="day.date" :value="index">{{ day.date }}</option></select></label>
    <label>交通方式 <select v-model="mode"><option value="walking">步行</option><option value="driving">驾车</option></select></label>
    <article v-for="(activity,index) in activities" :key="index">
      <h4>{{ index+1 }}. {{ activity.title }}</h4>
      <p v-if="activity.place">已确认：{{ activity.place.name }} · {{ activity.place.address }}</p>
      <PlaceLookup :name="activity.title" :city="route.destinations?.[0] || route.destination || ''" @select="place => selectPlace(index,place)" />
      <button v-if="index < activities.length-1" :disabled="busy || !activity.place || !activities[index+1].place" @click="calculate(index)">计算到下一站</button>
      <p v-if="activity.travelEstimate">{{ activity.travelEstimate.mode === 'walking' ? '步行' : '驾车' }}约 {{ activity.travelEstimate.minutes }} 分钟 · {{ activity.travelEstimate.distanceMeters }} 米 · 查询时间 {{ new Date(activity.travelEstimate.checkedAt).toLocaleString() }}</p>
    </article>
    <p role="status">{{ message }}</p>
  </details>
</template>
<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue'
import PlaceLookup from './PlaceLookup.vue'
import {planJourney,reconcileTravelEstimates} from '../services/mapPlaces.js'
const props=defineProps({route:{type:Object,required:true}})
const dayIndex=ref(0),mode=ref('walking'),busy=ref(false),message=ref('')
const activities=computed(()=>props.route.days?.[dayIndex.value]?.activities||[])
watch(()=>JSON.stringify(props.route.days?.map(day=>day.activities?.map(a=>a.place?.location))),()=>reconcileTravelEstimates(props.route.days),{immediate:true,flush:'sync'})
let controller,disposed=false
function invalidate(activity){if(activity){activity.travelMinutes=null;delete activity.travelEstimate}}
function selectPlace(index,place){controller?.abort();busy.value=false;const activity=activities.value[index];if(!activity)return;activity.place=place;invalidate(activity);invalidate(activities.value[index-1])}
async function calculate(index){
 controller?.abort();const current=new AbortController();controller=current
 const activity=activities.value[index],next=activities.value[index+1],day=dayIndex.value
 if(!activity?.place||!next?.place)return
 const signature=JSON.stringify([activity.place.location,next.place.location]),selectedMode=mode.value
 busy.value=true;message.value=''
 try{
  const result=await planJourney(activity.place.location,next.place.location,selectedMode,{signal:current.signal})
  if(disposed||current.signal.aborted||day!==dayIndex.value||activity!==activities.value[index]||next!==activities.value[index+1]||signature!==JSON.stringify([activity.place.location,next.place.location]))return
  activity.travelMinutes=result.minutes;activity.travelEstimate=result;message.value='真实交通耗时已写入当天安排，请检查时间冲突并保存。'
 }catch(e){if(!disposed&&!current.signal.aborted)message.value=e.message}finally{if(controller===current)busy.value=false}
}
watch([dayIndex,mode],()=>{controller?.abort();busy.value=false;message.value=''})
onBeforeUnmount(()=>{disposed=true;controller?.abort()})
</script>
<style scoped>.travel-map{border:1px solid #ccddeb;padding:16px;border-radius:10px;margin:12px 0}.travel-map label{margin-right:12px}.travel-map select,.travel-map button{padding:8px}summary{cursor:pointer}article{border-top:1px solid #ddd;margin-top:12px}</style>
