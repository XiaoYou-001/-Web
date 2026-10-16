import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { aiService } from '../src/services/aiService.js';
import { ApiError } from '../src/services/apiClient.js';
import { loadView, renderView } from './helpers/vueView.js';
import { mountState } from './helpers/mountState.js';
import { FakeTimers } from './helpers/chat.js';

const Customer = await loadView('CustomerServiceView');
const reply = text => ({ text, structuredInfo: { categories: ['hotel'], keyPoints: [] } });
let state, timers, unmount;
beforeEach(t => {
  timers = new FakeTimers();
  t.mock.method(globalThis, 'setTimeout', timers.setTimeout);
  t.mock.method(globalThis, 'clearTimeout', timers.clearTimeout);
  ({ state, unmount } = mountState(Customer));
  t.after(() => { unmount(); assert.equal(timers.jobs.size, 0); });
});
function startAI() { state.toggleAgentType(); timers.advance(500); }

test('sending from a click uses the text draft and prevents duplicate sends while waiting', async t => {
  startAI();
  let resolve;
  t.mock.method(aiService, 'sendMessage', () => new Promise(done => { resolve = done; }));
  state.messageInput.value = '  规划行程  ';
  state.sendMessage({ type: 'click' });
  state.sendMessage('重复请求');
  assert.equal(aiService.sendMessage.mock.callCount(), 1);
  assert.equal(aiService.sendMessage.mock.calls[0].arguments[0], '规划行程');
  assert.equal(state.isTyping.value, true);
  resolve(reply('真实返回'));
  await setImmediate();
  assert.equal(state.messages.value.at(-1).text, '真实返回');
  assert.equal(state.messages.value.at(-1).model, 'open-source-llm');
  assert.equal(state.isTyping.value, false);
});

test('sending immediately after switching agents does not append a delayed welcome after the reply', async t => {
  state.toggleAgentType();
  t.mock.method(aiService, 'sendMessage', async () => reply('立即回复'));
  state.sendMessage('快速提问');
  await setImmediate();
  timers.advance(500);
  assert.equal(state.messages.value.length, 2);
  assert.equal(state.messages.value[1].text, '立即回复');
});

test('switching agents cancels old requests and late replies cannot stop the new request', async t => {
  startAI();
  const pending = [];
  t.mock.method(aiService, 'sendMessage', (_message, options) => new Promise(resolve => pending.push({ resolve, signal: options.signal })));
  state.sendMessage('旧问题');
  state.toggleAgentType();
  assert.equal(pending[0].signal.aborted, true);
  state.toggleAgentType(); timers.advance(500);
  state.sendMessage('新问题');
  pending[0].resolve(reply('过期回复'));
  await setImmediate();
  assert.equal(state.isTyping.value, true);
  assert.ok(!state.messages.value.some(message => message.text === '过期回复'));
  pending[1].resolve(reply('新回复'));
  await setImmediate();
  assert.equal(state.messages.value.at(-1).text, '新回复');
  assert.equal(state.isTyping.value, false);
});

test('model changes and reset abort current work and suppress old errors', async t => {
  startAI();
  let reject, signal;
  t.mock.method(aiService, 'sendMessage', (_message, options) => { signal = options.signal; return new Promise((_resolve, fail) => { reject = fail; }); });
  state.sendMessage('旧模型问题');
  state.aiModel.value = 'qwen-turbo'; state.onModelChange();
  assert.equal(signal.aborted, true);
  reject(new ApiError('TIMEOUT'));
  await setImmediate();
  assert.ok(!state.messages.value.some(message => message.error));
  state.sendMessage('新模型问题');
  state.resetConversation();
  assert.equal(signal.aborted, true);
  reject(new ApiError('NETWORK'));
  await setImmediate();
  timers.advance(500);
  assert.equal(state.messages.value.length, 1);
  assert.match(state.messages.value[0].text, /Qwen-Turbo/);
});

test('transient errors render an alert and explicit retry reuses the original question', async t => {
  startAI();
  t.mock.method(aiService, 'sendMessage', async () => { throw new ApiError('RATE_LIMIT'); });
  state.sendMessage('能重试的问题');
  await setImmediate();
  const failure = state.messages.value.at(-1);
  assert.equal(failure.error, true);
  assert.equal(failure.retryable, true);
  assert.match(failure.text, /频繁/);
  assert.equal(state.isTyping.value, false);
  const html = await renderView(Customer, state);
  assert.match(html, /role="alert"/);
  assert.match(html, /重试/);
  t.mock.method(aiService, 'sendMessage', async message => { assert.equal(message, '能重试的问题'); return reply('已恢复'); });
  state.retryMessage(failure);
  await setImmediate();
  assert.equal(state.messages.value.at(-1).text, '已恢复');
  assert.equal(state.messages.value.filter(message => message.type === 'user').length, 1);
});

test('stopping and unmounting abort pending AI work without appending late replies', async t => {
  startAI();
  let resolve, signal;
  t.mock.method(aiService, 'sendMessage', (_message, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); });
  state.sendMessage('停止等待');
  state.stopReply();
  assert.equal(signal.aborted, true);
  resolve(reply('迟到'));
  await setImmediate();
  assert.ok(!state.messages.value.some(message => message.text === '迟到'));
  assert.equal(state.isTyping.value, false);
  state.sendMessage('离开页面');
  unmount(); unmount = () => {};
  assert.equal(signal.aborted, true);
  const length = state.messages.value.length;
  resolve(reply('卸载后回复'));
  await setImmediate();
  assert.equal(state.messages.value.length, length);
});

test('human reply timers are cancelled on switches, and oversized input retains its draft', () => {
  timers.advance(500);
  state.messageInput.value = '字'.repeat(2001);
  const before = state.messages.value.length;
  state.sendMessage();
  assert.equal(state.messages.value.length, before);
  assert.equal(state.messageInput.value.length, 2001);
  assert.match(state.inputError.value, /2000/);
  state.sendMessage('酒店问题');
  assert.equal(state.isTyping.value, true);
  state.toggleAgentType();
  timers.advance(2000);
  assert.equal(state.messages.value.length, 1);
  assert.equal(state.messages.value[0].agent, 'ai');
});
