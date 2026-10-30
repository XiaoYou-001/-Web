import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeLocationKey } from 'vue-router';
import { createViewState, loadView, renderView } from './helpers/vueView.js';
import { mockFeedback } from './helpers/feedback.js';
import itineraryService from '../src/services/itineraryService.js';
import chatViewModel from '../src/views/chatViewModel.js';
import { feedback } from '../src/services/feedbackService.js';

const Share = await loadView('ItineraryShareView');
const routePlugin = { install(app) { app.provide(routeLocationKey, { params: { id: 'legacy-test' } }); } };
const plan = { name: '北京旧行程', startDate: '2026-10-30', endDate: '2026-10-30', budget: 0, days: [{ date: '2026-10-30', activities: [{ title: '故宫', time: '09:00' }] }] };

function setClipboard(t, clipboard) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  });
}

for (const mode of ['unavailable', 'denied']) {
  test(`legacy plan clipboard ${mode} exposes the complete plan for manual copying without claiming success`, async t => {
    mockFeedback(t);
    setClipboard(t, mode === 'denied' ? { writeText: async () => { throw new Error('denied'); } } : undefined);
    const state = await createViewState(Share, [routePlugin]);
    state.itinerary.value = plan;
    const focused = [];
    state.copyField.value = { focus: () => focused.push('focus'), select: () => focused.push('select') };
    await state.copyPlan();
    assert.match(state.manualCopyText.value, /故宫/);
    assert.doesNotMatch(state.manualCopyText.value, /undefined/);
    assert.deepEqual(focused, ['focus', 'select']);
    assert.equal(feedback.success.mock.callCount(), 0);
    const html = await renderView(Share, state);
    assert.match(html, /<textarea[^>]*readonly/);
    assert.match(html, /故宫/);
    assert.match(html, /不是公开分享链接/);
  });
}

test('successful clipboard retry removes manual-copy fallback and reports success once', async t => {
  mockFeedback(t);
  const copied = [];
  setClipboard(t, { writeText: async text => copied.push(text) });
  const state = await createViewState(Share, [routePlugin]);
  state.itinerary.value = plan;
  state.manualCopyText.value = 'previous fallback';
  await state.copyPlan();
  assert.equal(state.manualCopyText.value, '');
  assert.match(copied[0], /北京旧行程/);
  assert.equal(feedback.success.mock.callCount(), 1);
});

test('legacy plan read failure stays distinct from missing records and can be retried', async t => {
  mockFeedback(t);
  let outcome = 'error';
  t.mock.method(itineraryService, 'getItinerary', () => {
    if (outcome === 'error') throw new Error('storage unavailable');
    return outcome === 'found' ? plan : undefined;
  });
  const state = await createViewState(Share, [routePlugin]);
  state.loadItinerary();
  assert.match(state.readError.value, /无法读取/);
  assert.equal(state.notFound.value, false);
  outcome = 'missing';
  state.loadItinerary();
  assert.equal(state.readError.value, '');
  assert.equal(state.notFound.value, true);
  outcome = 'found';
  state.loadItinerary();
  assert.equal(state.notFound.value, false);
  assert.equal(state.itinerary.value.name, plan.name);
});

test('chat copy failure provides actionable inline feedback and clears on a successful retry', async t => {
  setClipboard(t, { writeText: async () => { throw new Error('denied'); } });
  const state = { chatError: '' };
  assert.equal(await chatViewModel.methods.copyMessage.call(state, { content: '旅行安排' }), false);
  assert.match(state.chatError, /手动复制/);
  globalThis.navigator.clipboard.writeText = async () => {};
  assert.equal(await chatViewModel.methods.copyMessage.call(state, { content: '旅行安排' }), true);
  assert.equal(state.chatError, '');
});

test('confirming Chinese input cannot prematurely send a chat message', () => {
  let sent = 0, prevented = 0;
  const context = { sendMessage() { sent += 1; } };
  const handler = chatViewModel.methods.handleMessageEnter;
  const preventDefault = () => { prevented += 1; };
  handler.call(context, { isComposing: true, keyCode: 13, preventDefault });
  handler.call(context, { isComposing: false, keyCode: 229, preventDefault });
  assert.equal(sent, 0);
  assert.equal(prevented, 0);
  handler.call(context, { isComposing: false, keyCode: 13, preventDefault });
  assert.equal(sent, 1);
  assert.equal(prevented, 1);
});
