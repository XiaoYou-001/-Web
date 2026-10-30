import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { routeLocationKey } from 'vue-router';
import { registerUser, loginUser } from '../src/services/authService.js';
import { saveUserRoute } from '../src/services/userDataService.js';
import { createViewState, loadView } from './helpers/vueView.js';

const Hotels = await loadView('HotelsView');
test('opening the booking dialog preserves the associated travel party size', async t => {
  const originalStorage = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
  t.after(() => { globalThis.localStorage = originalStorage; });
  registerUser('13800138001', 'test-pass');
  loginUser('13800138001', 'test-pass');
  setActivePinia(createPinia());
  const { result: trip } = saveUserRoute({ title: '三人旅行', startDate: '2030-06-01', endDate: '2030-06-03', persons: 3, themes: [], preferences: {} });
  const state = await createViewState(Hotels, [{ install(app) { app.provide(routeLocationKey, { query: { travel: trip.id } }); } }]);
  state.openBooking(state.paginatedHotels.value[0]);
  assert.equal(state.bookingOpen.value, true);
  assert.equal(state.bookingGuests.value, 3);
  state.bookingGuests.value = 1;
  state.closeBooking();
  state.openBooking(state.paginatedHotels.value[0]);
  assert.equal(state.bookingGuests.value, 3);
});
