import test from 'node:test';
import assert from 'node:assert/strict';
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
