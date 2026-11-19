import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { registerUser } from '../src/services/authService.js';
import { useAuthStore } from '../src/stores/auth.js';
import { ChatService, chatService } from '../src/services/chatService.js';
import { collaborationService } from '../src/services/collaborationService.js';
import { createOptionsView, loadView } from './helpers/vueView.js';
import { FakeTimers, FakeSocket } from './helpers/chat.js';
import { mockFeedback } from './helpers/feedback.js';

const Chat = await loadView('ChatView');
const originals = { localStorage: globalThis.localStorage };
let pinia, auth, timers, sockets, view;

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
  t.mock.method(globalThis, 'setTimeout', timers.setTimeout);
  t.mock.method(globalThis, 'clearTimeout', timers.clearTimeout);
  t.mock.method(chatService, 'createSocket', url => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  });
  t.mock.property(chatService, 'timers', timers);
  // 连接成功后的服务端历史补收由 chat-offline 测试覆盖，这里避免真实网络请求。
  t.mock.method(chatService, 'fetchHistory', async () => []);
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

test('chat service appends a trip token without changing the plain room URL', () => {
  const urls = [];
  const service = new ChatService({ createSocket: url => { urls.push(url); return new FakeSocket(url) }, timers });
  service.connect('成员', 'account-1', 'trip-abc', 'signed.token');
  const tripUrl = new URL(urls[0]);
  assert.equal(tripUrl.searchParams.get('roomId'), 'trip-abc');
  assert.equal(tripUrl.searchParams.get('token'), 'signed.token');

  service.disconnect();
  service.connect('成员', 'account-1', 'general');
  assert.equal(new URL(urls[1]).searchParams.has('token'), false);
});

test('trip room entry requests a server token and reuses it until expiry', async t => {
  t.mock.method(collaborationService, 'chatToken', async () => ({
    token: 'trip-token-1', roomId: 'trip-abc', expiresAt: Date.now() + 15 * 60 * 1000
  }));

  view = await createOptionsView(Chat, [pinia]);
  view.tripEntry = 'trip-abc';
  await view.enterTripRoomFromInput();

  assert.equal(view.currentRoom.id, 'trip-abc');
  assert.equal(view.currentRoom.name, '同行聊天室');
  assert.equal(sockets.length, 1);
  assert.equal(new URL(sockets[0].url).searchParams.get('token'), 'trip-token-1');
  assert.equal(view.tripRoomExpiresAt > Date.now(), true);

  await view.connectToChat('trip-abc');
  assert.equal(sockets.length, 1, '有效期内不重复申请令牌或重复连接');
  sockets[0].open();
  assert.equal(view.connected, true);
});

test('trip room token failure keeps an explicit retry state and never opens a socket', async t => {
  let attempts = 0;
  t.mock.method(collaborationService, 'chatToken', async () => {
    attempts++
    if (attempts === 1) throw new Error('请先在工作台连接协作身份')
    return { token: 'retry-token', roomId: 'trip-abc', expiresAt: Date.now() + 15 * 60 * 1000 }
  });

  view = await createOptionsView(Chat, [pinia]);
  view.tripEntry = 'trip-abc';
  await view.enterTripRoomFromInput();

  assert.equal(view.currentRoom.id, 'trip-abc');
  assert.match(view.chatError, /请先在工作台连接协作身份/)
  assert.equal(view.connectionState, 'offline');
  assert.equal(sockets.length, 0);

  view.manualReconnect();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(sockets.length, 1);
  assert.equal(new URL(sockets[0].url).searchParams.get('token'), 'retry-token');
});

test('invalid trip room input is rejected before any network request', async t => {
  const chatToken = t.mock.method(collaborationService, 'chatToken', async () => { throw new Error('should not be called') });
  view = await createOptionsView(Chat, [pinia]);
  view.tripEntry = 'bad room!';
  await view.enterTripRoomFromInput();
  assert.equal(chatToken.mock.callCount(), 0);
  assert.equal(view.currentRoom, null);
  assert.match(view.chatError, /有效的同行聊天室/)
});

test('a trip room query joins automatically and is named from the route', async t => {
  t.mock.method(collaborationService, 'chatToken', async () => ({
    token: 'query-token', roomId: 'trip-route1', expiresAt: Date.now() + 15 * 60 * 1000
  }));
  view = await createOptionsView(Chat, [pinia, {
    install(app) { app.config.globalProperties.$route = { query: { room: 'trip-route1', name: '杭州三日' } } }
  }]);
  view.enterRoomFromQuery();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(view.currentRoom.id, 'trip-route1');
  assert.equal(view.currentRoom.name, '杭州三日');
  assert.equal(sockets.length, 1);
});
