import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { registerUser } from '../src/services/authService.js';
import { useAuthStore } from '../src/stores/auth.js';
import { ChatService, chatService } from '../src/services/chatService.js';
import { createOptionsView, loadView } from './helpers/vueView.js';
import { FakeTimers, FakeSocket } from './helpers/chat.js';
import { mockFeedback } from './helpers/feedback.js';

const Chat = await loadView('ChatView');
const originals = { localStorage: globalThis.localStorage };
let pinia, auth, timers, sockets, view, historyBatches;

const flush = async (rounds = 8) => {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
};

beforeEach(t => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  mockFeedback(t);
  timers = new FakeTimers();
  sockets = [];
  historyBatches = [];
  t.mock.method(globalThis, 'setTimeout', timers.setTimeout);
  t.mock.method(globalThis, 'clearTimeout', timers.clearTimeout);
  t.mock.method(chatService, 'createSocket', url => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  });
  // 默认不访问真实网络；需要补收时由用例推入批次。
  t.mock.method(chatService, 'fetchHistory', async () => historyBatches.shift() || []);
  t.mock.property(chatService, 'timers', timers);
  pinia = createPinia();
  setActivePinia(pinia);
  auth = useAuthStore();
  registerUser('13800138000', 'pass-1234');
  auth.login('13800138000', 'pass-1234');
});

afterEach(() => {
  view?.leaveRoom();
  view = null;
  chatService.disconnect();
  Object.assign(globalThis, originals);
});

test('history fetch sends the room, cursor, token and filters unrelated rooms', async () => {
  const calls = [];
  const service = new ChatService({
    createSocket: url => new FakeSocket(url),
    timers,
    httpEndpoint: 'http://chat.local/history',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messages: [
            { id: 'm1', roomId: 'trip-abc' },
            { id: 'other-room', roomId: 'food' }
          ]
        })
      };
    }
  });

  const messages = await service.fetchHistory({ roomId: 'trip-abc', token: 'signed-token', afterId: 'm0', limit: 20 });
  const requested = new URL(calls[0].url);
  assert.equal(requested.origin + requested.pathname, 'http://chat.local/history');
  assert.equal(requested.searchParams.get('roomId'), 'trip-abc');
  assert.equal(requested.searchParams.get('afterId'), 'm0');
  assert.equal(requested.searchParams.get('limit'), '20');
  assert.equal(requested.searchParams.get('token'), 'signed-token');
  assert.deepEqual(messages.map(message => message.id), ['m1']);
});

test('history fetch surfaces HTTP failures and malformed payloads', async () => {
  const failing = new ChatService({
    createSocket: url => new FakeSocket(url),
    timers,
    httpEndpoint: 'http://chat.local/history',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) })
  });
  await assert.rejects(
    () => failing.fetchHistory({ roomId: 'general' }),
    error => error.status === 503 && /聊天记录读取失败/.test(error.message)
  );

  const malformed = new ChatService({
    createSocket: url => new FakeSocket(url),
    timers,
    httpEndpoint: 'http://chat.local/history',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ messages: 'nope' }) })
  });
  await assert.rejects(() => malformed.fetchHistory({ roomId: 'general' }), /聊天记录格式不正确/);
});

test('reconnecting pulls missed messages from server history and merges them in order', async () => {
  view = await createOptionsView(Chat, [pinia]);
  await view.joinRoom({ id: 'general', name: '综合交流' });
  sockets[0].open();
  await flush();

  historyBatches.push([
    { id: 'srv-2', type: 'message', roomId: 'general', content: '第二条', username: '同行人', userId: 'other', timestamp: '2026-11-17T10:02:00.000Z' },
    { id: 'srv-1', type: 'message', roomId: 'general', content: '第一条', username: '同行人', userId: 'other', timestamp: '2026-11-17T10:01:00.000Z' },
    { id: 'srv-3', type: 'message', roomId: 'general', content: '我发的', username: view.username, userId: view.userId, timestamp: '2026-11-17T10:03:00.000Z' }
  ]);
  const added = await view.restoreFromServer({ initial: true });

  assert.equal(added, 3);
  assert.deepEqual(view.messages.map(message => message.id), ['srv-1', 'srv-2', 'srv-3']);
  assert.equal(view.messages.every(message => message.status === 'sent'), true);
  assert.equal(view.loadedHistoryCount, 3);
  assert.equal(view.historyLoaded, true);
  assert.match(view.replayNotice, /已从服务器加载 3 条历史消息/);
  const saved = JSON.parse(localStorage.getItem(`chat_history_${view.userId}_general`));
  assert.deepEqual(saved.map(message => message.id), ['srv-1', 'srv-2', 'srv-3']);
});

test('restore only requests messages after the last confirmed cursor', async () => {
  view = await createOptionsView(Chat, [pinia]);
  await view.joinRoom({ id: 'general', name: '综合交流' });
  sockets[0].open();
  await flush();
  view.messages.push({
    id: 'srv-9', type: 'message', roomId: 'general', content: '已确认',
    username: view.username, userId: view.userId, timestamp: '2026-11-17T10:09:00.000Z', status: 'sent'
  });

  const requested = [];
  chatService.fetchHistory.mock.mockImplementation(async options => {
    requested.push(options);
    return options.afterId === 'srv-9'
      ? [{ id: 'srv-10', type: 'message', roomId: 'general', content: '补收一条', username: '同行人', userId: 'other', timestamp: '2026-11-17T10:10:00.000Z' }]
      : [];
  });
  const added = await view.restoreFromServer();

  assert.equal(added, 1);
  assert.equal(requested[0].afterId, 'srv-9');
  assert.match(view.replayNotice, /已补收 1 条消息/);
});

test('unconfirmed outgoing messages are resent automatically after reconnect, with a retry cap', async () => {
  view = await createOptionsView(Chat, [pinia]);
  await view.joinRoom({ id: 'general', name: '综合交流' });
  sockets[0].open();
  await flush();

  const pending = {
    id: 'local-pending-1', type: 'message', roomId: 'general', content: '离线时没发出去',
    username: view.username, userId: view.userId, timestamp: '2026-11-17T10:11:00.000Z', status: 'unconfirmed'
  };
  view.messages.push(pending);

  assert.equal(view.autoResendPending(), 1);
  assert.equal(sockets[0].sent.at(-1).id, 'local-pending-1');
  assert.equal(pending.status, 'pending');
  assert.match(view.replayNotice, /已自动重发 1 条未确认消息/);
  assert.equal(pending.autoRetries, 1);

  // 连接仍在但回执未到时不重复发送。
  assert.equal(view.autoResendPending(), 0);

  pending.status = 'unconfirmed';
  view.autoResendPending();
  pending.status = 'unconfirmed';
  view.autoResendPending();
  assert.equal(pending.autoRetries, 3);
  pending.status = 'unconfirmed';
  assert.equal(view.autoResendPending(), 0, '达到上限后保留手动重发');
});

test('auto resend skips other users and confirmed messages', async () => {
  view = await createOptionsView(Chat, [pinia]);
  await view.joinRoom({ id: 'general', name: '综合交流' });
  sockets[0].open();
  await flush();

  view.messages.push(
    { id: 'other-pending', type: 'message', roomId: 'general', content: '别人的', username: '同行人', userId: 'other', status: 'unconfirmed' },
    { id: 'mine-sent', type: 'message', roomId: 'general', content: '已送达', username: view.username, userId: view.userId, status: 'sent' }
  );
  assert.equal(view.autoResendPending(), 0);
  assert.equal(sockets[0].sent.some(message => message.id === 'other-pending'), false);
});

test('browser offline stops retries until the online event reconnects', () => {
  const listener = { offline: [], online: [] };
  const target = {
    navigator: { onLine: true },
    addEventListener: (name, handler) => { if (listener[name]) listener[name].push(handler) },
    removeEventListener: () => {}
  };
  const service = new ChatService({
    createSocket: url => { const socket = new FakeSocket(url); sockets.push(socket); return socket },
    timers,
    listenerTarget: target,
    httpEndpoint: 'http://chat.local/history'
  });

  service.connect('成员', 'account-1', 'general');
  assert.equal(listener.offline.length, 1);
  sockets[0].open();
  assert.equal(service.isConnected(), true);

  listener.offline[0]();
  assert.equal(service.state, 'reconnecting');
  timers.advance(5000);
  assert.equal(sockets.length, 1, '离线期间不再发起重连');

  listener.online[0]();
  assert.equal(sockets.length, 2);
  service.disconnect();
});
