<template>
  <section class="place-lookup">
    <label>城市 <input v-model="city" placeholder="例如：北京"></label>
    <label>地点名称 <input v-model="keyword" placeholder="输入景点或酒店名称" @keydown.enter.prevent="search"></label>
    <button type="button" :disabled="busy" @click="search">{{ busy ? '查询中…' : '查询真实地点' }}</button>
    <p role="status">{{ message }}</p>
    <ul><li v-for="candidate in candidates" :key="candidate.id"><button type="button" @click="choose(candidate)">{{ candidate.name }} · {{ candidate.city }} {{ candidate.address }}</button></li></ul>
    <p v-if="selected">已确认：{{ selected.name }} · {{ selected.address }} <a :href="placeLink(selected)" target="_blank" rel="noopener noreferrer">在高德查看地点</a></p>
    <slot v-if="selected" :place="selected"></slot>
    <div v-if="selected && showMap" ref="mapContainer" class="location-map" aria-label="已确认地点地图"></div>
    <p v-if="mapLoading" role="status">正在加载地点地图…</p>
    <p v-if="mapError" role="alert">{{ mapError }} 地点已确认，可以继续安排。<button type="button" @click="retryMap">重试地图</button></p>
  </section>
</template>
<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { searchPlaces, placeLink } from '../services/mapPlaces.js'
import { useAttractionMap } from '../composables/useAttractionMap.js'
const props=defineProps({name:{type:String,default:''},city:{type:String,default:''},showMap:{type:Boolean,default:true}}),emit=defineEmits(['select'])
const keyword=ref(props.name),city=ref(props.city),candidates=ref([]),selected=ref(null),message=ref(''),busy=ref(false)
let controller,disposed=false
const {mapContainer,mapLoading,mapError,retryMap}=useAttractionMap({viewMode:computed(()=>props.showMap && selected.value?'map':'grid'),items:computed(()=>selected.value?[{...selected.value,coordinates:selected.value.location}]:[]),onSelect:()=>{}})
function clear(){controller?.abort();selected.value=null;candidates.value=[];busy.value=false}
watch(()=>[props.name,props.city],()=>{clear();keyword.value=props.name;city.value=props.city;message.value=''})
async function search(){
 controller?.abort();const current=new AbortController();controller=current;busy.value=true;message.value='';candidates.value=[]
 try{const result=await searchPlaces(keyword.value,city.value,{signal:current.signal});if(current.signal.aborted||disposed)return;candidates.value=result;message.value=result.length?'请选择正确的地点；同名地点不会自动采用。':'未找到匹配地点，请补充城市或修改名称。'}catch(e){if(!current.signal.aborted&&!disposed)message.value=e.message}finally{if(controller===current)busy.value=false}
}
function choose(candidate){controller?.abort();selected.value=candidate;candidates.value=[];message.value='地点已确认';emit('select',candidate)}
onBeforeUnmount(()=>{disposed=true;clear()})
</script>
<style scoped>.place-lookup{padding:12px;border:1px solid #ccddeb;margin:12px 0;border-radius:8px}.place-lookup label{display:inline-flex;flex-wrap:wrap;gap:8px;margin:4px}.place-lookup input,.place-lookup button{padding:8px;max-width:100%}.location-map{height:260px;width:100%}.place-lookup li{margin:8px 0}</style>
