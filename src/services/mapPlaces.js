import { loadMap } from './mapLoader.js'

function callbackTask(start, signal, timeoutMs=15000) {
  return new Promise((resolve,reject)=>{
    let settled=false
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value)}
    const abort=()=>finish(new Error('查询已取消'))
    const timer=setTimeout(()=>finish(new Error('地图查询超时，请重试')),timeoutMs)
    if(signal?.aborted){abort();return}
    signal?.addEventListener('abort',abort,{once:true})
    try{start((error,value)=>finish(error,value))}catch{finish(new Error('地图查询失败'))}
  })
}
export function coordinates(value){
  const rawLng=value?.getLng?.()??value?.lng??value?.[0],rawLat=value?.getLat?.()??value?.lat??value?.[1]
  if([rawLng,rawLat].some(v=>v==null || typeof v==='boolean' || typeof v==='object' || String(v).trim()===''))return null
  const lng=Number(rawLng),lat=Number(rawLat)
  if(!Number.isFinite(lng)||!Number.isFinite(lat)||lng < -180||lng>180||lat < -90||lat>90)return null
  return [lng,lat]
}
async function plugin(name,signal,loader){
 const sdk=await loader({signal})
 if(typeof sdk[name]!=='function') await callbackTask(done=>sdk.plugin([`AMap.${name}`],()=>done(null)),signal)
 return sdk
}
export async function searchPlaces(keyword,city='',{signal,loader=loadMap}={}){
 if(!keyword?.trim())throw new Error('请输入地点名称')
 const sdk=await plugin('PlaceSearch',signal,loader)
 return callbackTask(done=>{
  const search=new sdk.PlaceSearch({city:city||'全国',citylimit:!!city,pageSize:5,extensions:'base'})
  search.search(keyword.trim(),(status,result)=>{
   if(status==='no_data'){done(null,[]);return}
   if(status!=='complete'){done(new Error('地点查询失败，请检查 Key 的 JS API 权限、域名白名单或配额'));return}
   done(null,(result?.poiList?.pois||[]).map(p=>({id:p.id,name:p.name,address:typeof p.address==='string'?p.address:'',city:p.cityname||city,location:coordinates(p.location),coordinateSystem:'GCJ-02',source:'高德地图'})).filter(p=>p.location))
  })
 },signal)
}
export async function planJourney(origin,destination,mode='walking',{signal,loader=loadMap}={}){
 const from=coordinates(origin),to=coordinates(destination)
 if(!from||!to)throw new Error('请先确认两个地点的真实位置')
 if(!['walking','driving'].includes(mode))throw new Error('暂不支持此交通方式')
 const name=mode==='walking'?'Walking':'Driving',sdk=await plugin(name,signal,loader)
 return callbackTask(done=>{
  const service=new sdk[name]({extensions:'base'})
  service.search(from,to,(status,result)=>{
   const route=result?.routes?.[0]
   if(status!=='complete'||!route||[route.time,route.distance].some(v=>v==null||typeof v==='boolean'||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0)){done(new Error('未找到可用路线，请调整地点或交通方式'));return}
   done(null,{minutes:Math.ceil(Number(route.time)/60),distanceMeters:Number(route.distance),mode,source:'高德地图',checkedAt:new Date().toISOString(),origin:from,destination:to})
  })
 },signal)
}

// Reordering/removing activities must not retain a journey to the old next stop.
export function reconcileTravelEstimates(days=[]){
 for(const day of days)for(const [index,activity] of (day.activities||[]).entries()){
  if(!activity.travelEstimate)continue
  const from=coordinates(activity.place?.location),to=coordinates(day.activities[index+1]?.place?.location)
  if(!from||!to||JSON.stringify([from,to])!==JSON.stringify([activity.travelEstimate.origin,activity.travelEstimate.destination])){
   activity.travelMinutes=null;delete activity.travelEstimate
  }
 }
}

export function placeLink(place){
 const location=coordinates(place?.location)
 if(!location)return null
 return 'https://uri.amap.com/marker?'+new URLSearchParams({position:location.join(','),name:place.name||'',coordinate:'gaode',src:'travel-planner',callnative:'0'})
}
