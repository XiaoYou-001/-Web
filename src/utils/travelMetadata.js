import {addCalendarDays,inclusiveDayCount,parseDateOnly} from './date.js'
const clone=value=>JSON.parse(JSON.stringify(value))
const fields=['title','startDate','endDate','destinations','themes','companion','preferences','coverImage','budget','persons']

// Metadata forms must not overwrite schedule edits made after the form opened.
export function applyTravelMetadata(current,input){
 const result=clone(current)
 for(const field of fields)if(Object.hasOwn(input,field)&&input[field]!==undefined)result[field]=clone(input[field])
 if(current.startDate===result.startDate&&current.endDate===result.endDate)return result
 const length=inclusiveDayCount(result.startDate,result.endDate)
 if(length>366)throw new Error('单次旅行最多支持366天，请拆分安排')
 const oldStart=parseDateOnly(current.startDate),oldDays=current.days||[]
 result.days=Array.from({length},(_,index)=>({date:addCalendarDays(result.startDate,index),activities:[],budget:null}))
 result.pendingActivities ||= []
 result.dateAdjustmentArchive ||= []
 for(const day of oldDays){
  const offset=(parseDateOnly(day.date)-oldStart)/86400000
  const activities=(day.activities||[]).map(activity=>{
   const copy=clone(activity)
   if(copy.travelEstimate){delete copy.travelEstimate;copy.travelMinutes=null}
   return copy
  })
  if(offset>=0&&offset<length){
   const target=result.days[offset]
   result.days[offset]={...clone(day),date:target.date,activities:[...target.activities,...activities]}
  }else{
   result.dateAdjustmentArchive.push(clone(day))
   result.pendingActivities.push(...activities.map(activity=>({...activity,previousDate:day.date})))
  }
 }
 return result
}
