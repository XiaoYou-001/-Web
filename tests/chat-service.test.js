import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatService } from '../src/services/chatService.js';
import { FakeTimers, FakeSocket } from './helpers/chat.js';

function fixture(t) {
  const timers = new FakeTimers();
  const sockets = [];
  const service = new ChatService({ timers, endpoint: 'wss://chat.example/ws', createSocket: url => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  } });
  t.after(() => service.disconnect());
  return { service, timers, sockets };
}

test('chat connects once per identity/room and subscriptions can be removed', t => {
  const { service, sockets } = fixture(t);
  let received = 0;
  const handler = () => received++;
  const unsubscribe = service.onMessage(handler);
  service.onMessage(handler);
  service.connect('旅行者', 'user-a', 'food');
  service.connect('旅行者', 'user-a', 'food');
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url.protocol, 'wss:');
  assert.equal(sockets[0].url.searchParams.get('username'), '旅行者');
  assert.equal(sockets[0].url.searchParams.get('roomId'), 'food');
  sockets[0].open();
  sockets[0].receive({ type: 'message', roomId: 'food' });
  unsubscribe();
  sockets[0].receive({ type: 'message', roomId: 'food' });
  assert.equal(received, 1);
});

test('room/account changes close the old socket and ignore captured stale events', t => {
  const { service, sockets } = fixture(t);
  const messages = [];
  service.onMessage(message => messages.push(message));
  service.connect('A', 'a', 'general');
  sockets[0].open();
  const staleMessage = sockets[0].onmessage;
  const staleClose = sockets[0].onclose;
  service.connect('B', 'b', 'food');
  assert.equal(sockets[0].readyState, 3);
  sockets[1].open();
  staleMessage({ data: JSON.stringify({ type: 'message', roomId: 'food' }) });
  staleClose();
  sockets[1].onmessage({ data: '{broken' });
  sockets[1].receive({ type: 'message', roomId: 'general' });
  sockets[1].receive({ type: 'unknown', roomId: 'food' });
  sockets[1].receive({ type: 'message', roomId: 'food', content: 'current' });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].content, 'current');
  assert.equal(service.state, 'connected');
  assert.equal(sockets[1].url.searchParams.get('userId'), 'b');
});

test('socket errors without a close event use one bounded exponential retry sequence', t => {
  const { service, timers, sockets } = fixture(t);
  service.connect('A', 'a');
  for (let attempt = 0; attempt <= service.maxReconnectAttempts; attempt++) {
    const socket = sockets.at(-1);
    const staleClose = socket.onclose;
    socket.fail();
    staleClose();
    assert.equal(socket.readyState, 3);
    if (attempt === service.maxReconnectAttempts) break;
    const delay = Math.min(1000 * 2 ** attempt, 30000);
    assert.equal(timers.jobs.size, 1);
    timers.advance(delay - 1);
    assert.equal(sockets.length, attempt + 1);
    timers.advance(1);
    assert.equal(sockets.length, attempt + 2);
  }
  assert.equal(service.state, 'offline');
  assert.equal(timers.jobs.size, 0);
});

test('connection timeout recovers and a successful connection resets the retry delay', t => {
  const { service, timers, sockets } = fixture(t);
  service.connect('A', 'a');
  timers.advance(10000);
  assert.equal(service.state, 'reconnecting');
  timers.advance(1000);
  sockets[1].open();
  assert.equal(service.isConnected(), true);
  assert.equal(service.reconnectAttempts, 0);
  sockets[1].fail();
  timers.advance(1000);
  assert.equal(sockets.length, 3);
});

test('valid room heartbeat replies keep the socket alive; missing replies trigger recovery', t => {
  const { service, timers, sockets } = fixture(t);
  let messages = 0;
  service.onMessage(() => messages++);
  service.connect('A', 'a', 'food');
  const socket = sockets[0];
  socket.open();
  for (let i = 0; i < 5; i++) {
    timers.advance(15000);
    socket.receive({ type: 'pong', roomId: 'food' });
  }
  assert.equal(service.isConnected(), true);
  assert.equal(messages, 0);
  assert.deepEqual(socket.sent[0], { type: 'ping', roomId: 'food' });
  timers.advance(60000);
  assert.equal(service.state, 'reconnecting');
  assert.equal(socket.readyState, 3);
});

test('manual reconnect preserves listeners, opens once and disconnect cancels all pending work', t => {
  const { service, timers, sockets } = fixture(t);
  let received = 0;
  service.onMessage(() => received++);
  service.connect('A', 'a');
  sockets[0].open();
  service.reconnect();
  assert.equal(sockets.length, 2);
  sockets[1].open();
  sockets[1].receive({ type: 'message', roomId: 'general' });
  assert.equal(received, 1);
  sockets[1].fail();
  service.disconnect();
  timers.advance(300000);
  assert.equal(sockets.length, 2);
  assert.equal(timers.jobs.size, 0);
  assert.equal(service.messageHandlers.size, 0);
  assert.equal(service.state, 'idle');
});

test('sending enforces current connection identity and reports validation/socket failures', t => {
  const { service, sockets } = fixture(t);
  assert.equal(service.sendMessage({ content: 'offline' }), false);
  service.connect('A', 'a', 'food');
  const socket = sockets[0];
  socket.open();
  assert.equal(service.sendMessage({ content: ' ' }), false);
  assert.equal(service.sendMessage({ content: '字'.repeat(2001) }), false);
  assert.equal(service.sendMessage({ id: 'stable', content: '😀'.repeat(2000), roomId: 'general', userId: 'forged' }), true);
  assert.equal(socket.sent[0].id, 'stable');
  assert.equal(socket.sent[0].roomId, 'food');
  assert.equal(socket.sent[0].userId, 'a');
  socket.failSend = true;
  assert.equal(service.sendMessage({ content: 'failed' }), false);
  assert.equal(service.state, 'reconnecting');
});

test('constructor failures stop after the configured retry budget', t => {
  const timers = new FakeTimers();
  let attempts = 0;
  const service = new ChatService({ timers, endpoint: 'ws://localhost/ws', createSocket: () => { attempts++; throw new Error('unavailable'); } });
  t.after(() => service.disconnect());
  service.maxReconnectAttempts = 2;
  service.connect('A', 'a');
  timers.advance(3000);
  assert.equal(attempts, 3);
  assert.equal(service.state, 'offline');
  assert.equal(timers.jobs.size, 0);
});
