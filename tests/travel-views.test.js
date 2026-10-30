import { mockFeedback } from './helpers/feedback.js';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import itineraryService from '../src/services/itineraryService.js';
import { createViewState, loadView, renderView } from './helpers/vueView.js';
import { createPinia, setActivePinia } from 'pinia';
import { loginUser, registerUser } from '../src/services/authService.js';
import { saveUserRoute } from '../src/services/userDataService.js';

const Routes = await loadView('RoutesView');
const Hotels = await loadView('HotelsView');
const Tickets = await loadView('TicketsView');
let notices;
const originalAlert = globalThis.alert;
const originalStorage = globalThis.localStorage;
beforeEach(t => {
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
  registerUser('13800138000', 'test-pass');
  loginUser('13800138000', 'test-pass');
  setActivePinia(createPinia());
  saveUserRoute({ title: '测试线路', startDate: '2030-12-01', endDate: '2030-12-03', themes: ['历史文化'], companion: 'family', preferences: { culture: 80, relaxation: 40, budget: 60 }, progress: 75, isFavorite: true });
  notices = [];
  mockFeedback(t, notices);
});
afterEach(() => { globalThis.alert = originalAlert; globalThis.localStorage = originalStorage; });

test('applying a recommendation opens a draft; cancel does not create or mutate routes', async () => {
  const state = await createViewState(Routes);
  const count = state.myRoutes.value.length;
  const recommendation = state.smartRecommendations.value[0];
  const tags = [...recommendation.tags];
  state.previewRecommendation(recommendation);
  assert.doesNotThrow(() => state.applyRecommendation(recommendation));
  assert.equal(state.showModal.value, true);
  assert.equal(state.previewData.value, null);
  assert.equal(state.myRoutes.value.length, count);
  state.toggleTheme(tags[0]);
  state.currentRoute.value.attractions[0].name = 'draft-only';
  state.closeModal();
  assert.equal(state.myRoutes.value.length, count);
  assert.deepEqual([...recommendation.tags], tags);
  assert.notEqual(recommendation.attractions[0].name, 'draft-only');

  state.applyRecommendation(recommendation);
  Object.assign(state.currentRoute.value, { startDate: '2030-12-01', endDate: '2030-12-03' });
  state.saveRoute();
  assert.equal(state.showModal.value, false);
  assert.equal(state.myRoutes.value.length, count + 1);
  const saved = state.myRoutes.value[0];
  assert.ok(saved.id);
  assert.equal(saved.title, recommendation.title);
  assert.equal(saved.attractions.length, recommendation.attractions.length);
  assert.deepEqual(saved.pendingActivities.map(a=>a.title),recommendation.attractions.map(a=>a.name));
  state.currentRoute.value.themes.push('unsaved');
  assert.ok(!saved.themes.includes('unsaved'));
});

test('editing nested preferences and themes is isolated until save', async () => {
  const state = await createViewState(Routes);
  const original = state.myRoutes.value[0];
  const originalCulture = original.preferences.culture;
  const originalThemes = [...original.themes];
  state.editRoute(original.id);
  state.currentRoute.value.preferences.culture = 1;
  state.toggleTheme(originalThemes[0]);
  state.closeModal();
  assert.equal(original.preferences.culture, originalCulture);
  assert.deepEqual([...original.themes], originalThemes);
  state.editRoute(original.id);
  state.currentRoute.value.preferences.culture = 25;
  state.saveRoute();
  assert.equal(state.myRoutes.value[0].preferences.culture, 25);
});

test('invalid route dates do not save or close the editor', async () => {
  const state = await createViewState(Routes);
  const count = state.myRoutes.value.length;
  state.showCreateModal();
  Object.assign(state.currentRoute.value, { title: '测试', startDate: '2030-12-02', endDate: '2030-12-01' });
  state.saveRoute();
  assert.equal(state.myRoutes.value.length, count);
  assert.equal(state.showModal.value, true);
  assert.match(notices.at(-1), /不能早于/);
});

test('generated itinerary keeps dates, preferences and daily activities when saved as route', async () => {
  const state = await createViewState(Routes);
  state.showItineraryModal.value = true;
  state.itineraryPlan.value = { destination: '北京', startDate: '2030-12-01', endDate: '2030-12-03', budget: 1000, persons:3, preferences: ['culture'] };
  state.generateItinerary();
  const generated = state.generatedItinerary.value;
  assert.deepEqual(generated.days.map(day => day.date), ['2030-12-01', '2030-12-02', '2030-12-03']);
  assert.match(itineraryService.exportItinerary(generated), /【北京3日游】/);
  const html = await renderView(Routes, state);
  assert.ok(html.includes('暂无匹配活动，可自行补充。'));
  state.itineraryPlan.value.preferences.push('art');
  assert.deepEqual([...generated.preferences], ['culture']);
  state.saveAsRoute();
  assert.equal(state.myRoutes.value[0].days[0].activities[0].title, generated.days[0].activities[0].title);
  assert.equal(state.myRoutes.value[0].persons,3);
  assert.deepEqual(state.myRoutes.value[0].destinations,['北京']);
  state.itineraryPlan.value.endDate = '2030-11-30';
  state.generateItinerary();
  assert.equal(state.generatedItinerary.value, null);
  assert.match(notices.at(-1), /不能早于/);
});

test('hotel pages render distinct slices of the sorted results, including the final page', async () => {
  const state = await createViewState(Hotels);
  const example = state.hotelList.value[0];
  state.hotelList.value = Array.from({ length: 19 }, (_, index) => ({ ...example, id: index + 100, name: `测试酒店-${index}`, price: 1000 - index }));
  state.sortBy.value = 'price-asc';
  const first = state.paginatedHotels.value.map(hotel => hotel.id);
  assert.equal(first.length, 8);
  assert.equal(state.totalPages.value, 3);
  let html = await renderView(Hotels, state);
  assert.equal((html.match(/class="hotel-card"/g) || []).length, 8);
  assert.ok(html.includes('测试酒店-18'));
  state.currentPage.value = 2;
  assert.ok(state.paginatedHotels.value.every(hotel => !first.includes(hotel.id)));
  state.currentPage.value = 3;
  html = await renderView(Hotels, state);
  assert.equal((html.match(/class="hotel-card"/g) || []).length, 3);
  assert.ok(!html.includes('测试酒店-18'));
  state.sortHotels();
  assert.equal(state.currentPage.value, 1);
});

test('hotel searches reset page while preserving sort order and handle no results', async () => {
  const state = await createViewState(Hotels);
  state.sortBy.value = 'price-asc';
  state.currentPage.value = 3;
  state.searchHotels();
  assert.equal(state.currentPage.value, 1);
  const prices = state.paginatedHotels.value.map(hotel => hotel.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  state.searchParam.value.location = '不存在的酒店';
  state.searchHotels();
  assert.equal(state.totalPages.value, 0);
  assert.equal(state.paginatedHotels.value.length, 0);
  const html = await renderView(Hotels, state);
  assert.ok(html.includes('暂无符合条件的酒店'));
  assert.equal((html.match(/class="hotel-card"/g) || []).length, 0);
});

test('scenic ticket options have finite prices based on the displayed adult fare', async () => {
  const state = await createViewState(Tickets);
  const originalTimeout = globalThis.setTimeout;
  try {
    globalThis.setTimeout = callback => { callback(); return 0; };
    state.searchScenic();
  } finally {
    globalThis.setTimeout = originalTimeout;
  }
  assert.equal(state.scenicResults.value.length, 10);
  for (const scenic of state.scenicResults.value) {
    assert.ok(scenic.ticketOptions.every(option => Number.isFinite(option.price) && option.price >= 0));
    assert.deepEqual(scenic.ticketOptions.map(option => option.price), [
      scenic.ticketPrice, Math.floor(scenic.ticketPrice * 0.5), Math.floor(scenic.ticketPrice * 0.6), Math.floor(scenic.ticketPrice * 0.7)
    ]);
  }
  assert.doesNotThrow(() => state.confirmBooking());
  assert.doesNotThrow(() => state.confirmScenicBooking());
});

test('travel mock results use different cities and calculate overnight durations correctly', async () => {
  const state = await createViewState(Tickets);
  Object.assign(state.travelSearch.value, { origin: '', destination: '', date: '', transport: 'all' });
  const originalTimeout = globalThis.setTimeout;
  const originalRandom = Math.random;
  // 第一组先抽到同一城市，重抽后生成 17:00 出发、次日 05:00 到达的火车。
  const sequence = [0.125, 0, 0.26, 0.4, 0, 0.99, 0, 0.99];
  try {
    Math.random = () => sequence.shift() ?? 0;
    globalThis.setTimeout = callback => { callback(); return 0; };
    state.searchTravel();
  } finally {
    Math.random = originalRandom;
    globalThis.setTimeout = originalTimeout;
  }
  assert.equal(state.travelResults.value.length, 10);
  assert.ok(state.travelResults.value.every(result => result.origin !== result.destination));
  const overnight = state.travelResults.value[0];
  assert.equal(overnight.origin, '上海');
  assert.equal(overnight.destination, '深圳');
  assert.equal(overnight.duration, '12小时00分钟');
  assert.ok(overnight.departureTime.endsWith('17:00'));
  assert.ok(overnight.arrivalTime.endsWith('05:00'));
  assert.notEqual(overnight.departureTime.slice(0, 10), overnight.arrivalTime.slice(0, 10));
});

test('offline exports preserve confirmed addresses, booking notes and route provenance',()=>{
 const text=itineraryService.exportRoute({title:'验收旅行',days:[{date:'2030-12-01',activities:[{title:'公园',place:{name:'确认公园',address:'公园路1号'},notes:'预约上午',travelEstimate:{mode:'walking',minutes:20,checkedAt:'2030-12-01T00:00:00Z'}}]}]});
 assert.match(text,/公园路1号/);assert.match(text,/预约上午/);assert.match(text,/步行约20分钟/);assert.match(text,/2030-12-01T00:00:00Z/);
});


test('metadata editor saves against latest schedule and archives days removed by shorter dates', async () => {
  const state = await createViewState(Routes)
  const original = JSON.parse(JSON.stringify(state.myRoutes.value[0]))
  original.days = [
    { date: '2030-12-01', activities: [{ title: '第一天' }] },
    { date: '2030-12-02', budget: 80, activities: [{ title: '第二天', description: '保留备注' }] },
    { date: '2030-12-03', activities: [] }
  ]
  state.travel.saveRoute(original)
  assert.match(await renderView(Routes, state), /编辑基本信息/)
  state.editRoute(original.id)
  state.currentRoute.value.endDate = '2030-12-01'
  original.days[0].activities[0].title = '另一标签页更新'
  original.expenses = [{ title: '最新费用', estimate: 100 }]
  saveUserRoute(original)
  state.saveRoute()
  const saved = state.myRoutes.value[0]
  assert.equal(saved.days.length, 1)
  assert.equal(saved.days[0].activities[0].title, '另一标签页更新')
  assert.equal(saved.expenses[0].title, '最新费用')
  assert.equal(saved.pendingActivities[0].title, '第二天')
  assert.equal(saved.pendingActivities[0].previousDate, '2030-12-02')
  assert.equal(saved.dateAdjustmentArchive[0].budget, 80)
  assert.equal(state.showModal.value, false)
})
