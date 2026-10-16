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
