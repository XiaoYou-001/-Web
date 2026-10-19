import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultPersons,
  dailyBudgetRows,
  perPerson,
  dailyAverage,
  calendarCells,
  monthTitle,
  destinationLabel,
  addDayDates
} from '../src/utils/routeStats.js';

test('defaultPersons derives a headcount from companion type', () => {
  assert.equal(defaultPersons('solo'), 1);
  assert.equal(defaultPersons('couple'), 2);
  assert.equal(defaultPersons('family'), 4);
  assert.equal(defaultPersons('friends'), 4);
  assert.equal(defaultPersons('unknown'), 2);
});

test('dailyBudgetRows computes per-day budget rows with proportional widths', () => {
  const days = [
    { date: '2030-06-01', activities: [{}, {}], budget: 1000 },
    { date: '2030-06-02', activities: [{}], budget: 2000 },
    { date: '2030-06-03', activities: [], budget: null }
  ];
  const rows = dailyBudgetRows(days);
  assert.equal(rows.length, 3);
  // 最大值占满 100%：第 2 天为峰值
  assert.equal(rows[1].pct, 100);
  // 非峰值按比例，但不低于最小值
  assert.ok(rows[0].pct < 100 && rows[0].pct >= 6);
  // 未设置预算 → 0%
  assert.equal(rows[2].pct, 0);
  assert.equal(rows[2].budget, 0);
  assert.equal(rows[0].activities, 2);
  // 空输入
  assert.deepEqual(dailyBudgetRows([]), []);
  assert.deepEqual(dailyBudgetRows(null), []);
});

test('perPerson and dailyAverage compute sensible shares', () => {
  assert.equal(perPerson(3000, 3), 1000);
  assert.equal(perPerson(3000, 0), 0);
  assert.equal(perPerson(3000, 1), 3000);
  assert.equal(dailyAverage(3000, 3), 1000);
  assert.equal(dailyAverage(3000, 0), 3000);
});

test('calendarCells lays out the travel month with travel/today markers', () => {
  const cells = calendarCells('2030-06-01', '2030-06-03', '2030-06-02');
  assert.equal(cells.length % 7, 0);
  const travelDays = cells.filter(c => c.travel);
  assert.equal(travelDays.length, 3);
  const today = cells.find(c => c.today);
  assert.ok(today && today.day === 2);
  // 第一天应是被前导空格填补后从 6/1 开始
  const first = cells.find(c => c.day === 1);
  assert.ok(first.travel);
  // 无效日期 → 空
  assert.deepEqual(calendarCells('', '', ''), []);
});

test('monthTitle formats a year-month label safely', () => {
  assert.equal(monthTitle('2030-06-15'), '2030年6月');
  assert.equal(monthTitle(''), '');
  assert.equal(monthTitle('bad'), '');
});

test('destinationLabel supports multi-destination arrays and fallback to single destination', () => {
  assert.equal(destinationLabel({ destinations: ['北京', '上海'] }), '北京 → 上海');
  assert.equal(destinationLabel({ destination: '杭州' }), '杭州');
  assert.equal(destinationLabel({}), '');
  assert.equal(destinationLabel(null), '');
});

test('addDayDates produces consecutive calendar dates', () => {
  assert.deepEqual(addDayDates('2030-06-01', 3), ['2030-06-01', '2030-06-02', '2030-06-03']);
});
