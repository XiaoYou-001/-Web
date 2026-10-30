import test from 'node:test'
import assert from 'node:assert/strict'
import {travelDraft} from '../src/services/travelDraft.js'
function storage(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)}}
function plan(){return {id:'trip',title:'当前旅行',startDate:'2030-06-01',endDate:'2030-06-03',days:[{date:'2030-06-01',activities:[{title:'故宫'}]}]}}

test('draft restores only against its saved baseline and cannot undo later metadata changes',()=>{
 const disk=storage();let current=plan()
 const draft=travelDraft(disk,'draft',()=>current)
 draft.write({...current,title:'尚未保存的编辑'})
 assert.equal(travelDraft(disk,'draft',()=>current).restore().title,'尚未保存的编辑')
 current={...current,endDate:'2030-06-01',pendingActivities:[{title:'移出的活动'}]}
 const original=disk.getItem('draft'),next=travelDraft(disk,'draft',()=>current)
 assert.throws(()=>next.restore(),/其他页面更新/)
 assert.equal(disk.getItem('draft'),original)
 assert.throws(()=>draft.assertCurrent(),/其他页面更新/)
})

test('independent tab drafts cannot overwrite or clear a newer draft',()=>{
 const disk=storage();let current=plan()
 const a=travelDraft(disk,'draft',()=>current),b=travelDraft(disk,'draft',()=>current)
 a.write({...current,title:'第一个标签页'})
 const raw=disk.getItem('draft')
 assert.throws(()=>b.write({...current,title:'第二个标签页'}),/其他页面更新/)
 assert.throws(()=>b.saved(current),/其他页面更新/)
 assert.equal(disk.getItem('draft'),raw)
 current={...current,title:'已经保存'}
 a.saved(current)
 assert.equal(disk.getItem('draft'),null)
 a.write({...current,title:'保存后的新编辑'})
 assert.equal(travelDraft(disk,'draft',()=>current).restore().title,'保存后的新编辑')
})

test('legacy and broken drafts are preserved and explicit recovery backs up both versions',()=>{
 for(const original of ['broken',JSON.stringify({...plan(),title:'旧版未保存草稿'})]) {
  const disk=storage();const current=plan();disk.setItem('draft',original)
  const draft=travelDraft(disk,'draft',()=>current)
  assert.throws(()=>draft.restore())
  assert.equal(disk.getItem('draft'),original)
  const editing={...current,title:'当前窗口的编辑'}
  assert.deepEqual(draft.recover(editing),current)
  const backup=[...disk.data].find(([key])=>key.startsWith('draft:backup:'))
  assert.equal(JSON.parse(backup[1]).storedDraft,original)
  assert.equal(JSON.parse(backup[1]).currentEditing.title,editing.title)
  assert.deepEqual(draft.restore(),current)
 }
})

test('failed backup or removal leaves the active draft intact',()=>{
 const disk=storage(),current=plan(),draft=travelDraft(disk,'draft',()=>current)
 draft.write({...current,title:'待保留'})
 const raw=disk.getItem('draft')
 disk.setItem=()=>{throw new Error('quota')}
 assert.throws(()=>draft.recover(current),/quota/)
 assert.equal(disk.getItem('draft'),raw)
 disk.removeItem=()=>{throw new Error('denied')}
 assert.throws(()=>draft.saved(current),/denied/)
 assert.equal(disk.getItem('draft'),raw)
})
