import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import { loadComponent } from './helpers/vueView.js';
import {
  PREPARATION_CATEGORIES,
  preparationTemplates,
  findPreparationTemplate,
  buildTemplateItems,
  applyPreparationTemplate,
  addPreparationItem,
  updatePreparationItem,
  togglePreparationItem,
  removePreparationItem,
  readPreparationItems,
  preparationStats,
  preparationReminders,
  sortPreparationItems
} from '../src/utils/preparation.js';
import { registerUser, loginUser, logout } from '../src/services/authService.js';
import { useTravelStore } from '../src/stores/travel.js';

function fakeStorage() {
  const storage = new Map();
  return {
    storage,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    }
  };
}

async function withStorage(fn) {
  const original = globalThis.localStorage;
  const fake = fakeStorage();
  globalThis.localStorage = fake.localStorage;
  try {
    return await fn(fake.storage);
  } finally {
    globalThis.localStorage = original;
  }
}

const route = () => ({ id: 'r1', title: '测试旅行', startDate: '2026-11-20', endDate: '2026-11-22', days: [] });

test('templates are stable copies and expand by day and person count', () => {
  const templates = preparationTemplates();
  assert.deepEqual(templates.map(item => item.id), ['general', 'beach', 'hiking', 'family']);
  const general = findPreparationTemplate('general');
  assert.equal(general.name, '通用出行');
  templates[0].groups[0].items.push('被修改');
  assert.equal(findPreparationTemplate('general').groups[0].items.includes('被修改'), false);
  assert.equal(findPreparationTemplate('missing'), null);

  const items = buildTemplateItems('hiking', { days: 3, persons: 2 });
  assert.equal(items.length, 15);
  const clothes = items.find(item => item.title === '速干衣物');
  assert.equal(clothes.detail, '3 天按需准备');
  assert.equal(clothes.category, '行李');
  assert.equal(clothes.source, 'template:hiking');
  assert.equal(clothes.templateKey, 'hiking:速干衣物');
  const firstAid = items.find(item => item.title === '急救包');
  assert.equal(firstAid.detail, '2 人份');
  for (const item of items) assert.ok(PREPARATION_CATEGORIES.includes(item.category));

  // 数量建议不影响去重键，也不会在模板里新建重复条目。
  const single = buildTemplateItems('general', { days: 1.9, persons: 0 });
  assert.equal(single.find(item => item.title === '换洗衣物').detail, '1 天按需准备');
  assert.equal(single.find(item => item.title === '现金与银行卡').detail, '');
  assert.throws(() => buildTemplateItems('nope'), /未找到该准备模板/);
});

test('applying a template is idempotent and respects manual duplicates', () => {
  const trip = route();
  addPreparationItem(trip, { title: '身份证', category: '证件' });
  const first = applyPreparationTemplate(trip, 'general', { days: 2, persons: 2 });
  // 15 条通用项中“身份证”已手动添加，因此只新增 14 条。
  assert.equal(first.added, 14);
  assert.equal(first.skipped, 1);
  assert.equal(first.templateName, '通用出行');
  assert.equal(readPreparationItems(trip).length, 15);
  assert.deepEqual(trip.preparation.appliedTemplates, ['general']);

  const second = applyPreparationTemplate(trip, 'general', { days: 2, persons: 2 });
  assert.equal(second.added, 0);
  assert.equal(second.skipped, 15);
  assert.equal(readPreparationItems(trip).length, 15);
  assert.deepEqual(trip.preparation.appliedTemplates, ['general']);

  // 不同分类下的同名事项允许存在。
  addPreparationItem(trip, { title: '身份证', category: '其他' });
  assert.equal(readPreparationItems(trip).length, 16);
  assert.throws(() => addPreparationItem(trip, { title: '身份证', category: '证件' }), /已存在/);
});

test('manual preparation items survive route date changes and saving', () => {
  const trip = route();
  const custom = addPreparationItem(trip, { title: '预约博物馆', category: '预约', dueDate: '2026-11-18' });
  trip.startDate = '2026-12-01';
  trip.endDate = '2026-12-03';
  trip.days = [{ date: '2026-12-01', activities: [] }];
  assert.ok(readPreparationItems(trip).some(item => item.id === custom.id && item.dueDate === '2026-11-18'));
  assert.equal(trip.preparation.appliedTemplates.length, 0);
});

test('stats count overdue and soon items without mutating the route', () => {
  const trip = route();
  trip.preparation = {
    items: [
      { id: 'a', title: '买保险', category: '其他', done: false, dueDate: '2026-11-10' },
      { id: 'b', title: '取护照', category: '证件', done: false, dueDate: '2026-11-20' },
      { id: 'c', title: '换外币', category: '其他', done: false, dueDate: '2026-12-01' },
      { id: 'd', title: '订酒店', category: '预约', done: true, dueDate: '2026-11-01' },
      { id: 'e', title: '充电宝', category: '行李', done: false, dueDate: '' }
    ],
    appliedTemplates: [],
    updatedAt: ''
  };
  const snapshot = JSON.stringify(trip);
  const stats = preparationStats(trip, '2026-11-16');
  assert.deepEqual(
    { total: stats.total, done: stats.done, open: stats.open, percent: stats.percent, overdue: stats.overdue, dueSoon: stats.dueSoon, has: stats.hasPreparation },
    { total: 5, done: 1, open: 4, percent: 20, overdue: 1, dueSoon: 1, has: true }
  );
  assert.deepEqual(stats.upcoming.map(item => item.id), ['a', 'b']);
  assert.deepEqual(preparationReminders(trip, '2026-11-16'), ['1 项准备已超过截止日期', '1 项准备将在 7 天内截止']);
  assert.equal(JSON.stringify(trip), snapshot);

  assert.deepEqual(preparationStats(route(), '2026-11-16'), {
    total: 0, done: 0, open: 0, percent: 0, overdue: 0, dueSoon: 0, upcoming: [], hasPreparation: false
  });
  // 无有效“今天”时不做逾期判断。
  assert.equal(preparationStats(trip, '').overdue, 0);
});

test('updating, toggling and removing preparation items validates input', () => {
  const trip = route();
  const a = addPreparationItem(trip, { title: '打印行程单', category: '其他', dueDate: '2026-11-19' });
  const b = addPreparationItem(trip, { title: '租车', category: '预约' });
  assert.throws(() => addPreparationItem(trip, { title: '   ', category: '其他' }), /请输入准备事项名称/);
  assert.throws(() => addPreparationItem(trip, { title: 'x'.repeat(81), category: '其他' }), /80字以内/);
  assert.throws(() => addPreparationItem(trip, { title: '租车', category: '预约' }), /已存在/);

  const edited = updatePreparationItem(trip, a.id, { title: '打印纸质行程单', dueDate: '2026-11-21' });
  assert.equal(edited.title, '打印纸质行程单');
  assert.equal(edited.dueDate, '2026-11-21');
  assert.throws(() => updatePreparationItem(trip, a.id, { title: '租车', category: '预约' }), /已存在/);
  assert.throws(() => updatePreparationItem(trip, a.id, { dueDate: '2026-02-31' }), /请输入有效日期/);
  assert.throws(() => updatePreparationItem(trip, 'missing', { title: 'x' }), /已不存在/);

  const done = togglePreparationItem(trip, b.id, true);
  assert.equal(done.done, true);
  assert.ok(done.completedAt);
  const undone = togglePreparationItem(trip, b.id);
  assert.equal(undone.done, false);
  assert.equal(undone.completedAt, '');

  removePreparationItem(trip, a.id);
  assert.equal(readPreparationItems(trip).length, 1);
  assert.throws(() => removePreparationItem(trip, a.id), /已不存在/);

  const sorted = sortPreparationItems([
    { title: 'B', done: false, dueDate: '2026-11-21' },
    { title: 'A', done: true, dueDate: '2026-11-01' },
    { title: 'C', done: false, dueDate: '' }
  ]);
  assert.deepEqual(sorted.map(item => item.title), ['B', 'C', 'A']);
});

test('preparation data is isolated per account and survives save/reload', async () => {
  await withStorage(async () => {
    registerUser('13900000001', 'pass-1234');
    loginUser('13900000001', 'pass-1234');
    const travel = useTravelStore(createPinia());
    const saved = travel.saveRoute({
      title: '准备测试', startDate: '2026-11-20', endDate: '2026-11-21', themes: [], preferences: {},
      days: [{ date: '2026-11-20', activities: [] }]
    });
    applyPreparationTemplate(saved, 'beach', { days: 2, persons: 2 });
    addPreparationItem(saved, { title: '买防晒霜', category: '行李', dueDate: '2026-11-18' });
    travel.saveRoute(saved);

    const reloaded = travel.routes.find(item => item.id === saved.id);
    assert.ok(reloaded.preparation.items.length > 2);
    assert.ok(reloaded.preparation.items.some(item => item.title === '买防晒霜'));
    assert.deepEqual(reloaded.preparation.appliedTemplates, ['beach']);

    logout();
    registerUser('13900000002', 'pass-1234');
    loginUser('13900000002', 'pass-1234');
    const otherTravel = useTravelStore(createPinia());
    assert.equal(otherTravel.routes.length, 0);

    logout();
    loginUser('13900000001', 'pass-1234');
    const back = useTravelStore(createPinia());
    assert.equal(back.routes.length, 1);
    assert.ok(back.routes[0].preparation.items.some(item => item.title === '买防晒霜'));
  });
});

test('preparation component renders progress, templates and items', async () => {
  const component = await loadComponent('components/TravelPreparation.vue');
  const trip = route();
  trip.persons = 2;
  applyPreparationTemplate(trip, 'general', { days: 2, persons: 1 });
  togglePreparationItem(trip, trip.preparation.items[0].id, true);
  const app = createSSRApp({ render: () => h(component, { route: trip }) });
  app.use(createPinia());
  const html = await renderToString(app);
  assert.match(html, /出行准备/);
  assert.match(html, /已准备 1\/15（7%）/);
  assert.match(html, /准备模板/);
  assert.match(html, /通用出行/);
  assert.match(html, /添加/);
  assert.match(html, /身份证/);
  assert.match(html, /按 3 天 \/ 2 人应用/);
  // 渲染不应改动传入的旅行数据。
  assert.equal(trip.preparation.items.length, 15);
});
