import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectPlan } from '../src/utils/planning.js';
test('planning flags overlapping visits, missing costs and over-budget estimates',()=>{
 const route={budget:100,expenses:[{estimate:120},{estimate:null}],days:[{activities:[{title:'A',time:'09:00',durationMinutes:240},{title:'B',time:'10:00'}]},{activities:[]}]};
 const issues=inspectPlan(route).join('\n');
 assert.match(issues,/重叠/);assert.match(issues,/尚未安排/);assert.match(issues,/超.*20.00/);assert.match(issues,/费用尚未录入/);
});
test('unknown travel data is not reported as a confirmed executable plan',()=>{
 assert.match(inspectPlan({days:[]}).join(' '),/尚未核实/);
});

test('planning checks user-confirmed opening hours and transfer buffers',()=>{
 const issues=inspectPlan({days:[{activities:[{title:'A',time:'09:00',durationMinutes:120,travelMinutes:60,opensAt:'10:00',closesAt:'10:30'},{title:'B',time:'11:30',durationMinutes:30}]}]}).join(' ');
 assert.match(issues,/早于填写/);assert.match(issues,/超出填写/);assert.match(issues,/重叠/);
});
