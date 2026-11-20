import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COLLAB_SESSION_PREFIX,
  COLLAB_TRIP_PREFIX,
  clearTripBinding,
  collabSessionKey,
  collabTripKey,
  createCollaborationService,
  readCollabSession,
  readTripBinding,
  writeTripBinding
} from '../src/services/collaborationService.js';
import { ApiError } from '../src/services/apiClient.js';

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fakeServer(handler) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const call = { url, method: options.method || 'GET', headers: options.headers || {}, body: options.body ? JSON.parse(options.body) : undefined };
    calls.push(call);
    return handler(call);
  };
  return { calls, fetchImpl };
}

const session = (patch = {}) => ({
  token: 't'.repeat(64),
  expiresAt: Date.now() + 60_000,
  user: { id: 'server-user-1', phone: '13800138000', nickname: '组织者' },
  ...patch
});

test('session keys are account scoped and expired tokens are discarded', () => {
  const storage = memoryStorage();
  assert.equal(collabSessionKey('local-a'), `${COLLAB_SESSION_PREFIX}local-a`);
  const now = 1_000_000;
  storage.setItem(collabSessionKey('local-a'), JSON.stringify(session({ expiresAt: now - 1 })));
  assert.equal(readCollabSession('local-a', { storage, now }), null);
  assert.equal(storage.getItem(collabSessionKey('local-a')), null);

  storage.setItem(collabSessionKey('local-a'), JSON.stringify(session({ expiresAt: now + 1 })));
  assert.equal(readCollabSession('local-a', { storage, now }).user.nickname, '组织者');
  assert.equal(readCollabSession('local-b', { storage, now }), null);
});

test('bind registers the server account first and logs in when the phone already exists', async () => {
  const storage = memoryStorage();
  const { calls, fetchImpl } = fakeServer(call => {
    if (call.url.endsWith('/auth/register')) {
      if (call.body.phone === '13900139000') return jsonResponse({ code: 'ACCOUNT_EXISTS', error: '该手机号已创建协作账号' }, 409);
      return jsonResponse({ ...session(), token: 'r'.repeat(64) }, 201);
    }
    if (call.url.endsWith('/auth/login')) return jsonResponse({ ...session(), token: 'l'.repeat(64) });
    if (call.url.endsWith('/auth/me') && call.method === 'PATCH') {
      return jsonResponse({ user: { ...session().user, nickname: '旅行组织者' } });
    }
    throw new Error(`unexpected ${call.method} ${call.url}`);
  });
  const service = createCollaborationService({ fetchImpl, storage, baseUrl: '/api' });

  const bound = await service.bind('local-a', { phone: '13800138000', password: 'pass-1234', nickname: '旅行组织者' });
  assert.equal(bound.token, 'r'.repeat(64));
  assert.equal(bound.user.nickname, '旅行组织者');
  assert.equal(service.session('local-a').token, 'r'.repeat(64));
  assert.equal(service.session('local-b'), null);
  assert.equal(calls[0].url.endsWith('/auth/register'), true);
  assert.equal(calls[0].body.phone, '13800138000');
  assert.equal(calls[1].headers['X-Travel-Authorization'], `Bearer ${'r'.repeat(64)}`);

  // 手机号已存在：注册返回 ACCOUNT_EXISTS 后改用登录，令牌来自登录响应。
  const again = await service.bind('local-b', { phone: '13900139000', password: 'pass-1234' });
  assert.equal(again.token, 'l'.repeat(64));
  assert.equal(calls.at(-1).url.endsWith('/auth/login'), true);
});

test('wrong password is surfaced and never creates a second account', async () => {
  const storage = memoryStorage();
  const { calls, fetchImpl } = fakeServer(call => {
    if (call.url.endsWith('/auth/register')) return jsonResponse({ code: 'ACCOUNT_EXISTS', error: '该手机号已创建协作账号' }, 409);
    assert.equal(call.url.endsWith('/auth/login'), true);
    return jsonResponse({ code: 'INVALID_CREDENTIALS', error: '手机号或密码错误' }, 401);
  });
  const service = createCollaborationService({ fetchImpl, storage, baseUrl: '/api' });
  await assert.rejects(
    service.bind('local-a', { phone: '13800138000', password: 'wrong-pass' }),
    error => error instanceof ApiError && error.code === 'INVALID_CREDENTIALS' && /手机号或密码错误/.test(error.message)
  );
  // 已存在的手机号只走“注册冲突 → 登录”，绝不会二次注册出新账号。
  assert.deepEqual(calls.map(call => call.url.split('/auth/')[1]), ['register', 'login']);
  assert.equal(service.session('local-a'), null);
});

test('restore validates the server session and clears a rejected token', async () => {
  const storage = memoryStorage();
  storage.setItem(collabSessionKey('local-a'), JSON.stringify(session()));
  const valid = createCollaborationService({
    storage,
    fetchImpl: async () => jsonResponse({ user: session().user })
  });
  const restored = await valid.restore('local-a');
  assert.equal(restored.user.id, 'server-user-1');

  const rejected = createCollaborationService({
    storage,
    fetchImpl: async () => jsonResponse({ code: 'AUTH_REQUIRED', error: '登录状态已失效' }, 401)
  });
  assert.equal(await rejected.restore('local-a'), null);
  assert.equal(storage.getItem(collabSessionKey('local-a')), null);
});

test('trip calls attach the owner token, preserve server messages and treat a missing space as empty', async () => {
  const storage = memoryStorage();
  storage.setItem(collabSessionKey('owner'), JSON.stringify(session()));
  const { calls, fetchImpl } = fakeServer(call => {
    if (call.url.includes('/trips/route-1') && call.method === 'GET') {
      return jsonResponse({ trip: { id: 'route-1', title: '杭州三日', version: 3, myRole: 'owner' } });
    }
    if (call.url.includes('/trips/missing') && call.method === 'GET') {
      return jsonResponse({ code: 'NOT_FOUND', error: '旅行协作空间不存在' }, 404);
    }
    if (call.url.includes('/chat-token')) {
      return jsonResponse({ token: 'payload.signature', roomId: 'trip-route-1', expiresAt: Date.now() + 1000 });
    }
    if (call.url.includes('/votes')) {
      return jsonResponse({ code: 'FORBIDDEN', error: '只读成员不能修改协商内容' }, 403);
    }
    throw new Error(`unexpected ${call.method} ${call.url}`);
  });
  const service = createCollaborationService({ fetchImpl, storage, baseUrl: '/api' });

  const trip = await service.getTrip('owner', 'route-1');
  assert.equal(trip.version, 3);
  assert.equal(calls[0].headers['X-Travel-Authorization'], `Bearer ${'t'.repeat(64)}`);

  assert.equal(await service.getTrip('owner', 'missing'), null);
  const chat = await service.chatToken('owner', 'route-1');
  assert.equal(chat.roomId, 'trip-route-1');

  await assert.rejects(
    service.vote('owner', 'route-1', 'c1', 'support'),
    error => error instanceof ApiError && error.code === 'FORBIDDEN' && /只读成员/.test(error.message)
  );
});

test('trip binding is scoped by local account and local trip id', () => {
  const storage = memoryStorage();
  assert.equal(collabTripKey('local-a', 'route-1'), `${COLLAB_TRIP_PREFIX}local-a:route-1`);
  assert.equal(readTripBinding('local-a', 'route-1', { storage }), '');

  assert.equal(writeTripBinding('local-a', 'route-1', 'server-trip-9', { storage }), true);
  assert.equal(readTripBinding('local-a', 'route-1', { storage }), 'server-trip-9');
  // 其它账号、其它本机旅行都不受影响。
  assert.equal(readTripBinding('local-b', 'route-1', { storage }), '');
  assert.equal(readTripBinding('local-a', 'route-2', { storage }), '');

  clearTripBinding('local-a', 'route-1', { storage });
  assert.equal(readTripBinding('local-a', 'route-1', { storage }), '');
  // 存储不可用时读取为空、写入返回 false，不抛异常。
  assert.equal(readTripBinding('local-a', 'route-1', { storage: null }), '');
  assert.equal(writeTripBinding('local-a', 'route-1', 'server-trip-9', { storage: { setItem() { throw new Error('quota'); } } }), false);
});

test('joining with a different local trip id keeps the shared space reachable and leaving clears the binding', async () => {
  const storage = memoryStorage();
  storage.setItem(collabSessionKey('member'), JSON.stringify(session({ user: { id: 'server-user-2', phone: '13700137000', nickname: '同行人' } })));
  const { calls, fetchImpl } = fakeServer(call => {
    if (call.url.endsWith('/invites/accept')) {
      return jsonResponse({ trip: { id: 'server-trip-9', title: '杭州三日', myRole: 'editor' } });
    }
    if (call.url.includes('/trips/server-trip-9/leave')) return jsonResponse({ ok: true });
    if (call.url.includes('/trips/server-trip-9')) {
      return jsonResponse({ trip: { id: 'server-trip-9', title: '杭州三日', myRole: 'editor' } });
    }
    if (call.url.includes('/trips/local-route-7')) {
      return jsonResponse({ code: 'NOT_FOUND', error: '旅行协作空间不存在' }, 404);
    }
    throw new Error(`unexpected ${call.method} ${call.url}`);
  });
  const service = createCollaborationService({ fetchImpl, storage, baseUrl: '/api' });

  const trip = await service.acceptInvite('member', 'INVITE-CODE', { localTripId: 'local-route-7' });
  assert.equal(trip.id, 'server-trip-9');
  assert.equal(readTripBinding('member', 'local-route-7', { storage }), 'server-trip-9');
  // 绑定按账号隔离：组织者账号或别的本机旅行不会被带上。
  assert.equal(readTripBinding('owner', 'local-route-7', { storage }), '');

  // 刷新/轮询用本机旅行 id 也能落到组织者的空间上。
  const refreshed = await service.getTrip('member', 'local-route-7');
  assert.equal(refreshed.id, 'server-trip-9');
  assert.equal(calls.at(-1).url.includes('/trips/server-trip-9'), true);

  await service.leaveTrip('member', 'local-route-7');
  assert.equal(calls.at(-1).url.includes('/trips/server-trip-9/leave'), true);
  assert.equal(readTripBinding('member', 'local-route-7', { storage }), '');
  // 退出后回退到本机 id，不会继续访问旧空间。
  assert.equal(await service.getTrip('member', 'local-route-7'), null);
  assert.equal(calls.at(-1).url.includes('/trips/local-route-7'), true);
});

test('missing local session never calls the network and reports a clear error', async () => {
  const { calls, fetchImpl } = fakeServer(() => { throw new Error('should not call'); });
  const service = createCollaborationService({ fetchImpl, storage: memoryStorage(), baseUrl: '/api' });
  await assert.rejects(
    service.getTrip('owner', 'route-1'),
    error => error instanceof ApiError && error.code === 'AUTH_REQUIRED' && /请先连接协作服务/.test(error.message)
  );
  assert.equal(calls.length, 0);
});

test('network failures and malformed success payloads are reported as retryable API errors', async () => {
  const storage = memoryStorage();
  const offline = createCollaborationService({
    storage,
    baseUrl: '/api',
    fetchImpl: async () => { throw new TypeError('network down'); }
  });
  await assert.rejects(
    offline.status(),
    error => error instanceof ApiError && error.code === 'NETWORK' && /无法连接协作服务/.test(error.message)
  );

  const malformed = createCollaborationService({
    storage,
    baseUrl: '/api',
    fetchImpl: async () => new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  });
  await assert.rejects(
    malformed.status(),
    error => error instanceof ApiError && error.code === 'INVALID_RESPONSE'
  );
});

test('queued shared expenses verify the active identity and the bound remote trip before sending', async () => {
  const storage = memoryStorage();
  const saved = session();
  storage.setItem(collabSessionKey('owner'), JSON.stringify(saved));
  writeTripBinding('owner', 'local-trip', 'remote-trip', { storage });
  const { calls, fetchImpl } = fakeServer(() => jsonResponse({ trip: { id: 'remote-trip', sharedLedger: { totalCents: 90 } } }));
  const service = createCollaborationService({ storage, fetchImpl });
  const expense = { requestId: 'operation', amountCents: 90, title: '车费', participantIds: ['member'] };
  const expected = { tripId: 'remote-trip', accountId: saved.user.id };
  for (const context of [undefined, { ...expected, accountId: 'different' }, { ...expected, tripId: 'other' }]) {
    await assert.rejects(service.addSharedExpense('owner', 'local-trip', expense, context), { code: 'CONTEXT_CHANGED' });
  }
  assert.equal(calls.length, 0);
  const trip = await service.addSharedExpense('owner', 'local-trip', expense, expected);
  assert.equal(trip.sharedLedger.totalCents, 90);
  assert.equal(calls[0].url, '/api/collaboration/trips/remote-trip/ledger/expenses');
  assert.equal(calls[0].headers['X-Travel-Authorization'], 'Bearer ' + saved.token);
  assert.deepEqual(calls[0].body, { ...expense, expectedPayerId: saved.user.id });
});
