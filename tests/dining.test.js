import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MEAL_SLOTS,
  addMeal,
  replaceMeal,
  moveMealToPool,
  readMeals,
  mealCoverage,
  mealConflicts,
  normalizeBudgetYuan,
  normalizeRestaurant,
  reconcileMealExpenses,
  ensureMealExpense,
  mealEstimate,
  mealCostLabel
} from '../src/utils/dining.js';
import {
  diningKey,
  saveFavorite,
  updateFavorite,
  removeFavorite,
  listFavorites,
  readDining
} from '../src/services/foodService.js';

function withStorage(fn) {
  const original = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  try {
    return fn(storage);
  } finally {
    globalThis.localStorage = original;
  }
}

const poi = (patch = {}) => ({
  id: 'poi-1', name: '楼外楼', address: '孤山路30号', city: '杭州',
  location: ['120.1401', '30.2501'], coordinateSystem: 'GCJ-02', source: '高德地图', ...patch
});

const route = () => ({
  title: '杭州三日', startDate: '2026-11-20', endDate: '2026-11-22', persons: 2,
  themes: [], preferences: {}, destinations: ['杭州'],
  days: [
    {
      date: '2026-11-20',
      activities: [
        { id: 'a1', title: '西湖', time: '09:00', durationMinutes: 120, travelMinutes: 30 },
        { id: 'a2', title: '灵隐寺', time: '14:00', durationMinutes: 90 }
      ]
    },
    { date: '2026-11-21', activities: [] }
  ],
  expenses: []
});

test('budget and restaurant input is validated without inventing prices', () => {
  assert.equal(normalizeBudgetYuan(''), null);
  assert.equal(normalizeBudgetYuan(null), null);
  assert.equal(normalizeBudgetYuan('0'), 0);
  assert.equal(normalizeBudgetYuan('88.5'), 88.5);
  assert.throws(() => normalizeBudgetYuan('abc'), /数字/);
  assert.throws(() => normalizeBudgetYuan(-1), /负数/);
  assert.throws(() => normalizeBudgetYuan(200000), /过大/);

  const restaurant = normalizeRestaurant(poi({ name: '  楼外楼  ' }));
  assert.equal(restaurant.name, '楼外楼');
  assert.deepEqual(restaurant.location, [120.1401, 30.2501]);
  assert.equal(restaurant.source, '高德地图');
  assert.throws(() => normalizeRestaurant({ name: '编造的餐厅' }), /坐标/);
  assert.throws(() => normalizeRestaurant({ name: ' ' }), /餐厅/);
  assert.throws(() => normalizeRestaurant(poi({ location: [200, 30] })), /坐标/);
  assert.ok(MEAL_SLOTS.some(slot => slot.key === 'dinner' && slot.defaultTime === '18:30'));
});

test('adding a meal schedules activity, expense and sorted timeline', () => {
  const trip = route();
  const lunch = addMeal(trip, { restaurant: poi(), date: '2026-11-20', slot: 'lunch', persons: 3, budgetPerPersonYuan: '88.5', note: '微辣' });
  assert.equal(lunch.activity.time, '12:00');
  assert.equal(lunch.activity.slotLabel, '午餐');
  assert.equal(lunch.activity.category, '用餐');
  assert.equal(lunch.activity.durationMinutes, 60);
  assert.deepEqual(lunch.activity.place.location, [120.1401, 30.2501]);
  assert.equal(lunch.estimatedTotal, 265.5);
  assert.equal(trip.expenses.length, 1);
  assert.equal(trip.expenses[0].estimate, 265.5);
  assert.equal(trip.expenses[0].sourceMealId, lunch.activity.id);
  assert.deepEqual(trip.days[0].activities.map(item => item.time), ['09:00', '12:00', '14:00']);
  assert.equal(readMeals(trip).length, 1);

  // 未填写人均预算：不生成预计费用，也不按 0 元处理。
  const dinner = addMeal(trip, { restaurant: poi({ id: 'poi-2', name: '知味观' }), date: '2026-11-20', slot: 'dinner', persons: 2 });
  assert.equal(dinner.activity.meal.budgetPerPerson, null);
  assert.equal(dinner.estimatedTotal, null);
  assert.equal(trip.expenses.length, 1);
  assert.deepEqual(trip.days[0].activities.map(item => item.time), ['09:00', '12:00', '14:00', '18:30']);

  assert.throws(() => addMeal(trip, { restaurant: poi(), date: '2026-12-01', slot: 'lunch' }), /旅行日期范围内/);
  assert.throws(() => addMeal(trip, { restaurant: poi(), date: '2026-11-21', slot: 'custom', time: '' }), /用餐时间/);
  assert.throws(() => addMeal(trip, { restaurant: poi(), date: '2026-11-21', slot: 'lunch', persons: 0 }), /人数/);

  // 时间冲突：需显式确认后才能加入。
  assert.throws(() => addMeal(trip, { restaurant: poi(), date: '2026-11-20', slot: 'custom', time: '14:10' }), /时间重叠/);
  const forced = addMeal(trip, { restaurant: poi(), date: '2026-11-20', slot: 'custom', time: '14:10', confirmConflict: true });
  assert.equal(forced.conflictsBeforeSave.length, 1);
  assert.equal(forced.activity.time, '14:10');

  const day = trip.days[0];
  assert.equal(mealConflicts(day, { time: '09:30', durationMinutes: 30 }).map(item => item.title).includes('西湖'), true);
  assert.equal(mealConflicts(day, { time: '09:30', durationMinutes: 30, excludeId: 'a1' }).some(item => item.title === '西湖'), false);
});

test('replacing a restaurant keeps the slot and invalidates stale travel estimates', () => {
  const trip = route();
  const lunch = addMeal(trip, { restaurant: poi(), date: '2026-11-20', slot: 'lunch', persons: 2, budgetPerPersonYuan: '100' });
  const westLake = trip.days[0].activities.find(item => item.title === '西湖');
  westLake.travelMinutes = 12;
  westLake.travelEstimate = { minutes: 12, origin: [1, 2], destination: [3, 4], source: '高德地图' };

  const replaced = replaceMeal(trip, lunch.activity.id, { restaurant: poi({ id: 'poi-9', name: '外婆家', address: '湖滨路' }), budgetPerPersonYuan: '80' });
  assert.equal(replaced.title, '外婆家');
  assert.equal(replaced.time, '12:00');
  assert.equal(replaced.place.address, '湖滨路');
  assert.equal(replaced.meal.budgetPerPerson, 80);
  assert.equal(replaced.meal.estimatedTotal, 160);
  assert.equal(westLake.travelEstimate, undefined);
  assert.equal(westLake.travelMinutes, null);
  assert.equal(trip.expenses.length, 1);
  assert.equal(trip.expenses[0].title.includes('外婆家'), true);
  assert.equal(trip.expenses[0].estimate, 160);
  assert.throws(() => replaceMeal(trip, 'missing', { restaurant: poi() }), /已不存在/);
});

test('moving a meal back to the candidate pool keeps the restaurant but drops its estimate', () => {
  const trip = route();
  const lunch = addMeal(trip, { restaurant: poi(), date: '2026-11-20', slot: 'lunch', persons: 2, budgetPerPersonYuan: '50', note: '靠窗' });
  const candidate = moveMealToPool(trip, lunch.activity.id);
  assert.equal(trip.days[0].activities.some(item => item.category === '用餐'), false);
  assert.equal(trip.pendingActivities.length, 1);
  assert.equal(candidate.previousDate, '2026-11-20');
  assert.equal(candidate.title, '楼外楼');
  assert.equal(candidate.meal.budgetPerPerson, 50);
  assert.equal(candidate.meal.note, '靠窗');
  assert.equal(trip.expenses.length, 0);

  const coverage = mealCoverage(trip);
  assert.equal(coverage.count, 0);
  assert.deepEqual(coverage.missingDates, ['2026-11-20', '2026-11-21']);
  assert.equal(coverage.unknownCost, 0);
  assert.throws(() => moveMealToPool(trip, lunch.activity.id), /已不存在/);
});

test('deleting a meal drops its generated estimate but keeps a real recorded cost', () => {
  const trip = route();
  const lunch = addMeal(trip, { restaurant: poi(), date: '2026-11-20', slot: 'lunch', persons: 2, budgetPerPersonYuan: '60' });
  assert.equal(trip.expenses.length, 1);

  // 删除用餐活动：自动生成的预计费用随之消失，不会在“预计费用”里留下幽灵条目。
  trip.days[0].activities = trip.days[0].activities.filter(item => item.id !== lunch.activity.id);
  reconcileMealExpenses(trip);
  assert.equal(trip.expenses.length, 0);

  // 用户已填写真实花费：保留金额，只解除关联，删除安排不能抹掉真实支出。
  const dinner = addMeal(trip, { restaurant: poi({ id: 'poi-2', name: '知味观' }), date: '2026-11-20', slot: 'dinner', persons: 2, budgetPerPersonYuan: '80' });
  const dinnerExpense = trip.expenses.find(item => item.sourceMealId === dinner.activity.id);
  dinnerExpense.actual = 168;
  trip.days[0].activities = trip.days[0].activities.filter(item => item.id !== dinner.activity.id);
  reconcileMealExpenses(trip);
  assert.equal(trip.expenses.length, 1);
  assert.equal(trip.expenses[0].actual, 168);
  assert.equal(trip.expenses[0].sourceMealId, '');
});

test('reconciling meal expenses removes duplicate links but never loses real spending', () => {
  const trip = route();
  const lunch = addMeal(trip, { restaurant: poi(), date: '2026-11-20', slot: 'lunch', persons: 2, budgetPerPersonYuan: '50' });
  // 重复的关联行（历史数据或并发写入造成）：只保留第一条。
  trip.expenses.push({ category: '餐饮', title: '重复餐费', estimate: 100, actual: null, sourceMealId: lunch.activity.id });
  const extra = { category: '餐饮', title: '手工补记', estimate: 100, actual: 99, sourceMealId: lunch.activity.id };
  trip.expenses.push(extra);
  reconcileMealExpenses(trip);
  assert.equal(trip.expenses.length, 2);
  assert.equal(trip.expenses[0].sourceMealId, lunch.activity.id);
  assert.equal(trip.expenses[1].sourceMealId, '');
  assert.equal(trip.expenses[1].actual, 99);
});

test('rescheduling a pooled meal restores its estimate without duplicating expenses', () => {
  const trip = route();
  const lunch = addMeal(trip, { restaurant: poi(), date: '2026-11-20', slot: 'lunch', persons: 3, budgetPerPersonYuan: '40', note: '靠窗' });
  const candidate = moveMealToPool(trip, lunch.activity.id);
  assert.equal(trip.expenses.length, 0);
  assert.equal(candidate.meal.estimatedTotal, undefined);
  assert.equal(mealEstimate(candidate), 120);
  assert.equal(mealEstimate({ meal: { budgetPerPerson: null, persons: 2 } }), null);
  assert.equal(mealEstimate({ meal: { budgetPerPerson: '', persons: 2 } }), null);
  assert.equal(mealEstimate({ meal: { budgetPerPerson: 30, persons: 0 } }), null);

  // 重新安排到另一天：预计总额按人均 × 人数恢复，并补回一条关联费用。
  trip.days[1].activities.push(candidate);
  trip.pendingActivities = [];
  const expense = ensureMealExpense(trip, candidate.id);
  assert.ok(expense);
  assert.equal(candidate.meal.estimatedTotal, 120);
  assert.equal(expense.estimate, 120);
  assert.equal(expense.sourceMealId, candidate.id);
  assert.equal(expense.title.includes('2026-11-21'), true);
  assert.equal(trip.expenses.length, 1);

  // 再次调用只同步金额，不会重复记账。
  assert.equal(ensureMealExpense(trip, candidate.id), expense);
  assert.equal(trip.expenses.length, 1);
  assert.equal(ensureMealExpense(trip, 'missing'), null);
});

test('meal cost label separates missing prices from a real zero budget', () => {
  assert.equal(mealCostLabel({ count: 0, unknownCost: 0, estimatedTotal: 0 }), '尚未安排用餐');
  assert.equal(mealCostLabel({ count: 1, unknownCost: 1, estimatedTotal: 0 }), '待确认');
  assert.equal(mealCostLabel({ count: 1, unknownCost: 0, estimatedTotal: 0 }), '¥0', '真实 0 元不是待确认');
  assert.equal(mealCostLabel({ count: 2, unknownCost: 1, estimatedTotal: 120 }), '¥120（另有 1 项待确认）');
  assert.equal(mealCostLabel(null), '尚未安排用餐');
});

test('meal coverage reports unknown costs separately from confirmed estimates', () => {
  const trip = route();
  addMeal(trip, { restaurant: poi(), date: '2026-11-20', slot: 'lunch', persons: 2, budgetPerPersonYuan: '40' });
  addMeal(trip, { restaurant: poi({ id: 'poi-2', name: '知味观' }), date: '2026-11-21', slot: 'dinner', persons: 2 });
  const coverage = mealCoverage(trip);
  assert.equal(coverage.count, 2);
  assert.equal(coverage.dates, 2);
  assert.deepEqual(coverage.missingDates, []);
  assert.equal(coverage.unknownCost, 1);
  assert.equal(coverage.estimatedTotal, 80);
});

test('favorite restaurants keep notes, taste and budget per account', () => withStorage(() => {
  const owner = 'user-a';
  assert.equal(listFavorites(owner).length, 0);

  const saved = saveFavorite(owner, poi(), { note: '适合带长辈', taste: '杭帮菜', budgetPerPersonYuan: '120' });
  assert.equal(saved.budgetPerPerson, 120);
  assert.equal(saved.taste, '杭帮菜');
  assert.equal(saved.restaurantId, 'poi-1');
  assert.equal(listFavorites(owner).length, 1);

  // 同一餐厅再次收藏是合并，不产生重复条目。
  const merged = saveFavorite(owner, poi(), { note: '靠窗位' });
  assert.equal(listFavorites(owner).length, 1);
  assert.equal(merged.id, saved.id);
  assert.equal(merged.budgetPerPerson, 120);
  assert.equal(merged.note, '靠窗位');

  const updated = updateFavorite(owner, saved.id, { budgetPerPerson: '' , taste: '本帮菜' });
  assert.equal(updated.budgetPerPerson, null);
  assert.equal(updated.taste, '本帮菜');
  assert.throws(() => updateFavorite(owner, 'missing', { note: 'x' }), /已不存在/);

  assert.equal(listFavorites('user-b').length, 0);
  removeFavorite(owner, saved.id);
  assert.equal(listFavorites(owner).length, 0);
  assert.throws(() => removeFavorite(owner, saved.id), /已不存在/);
}));

test('corrupted favorite data is surfaced and never overwritten', () => withStorage(storage => {
  storage.set(diningKey('user-a'), '{broken');
  const state = readDining('user-a');
  assert.equal(state.corrupted, true);
  assert.equal(state.favorites.length, 0);
  assert.throws(() => saveFavorite('user-a', poi(), { note: 'x' }), /数据已损坏/);
  assert.equal(storage.get(diningKey('user-a')), '{broken');

  storage.set(diningKey('user-a'), JSON.stringify({ version: 1, ownerId: 'someone-else', favorites: [] }));
  assert.equal(readDining('user-a').corrupted, true);
}));

test('food view and dining components render search, favorites and scheduled meals', async () => {
  const { loadView, loadComponent } = await import('./helpers/vueView.js');
  const { createPinia } = await import('pinia');
  const { createSSRApp, h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  const { registerUser, loginUser } = await import('../src/services/authService.js');
  const { useTravelStore } = await import('../src/stores/travel.js');
  const original = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  try {
    registerUser('13920000003', 'pass-1234');
    loginUser('13920000003', 'pass-1234');
    const pinia = createPinia();
    const travel = useTravelStore(pinia);
    const trip = route();
    addMeal(trip, { restaurant: poi(), date: '2026-11-20', slot: 'lunch', persons: 2, budgetPerPersonYuan: '120', note: '靠窗' });
    const savedRoute = travel.saveRoute(trip);
    saveFavorite(travel.ownerId, poi(), { note: '适合带长辈', taste: '杭帮菜', budgetPerPersonYuan: '120' });

    const routerStub = { props: ['to'], render() { return h('a', { href: String(this.to) }, this.$slots.default?.()) } };
    const FoodView = await loadView('FoodView');
    const app = createSSRApp({ render: () => h(FoodView) });
    app.use(pinia);
    app.component('router-link', routerStub);
    const html = await renderToString(app);
    assert.match(html, /美食探索与用餐安排/);
    assert.match(html, /搜索真实地点/);
    assert.match(html, /楼外楼/);
    assert.match(html, /人均 ¥120/);
    assert.match(html, /适合带长辈/);
    assert.match(html, /已安排 1 项/);
    assert.match(html, /在旅行工作台替换餐厅或移回候选池/);

    const TravelDining = await loadComponent('components/TravelDining.vue');
    const diningApp = createSSRApp({ render: () => h(TravelDining, { route: savedRoute }) });
    diningApp.use(pinia);
    const diningHtml = await renderToString(diningApp);
    assert.match(diningHtml, /用餐安排（1 项/);
    assert.match(diningHtml, /移回候选池/);
    assert.match(diningHtml, /选择收藏餐厅/);

    const AddMealToTravel = await loadComponent('components/AddMealToTravel.vue');
    const formApp = createSSRApp({ render: () => h(AddMealToTravel, { restaurant: poi(), route: savedRoute }) });
    formApp.use(pinia);
    formApp.component('router-link', routerStub);
    const formHtml = await renderToString(formApp);
    assert.match(formHtml, /加入用餐：<strong>楼外楼<\/strong>/);
    assert.match(formHtml, /人均预算（元，可留空）/);
    assert.match(formHtml, /不会按免费处理/);
    assert.match(formHtml, /加入行程/);
  } finally {
    globalThis.localStorage = original;
  }
});
