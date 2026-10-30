export function inspectPlan(route) {
 const issues=[]
 for(const [index,day] of (route.days||[]).entries()) {
  const label=`第${index+1}天`
  if(!day.activities?.length) issues.push(`${label}尚未安排活动`)
  let previousEnd=0
  for(const activity of day.activities||[]) {
   const match=/^(\d{1,2}):(\d{2})$/.exec(activity.time||'')
   if(!match || +match[1]>23 || +match[2]>59) {issues.push(`${label}「${activity.title}」时间待确认`);continue}
   const start=+match[1]*60 + +match[2]
   if(start<previousEnd) issues.push(`${label}「${activity.title}」与前一活动重叠或未留交通缓冲`)
   if(!Number.isFinite(activity.durationMinutes) || activity.durationMinutes < 0) issues.push(`${label}「${activity.title}」停留时长待确认`)
   const duration=Number.isFinite(activity.durationMinutes)&&activity.durationMinutes>=0?activity.durationMinutes:0
   const transfer=Number.isFinite(activity.travelMinutes)&&activity.travelMinutes>=0?activity.travelMinutes:0
   const minutes = value => {const m=/^(\d{2}):(\d{2})$/.exec(value||'');return m && +m[1]<24 && +m[2]<60 ? +m[1]*60 + +m[2] : null}
   const opens=minutes(activity.opensAt), closes=minutes(activity.closesAt)
   if(opens!==null && start<opens) issues.push(`${label}「${activity.title}」早于填写的开放时间`)
   if(closes!==null && start+duration>closes) issues.push(`${label}「${activity.title}」超出填写的关闭时间`)
   previousEnd=start+duration+transfer
   if(previousEnd>21*60) issues.push(`${label}「${activity.title}」结束较晚，请检查体力与开放时间`)
  }
 }
 const expenses=route.expenses||[]
 if(!expenses.length || expenses.some(e=>e.estimate==null)) issues.push('部分费用尚未录入，预算是否足够暂无法确定')
 const total=expenses.reduce((sum,e)=>sum+(e.estimate??0),0)
 if(Number.isFinite(route.budget)&&total>route.budget) issues.push(`预计费用超过预算上限 ¥${(total-route.budget).toFixed(2)}`)
 issues.push('开放时间与真实交通耗时尚未核实，请出行前确认')
 return issues
}
