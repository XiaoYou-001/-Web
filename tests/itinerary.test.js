import assert from 'node:assert/strict';
import { test } from 'node:test';
import itineraryService from '../src/services/itineraryService.js';

test('missing route provider leaves travel duration unknown', () => {
  assert.equal(itineraryService.estimateTravelTime('故宫', '长城'), null);
  assert.equal(itineraryService.estimateTravelTime('', ''), null);
});

test('recommendations cover multiple cities while preserving the Shanghai demo semantics', () => {
  // 上海无文化历史类，保持“明确提示无匹配”的演示语义
  assert.deepEqual(itineraryService.recommendAttractions(['culture'], '上海'), []);
  assert.ok(itineraryService.recommendAttractions(['nature'], '上海').length > 0);
  assert.ok(itineraryService.recommendAttractions(['culture'], '杭州').length > 0);
  assert.ok(itineraryService.recommendAttractions(['culture'], '西安').length > 0);
  assert.ok(itineraryService.recommendAttractions(['nature'], '三亚').length > 0);
  // 结果按评分降序
  const arts = itineraryService.recommendAttractions(['art'], '上海');
  assert.ok(arts.every((item, index) => index === 0 || arts[index - 1].rating >= item.rating));
});

test('daily plan does not repeat attractions across days and attaches travel notes', () => {
  // 北京 culture+nature 有足够景点，3 天不应跨天重复
  const plan = itineraryService.generateDailyPlan('北京', ['culture', 'nature'], 3000, 2, '2030-06-01');
  const titles = plan.flatMap(day => day.activities.map(a => a.title));
  assert.equal(new Set(titles).size, titles.length, '同一行程中的景点不应重复');
  assert.deepEqual(plan.map(day => day.date), ['2030-06-01', '2030-06-02']);
  // 同一天第二个景点应带交通耗时说明
  if (plan[0].activities.length > 1) {
    assert.match(plan[0].activities[0].description, /真实交通耗时/);
  }
  const travel = itineraryService.estimateTravelTime('A', 'B');
  assert.equal(travel, null);
});

test('exportRoute produces a shareable text plan with and without daily activities', () => {
  // 有每日行程
  const routeWithDays = {
    title: ' 北京3日游 ',
    startDate: '2030-06-01',
    endDate: '2030-06-03',
    budget: 3000,
    themes: ['历史文化', '自然风光'],
    companion: 'solo',
    days: [
      { date: '2030-06-01', activities: [{ time: '09:00', title: '故宫', description: '约4小时' }], budget: 1000 }
    ]
  };
  const text = itineraryService.exportRoute(routeWithDays);
  assert.match(text, /北京3日游/);
  assert.match(text, /2030-06-01 至 2030-06-03/);
  assert.match(text, /第1天/);
  assert.match(text, /09:00 - 故宫/);
  assert.match(text, /当日预算：¥1000/);

  // 无每日行程 → 退化为摘要
  const routeSummary = { title: '周末游', startDate: '2030-07-01', endDate: '2030-07-02', themes: ['亲子'] };
  const summary = itineraryService.exportRoute(routeSummary);
  assert.match(summary, /周末游/);
  assert.doesNotMatch(summary, /第1天/);

  // 空/无效输入返回空字符串
  assert.equal(itineraryService.exportRoute(null), '');
  assert.equal(itineraryService.exportRoute({}), '');
});

test('exportRoute includes multi-destination and persons (headcount) info', () => {
  const route = {
    title: '京沪双城游',
    startDate: '2030-06-01',
    endDate: '2030-06-04',
    budget: 8000,
    destinations: ['北京', '上海'],
    persons: 4,
    days: []
  };
  const text = itineraryService.exportRoute(route);
  assert.match(text, /目的地：北京、上海/);
  assert.match(text, /人数：4 人/);

  // 单目的地字段回退
  const single = itineraryService.exportRoute({ title: '杭州行', startDate: '2030-01-01', endDate: '2030-01-02', destination: '杭州' });
  assert.match(single, /目的地：杭州/);
  assert.doesNotMatch(single, /人数：/);
});


 test('generated activities do not overlap long visits and mark empty days', () => {
 const plan=itineraryService.generateDailyPlan('北京',['nature','culture'],3000,15,'2030-06-01');
 for(const day of plan) { let end=0; for(const a of day.activities) { const [h,m]=a.time.split(':').map(Number); const start=h*60+m; assert.ok(start>=end); end=start+a.durationMinutes; assert.ok(end<=18*60); } }
 assert.ok(plan.some(day=>day.activities.length===0 && day.warning.includes('不足')));
 });
