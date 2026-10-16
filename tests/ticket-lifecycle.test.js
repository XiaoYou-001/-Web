import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadView } from './helpers/vueView.js';
import { mountState } from './helpers/mountState.js';
import { FakeTimers } from './helpers/chat.js';

const Tickets = await loadView('TicketsView');
function page(t) {
  const timers = new FakeTimers();
  t.mock.method(globalThis, 'setTimeout', timers.setTimeout);
  t.mock.method(globalThis, 'clearTimeout', timers.clearTimeout);
  const mounted = mountState(Tickets);
  t.after(() => { mounted.unmount(); assert.equal(timers.jobs.size, 0); });
  return { ...mounted, timers };
}

test('reset cancels pending travel and scenic searches and ignores callbacks already queued', t => {
  const { state, timers } = page(t);
  state.searchTravel(); state.searchScenic();
  const stale = [...timers.jobs.values()].map(job => job.callback);
  state.resetTravelForm(); state.resetScenicForm();
  stale.forEach(callback => callback()); timers.advance(1000);
  assert.equal(timers.jobs.size, 0);
  assert.equal(state.isSearching.value, false);
  assert.equal(state.isScenicSearching.value, false);
  assert.equal(state.isSearched.value, false);
  assert.equal(state.isScenicSearched.value, false);
  assert.deepEqual(state.travelResults.value, []);
  assert.deepEqual(state.scenicResults.value, []);
});

test('a newer search replaces the old job and uses submitted criteria instead of edited drafts', t => {
  const { state, timers } = page(t);
  state.scenicSearch.value.city = '北京'; state.searchScenic();
  const stale = [...timers.jobs.values()][0].callback;
  state.scenicSearch.value.city = '杭州'; state.searchScenic();
  stale(); assert.equal(state.isScenicSearching.value, true);
  state.scenicSearch.value.city = '不存在';
  assert.equal(timers.jobs.size, 1);
  timers.advance(800);
  assert.equal(state.scenicResults.value.length, 1);
  assert.equal(state.scenicResults.value[0].city, '杭州');
  assert.equal(state.isScenicSearching.value, false);
});

test('unmount cancels both searches without writing results after leaving the page', t => {
  const { state, timers, unmount } = page(t);
  state.searchTravel(); state.searchScenic();
  const stale = [...timers.jobs.values()].map(job => job.callback);
  unmount(); stale.forEach(callback => callback());
  assert.equal(timers.jobs.size, 0);
  assert.equal(state.isSearched.value, false);
  assert.equal(state.isScenicSearched.value, false);
});
