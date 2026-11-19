import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PLAN_NAME_PRESETS,
  planGroupRoutes,
  createPlanVariant,
  planMetrics,
  dayPlanDiff,
  comparePlans,
  adoptPlan
} from '../src/utils/planVariant.js';

const baseRoute = () => ({
  id: 'base-1',
  title: '杭州三日',
  startDate: '2026-11-20',
  endDate: '2026-11-22',
  persons: 2,
  budget: 3000,
  themes: ['美食'],
  preferences: { pace: 'relaxed' },
  destinations: ['杭州'],
  companion: 'family',
  days: [
    {
      date: '2026-11-20',
      activities: [
        {
          id: 'a1',
          title: '西湖',
          time: '09:00',
          durationMinutes: 120,
          travelEstimate: { minutes: 20, distanceMeters: 1200, mode: 'walking', checkedAt: '2026-11-01T00:00:00.000Z' },
          completed: true
        },
        { id: 'a2', title: '灵隐寺', time: '14:00', durationMinutes: 90 }
      ]
    },
    { date: '2026-11-21', activities: [] }
  ],
  pendingActivities: [{ id: 'p1', title: '河坊街' }],
  expenses: [
    { category: '交通', title: '高铁', estimate: 1000, actual: 980 },
    { category: '餐饮', title: '午餐', estimate: null, actual: null }
  ],
  ledger: { members: [{ id: 'm1', name: '我' }], entries: [] },
  preparation: { items: [{ id: 'x', title: '身份证', done: true, completedAt: '2026-11-01T00:00:00.000Z' }], updatedAt: '2026-11-01T00:00:00.000Z' },
  shareToken: 'share-abc',
  dateAdjustmentArchive: { at: '2026-10-01' },
  adoptedFrom: { planId: 'old', planName: '旧方案' }
});

test('plan variants are independent copies without real-trip records', () => {
  const base = baseRoute();
  const copy = createPlanVariant(base, { planName: '  轻松版  ' });

  assert.equal(copy.id, undefined, '复制件由保存时生成新 id');
  assert.equal(copy.planName, '轻松版');
  assert.equal(copy.isPlanVariant, true);
  assert.equal(copy.planGroupId, 'base-1');
  assert.equal(copy.sourceRouteId, 'base-1');
  assert.equal(copy.title, '杭州三日');
  assert.equal(copy.isFavorite, false);
  for (const field of ['ledger', 'shareToken', 'dateAdjustmentArchive', 'adoptedFrom']) {
    assert.equal(Object.hasOwn(copy, field), false, `${field} 不应被复制`);
  }
  assert.equal(copy.expenses.find(item => item.title === '高铁').actual, null, '实际支出不随方案复制');
  assert.equal(copy.expenses.find(item => item.title === '高铁').estimate, 1000, '预计费用保留');
  assert.equal(copy.preparation.items[0].done, false, '准备完成状态不继承');
  assert.equal(copy.preparation.items[0].completedAt, '');
  assert.equal(copy.days[0].activities[0].completed, false, '完成标记不继承');
  assert.equal(base.days[0].activities[0].completed, true, '原旅行不被修改');
  assert.equal(base.ledger.members.length, 1);

  // 方案再复制仍属于同一组，不会层层嵌套成新组。
  const copy2 = createPlanVariant({ ...copy, id: 'variant-1' }, { planName: '省钱版' });
  assert.equal(copy2.planGroupId, 'base-1');

  assert.throws(() => createPlanVariant(base, { planName: ' ' }), /方案名称/);
  assert.throws(() => createPlanVariant(base, { planName: '一'.repeat(21) }), /20 字以内/);
  assert.throws(() => createPlanVariant({ title: '缺少 id' }, { planName: '轻松版' }), /旅行信息无效/);
  assert.ok(PLAN_NAME_PRESETS.includes('轻松版'));
});

test('plan group lists base first and excludes unrelated travel', () => {
  const base = baseRoute();
  const relaxed = { ...createPlanVariant(base, { planName: '轻松版' }), id: 'variant-1' };
  const budget = { ...createPlanVariant(base, { planName: '省钱版' }), id: 'variant-2' };
  const unrelated = { ...baseRoute(), id: 'other-1', title: '成都四日', planGroupId: undefined };
  const routes = [relaxed, unrelated, base, budget];

  const group = planGroupRoutes(routes, relaxed);
  assert.equal(group[0].id, 'base-1', '原旅行排在最前');
  assert.deepEqual(group.map(item => item.id).sort(), ['base-1', 'variant-1', 'variant-2']);
  assert.equal(planGroupRoutes(routes, unrelated).length, 1, '未分组的旅行只有自己');
  // 原旅行不在列表中时无法确定基准，返回空而不是把方案当成原旅行。
  assert.deepEqual(planGroupRoutes([relaxed], relaxed), []);
  assert.deepEqual(planGroupRoutes([], base), []);
});

test('metrics expose budget, estimated cost and data gaps without assuming free', () => {
  const base = baseRoute();
  const metrics = planMetrics(base);
  assert.equal(metrics.days, 2);
  assert.equal(metrics.activities, 2);
  assert.equal(metrics.meals, 0);
  assert.equal(metrics.pending, 1);
  assert.equal(metrics.persons, 2);
  assert.equal(metrics.budget, 3000);
  assert.equal(metrics.estimatedTotal, 1000);
  assert.equal(metrics.knownCosts, 1);
  assert.equal(metrics.unknownCosts, 1);
  assert.equal(metrics.overBudget, false);
  // 交通耗时记录在出发站；最后一项没有下一站，不计入应查询路段。
  assert.equal(metrics.travelQueried, 1);
  assert.equal(metrics.travelUnqueried, 0);
  assert.equal(metrics.empty, false);

  // 只有未知费用时预计费用为 null，而不是 0。
  const unknownOnly = { ...baseRoute(), expenses: [{ category: '餐饮', title: '晚餐', estimate: null }, { category: '门票', title: '西湖', estimate: '' }] };
  const unknownMetrics = planMetrics(unknownOnly);
  assert.equal(unknownMetrics.estimatedTotal, null);
  assert.equal(unknownMetrics.knownCosts, 0);
  assert.equal(unknownMetrics.unknownCosts, 2);

  const noExpenses = planMetrics({ ...baseRoute(), expenses: [] });
  assert.equal(noExpenses.estimatedTotal, null);
  assert.equal(noExpenses.knownCosts, 0);

  const over = planMetrics({ ...baseRoute(), expenses: [{ category: '交通', title: '机票', estimate: 4200 }] });
  assert.equal(over.overBudget, true);
  assert.equal(over.estimatedTotal, 4200);

  const empty = planMetrics({ id: 'x', title: '空方案', startDate: '2026-12-01', endDate: '2026-12-01', days: [], expenses: [] });
  assert.equal(empty.empty, true);
  assert.equal(empty.activities, 0);
  assert.equal(empty.persons, null);
  assert.equal(empty.budget, null);
});

test('day diff aligns dates and marks unqueried traffic only when a next stop exists', () => {
  const base = baseRoute();
  const variant = { ...createPlanVariant(base, { planName: '轻松版' }), id: 'variant-1' };
  delete variant.days[0].activities[0].travelEstimate;
  variant.days[0].activities[0].title = '西湖游船';
  variant.days.push({ date: '2026-11-22', activities: [{ id: 'a3', title: '龙井村', time: '10:00', durationMinutes: 60 }] });

  const diff = dayPlanDiff([base, variant]);
  assert.deepEqual(diff.map(day => day.date), ['2026-11-20', '2026-11-21', '2026-11-22']);
  assert.equal(diff[0].cells.length, 2);
  assert.equal(diff[0].cells[0].activities[0].title, '西湖');
  assert.equal(diff[0].cells[0].activities[0].travelQueried, true);
  assert.equal(diff[0].cells[1].activities[0].title, '西湖游船');
  assert.equal(diff[0].cells[1].activities[0].travelQueried, false);
  // 当天最后一项无需查询交通，返回 null 而不是“未查询”。
  assert.equal(diff[0].cells[1].activities[1].travelQueried, null);
  assert.equal(diff[2].cells[0].count, 0, '原旅行没有第三天');
  assert.equal(diff[2].cells[1].activities[0].title, '龙井村');
});

test('comparison lists basis warnings and never ranks a winner', () => {
  const base = baseRoute();
  const relaxed = { ...createPlanVariant(base, { planName: '轻松版' }), id: 'variant-1' };
  relaxed.persons = 3;
  relaxed.startDate = '2026-11-19';
  delete relaxed.days[0].activities[0].travelEstimate;

  const result = comparePlans([base, relaxed]);
  assert.deepEqual(Object.keys(result).sort(), ['basis', 'days', 'panels']);
  assert.equal(result.panels.length, 2);
  const joined = result.basis.join('|');
  assert.match(joined, /日期范围不同/);
  assert.match(joined, /人数不同/);
  assert.match(joined, /未录入的费用/);
  assert.match(joined, /交通耗时/);
  assert.equal(/最优|最佳|推荐/.test(joined), false, '不输出“最优”结论');

  const withEmpty = comparePlans([base, { id: 'e', title: '空', days: [], expenses: [], persons: 2 }]);
  assert.match(withEmpty.basis.join('|'), /空方案/);
  assert.match(withEmpty.basis.join('|'), /不能按免费计算|未录入任何费用/);
});

test('adopting a plan keeps the target id, ledger and recorded actual spending', () => {
  const target = baseRoute();
  const chosen = {
    ...createPlanVariant(target, { planName: '省钱版' }),
    id: 'variant-2',
    expenses: [
      { category: '交通', title: '高铁', estimate: 880, actual: null },
      { category: '餐饮', title: '午餐', estimate: 120, actual: null },
      { category: '住宿', title: '民宿', estimate: 600, actual: null }
    ]
  };
  target.expenses.push({ category: '门票', title: '西湖门票', estimate: 120, actual: 120 });
  target.ledger = { members: [{ id: 'm1', name: '我' }], entries: [{ id: 'e1', amount: 120 }], settlements: [] };

  const result = adoptPlan(target, chosen);
  const route = result.route;
  assert.equal(route.id, 'base-1');
  assert.equal(route.title, '杭州三日');
  assert.equal(route.startDate, '2026-11-20');
  assert.equal(route.adoptedFrom.planId, 'variant-2');
  assert.equal(route.adoptedFrom.planName, '省钱版');
  assert.deepEqual(route.days, chosen.days);
  assert.deepEqual(route.pendingActivities, chosen.pendingActivities);
  assert.equal(route.budget, chosen.budget);
  assert.equal(route.companion, chosen.companion);
  assert.deepEqual(route.themes, chosen.themes);
  assert.deepEqual(route.destinations, chosen.destinations);
  assert.deepEqual(route.ledger, target.ledger, '账本结算保留');
  // 调日期归档是原旅行的历史记录，采用方案不应清空（便于回溯此前的安排）。
  assert.deepEqual(route.dateAdjustmentArchive, target.dateAdjustmentArchive, '调日期归档保留可回溯');

  const byTitle = title => route.expenses.filter(item => item.title === title);
  assert.equal(byTitle('高铁').length, 1);
  assert.equal(byTitle('高铁')[0].actual, 980, '同类别同名支出保留实际金额');
  assert.equal(byTitle('高铁')[0].estimate, 880, '采用方案的预计费用');
  assert.equal(byTitle('午餐')[0].actual, null);
  assert.equal(byTitle('西湖门票')[0].actual, 120, '新方案没有的实际支出单独保留');
  assert.equal(result.matchedActuals, 1);
  assert.deepEqual(result.unmatchedActuals, ['西湖门票']);
  assert.equal(result.route.expenses.every(item => item.actual === null || item.actual === 980 || item.actual === 120), true);

  // 原对象不被修改，采用失败时不会留下半套数据。
  assert.equal(target.expenses.length, 3);
  assert.equal(target.days[0].activities[0].title, '西湖');
  assert.throws(() => adoptPlan(target, target), /另一个方案/);
  assert.throws(() => adoptPlan(target, {}), /请选择要采用的方案/);
});

test('adopting a plan matches duplicate actuals one by one and keeps estimate-only rows', () => {
  const target = baseRoute();
  target.expenses = [
    { category: '交通', title: '高铁', estimate: 980, actual: 980 },
    { category: '交通', title: '高铁', estimate: 1020, actual: 1020 },
    { category: '门票', title: '灵隐寺', estimate: 75, actual: null }
  ];
  const chosen = {
    ...createPlanVariant(target, { planName: '轻松版' }),
    id: 'variant-3',
    expenses: [{ category: '交通', title: '高铁', estimate: 880, actual: null }]
  };
  const result = adoptPlan(target, chosen);
  const highspeed = result.route.expenses.filter(item => item.title === '高铁');
  assert.equal(highspeed.length, 2, '同名的两笔实际支出都要保留');
  assert.deepEqual(highspeed.map(item => item.actual).sort((a, b) => a - b), [980, 1020]);
  assert.equal(result.route.expenses.filter(item => item.title === '灵隐寺').length, 1, '只有预计金额的费用行保留');
  assert.equal(result.route.expenses.find(item => item.title === '灵隐寺').actual, null);
  assert.equal(result.unmatchedActuals.length, 1);
});

test('adopting a plan drops generated meal costs for meals the chosen plan no longer has', () => {
  const target = baseRoute();
  const lunch = {
    id: 'meal-1',
    title: '楼外楼',
    time: '12:00',
    durationMinutes: 60,
    category: '用餐',
    slot: 'lunch',
    slotLabel: '午餐',
    meal: { persons: 2, budgetPerPerson: 60, estimatedTotal: 120 }
  };
  target.days[0].activities.push(lunch);
  target.expenses.push({ category: '餐饮', title: '楼外楼（2026-11-20 午餐）', estimate: 120, actual: null, sourceMealId: 'meal-1' });
  target.expenses.push({ category: '餐饮', title: '知味观（2026-11-21 晚餐）', estimate: 180, actual: 176, sourceMealId: 'meal-2' });

  // 采用方案里这两项用餐安排都不存在。
  const chosen = { ...createPlanVariant(target, { planName: '轻松版' }), id: 'variant-4', expenses: [] };
  chosen.days = chosen.days.map(day => ({ ...day, activities: day.activities.filter(item => item.category !== '用餐') }));

  const result = adoptPlan(target, chosen);
  const meals = result.route.expenses.filter(item => String(item.title).includes('楼外楼') || String(item.title).includes('知味观'));
  assert.equal(meals.some(item => item.title.includes('楼外楼')), false, '没有用餐安排的预计餐费不能留在预计费用里');
  const kept = meals.find(item => item.title.includes('知味观'));
  assert.ok(kept, '已记入真实花费的餐费必须保留');
  assert.equal(kept.actual, 176);
  assert.equal(kept.sourceMealId, '');
});

test('plan compare view renders metrics, gaps and adoption without ranking', async () => {
  const { loadView } = await import('./helpers/vueView.js');
  const { createPinia } = await import('pinia');
  const { createSSRApp, h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  const { routeLocationKey, routerKey } = await import('vue-router');
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
    registerUser('13920000009', 'pass-1234');
    loginUser('13920000009', 'pass-1234');
    const pinia = createPinia();
    const travel = useTravelStore(pinia);
    const seed = baseRoute();
    delete seed.id;
    const saved = travel.saveRoute(seed);
    const variant = createPlanVariant(saved, { planName: '轻松版' });
    delete variant.days[0].activities[0].travelEstimate;
    travel.saveRoute(variant);

    const PlanCompareView = await loadView('PlanCompareView');
    const linkStub = { props: ['to'], render() { return h('a', { href: String(this.to) }, this.$slots.default?.()) } };
    const app = createSSRApp({ render: () => h(PlanCompareView) });
    app.use(pinia);
    app.provide(routeLocationKey, { query: { base: saved.id }, fullPath: `/plans/compare?base=${saved.id}` });
    app.provide(routerKey, { push: async () => {}, replace: async () => {} });
    app.component('router-link', linkStub);
    app.component('font-awesome-icon', { render: () => null });
    const html = await renderToString(app);

    assert.match(html, /行程方案对比/);
    assert.match(html, /轻松版/);
    assert.match(html, /杭州三日/);
    assert.match(html, /比较口径提示/);
    assert.match(html, /部分方案仍有未查询的交通耗时/);
    assert.match(html, /部分方案存在未录入的费用/);
    assert.match(html, /预计费用/);
    assert.match(html, /¥1000\.00/);
    assert.match(html, /采用此方案/);
    assert.match(html, /当前旅行/);
    assert.match(html, /复制当前旅行为新方案/);
    assert.match(html, /实际支出/);
    assert.match(html, /交通未查询/);
    assert.match(html, /没有.最优方案.结论/);
    assert.equal(/最佳方案/.test(html), false);
  } finally {
    globalThis.localStorage = original;
  }
});

test('copy and adopt actions persist through the travel store', async () => {
  const { loadView, createViewState } = await import('./helpers/vueView.js');
  const { createPinia } = await import('pinia');
  const { routeLocationKey } = await import('vue-router');
  const { registerUser, loginUser } = await import('../src/services/authService.js');
  const { useTravelStore } = await import('../src/stores/travel.js');
  const { feedback } = await import('../src/services/feedbackService.js');
  const original = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  try {
    registerUser('13920000010', 'pass-1234');
    loginUser('13920000010', 'pass-1234');
    const pinia = createPinia();
    const travel = useTravelStore(pinia);
    const seed = baseRoute();
    delete seed.id;
    const saved = travel.saveRoute(seed);
    const routePlugin = {
      install(app) {
        app.provide(routeLocationKey, { query: { base: saved.id }, fullPath: `/plans/compare?base=${saved.id}` });
      }
    };
    const PlanCompareView = await loadView('PlanCompareView');
    const state = await createViewState(PlanCompareView, [pinia, routePlugin]);
    assert.equal(state.selectedIds.value.length, 1, '只有一个方案时不强行比较');

    state.newPlanName.value = '省钱版';
    await state.copyPlan();
    assert.equal(travel.routes.length, 2);
    const variant = travel.routes.find(item => item.isPlanVariant);
    assert.equal(variant.planGroupId, saved.id);
    assert.equal(variant.planName, '省钱版');
    assert.equal(variant.expenses.find(item => item.title === '高铁').actual, null);
    assert.match(state.actionMessage.value, /已创建方案/);
    assert.deepEqual(state.selectedIds.value, [saved.id, variant.id]);
    assert.ok(state.comparison.value, '两个方案后自动进入比较');

    // 从方案入口进入时仍以同组原旅行作为比较基准。
    const variantView = await createViewState(PlanCompareView, [pinia, {
      install(app) {
        app.provide(routeLocationKey, { query: { base: variant.id }, fullPath: `/plans/compare?base=${variant.id}` });
      }
    }]);
    assert.equal(variantView.baseRoute.value.id, saved.id);
    assert.equal(variantView.group.value.length, 2);

    const panel = state.comparison.value.panels.find(item => item.id === variant.id);
    const pending = state.adopt(panel);
    feedback.settleConfirmation(true);
    await pending;

    const updated = travel.routes.find(item => item.id === saved.id);
    assert.equal(updated.adoptedFrom.planId, variant.id);
    assert.equal(updated.adoptedFrom.planName, '省钱版');
    assert.match(state.actionMessage.value, /已采用/);
    assert.match(state.actionMessage.value, /保留 1 项实际支出/);
    assert.equal(travel.routes.length, 2, '采用方案不会删除其他方案');
    assert.equal(travel.routes.filter(item => item.isPlanVariant).length, 1);
  } finally {
    feedback.reset();
    globalThis.localStorage = original;
  }
});

test('routes view exposes plan comparison entry and page title', async () => {
  const { loadView, createViewState } = await import('./helpers/vueView.js');
  const { createPinia } = await import('pinia');
  const { routerKey } = await import('vue-router');
  const { pageTitle } = await import('../src/router/navigation.js');
  const RoutesView = await loadView('RoutesView');
  const pushed = [];
  const routerPlugin = {
    install(app) {
      app.provide(routerKey, {
        push: async target => { pushed.push(target) },
        replace: async () => {}
      });
    }
  };
  const state = await createViewState(RoutesView, [createPinia(), routerPlugin]);
  state.planCompare('route-42');
  assert.deepEqual(pushed[0], { name: 'plan-compare', query: { base: 'route-42' } });
  assert.equal(pageTitle('plan-compare'), '方案对比 · 智绘旅游');
});
