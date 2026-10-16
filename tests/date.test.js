import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { addCalendarDays, inclusiveDayCount, parseDateOnly } from '../src/utils/date.js';
import itineraryService from '../src/services/itineraryService.js';

test('calendar dates handle same day, leap years, month and year boundaries', () => {
  assert.equal(inclusiveDayCount('2030-12-01', '2030-12-01'), 1);
  assert.equal(inclusiveDayCount('2028-02-28', '2028-03-01'), 3);
  assert.equal(addCalendarDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addCalendarDays('2030-12-31', 1), '2031-01-01');
  for (const value of ['2030-02-29', '2030-04-31', '2030-13-01', '0000-01-01', '', '2030-1-1']) {
    assert.throws(() => parseDateOnly(value));
  }
  assert.throws(() => inclusiveDayCount('2030-12-02', '2030-12-01'), /不能早于/);
});

test('calendar day counts are stable across DST and local dates do not use UTC day', () => {
  const moduleUrl = new URL('../src/utils/date.js', import.meta.url).href;
  const script = `import { localDateString, inclusiveDayCount } from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify([localDateString(new Date('2030-01-01T00:30:00+08:00')), inclusiveDayCount('2026-03-07', '2026-03-09')]));`;
  const run = timezone => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: timezone }, encoding: 'utf8'
  }));
  assert.deepEqual(run('Asia/Shanghai'), ['2030-01-01', 3]);
  assert.deepEqual(run('America/New_York'), ['2029-12-31', 3]);
});

test('itineraries start on requested date and daily budgets preserve total amount', () => {
  const plan = itineraryService.generateDailyPlan('北京', ['culture', 'nature'], 1000, 3, '2030-12-31');
  assert.deepEqual(plan.map(day => day.date), ['2030-12-31', '2031-01-01', '2031-01-02']);
  assert.equal(plan.reduce((sum, day) => sum + Math.round(day.budget * 100), 0), 100000);
  assert.ok(plan[0].activities.length > 0);
  assert.throws(() => itineraryService.generateDailyPlan('北京', ['culture'], -1, 2, '2030-12-01'), /预算/);
  assert.throws(() => itineraryService.generateDailyPlan('北京', ['culture'], 1.001, 2, '2030-12-01'), /两位小数/);
  assert.throws(() => itineraryService.generateDailyPlan('北京', ['culture'], 1e308, 2, '2030-12-01'), /金额不能过大/);
  assert.throws(() => itineraryService.generateDailyPlan('北京', ['culture'], 100, 0, '2030-12-01'), /天数/);
  assert.throws(() => itineraryService.generateDailyPlan('北京', ['culture'], 100, 366, '2030-12-01'), /天数/);
  assert.throws(() => itineraryService.generateDailyPlan('上海', ['culture'], 100, 2, '2030-12-01'), /暂无匹配/);
});
