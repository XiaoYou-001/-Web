import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { loginUser, logout, registerUser } from '../src/services/authService.js';
import { useAuthStore } from '../src/stores/auth.js';
import { useTravelStore } from '../src/stores/travel.js';
import * as repository from '../src/services/userDataService.js';
import alerts from '../src/services/alertsService.js';
import itineraries from '../src/services/itineraryService.js';

let storage, ownerA, ownerB;
const originalStorage = globalThis.localStorage;
const route = () => ({ title: '我的线路', startDate: '2030-12-01', endDate: '2030-12-02', themes: ['历史文化'], preferences: { culture: 50, budget: 50, relaxation: 50 }, days: [{ date: '2030-12-01', activities: [{ title: '故宫', time: '09:00', description: '游览' }] }] });
const subscription = (type = 'hotel', itemId = 1) => ({ type, itemId, itemName: '测试项目', targetPrice: 85, currentPrice: 100 });

beforeEach(() => {
  storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  ownerA = registerUser('13800138000', 'test-pass').user.id;
  ownerB = registerUser('13900139000', 'test-pass').user.id;
  loginUser('13800138000', 'test-pass');
  setActivePinia(createPinia());
});
afterEach(() => { globalThis.localStorage = originalStorage; });

test('routes, favorites and subscriptions restore in a fresh store after a simulated reload', () => {
  const travel = useTravelStore();
  const saved = travel.saveRoute(route());
  travel.toggleRouteFavorite(saved.id);
  travel.toggleFavorite('attractions', 1);
  travel.toggleFavorite('hotels', 1);
  const sub = travel.subscribe(subscription());
  const updated = { ...route(), id: saved.id, title: '修改后的线路', isFavorite: true };
  travel.saveRoute(updated);
  setActivePinia(createPinia());
  const reloaded = useTravelStore();
  assert.equal(reloaded.routes[0].title, '修改后的线路');
  assert.equal(reloaded.routes[0].days[0].activities[0].title, '故宫');
  assert.equal(reloaded.routes[0].isFavorite, true);
  assert.deepEqual([...reloaded.attractionFavorites], ['1']);
  assert.deepEqual([...reloaded.hotelFavorites], ['1']);
  assert.equal(reloaded.subscriptions[0].id, sub.id);
  assert.equal(reloaded.favoriteCount, 3);
});

test('account switches and logout clear displayed data and returning restores the original account', () => {
  const auth = useAuthStore();
  const travel = useTravelStore();
  travel.saveRoute(route());
  travel.toggleFavorite('hotels', 1);
  travel.subscribe(subscription());
  auth.login('13900139000', 'test-pass');
  assert.equal(travel.ownerId, ownerB);
  assert.equal(travel.routes.length, 0);
  assert.equal(travel.favoriteCount, 0);
  assert.equal(travel.subscriptions.length, 0);
  travel.saveRoute({ ...route(), title: '账号B线路' });
  auth.logout();
  assert.equal(travel.ownerId, '');
  assert.equal(travel.routes.length, 0);
  auth.login('13800138000', 'test-pass');
  assert.equal(travel.routes.length, 1);
  assert.equal(travel.routes[0].title, '我的线路');
  assert.equal(travel.subscriptions.length, 1);
  assert.equal(travel.hotelFavorites.length, 1);
});

test('duplicate subscriptions reuse their ID, but different product types remain independent', () => {
  const first = alerts.createSubscription(subscription());
  const repeated = alerts.createSubscription(subscription('hotel', '1'));
  assert.equal(first.id, repeated.id);
  alerts.createSubscription(subscription('attraction', 1));
  assert.equal(alerts.getAllSubscriptions().length, 2);
  alerts.updateSubscription(first.id, { active: false, id: 'replacement', type: 'ticket' });
  assert.equal(alerts.getAllSubscriptions()[0].active, false);
  assert.equal(alerts.getAllSubscriptions()[0].id, first.id);
  assert.equal(alerts.createSubscription(subscription()).id, first.id);
  alerts.deleteSubscription(first.id);
  assert.deepEqual(alerts.getAllSubscriptions().map(sub => sub.type), ['attraction']);
});

test('route deletion and removal of favorites survive reload without removing other data', () => {
  const travel = useTravelStore();
  const saved = travel.saveRoute(route());
  travel.toggleFavorite('hotels', 1);
  travel.toggleFavorite('hotels', '1');
  travel.subscribe(subscription());
  travel.deleteRoute(saved.id);
  travel.refresh();
  assert.equal(travel.routes.length, 0);
  assert.equal(travel.hotelFavorites.length, 0);
  assert.equal(travel.subscriptions.length, 1);
});

test('itinerary CRUD is scoped to the current account and IDs cannot be overwritten', () => {
  const saved = itineraries.createItinerary({ name: '北京行程', ...route(), budget: 1000 });
  itineraries.updateItinerary(saved.id, { name: '修改行程', id: 'replacement' });
  assert.equal(itineraries.getItinerary(saved.id).name, '修改行程');
  loginUser('13900139000', 'test-pass');
  assert.equal(itineraries.getAllItineraries().length, 0);
  assert.equal(itineraries.getItinerary(saved.id), undefined);
  itineraries.deleteItinerary(saved.id);
  loginUser('13800138000', 'test-pass');
  assert.equal(itineraries.getItinerary(saved.id).name, '修改行程');
  itineraries.deleteItinerary(saved.id);
  assert.equal(itineraries.getAllItineraries().length, 0);
});

test('unowned legacy records are preserved without being assigned to either account', () => {
  storage.set('price_subscriptions', JSON.stringify([subscription()]));
  storage.set('user_itineraries', JSON.stringify([{ id: 'old', name: '旧数据' }]));
  const before = [storage.get('price_subscriptions'), storage.get('user_itineraries')];
  assert.equal(repository.readUserData().subscriptions.length, 0);
  repository.toggleUserFavorite('hotels', 1);
  loginUser('13900139000', 'test-pass');
  assert.equal(repository.readUserData().itineraries.length, 0);
  assert.deepEqual([storage.get('price_subscriptions'), storage.get('user_itineraries')], before);
});

test('malformed, unknown-version or misowned data is retained and blocked from overwrite', () => {
  const key = repository.userDataKey(ownerA);
  const invalid = ['{broken', JSON.stringify({ ...repository.emptyUserData(ownerA), version: 2 }), JSON.stringify(repository.emptyUserData(ownerB)), JSON.stringify({ ...repository.emptyUserData(ownerA), routes: [{}] })];
  for (const raw of invalid) {
    storage.set(key, raw);
    assert.throws(() => repository.readUserData(), /原始记录已保留/);
    assert.throws(() => repository.toggleUserFavorite('hotels', 1));
    assert.equal(storage.get(key), raw);
  }
});

test('quota failure preserves disk and store data, with no successful optimistic update', () => {
  const travel = useTravelStore();
  travel.saveRoute(route());
  const before = storage.get(repository.userDataKey(ownerA));
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => travel.toggleFavorite('hotels', 1), /保存失败/);
  assert.equal(travel.hotelFavorites.length, 0);
  assert.equal(travel.routes.length, 1);
  assert.equal(storage.get(repository.userDataKey(ownerA)), before);
  assert.match(travel.storageError, /保存失败/);
});

test('pending account changes and stale draft owners cannot write across accounts', () => {
  const travel = useTravelStore();
  const original = travel.saveRoute(route());
  loginUser('13900139000', 'test-pass');
  assert.throws(() => travel.saveRoute(route(), ownerA), /账号已切换/);
  assert.throws(() => travel.toggleFavorite('hotels', 1), /账号已切换/);
  assert.equal(storage.has(repository.userDataKey(ownerB)), false);
  loginUser('13800138000', 'test-pass');
  assert.equal(repository.readUserData().routes[0].id, original.id);
  logout();
  assert.throws(() => repository.saveUserRoute(route()), /请先登录/);
});

test('commits merge against latest disk data and refresh picks up another tab changes', () => {
  const travel = useTravelStore();
  repository.toggleUserFavorite('hotels', 1);
  travel.saveRoute(route());
  assert.equal(travel.hotelFavorites.length, 1);
  repository.createUserSubscription(subscription());
  travel.refresh();
  assert.equal(travel.subscriptions.length, 1);
  assert.equal(travel.routes.length, 1);
});
