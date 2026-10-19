import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { registerUser } from '../src/services/authService.js';
import { useAuthStore } from '../src/stores/auth.js';
import { useTravelStore } from '../src/stores/travel.js';
import { feedback } from '../src/services/feedbackService.js';
import { createViewState } from './helpers/vueView.js';

const Tickets = await (await import('./helpers/vueView.js')).loadView('TicketsView');
const Profile = await (await import('./helpers/vueView.js')).loadView('ProfileView');

const originalStorage = globalThis.localStorage;
let pinia, router, auth, travel, storage;
beforeEach(() => {
  feedback.reset(); storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  pinia = createPinia(); setActivePinia(pinia);
  auth = useAuthStore(); travel = useTravelStore();
  router = createRouter({ history: createMemoryHistory(), routes: ['/', '/profile'].map(path => ({ path, component: { render: () => null } })) });
});
afterEach(() => { feedback.reset(); globalThis.localStorage = originalStorage; });

test('booking without login never creates an order and stays informational', async () => {
  const tickets = await createViewState(Tickets);
  tickets.selectedTravel.value = { origin: '北京', destination: '上海', number: 'CA1001', seatTypes: [{ type: '商务舱', price: 1200 }] };
  tickets.confirmBooking();
  assert.equal(travel.orders.length, 0);
  assert.match(feedback.notices.value.at(-1).message, /未创建真实订单/);
  tickets.selectedScenic.value = { name: '故宫', ticketOptions: [{ name: '成人票', price: 60 }] };
  tickets.confirmScenicBooking();
  assert.equal(travel.orders.length, 0);
  assert.match(feedback.notices.value.at(-1).message, /未创建真实订单/);
});

test('booking when logged in creates persisted pending orders that survive reload', async () => {
  registerUser('13800138000', 'test-pass'); auth.login('13800138000', 'test-pass');
  let tickets = await createViewState(Tickets);
  tickets.selectedTravel.value = { origin: '北京', destination: '上海', number: 'CA1001', date: '2030-01-01', seatTypes: [{ type: '商务舱', price: 1200 }] };
  tickets.chooseSeat(tickets.selectedTravel.value.seatTypes[0]);
  tickets.confirmBooking();
  assert.equal(travel.orders.length, 1);
  const travelOrder = travel.orders[0];
  assert.equal(travelOrder.type, 'travel');
  assert.equal(travelOrder.status, 'pending');
  assert.equal(travelOrder.totalPrice, 1200);
  assert.match(feedback.notices.value.at(-1).message, /演示订单已创建/);

  tickets.selectedScenic.value = { name: '故宫', detailImageUrl: '/img.jpg', ticketOptions: [{ name: '成人票', price: 60 }] };
  tickets.confirmScenicBooking();
  assert.equal(travel.orders.length, 2);
  assert.equal(travel.orders[0].type, 'attraction');
  assert.equal(travel.orders[0].totalPrice, 60);

  // 模拟刷新：重新创建 store 并读取同一账号数据
  const pinia2 = createPinia(); setActivePinia(pinia2);
  const auth2 = useAuthStore(); const travel2 = useTravelStore();
  auth2.login('13800138000', 'test-pass');
  assert.equal(travel2.orders.length, 2);
  setActivePinia(pinia);
});

test('demo payment only advances persisted orders and keeps seed orders unmoved', async () => {
  registerUser('13800138000', 'test-pass'); auth.login('13800138000', 'test-pass');
  const tickets = await createViewState(Tickets);
  tickets.selectedTravel.value = { origin: '北京', destination: '上海', number: 'CA1001', date: '2030-01-01', seatTypes: [{ type: '经济舱', price: 500 }] };
  tickets.confirmBooking();
  const orderId = travel.orders[0].id;

  const profile = await createViewState(Profile, [pinia, router]);
  const order = profile.orders.value.find(o => o.id === orderId);
  const pending = profile.payOrder(order);
  feedback.settleConfirmation(true); await pending;
  assert.equal(travel.orders[0].status, 'paid');
  assert.equal(profile.orders.value.find(o => o.id === orderId).status, 'paid');

  // 种子演示订单支付不推进、不真实扣款
  const seed = profile.orders.value.find(o => o.id === 'A002');
  const seedInitialStatus = seed.status;
  const seedPending = profile.payOrder(seed);
  feedback.settleConfirmation(true); await seedPending;
  const freshSeed = profile.orders.value.find(o => o.id === 'A002');
  assert.equal(freshSeed.status, seedInitialStatus);
  assert.match(feedback.notices.value.at(-1).message, /尚未接入/);
});

test('advance and cancel follow the order state machine and persist', async () => {
  registerUser('13800138000', 'test-pass'); auth.login('13800138000', 'test-pass');
  const tickets = await createViewState(Tickets);
  tickets.selectedTravel.value = { origin: '北京', destination: '上海', number: 'CA1001', date: '2030-01-01', seatTypes: [{ type: '经济舱', price: 500 }] };
  tickets.confirmBooking();
  const orderId = travel.orders[0].id;
  const profile = await createViewState(Profile, [pinia, router]);

  // 推进：待支付 → 已支付 → 已确认 → 已完成
  let order = profile.orders.value.find(o => o.id === orderId);
  let p = profile.payOrder(order); feedback.settleConfirmation(true); await p;
  order = profile.orders.value.find(o => o.id === orderId);
  const a1 = profile.advanceOrder(order); feedback.settleConfirmation(true); await a1;
  assert.equal(travel.orders[0].status, 'confirmed');
  order = profile.orders.value.find(o => o.id === orderId);
  const a2 = profile.advanceOrder(order); feedback.settleConfirmation(true); await a2;
  assert.equal(travel.orders[0].status, 'completed');

  // 新订单取消：待支付 → 已取消
  const tickets2 = await createViewState(Tickets);
  tickets2.selectedScenic.value = { name: '故宫', detailImageUrl: '/img.jpg', ticketOptions: [{ name: '成人票', price: 60 }] };
  tickets2.confirmScenicBooking();
  const cancelId = travel.orders[0].id;
  const corder = profile.orders.value.find(o => o.id === cancelId);
  const cp = profile.cancelOrder(corder); feedback.settleConfirmation(true); await cp;
  assert.equal(travel.orders[0].status, 'cancelled');

  // 已取消订单再次取消应报错且不改变状态
  const cancelAgain = profile.cancelOrder(travel.orders[0]); feedback.settleConfirmation(true); await cancelAgain;
  assert.equal(travel.orders[0].status, 'cancelled');
  assert.equal(feedback.notices.value.at(-1).type, 'error');
});

test('order review is only allowed on completed persisted orders and persists', async () => {
  registerUser('13800138000', 'test-pass'); auth.login('13800138000', 'test-pass');
  const tickets = await createViewState(Tickets);
  tickets.selectedTravel.value = { origin: '北京', destination: '上海', number: 'CA1001', date: '2030-01-01', seatTypes: [{ type: '经济舱', price: 500 }] };
  tickets.confirmBooking();
  const orderId = travel.orders[0].id;
  const profile = await createViewState(Profile, [pinia, router]);

  // 未完成订单不可评价
  assert.throws(() => travel.submitOrderReview(orderId, { rating: 5, comment: '很棒' }), /已完成/);

  // 推进到已完成
  let order = profile.orders.value.find(o => o.id === orderId);
  let p = profile.payOrder(order); feedback.settleConfirmation(true); await p;
  order = profile.orders.value.find(o => o.id === orderId);
  const a1 = profile.advanceOrder(order); feedback.settleConfirmation(true); await a1;
  order = profile.orders.value.find(o => o.id === orderId);
  const a2 = profile.advanceOrder(order); feedback.settleConfirmation(true); await a2;
  assert.equal(travel.orders[0].status, 'completed');

  // 非法评分被拒绝
  assert.throws(() => travel.submitOrderReview(orderId, { rating: 6, comment: 'x' }), /评分/);
  // 成功提交
  const review = travel.submitOrderReview(orderId, { rating: 5, comment: '  非常棒的旅行  ' });
  assert.equal(review.rating, 5);
  assert.equal(review.comment, '非常棒的旅行');
  assert.ok(review.reviewedAt);
  assert.equal(travel.orders[0].review.rating, 5);
  // 覆盖再次提交
  const review2 = travel.submitOrderReview(orderId, { rating: 4, comment: '还不错' });
  assert.equal(review2.rating, 4);
  assert.equal(travel.orders[0].review.comment, '还不错');

  // 模拟刷新后评价仍在
  const pinia2 = createPinia(); setActivePinia(pinia2);
  const auth2 = useAuthStore(); const travel2 = useTravelStore();
  auth2.login('13800138000', 'test-pass');
  assert.equal(travel2.orders[0].review.rating, 4);
  setActivePinia(pinia);
});

