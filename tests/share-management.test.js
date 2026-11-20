import test from 'node:test';
import assert from 'node:assert/strict';
import { shareChanges, sharePayload } from '../src/services/publicSharePlan.js';
import {shareManagement} from '../src/services/shareManagement.js';
const first={id:'a'.repeat(36),managementToken:'a'.repeat(64),ready:false};
const second={id:'b'.repeat(36),managementToken:'b'.repeat(64),ready:false};
function storage(){const data=new Map();return {get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))}}
test('independent tabs preserve every share capability while readiness and revocation change',()=>{
 const disk=storage(),a=shareManagement(disk,'owner:trip'),b=shareManagement(disk,'owner:trip');
 assert.deepEqual(a.load(),[]);assert.deepEqual(b.load(),[]);
 a.add(first);b.add(second);a.ready(first.id,123);assert.equal(b.load().length,2);
 b.revoke(first.id);a.ready(first.id,456);assert.deepEqual(a.load().map(e=>e.id),[second.id]);
 assert.equal(shareManagement(disk,'other:trip').load().length,0);
});
test('legacy capability lists remain recoverable and revocation cannot be undone by a reload',()=>{
 const disk=storage();disk.setItem('owner:trip',JSON.stringify([first]));const store=shareManagement(disk,'owner:trip');
 store.add(second);store.ready(first.id,123);assert.equal(store.load().length,2);
 store.revoke(first.id);assert.deepEqual(shareManagement(disk,'owner:trip').load().map(e=>e.id),[second.id]);
 assert.equal(JSON.parse(disk.getItem('owner:trip'))[0].managementToken,first.managementToken);
});
test('unreadable management records block writes without destroying originals',()=>{
 const disk=storage();disk.setItem('owner:trip','broken');const store=shareManagement(disk,'owner:trip');
 assert.throws(()=>store.add(first));assert.equal(disk.getItem('owner:trip'),'broken');assert.equal(disk.length,1);
});


test('revocation stays visible when another tab writes a stale ready update at the same time',()=>{
 const disk=storage(),a=shareManagement(disk,'owner:trip'),b=shareManagement(disk,'owner:trip')
 a.add(first)
 const set=disk.setItem
 let interleaved=false
 disk.setItem=(key,value)=>{
  if(!interleaved && key===`owner:trip:${first.id}` && JSON.parse(value).ready){interleaved=true;b.revoke(first.id)}
  set(key,value)
 }
 assert.deepEqual(a.ready(first.id,123),[])
 assert.deepEqual(b.load(),[])
 assert.throws(()=>a.add(first),/已使用/)
})

test('update preview compares only public fields and distinguishes removed days from empty days', () => {
  const before = {
    name: '故宫', startDate: '2030-06-01', endDate: '2030-06-03',
    days: [{ date: '2030-06-01', activities: [{ title: '游览', time: '10:00' }] }, { date: '2030-06-02', activities: [] }]
  };
  const draft = {
    ...before, title: before.name, expenses: [{ notes: 'PRIVATE' }],
    days: before.days.map(day => ({ ...day, activities: day.activities.map(activity => ({ ...activity, notes: 'PRIVATE' })) }))
  };
  assert.deepEqual(shareChanges(before, sharePayload(draft)), []);
  draft.days[0].activities[0].time = '11:00';
  draft.days[1].date = '2030-06-03';
  const preview = shareChanges(before, sharePayload(draft));
  assert.doesNotMatch(JSON.stringify(preview), /PRIVATE/);
  assert.deepEqual(preview, [
    { label: '2030-06-01', activitiesOnly: true, before: ['第 1 项 · 10:00 · 游览'], after: ['第 1 项 · 11:00 · 游览'] },
    { label: '2030-06-02', before: [], after: null },
    { label: '2030-06-03', before: null, after: [] }
  ]);
});

test('updating one meeting, inserting a stop or reordering duplicate names previews only affected rows', () => {
  const date = '2030-06-01';
  const activities = [
    { title: '集合', time: '09:00' },
    { title: '午餐', time: '12:00' },
    { title: '集合', time: '14:00' },
    { title: '集合', time: '14:00' }
  ];
  const before = { name: '行程', startDate: date, endDate: date, days: [{ date, activities }] };
  function diff(next) {
    return shareChanges(before, { ...before, title: before.name, days: [{ date, activities: next }] })[0];
  }
  const retimed = diff([activities[0], activities[1], { title: '集合', time: '15:00' }, activities[3]]);
  assert.deepEqual(retimed.before, ['第 3 项 · 14:00 · 集合']);
  assert.deepEqual(retimed.after, ['第 3 项 · 15:00 · 集合']);
  const moved = diff([activities[1], activities[2], activities[3], activities[0]]);
  assert.deepEqual(moved.before, ['第 1 项 · 09:00 · 集合']);
  assert.deepEqual(moved.after, ['第 4 项 · 09:00 · 集合']);
  const inserted = diff([{ title: '早餐', time: '08:00' }, ...activities]);
  assert.deepEqual(inserted.before, []);
  assert.deepEqual(inserted.after, ['第 1 项 · 08:00 · 早餐']);
});
