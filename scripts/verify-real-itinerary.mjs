import { routeLocationKey } from 'vue-router'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createPinia, setActivePinia } from 'pinia'
import { apiClient, createApiClient } from '../src/services/apiClient.js'
import { registerUser, loginUser } from '../src/services/authService.js'
import { readUserData } from '../src/services/userDataService.js'
import { loadView, createViewState, renderView } from '../tests/helpers/vueView.js'
import { feedback } from '../src/services/feedbackService.js'
const data = new Map()
globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,String(value)), removeItem: key => data.delete(key) }
globalThis.sessionStorage = globalThis.localStorage
registerUser('13800138000','test-pass'); loginUser('13800138000','test-pass')
setActivePinia(createPinia())
const notices=[]
for (const method of ['success','error','info']) feedback[method]=message=>notices.push(message)
apiClient.request = createApiClient({baseUrl:'http://127.0.0.1:3017/api'}).request
const view=await loadView('RoutesView'), state=await createViewState(view)
state.showItineraryModal.value=true
state.itineraryPlan.value={destination:'北京',startDate:'2026-11-10',endDate:'2026-11-12',budget:6000,persons:2,preferences:['culture','food'],pace:'normal'}
const start=Date.now()
await state.generateItinerary()
assert.ok(state.generatedItinerary.value,JSON.stringify(notices))
const result=JSON.parse(JSON.stringify(state.generatedItinerary.value))
assert.equal(result.days.length,3)
const html=await renderView(view,state)
assert.ok(html.includes(result.days[0].activities[0].title))
let blob,filename,clicked=false
const urls=new Map()
globalThis.window={URL:{createObjectURL(value){blob=value;return 'blob:test'},revokeObjectURL(){}}}
globalThis.document={createElement(){return {set download(value){filename=value},click(){clicked=true}}}}
state.exportItineraryPlan()
assert.ok(clicked)
const exported=await blob.text()
assert.ok(exported.includes(result.days[0].activities[0].title))
assert.ok(exported.includes('2026-11-12'))
state.saveAsRoute()
const saved=readUserData().routes.find(route=>route.title==='北京3日游')
assert.ok(saved,JSON.stringify(notices))
assert.deepEqual(saved.days,result.days)
assert.equal(saved.persons,2)
const detailView=await loadView('RouteDetailView')
const routePlugin={install(app){app.provide(routeLocationKey,{params:{id:saved.id},query:{}})}}
const detailState=await createViewState(detailView,[routePlugin])
const detailHtml=await renderView(detailView,detailState,[routePlugin])
assert.ok(detailHtml.includes(result.days[0].activities[0].title))
const reloaded=await createViewState(view)
assert.ok(reloaded.myRoutes.value.some(route=>route.id===saved.id))
await writeFile('.local-evidence/real-itinerary.json',JSON.stringify({elapsedMs:Date.now()-start,result,saved,filename,notices,checks:['real model through backend','page render','export download handler and content','save route persistence','reload view','saved route detail render']},null,2))
await writeFile('.local-evidence/北京行程计划.txt',exported)
console.log(JSON.stringify({ok:true,elapsedMs:Date.now()-start,days:result.days.length,activities:result.days.map(d=>d.activities.length),filename,notices}))
