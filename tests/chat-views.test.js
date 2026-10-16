import { mockFeedback } from './helpers/feedback.js';
import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { registerUser } from '../src/services/authService.js';
import { useAuthStore } from '../src/stores/auth.js';
import { chatService } from '../src/services/chatService.js';
import { createOptionsView, loadView } from './helpers/vueView.js';
import { FakeTimers, FakeSocket } from './helpers/chat.js';

const Chat = await loadView('ChatView');
const originals = { localStorage: globalThis.localStorage, confirm: globalThis.confirm };
let pinia, auth, storage, timers, sockets, view;

beforeEach(t => {
  storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
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
  assert.equal(timers.jobs.size, 0);
  Object.assign(globalThis, originals);
});

async function join() {
  view = await createOptionsView(Chat, [pinia]);
  view.joinRoom(view.chatRooms[0]);
  sockets.at(-1).open();
  return view;
}

function frame(id, content, extra = {}) {
  return { id, type: 'message', content, roomId: 'general', userId: 'peer', username: '同行者', timestamp: new Date().toISOString(), ...extra };
}

test('repeated connects and manual reconnects keep one listener; leaving disposes everything', async () => {
  await join();
  view.connectToChat('general');
  assert.equal(sockets.length, 1);
  for (let i = 0; i < 3; i++) { view.manualReconnect(); sockets.at(-1).open(); }
  assert.equal(chatService.messageHandlers.size, 1);
  assert.equal(chatService.connectHandlers.size, 1);
  sockets.at(-1).receive(frame('peer-1', 'one delivery'));
  assert.equal(view.messages.length, 1);
  Chat.beforeUnmount.call(view);
  assert.equal(chatService.messageHandlers.size, 0);
  assert.equal(view.currentRoom, null);
  assert.equal(timers.jobs.size, 0);
});

test('out-of-order own echoes merge by ID while equal content with different IDs remains visible', async () => {
  await join();
  view.newMessage = 'same';
  view.sendMessage();
  view.newMessage = 'same';
  view.sendMessage();
  const [first, second] = sockets[0].sent;
  assert.equal(view.messages[0].status, 'pending');
  assert.equal(JSON.parse(storage.get(view.historyKey('general')))[0].status, 'pending');
  sockets[0].receive({ ...second, timestamp: '2026-10-16T00:00:02Z' });
  sockets[0].receive(frame('between', 'other message'));
  sockets[0].receive({ ...first, timestamp: '2026-10-16T00:00:01Z' });
  sockets[0].receive(first);
  sockets[0].receive(frame('between', 'other message'));
  assert.equal(view.messages.length, 3);
  assert.equal(view.messages[0].id, first.id);
  assert.equal(view.messages[1].id, second.id);
  assert.equal(view.messages.filter(message => message.status === 'pending').length, 0);
  assert.equal(view.pendingTimers.size, 0);
});

test('unconfirmed messages retry with the original ID and only server echo confirms acceptance', async () => {
  await join();
  view.newMessage = 'retry safely';
  view.sendMessage();
  const original = sockets[0].sent[0];
  timers.advance(10000);
  assert.equal(view.messages[0].status, 'unconfirmed');
  view.retryMessage(view.messages[0]);
  assert.equal(sockets[0].sent[1].id, original.id);
  assert.equal(view.messages[0].status, 'pending');
  sockets[0].receive(original);
  assert.equal(view.messages.length, 1);
  assert.equal(view.messages[0].status, 'sent');
  assert.equal(view.pendingTimers.size, 0);
});

test('send failures retain the draft; disconnect marks outstanding messages as unconfirmed', async () => {
  await join();
  view.newMessage = 'first';
  view.sendMessage();
  sockets[0].failSend = true;
  view.newMessage = 'keep this draft';
  view.sendMessage();
  assert.equal(view.messages.length, 1);
  assert.equal(view.messages[0].status, 'unconfirmed');
  assert.equal(view.newMessage, 'keep this draft');
  assert.equal(view.connected, false);
  assert.match(view.chatError, /未发出/);
  assert.equal(view.pendingTimers.size, 0);
  assert.equal(JSON.parse(storage.get(view.historyKey('general')))[0].status, 'unconfirmed');
});

test('switching rooms suppresses delayed events and uses authoritative room presence counts', async () => {
  await join();
  const oldSocket = sockets[0];
  const delayed = oldSocket.onmessage;
  oldSocket.receive(frame('presence', 'joined', { type: 'join', onlineUsers: 7 }));
  assert.equal(view.onlineUsers, 7);
  view.joinRoom(view.chatRooms[2]);
  const socket = sockets.at(-1);
  socket.open();
  delayed({ data: JSON.stringify(frame('stale', 'late old room')) });
  socket.receive(frame('foreign', 'wrong room'));
  socket.receive(frame('food-join', 'joined', { roomId: 'food', type: 'join', onlineUsers: 2 }));
  assert.equal(view.onlineUsers, 2);
  assert.equal(view.messages.length, 1);
  assert.equal(view.messages[0].roomId, 'food');
  assert.equal(JSON.parse(storage.get(view.historyKey('general')))[0].id, 'presence');
});

test('account switch saves outstanding history under its original owner and closes the room', async () => {
  await join();
  const owner = auth.user.id;
  view.newMessage = 'A only';
  view.sendMessage();
  view.newMessage = 'private unsent draft';
  registerUser('13900139000', 'pass-1234');
  auth.login('13900139000', 'pass-1234');
  // SSR 不调度 Options API 的 watch，显式触发真实页面的账号切换回调。
  Chat.watch.userId.call(view, auth.user.id, owner);
  await nextTick();
  assert.equal(view.currentRoom, null);
  assert.equal(view.messages.length, 0);
  assert.equal(view.newMessage, '');
  assert.equal(JSON.parse(storage.get(`chat_history_${owner}_general`))[0].content, 'A only');
  assert.equal(storage.has(`chat_history_${auth.user.id}_general`), false);
  assert.equal(chatService.messageHandlers.size, 0);
});

test('reload recovers pending history as unconfirmed and bounds retained history to 100 entries', async () => {
  const key = `chat_history_${auth.user.id}_general`;
  storage.set(key, JSON.stringify(Array.from({ length: 110 }, (_, i) => frame(`old-${i}`, `message ${i}`, { status: 'pending', userId: auth.user.id }))));
  await join();
  assert.equal(view.messages.length, 100);
  assert.equal(view.messages[0].id, 'old-10');
  assert.equal(view.messages[0].status, 'unconfirmed');
  sockets[0].receive(frame('new', 'new message'));
  assert.equal(view.messages.length, 100);
  assert.equal(JSON.parse(storage.get(key)).length, 100);
  assert.equal(view.loadedHistoryCount, 100);
});

test('corrupt history is preserved through presence updates until the user clears it', async () => {
  const key = `chat_history_${auth.user.id}_general`;
  storage.set(key, '{broken');
  await join();
  sockets[0].receive(frame('join', 'joined', { type: 'join', onlineUsers: 1 }));
  assert.equal(storage.get(key), '{broken');
  assert.match(view.chatError, /原始记录已保留/);
  await view.clearHistory();
  assert.equal(view.chatError, '');
  sockets[0].receive(frame('fresh', 'new message'));
  assert.equal(JSON.parse(storage.get(key))[0].id, 'fresh');
});

test('clearing history while a message is pending does not restore it when its echo arrives', async () => {
  await join();
  view.newMessage = 'clear before acknowledgement';
  view.sendMessage();
  const echo = sockets[0].sent[0];
  await view.clearHistory();
  sockets[0].receive(echo);
  assert.equal(view.messages.length, 0);
  assert.equal(storage.has(view.historyKey('general')), false);
  assert.equal(view.pendingTimers.size, 0);
});

test('server rejection leaves a retryable message and oversized drafts are not submitted', async () => {
  await join();
  view.newMessage = '字'.repeat(2001);
  view.sendMessage();
  assert.equal(sockets[0].sent.length, 0);
  assert.match(view.chatError, /2000/);
  view.newMessage = 'valid';
  view.sendMessage();
  sockets[0].receive({ type: 'error', roomId: 'general', id: view.messages[0].id, content: 'rejected' });
  assert.equal(view.messages[0].status, 'unconfirmed');
  assert.equal(view.pendingTimers.size, 0);
  assert.equal(view.chatError, 'rejected');
});
