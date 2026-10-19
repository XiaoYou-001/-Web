import assert from 'node:assert/strict';
import { test } from 'node:test';
import itineraryService from '../src/services/itineraryService.js';

test('travel time estimates are deterministic and bounded in 5-minute steps', () => {
  const first = itineraryService.estimateTravelTime('故宫', '长城');
  const second = itineraryService.estimateTravelTime('故宫', '长城');
  assert.equal(first, second);
  assert.ok(first >= 15 && first <= 90);
  assert.equal(first % 5, 0);
  // 不同地点结果也可能相同（散列合理范围内），但空输入有兜底值
  assert.equal(itineraryService.estimateTravelTime('', ''), 30);
  assert.equal(itineraryService.estimateTravelTime(null, null), 30);
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
    assert.match(plan[0].activities[0].description, /下一站约需/);
  }
  const travel = itineraryService.estimateTravelTime('A', 'B');
  assert.ok(travel > 0);
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

