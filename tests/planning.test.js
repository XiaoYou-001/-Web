import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectPlan } from '../src/utils/planning.js';
test('planning flags overlapping visits, missing costs and over-budget estimates',()=>{
 const route={budget:100,expenses:[{estimate:120},{estimate:null}],days:[{activities:[{title:'A',time:'09:00',durationMinutes:240},{title:'B',time:'10:00'}]},{activities:[]}]};
 const findings=inspectPlan(route);
 const issues=findings.map(issue=>issue.message).join('\n');
 assert.deepEqual(findings.find(issue=>issue.field==='quickTitle'),{message:'第2天尚未安排活动',dayIndex:1,field:'quickTitle'});
 assert.equal(findings.find(issue=>issue.field==='estimate').expenseIndex,1);
 assert.equal(findings.find(issue=>issue.field==='budget').dayIndex,undefined);
 assert.match(issues,/重叠/);assert.match(issues,/尚未安排/);assert.match(issues,/超.*20.00/);assert.match(issues,/费用尚未录入/);
});
test('only actionable findings count, and repeated titles keep distinct field targets',()=>{
 const visit={title:'展览',time:'10:00',durationMinutes:20};
 const route={days:[{activities:[visit,{...visit,time:'11:00'}]}],expenses:[{estimate:0}]};
 assert.deepEqual(inspectPlan(route),[]);
 route.days[0].activities[1].durationMinutes=null;
 const [finding]=inspectPlan(route);
 assert.equal(finding.field,'durationMinutes');
 assert.equal(finding.activityIndex,1);
 assert.equal(finding.dayIndex,0);
});

test('planning checks user-confirmed opening hours and transfer buffers',()=>{
 const issues=inspectPlan({days:[{activities:[{title:'A',time:'09:00',durationMinutes:120,travelMinutes:60,opensAt:'10:00',closesAt:'10:30'},{title:'B',time:'11:30',durationMinutes:30}]}]}).map(issue=>issue.message).join(' ');
 assert.match(issues,/早于填写/);assert.match(issues,/超出填写/);assert.match(issues,/重叠/);
});
