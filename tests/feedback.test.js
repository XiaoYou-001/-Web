import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFeedbackService, feedback } from '../src/services/feedbackService.js';
import { useFeedback } from '../src/composables/useFeedback.js';
import { FakeTimers } from './helpers/chat.js';
import { mountState } from './helpers/mountState.js';
import { loadComponent, renderView } from './helpers/vueView.js';

test('notices deduplicate, stay bounded and release timers; errors remain until dismissed', () => {
  const timers = new FakeTimers(), service = createFeedbackService({ timers });
  service.success('已保存'); service.success('已保存');
  assert.equal(service.notices.value.length, 1);
  assert.equal(timers.jobs.size, 1);
  service.error('保存失败'); service.warning('请检查'); service.info('正在处理');
  assert.equal(service.notices.value.length, 3);
  assert.equal(timers.jobs.size, 2);
  timers.advance(5000);
  assert.deepEqual(service.notices.value.map(notice => notice.message), ['保存失败']);
  service.dismiss(service.notices.value[0].id);
  service.success('待清理'); service.reset();
  assert.equal(service.notices.value.length, 0);
  assert.equal(timers.jobs.size, 0);
});

test('confirmation is explicit, runs once and removes abort listeners on either outcome', async t => {
  const service = createFeedbackService();
  const controller = new AbortController();
  t.mock.method(controller.signal, 'removeEventListener');
  const first = service.confirm('删除线路？', { signal: controller.signal, danger: true });
  assert.equal(service.confirmation.value.message, '删除线路？');
  assert.equal(await service.confirm('重复点击'), false);
  service.settleConfirmation(true); service.settleConfirmation(true);
  assert.equal(await first, true);
  assert.equal(controller.signal.removeEventListener.mock.callCount(), 1);
  assert.equal(service.confirmation.value, null);
  controller.abort();
  assert.equal(await service.confirm('已取消', { signal: controller.signal }), false);
  const second = service.confirm('取消此操作');
  service.settleConfirmation(false);
  assert.equal(await second, false);
});

test('aborting the owner or resetting feedback resolves the pending action as cancelled', async () => {
  const service = createFeedbackService(), controller = new AbortController();
  const pending = service.confirm('待确认', { signal: controller.signal });
  controller.abort();
  assert.equal(await pending, false);
  assert.equal(service.confirmation.value, null);
  const next = service.confirm('另一个动作');
  service.reset();
  assert.equal(await next, false);
});

test('unmount cancels scoped confirmations and suppresses late notifications', async t => {
  feedback.reset(); t.after(() => feedback.reset());
  t.mock.method(feedback, 'success', () => {});
  const { state, unmount } = mountState({ setup: useFeedback });
  const pending = state.confirm('离开后不能执行');
  unmount();
  assert.equal(await pending, false);
  state.success('迟到的结果');
  assert.equal(feedback.success.mock.callCount(), 0);
  assert.equal(await state.confirm('卸载后的操作'), false);
});

test('feedback markup escapes untrusted text and exposes dialog labels and cancellation', async () => {
  const Host = await loadComponent('components/FeedbackHost.vue');
  const service = createFeedbackService();
  service.error('<img src=x onerror=alert(1)>');
  const pending = service.confirm('删除 <script> 数据？', { title: '删除线路', confirmLabel: '删除线路', danger: true });
  const html = await renderView(Host, { feedback: service, notices: service.notices, confirmation: service.confirmation,
    labels: { error: '错误' }, dialog: null, cancelButton: null, confirmButton: null, trapFocus: () => {} });
  assert.match(html, /role="alert"/);
  assert.match(html, /role="alertdialog"/);
  assert.match(html, /aria-labelledby="feedback-title"/);
  assert.match(html, /aria-describedby="feedback-description"/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /取消/);
  assert.ok(!html.includes('<script>'));
  service.reset(); await pending;
});
