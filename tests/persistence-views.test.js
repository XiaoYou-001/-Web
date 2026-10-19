import { mockFeedback } from './helpers/feedback.js';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { loginUser, registerUser } from '../src/services/authService.js';
import { useAuthStore } from '../src/stores/auth.js';
import { useTravelStore } from '../src/stores/travel.js';
import { userDataKey } from '../src/services/userDataService.js';
import { createViewState, loadView, renderView } from './helpers/vueView.js';

const Routes = await loadView('RoutesView');
const Hotels = await loadView('HotelsView');
const Attractions = await loadView('AttractionsView');
const Profile = await loadView('ProfileView');
const originals = { localStorage: globalThis.localStorage, alert: globalThis.alert, confirm: globalThis.confirm };
let storage, travel, auth, notices, pinia;
const initialize = () => {
  pinia = createPinia();
  setActivePinia(pinia);
  auth = useAuthStore();
  travel = useTravelStore();
};
beforeEach(t => {
  storage = new Map(); notices = [];
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  mockFeedback(t, notices);

  registerUser('13800138000', 'test-pass');
  registerUser('13900139000', 'test-pass');
  loginUser('13800138000', 'test-pass');
  initialize();
});
afterEach(() => { Object.assign(globalThis, originals); });

test('route page saves, edits, favorites and deletes survive new page and store instances', async () => {
  let page = await createViewState(Routes);
  assert.equal(page.myRoutes.value.length, 0);
  page.showCreateModal();
  Object.assign(page.currentRoute.value, { title: '持久化线路', startDate: '2030-12-01', endDate: '2030-12-02' });
  page.saveRoute();
  const id = page.myRoutes.value[0].id;
  page.toggleFavorite(id);
  initialize();
  page = await createViewState(Routes);
  assert.equal(page.myRoutes.value[0].id, id);
  assert.equal(page.myRoutes.value[0].isFavorite, true);
  page.editRoute(id);
  page.currentRoute.value.title = '已修改线路';
  page.saveRoute();
  initialize();
  page = await createViewState(Routes);
  assert.equal(page.myRoutes.value[0].title, '已修改线路');
  await page.deleteRoute(id);
  initialize();
  page = await createViewState(Routes);
  assert.equal(page.myRoutes.value.length, 0);
});

test('hotel card and detail favorite actions share persistent state and profile count', async () => {
  let hotels = await createViewState(Hotels);
  const hotel = hotels.hotelList.value[0];
  hotels.toggleFavorite(hotel);
  initialize();
  hotels = await createViewState(Hotels);
  assert.equal(hotels.isFavorite(hotel), true);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] });
  const profile = await createViewState(Profile, [pinia, router]);
  assert.equal(profile.favoriteCount.value, 1);
  hotels.showHotelDetails(hotels.hotelList.value[0]);
  assert.ok((await renderView(Hotels, hotels)).includes('已收藏'));
  hotels.toggleFavorite(hotel.id);
  assert.equal(profile.favoriteCount.value, 0);
  initialize();
  assert.equal((await createViewState(Hotels)).isFavorite(hotel), false);
});

test('attraction favorites and subscriptions restore, deduplicate and cancel without affecting hotels', async () => {
  let attractions = await createViewState(Attractions);
  const hotels = await createViewState(Hotels);
  const attraction = { id: 1, name: '故宫', price: 60, location: '北京' };
  attractions.toggleFavorite(1);
  attractions.subscribePriceAlert(attraction);
  attractions.subscribePriceAlert(attraction);
  hotels.subscribeHotelPrice(hotels.hotelList.value[0]);
  initialize();
  attractions = await createViewState(Attractions);
  assert.equal(attractions.isFavorite(1), true);
  assert.equal(attractions.priceSubscriptions.value.length, 1);
  assert.equal(attractions.isPriceSubscribed(1), true);
  const id = attractions.priceSubscriptions.value[0].id;
  await attractions.unsubscribePriceAlert(id);
  initialize();
  attractions = await createViewState(Attractions);
  assert.equal(attractions.isPriceSubscribed(1), false);
  assert.equal(travel.subscriptions.length, 1);
  assert.equal(travel.subscriptions[0].type, 'hotel');
});

test('target price of a subscription can be edited and validated from the hotel page', async () => {
  const hotels = await createViewState(Hotels);
  hotels.subscribeHotelPrice(hotels.hotelList.value[0]);
  const sub = travel.subscriptions[0];
  const original = sub.targetPrice;

  // 有效编辑更新目标价并持久化
  hotels.startEditTarget(sub);
  hotels.targetDraft.value = 300;
  hotels.saveTargetPrice(travel.subscriptions[0]);
  assert.equal(travel.subscriptions[0].targetPrice, 300);
  assert.equal(hotels.editingTargetId.value, null);

  // 非法目标价被拒绝且不改变
  const sub2 = travel.subscriptions[0];
  hotels.startEditTarget(sub2);
  hotels.targetDraft.value = -5;
  hotels.saveTargetPrice(travel.subscriptions[0]);
  assert.equal(travel.subscriptions[0].targetPrice, 300);

  // 重新初始化后（模拟刷新）目标价保留
  initialize();
  const hotels2 = await createViewState(Hotels);
  assert.equal(travel.subscriptions[0].targetPrice, 300);
  assert.ok(original !== 300);
});

test('triggered price alerts can be dismissed individually or cleared from the profile page', async () => {
  travel.priceAlert({ type: 'hotel', itemName: '希尔顿', message: '【价格提醒】降价至 500 元' });
  travel.priceAlert({ type: 'attraction', itemName: '故宫', message: '【价格提醒】降价至 40 元' });
  assert.equal(travel.alerts.length, 2);

  const profile = await createViewState(Profile);
  // 单条删除
  const first = travel.alerts[0];
  await profile.dismissAlert(first);
  assert.equal(travel.alerts.length, 1);
  assert.ok(!travel.alerts.some(a => a.id === first.id));

  // 清空全部
  await profile.clearAllAlerts();
  assert.equal(travel.alerts.length, 0);

  // 模拟刷新后仍为空
  initialize();
  const profile2 = await createViewState(Profile);
  assert.equal(profile2.travel.alerts.length, 0);
});

test('hotel and attraction booking create persisted pending orders consistent with the order flow', async () => {
  const hotels = await createViewState(Hotels);
  const attractions = await createViewState(Attractions);

  // 默认已登录：酒店预订创建待支付订单
  hotels.bookHotel(hotels.hotelList.value[0]);
  assert.equal(travel.orders.length, 1);
  assert.equal(travel.orders[0].type, 'hotel');
  assert.equal(travel.orders[0].name, hotels.hotelList.value[0].name);
  assert.equal(travel.orders[0].status, 'pending');
  assert.equal(travel.orders[0].totalPrice, hotels.hotelList.value[0].price);

  // 景点预订（id=1 为故宫）创建待支付订单
  attractions.bookAttraction(1);
  assert.equal(travel.orders.length, 2);
  assert.equal(travel.orders[0].type, 'attraction');
  assert.equal(travel.orders[0].status, 'pending');

  // 模拟刷新后订单保留
  initialize();
  const profile = await createViewState(Profile);
  assert.equal(profile.travel.orders.length, 2);

  // 未登录时预订不建单，仅提示
  auth.logout();
  const hotels2 = await createViewState(Hotels);
  hotels2.bookHotel(hotels2.hotelList.value[0]);
  assert.equal(travel.orders.length, 0);
  assert.match(notices.at(-1), /请先登录/);
});

test('profile supports travel orders in stats and tab while advancing shows the next status', async () => {
  // 行程（票务）预订产生 type=travel 订单，个人中心应纳入统计与专属 tab
  travel.createOrder({ type: 'travel', name: '北京→上海 · G123', location: '北京 - 上海', totalPrice: 553, bookingDate: '2030-12-01' });
  travel.createOrder({ type: 'hotel', name: '如家酒店', location: '北京', totalPrice: 299, bookingDate: '2030-12-01' });
  assert.equal(travel.orders.length, 2);

  const profile = await createViewState(Profile);
  assert.equal(profile.totalTravelOrders.value, 1);
  assert.equal(profile.orderTypeLabel('travel'), '票务/行程订单');

  // 切到「票务/行程订单」tab 只显示 travel 订单（种子演示订单为景点/酒店，不计入）
  const travelOrderId = travel.orders.find(o => o.type === 'travel').id;
  profile.switchOrderTab('travel');
  assert.equal(profile.activeTab.value, 'travel');
  assert.equal(profile.currentPage.value, 1);
  assert.equal(profile.filteredOrders.value.length, 1);
  assert.equal(profile.filteredOrders.value[0].type, 'travel');

  // 全部 tab 包含两条持久化订单（外加种子演示订单，只校验出现即可）
  profile.switchOrderTab('all');
  assert.ok(profile.filteredOrders.value.some(o => o.id === travelOrderId));
  assert.ok(profile.filteredOrders.value.some(o => o.type === 'hotel'));

  // 推进 paid → confirmed 时，成功提示应展示「下一个」状态而非旧状态
  const paidOrder = travel.orders.find(o => o.id === travelOrderId);
  travel.updateOrder(paidOrder.id, { status: 'paid' });
  const paidRef = travel.orders.find(o => o.id === paidOrder.id);
  await profile.advanceOrder(paidRef);
  assert.ok(notices.some(m => m.includes('已确认')), `期望提示下一个状态，实际提示：${notices.join(' | ')}`);
});

test('attraction page can check subscription prices and persist triggered alerts', async () => {
  const attractions = await createViewState(Attractions);
  // 每轮检查模拟市价逐步下探，较多次后必触发降价提醒
  attractions.subscribePriceAlert({ id: 1, name: '故宫', price: 100, location: '北京' });
  let alerts = travel.alerts.length;
  let guard = 0;
  while (alerts === 0 && guard < 30) {
    await attractions.checkNowPrices();
    alerts = travel.alerts.length;
    guard++;
  }
  assert.ok(alerts >= 1, '价格检查应最终触发并持久化降价提醒');
  assert.ok(attractions.priceCheckResults.value.length >= 1);
  // 检查结果展示“价格提醒”或“未触发”文案
  assert.match(attractions.priceCheckResults.value.join(' '), /提醒|未触发/);
});

test('account switching leaves the new account empty and prevents saving an old draft into it', async () => {
  const routes = await createViewState(Routes);
  routes.showCreateModal();
  Object.assign(routes.currentRoute.value, { title: '账号A草稿', startDate: '2030-12-01', endDate: '2030-12-02' });
  const hotels = await createViewState(Hotels);
  hotels.toggleFavorite(hotels.hotelList.value[0]);
  auth.login('13900139000', 'test-pass');
  assert.equal(hotels.favoriteHotels.value.length, 0);
  routes.saveRoute();
  assert.equal(routes.myRoutes.value.length, 0);
  assert.equal(routes.showModal.value, true);
  assert.match(notices.at(-1), /账号已切换/);
  assert.equal(storage.has(userDataKey(auth.user.id)), false);
});

test('failed route and subscription saves retain drafts and do not display success', async () => {
  const routes = await createViewState(Routes);
  routes.showCreateModal();
  Object.assign(routes.currentRoute.value, { title: '待保存草稿', startDate: '2030-12-01', endDate: '2030-12-02' });
  const hotels = await createViewState(Hotels);
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  routes.saveRoute();
  assert.equal(routes.showModal.value, true);
  assert.equal(routes.currentRoute.value.title, '待保存草稿');
  assert.equal(routes.myRoutes.value.length, 0);
  hotels.subscribeHotelPrice(hotels.hotelList.value[0]);
  assert.equal(hotels.hotelPriceSubscriptions.value.length, 0);
  assert.ok(notices.every(message => message.includes('保存失败')));
  assert.ok((await renderView(Routes, routes)).includes('保存失败'));
});

test('generated daily itinerary remains attached to the saved route after reload', async () => {
  let routes = await createViewState(Routes);
  routes.itineraryPlan.value = { destination: '北京', startDate: '2030-12-31', endDate: '2031-01-02', budget: 1000, preferences: ['culture', 'nature'] };
  routes.generateItinerary();
  const generated = JSON.parse(JSON.stringify(routes.generatedItinerary.value.days));
  routes.saveAsRoute();
  initialize();
  routes = await createViewState(Routes);
  assert.equal(routes.myRoutes.value[0].title, '北京3日游');
  assert.equal(routes.myRoutes.value[0].budget, 1000);
  assert.deepEqual(JSON.parse(JSON.stringify(routes.myRoutes.value[0].days)), generated);
});

test('a malformed saved snapshot displays an error and cannot be overwritten from the page', async () => {
  const key = userDataKey(auth.user.id);
  storage.set(key, '{broken');
  initialize();
  const hotels = await createViewState(Hotels);
  const html = await renderView(Hotels, hotels);
  assert.ok(html.includes('原始记录已保留'));
  hotels.toggleFavorite(hotels.hotelList.value[0]);
  assert.equal(storage.get(key), '{broken');
  assert.equal(hotels.favoriteHotels.value.length, 0);
});
