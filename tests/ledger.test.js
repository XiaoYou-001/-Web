import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import { loadComponent } from './helpers/vueView.js';
import {
  yuanToCents,
  centsToYuan,
  formatCents,
  createLedger,
  ensureLedger,
  addLedgerMember,
  removeLedgerMember,
  splitEven,
  addLedgerExpense,
  updateLedgerExpense,
  removeLedgerExpense,
  expenseShares,
  ledgerBalances,
  suggestedTransfers,
  recordSettlement,
  revokeSettlement,
  settlementCovering,
  reconcileExpenseIds,
  migrateExpenseSources,
  ledgerSummary
} from '../src/utils/ledger.js';
import { registerUser, loginUser, logout } from '../src/services/authService.js';
import { useTravelStore } from '../src/stores/travel.js';

const tripWithMembers = names => {
  const trip = { id: 'r1', title: '账本测试', startDate: '2026-11-20', endDate: '2026-11-22', days: [] };
  trip.ledger = {
    version: 1,
    currency: 'CNY',
    members: names.map((name, index) => ({ id: `m${index}`, name, createdAt: '' })),
    expenses: [],
    settlements: [],
    updatedAt: ''
  };
  return trip;
};

test('money helpers keep integer cents and reject invalid input', () => {
  assert.equal(yuanToCents('12.34'), 1234);
  assert.equal(yuanToCents('0.5'), 50);
  assert.equal(yuanToCents(7), 700);
  assert.equal(yuanToCents('0'), 0);
  assert.equal(centsToYuan(1234), '12.34');
  assert.equal(centsToYuan(0), '0.00');
  assert.equal(formatCents(1234), '¥12.34');
  for (const bad of ['', '-1', '1.234', 'abc', '1,000', ' 1.2.3 ']) assert.throws(() => yuanToCents(bad), /金额/);
  assert.throws(() => centsToYuan(1.5), /整数分/);
});

test('even split distributes remainder deterministically by id order', () => {
  assert.deepEqual(splitEven(100, ['b', 'a', 'c']), { a: 34, b: 33, c: 33 });
  assert.deepEqual(splitEven(10, ['d', 'c', 'b', 'a']), { a: 3, b: 3, c: 2, d: 2 });
  assert.deepEqual(splitEven(5, ['solo']), { solo: 5 });
  assert.deepEqual(splitEven(0, ['a', 'b']), { a: 0, b: 0 });
  // 重复参与人只计一次。
  assert.deepEqual(splitEven(10, ['a', 'a', 'b']), { a: 5, b: 5 });
  assert.throws(() => splitEven(100, []), /至少一位/);
  for (const total of [1, 2, 7, 99, 100000]) {
    const shares = splitEven(total, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    assert.equal(Object.values(shares).reduce((sum, value) => sum + value, 0), total);
  }
  // 传入账本成员顺序时，余数给最先加入的同行人。
  assert.deepEqual(splitEven(100, ['c', 'b', 'a'], ['c', 'b', 'a']), { c: 34, b: 33, a: 33 });
  assert.deepEqual(splitEven(100, ['a', 'b', 'c'], ['c', 'b', 'a']), { c: 34, b: 33, a: 33 });
});

test('members are validated and cannot be removed while referenced', () => {
  const trip = tripWithMembers([]);
  const lu = addLedgerMember(trip, '  小 林 ');
  assert.equal(lu.name, '小 林');
  assert.throws(() => addLedgerMember(trip, '小 林'), /已存在/);
  assert.throws(() => addLedgerMember(trip, '   '), /请输入/);
  assert.throws(() => addLedgerMember(trip, 'x'.repeat(21)), /20字以内/);
  const wang = addLedgerMember(trip, '小王');
  removeLedgerMember(trip, wang.id);
  assert.deepEqual(trip.ledger.members.map(member => member.id), [lu.id]);
  assert.throws(() => removeLedgerMember(trip, wang.id), /已不存在/);
});

test('expenses validate payer, participants, custom shares and amounts', () => {
  const trip = tripWithMembers(['张三', '李四', '王五']);
  const expense = addLedgerExpense(trip, {
    title: '海鲜晚餐', amount: '100.00', category: '餐饮', payerId: 'm0',
    participantIds: ['m0', 'm1', 'm2'], date: '2026-11-20'
  });
  assert.equal(expense.amountCents, 10000);
  assert.deepEqual(expense.shares, { m0: 3334, m1: 3333, m2: 3333 });
  assert.equal(expense.splitMode, 'even');
  assert.deepEqual(expenseShares(expense), expense.shares);
  assert.equal(expense.category, '餐饮');

  assert.throws(() => addLedgerExpense(trip, { title: '', amount: '10', payerId: 'm0', participantIds: ['m0'] }), /请输入支出名称/);
  assert.throws(() => addLedgerExpense(trip, { title: 'x', amount: '10', payerId: 'nobody', participantIds: ['m0'] }), /请选择付款人/);
  assert.throws(() => addLedgerExpense(trip, { title: 'x', amount: '10', payerId: 'm0', participantIds: [] }), /至少一位/);
  assert.throws(() => addLedgerExpense(trip, { title: 'x', amount: '0', payerId: 'm0', participantIds: ['m0'] }), /大于 0/);
  assert.throws(() => addLedgerExpense(trip, { title: 'x', amount: '10', payerId: 'm0', participantIds: ['m0'], date: '2026-13-01' }), /有效日期/);

  assert.throws(() => addLedgerExpense(trip, {
    title: '打车', amount: '30.00', payerId: 'm0', participantIds: ['m0', 'm1'], splitMode: 'custom',
    shares: { m0: 1000, m1: 1500 }
  }), /不一致/);
  const custom = addLedgerExpense(trip, {
    title: '打车', amount: '30.00', payerId: 'm0', participantIds: ['m0', 'm1'], splitMode: 'custom',
    shares: { m0: 1000, m1: 2000 }, category: '未知分类'
  });
  assert.deepEqual(custom.shares, { m0: 1000, m1: 2000 });
  assert.equal(custom.category, '其他');

  // 付款人可以不参与分摊（代付）。
  const advance = addLedgerExpense(trip, {
    title: '代付门票', amount: '50.00', payerId: 'm2', participantIds: ['m0', 'm1'], date: '2026-11-21'
  });
  assert.deepEqual(advance.shares, { m0: 2500, m1: 2500 });

  // 同一笔实际支出不能重复入账。
  addLedgerExpense(trip, { title: '重复', amount: '5', payerId: 'm0', participantIds: ['m0'], sourceExpenseId: 'e-1' });
  assert.throws(() => addLedgerExpense(trip, { title: '重复', amount: '5', payerId: 'm0', participantIds: ['m0'], sourceExpenseId: 'e-1' }), /未重复添加|已记入账本/);
});

test('balances conserve to zero and suggested transfers clear all debt', () => {
  const trip = tripWithMembers(['张三', '李四']);
  const dinner = addLedgerExpense(trip, { title: '晚餐', amount: '100.00', payerId: 'm0', participantIds: ['m0', 'm1'], date: '2026-11-20' });
  const balances = ledgerBalances(trip);
  assert.equal(balances.expenseTotal, 10000);
  const zhang = balances.rows.find(row => row.id === 'm0');
  const li = balances.rows.find(row => row.id === 'm1');
  assert.deepEqual({ paid: zhang.paid, share: zhang.share, net: zhang.net, remaining: zhang.remaining }, { paid: 10000, share: 5000, net: 5000, remaining: 5000 });
  assert.deepEqual({ paid: li.paid, share: li.share, net: li.net, remaining: li.remaining }, { paid: 0, share: 5000, net: -5000, remaining: -5000 });
  assert.equal(balances.remainingSum, 0);
  assert.equal(balances.settled, false);

  const transfers = suggestedTransfers(balances);
  assert.deepEqual(transfers, [{ fromId: 'm1', fromName: '李四', toId: 'm0', toName: '张三', amountCents: 5000 }]);

  // 结算登记后余额归零，但只是“已登记”，并非真实支付。
  const settlement = recordSettlement(trip, { fromId: 'm1', toId: 'm0', amountCents: 5000, date: '2026-11-21', note: '微信' });
  assert.deepEqual(settlement.coveredExpenseIds, [dinner.id]);
  const settled = ledgerBalances(trip);
  assert.equal(settled.rows.find(row => row.id === 'm0').remaining, 0);
  assert.equal(settled.rows.find(row => row.id === 'm1').remaining, 0);
  assert.equal(settled.settlementTotal, 5000);
  assert.equal(settled.settled, true);
  assert.equal(suggestedTransfers(settled).length, 0);

  // 已结算支出不能直接修改或删除，撤销后恢复。
  assert.equal(settlementCovering(trip.ledger, dinner.id)?.id, settlement.id);
  assert.throws(() => updateLedgerExpense(trip, dinner.id, { amount: '120.00' }), /撤销/);
  assert.throws(() => removeLedgerExpense(trip, dinner.id), /撤销/);
  assert.throws(() => removeLedgerMember(trip, 'm1'), /不能移除/);
  revokeSettlement(trip, settlement.id);
  assert.equal(ledgerBalances(trip).settled, false);
  const updated = updateLedgerExpense(trip, dinner.id, { amount: '120.00', participantIds: ['m0', 'm1'] });
  assert.deepEqual(updated.shares, { m0: 6000, m1: 6000 });
  assert.throws(() => revokeSettlement(trip, settlement.id), /已不存在/);

  assert.throws(() => recordSettlement(trip, { fromId: 'm0', toId: 'm0', amount: '10' }), /同一个人/);
  assert.throws(() => recordSettlement(trip, { fromId: 'm0', toId: 'm1', amount: '0' }), /大于 0/);
});

test('settlements only cover unsettled expenses and can be followed by new ones', () => {
  const trip = tripWithMembers(['甲', '乙']);
  const first = addLedgerExpense(trip, { title: '第一笔', amount: '10.00', payerId: 'm0', participantIds: ['m0', 'm1'], date: '2026-11-20' });
  const settlement = recordSettlement(trip, { fromId: 'm1', toId: 'm0', amount: '5.00', date: '2026-11-20' });
  assert.deepEqual(settlement.coveredExpenseIds, [first.id]);

  const second = addLedgerExpense(trip, { title: '第二笔', amount: '30.00', payerId: 'm1', participantIds: ['m0', 'm1'], date: '2026-11-21' });
  const balances = ledgerBalances(trip);
  assert.equal(balances.rows.find(row => row.id === 'm0').remaining, -1500);
  assert.equal(balances.rows.find(row => row.id === 'm1').remaining, 1500);
  assert.equal(balances.settled, false);

  const secondSettlement = recordSettlement(trip, { fromId: 'm0', toId: 'm1', amount: '15.00', date: '2026-11-21' });
  assert.deepEqual(secondSettlement.coveredExpenseIds, [second.id]);
  assert.equal(ledgerBalances(trip).settled, true);
  // 已覆盖的第一笔仍受保护，第二笔也同样受保护。
  assert.throws(() => updateLedgerExpense(trip, second.id, { amount: '40.00' }), /撤销/);
  assert.throws(() => updateLedgerExpense(trip, first.id, { title: '不可能' }), /撤销/);
  assert.throws(() => removeLedgerExpense(trip, first.id), /撤销/);
});

test('settlements do not lock unrelated or partially repaid expenses', () => {
  const trip = tripWithMembers(['甲', '乙', '丙']);
  // 甲垫付聚餐 100（三人分摊），丙垫付打车 30（丙、甲分摊）。
  const dinner = addLedgerExpense(trip, { title: '聚餐', amount: '100.00', payerId: 'm0', participantIds: ['m0', 'm1', 'm2'], date: '2026-11-20' });
  const taxi = addLedgerExpense(trip, { title: '打车', amount: '30.00', payerId: 'm2', participantIds: ['m2', 'm0'], date: '2026-11-20' });

  // 乙 → 甲 全额还款：只应锁定方向一致的聚餐，不能锁住丙垫付的打车。
  const settlement = recordSettlement(trip, { fromId: 'm1', toId: 'm0', amount: '33.34', date: '2026-11-20' });
  assert.deepEqual(settlement.coveredExpenseIds, [dinner.id]);
  assert.equal(settlementCovering(trip.ledger, taxi.id), null);
  assert.doesNotThrow(() => updateLedgerExpense(trip, taxi.id, { amount: '40.00' }));

  // 甲 → 丙 只还一部分时不锁定任何支出（仍可修改），余额照常显示未结清。
  const partial = recordSettlement(trip, { fromId: 'm0', toId: 'm2', amount: '5.00', date: '2026-11-20' });
  assert.deepEqual(partial.coveredExpenseIds, []);
  assert.equal(settlementCovering(trip.ledger, taxi.id), null);
  assert.doesNotThrow(() => updateLedgerExpense(trip, taxi.id, { title: '打车（改）' }));
  // 部分还款后丙仍然应收未结清（余额守恒合计始终为 0，所以检查具体人的剩余）。
  assert.notEqual(ledgerBalances(trip).rows.find(row => row.id === 'm2').remaining, 0);
});

test('legacy index based sources migrate to stable expense ids', () => {
  const trip = tripWithMembers(['甲', '乙']);
  trip.expenses = [
    { title: '酒店', category: '住宿', actual: 80 },
    { title: '门票', category: '门票', actual: 0 }
  ];
  const expense = addLedgerExpense(trip, {
    title: '酒店', amount: '80.00', payerId: 'm0', participantIds: ['m0', 'm1'],
    date: '2026-11-20', sourceExpenseId: '1'
  });
  assert.equal(migrateExpenseSources(trip), true);
  assert.ok(trip.expenses[0].id);
  assert.equal(expense.sourceExpenseId, trip.expenses[1].id);
  assert.equal(migrateExpenseSources(trip), false);
});

test('actual expenses are separate from estimates and source ids reconcile once', () => {
  const trip = tripWithMembers(['甲', '乙']);
  trip.expenses = [
    { title: '酒店', category: '住宿', estimate: 120, actual: 80 },
    { title: '门票', category: '门票', estimate: 60, actual: 0 }
  ];
  assert.equal(ledgerSummary(trip).totalCents, 0);
  assert.equal(ledgerBalances(trip).rows.every(row => row.paid === 0 && row.share === 0), true);

  addLedgerExpense(trip, {
    title: '酒店', amount: '80.00', payerId: 'm0', participantIds: ['m0', 'm1'],
    date: '2026-11-20', sourceExpenseId: 'legacy-index-0'
  });
  const summary = ledgerSummary(trip);
  assert.equal(summary.totalCents, 8000);
  assert.equal(summary.expenseCount, 1);
  assert.deepEqual([...summary.noSourceIds], ['legacy-index-0']);
  assert.equal(summary.hasLedger, true);

  assert.equal(reconcileExpenseIds([{ title: '没有 id' }, { id: 'keep' }]), true);
  const list = [{ title: '没有 id' }, { id: 'keep' }];
  assert.equal(reconcileExpenseIds(list), true);
  assert.ok(list[0].id);
  assert.equal(list[1].id, 'keep');
  assert.equal(reconcileExpenseIds(list), false);
});

test('ledger starts empty and is isolated per account', async () => {
  const original = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  try {
    const empty = createLedger();
    assert.deepEqual(empty.members, []);
    assert.equal(empty.currency, 'CNY');
    assert.equal(ensureLedger(tripWithMembers([])).currency, 'CNY');

    registerUser('13910000001', 'pass-1234');
    loginUser('13910000001', 'pass-1234');
    const travel = useTravelStore(createPinia());
    const saved = travel.saveRoute({
      title: '账本隔离', startDate: '2026-11-20', endDate: '2026-11-21', themes: [], preferences: {},
      days: [{ date: '2026-11-20', activities: [] }]
    });
    addLedgerMember(saved, '甲');
    addLedgerMember(saved, '乙');
    const [a, b] = saved.ledger.members;
    addLedgerExpense(saved, { title: '午餐', amount: '40.00', payerId: a.id, participantIds: [a.id, b.id], date: '2026-11-20' });
    travel.saveRoute(saved);

    const reloaded = travel.routes.find(item => item.id === saved.id);
    assert.equal(reloaded.ledger.members.length, 2);
    assert.equal(reloaded.ledger.expenses.length, 1);
    assert.equal(ledgerBalances(reloaded).expenseTotal, 4000);

    logout();
    registerUser('13910000002', 'pass-1234');
    loginUser('13910000002', 'pass-1234');
    assert.equal(useTravelStore(createPinia()).routes.length, 0);

    logout();
    loginUser('13910000001', 'pass-1234');
    assert.equal(useTravelStore(createPinia()).routes[0].ledger.expenses.length, 1);
  } finally {
    globalThis.localStorage = original;
  }
});

test('ledger component renders balances, transfers and a settlement disclaimer', async () => {
  const component = await loadComponent('components/TravelLedger.vue');
  const trip = tripWithMembers(['张三', '李四']);
  addLedgerExpense(trip, { title: '海鲜晚餐', amount: '100.00', payerId: 'm0', participantIds: ['m0', 'm1'], date: '2026-11-20' });
  const app = createSSRApp({ render: () => h(component, { route: trip }) });
  app.use(createPinia());
  const html = await renderToString(app);
  assert.match(html, /旅行账本与 AA 分账/);
  assert.match(html, /共 1 笔 · ¥100.00/);
  assert.match(html, /不代表真实支付已完成/);
  assert.match(html, /海鲜晚餐/);
  assert.match(html, /张三/);
  assert.match(html, /应收 ¥50.00/);
  assert.match(html, /应付 ¥50.00/);
  assert.match(html, /李四 → 张三/);
  assert.match(html, /登记结算/);
  assert.equal(trip.ledger.expenses.length, 1);
  assert.equal(trip.ledger.expenses[0].amountCents, 10000);
});
