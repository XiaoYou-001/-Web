import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import { loadComponent } from './helpers/vueView.js';
test('workbench renders missing-information checks and separates estimates from spending',async()=>{
 const component=await loadComponent('components/TravelWorkbench.vue');
 const app=createSSRApp({render:()=>h(component,{route:{id:'test',title:'旅行',startDate:'2030-01-01',endDate:'2030-01-01',budget:100,days:[{date:'2030-01-01',activities:[]}],expenses:[{title:'酒店',category:'住宿',estimate:120,actual:80}]}})});
 app.use(createPinia());
 const html=await renderToString(app);
 assert.match(html,/预计费用：¥120/);assert.match(html,/实际支出：¥80/);assert.match(html,/尚未安排活动/);assert.match(html,/超过预算上限/);assert.match(html,/导出离线计划/);
});

import { reactive, ref } from 'vue';
import { matchedRouteKey } from 'vue-router';
import { registerUser, loginUser } from '../src/services/authService.js';
import { useTravelStore } from '../src/stores/travel.js';

test('leaving the workbench persists edits before catalogue additions and blocks quota failures',async()=>{
 const original=globalThis.localStorage;
 const storage=new Map();
 globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 try {
  registerUser('13800138000','test-pass');loginUser('13800138000','test-pass');
  const pinia=createPinia();const travel=useTravelStore(pinia);
  const saved=travel.saveRoute({title:'原计划',startDate:'2030-06-01',endDate:'2030-06-01',themes:[],preferences:{},days:[{date:'2030-06-01',activities:[]}]});
  const draft=reactive(JSON.parse(JSON.stringify(saved)));
  const record={leaveGuards:new Set()};
  const component=await loadComponent('components/TravelWorkbench.vue');
  const app=createSSRApp({render:()=>h(component,{route:draft})});app.use(pinia);app.provide(matchedRouteKey,ref(record));
  await renderToString(app);
  const guard=[...record.leaveGuards][0];assert.equal(typeof guard,'function');
  draft.title='编辑后的计划';
  assert.equal(await guard(),true);
  assert.equal(travel.routes[0].title,'编辑后的计划');
  assert.equal(storage.has(`travel-draft:${encodeURIComponent(travel.ownerId)}:${saved.id}`),false);
  globalThis.localStorage.setItem=()=>{throw new Error('quota')};
  draft.title='保存失败的草稿';
  assert.equal(await guard(),false);
  assert.equal(draft.title,'保存失败的草稿');
  assert.equal(travel.routes[0].title,'编辑后的计划');
 } finally {globalThis.localStorage=original}
});


test('workbench refuses to auto-restore stale dates or save over a newer plan',async()=>{
 const original=globalThis.localStorage, storage=new Map()
 globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
 try {
  registerUser('13800138000','test-pass');loginUser('13800138000','test-pass')
  const pinia=createPinia(),travel=useTravelStore(pinia)
  const saved=travel.saveRoute({title:'原旅行',themes:[],preferences:{},startDate:'2030-06-01',endDate:'2030-06-03',days:[{date:'2030-06-01',activities:[]}]})
  const {travelDraft}=await import('../src/services/travelDraft.js')
  const key=`travel-draft:${encodeURIComponent(travel.ownerId)}:${saved.id}`
  const draftManager=travelDraft(globalThis.localStorage,key,()=>travel.routes[0])
  draftManager.write({...saved,title:'旧日期草稿'})
  const stale=storage.get(key)
  const latest=travel.saveRoute({...saved,endDate:'2030-06-01',title:'新日期旅行'})
  const route=reactive(JSON.parse(JSON.stringify(latest))),record={leaveGuards:new Set()}
  const component=await loadComponent('components/TravelWorkbench.vue')
  const app=createSSRApp({render:()=>h(component,{route})});app.use(pinia);app.provide(matchedRouteKey,ref(record))
  const html=await renderToString(app)
  assert.equal(route.endDate,'2030-06-01')
  assert.match(html,/导出保留草稿/)
  assert.equal(await [...record.leaveGuards][0](),false)
  assert.equal(storage.get(key),stale)
  assert.equal(travel.routes[0].title,'新日期旅行')
 }finally{globalThis.localStorage=original}
})
