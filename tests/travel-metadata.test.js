import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTravelMetadata} from '../src/utils/travelMetadata.js';
const trip={id:'1',title:'旅行',startDate:'2030-12-30',endDate:'2031-01-01',days:[{date:'2030-12-30',activities:[{title:'A',travelMinutes:20,travelEstimate:{minutes:20}}],budget:100},{date:'2031-01-01',activities:[{title:'C',notes:'预约'}],budget:200}],expenses:[{title:'酒店',actual:300}]};
test('metadata changes keep the latest schedule instead of stale form copies',()=>{
 const result=applyTravelMetadata(trip,{title:'新名称',days:[],expenses:[]});assert.equal(result.title,'新名称');assert.deepEqual(result.days,trip.days);assert.deepEqual(result.expenses,trip.expenses);
});
test('moving dates keeps relative days across years and invalidates dated route estimates',()=>{
 const result=applyTravelMetadata(trip,{startDate:'2031-01-02',endDate:'2031-01-04'});
 assert.equal(result.days[0].date,'2031-01-02');assert.equal(result.days[2].activities[0].title,'C');assert.equal(result.days[0].activities[0].travelEstimate,undefined);assert.equal(result.days[0].activities[0].travelMinutes,null);assert.equal(trip.days[0].activities[0].travelMinutes,20);
});
test('shortening a trip preserves displaced activities, notes and original day budgets',()=>{
 const result=applyTravelMetadata(trip,{endDate:'2030-12-30'});assert.equal(result.days.length,1);assert.equal(result.pendingActivities[0].title,'C');assert.equal(result.pendingActivities[0].notes,'预约');assert.equal(result.pendingActivities[0].previousDate,'2031-01-01');assert.equal(result.dateAdjustmentArchive[0].budget,200);
});
