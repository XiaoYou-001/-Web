import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import express from 'express';
import { createAuthRouter } from '../server/auth.js';
import { createCollaborationRouter } from '../server/collaboration.js';

async function serve(t, directory, { chatSecret = '0123456789abcdef', chatAdminSecret, chatInternalUrl, fetchImpl, now, authOptions = {} } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter({ directory, now, ...authOptions }));
  app.use('/api/collaboration', createCollaborationRouter({
    directory, chatSecret, chatAdminSecret, chatInternalUrl, fetchImpl, now
  }));
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

function tempDir(t) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-collab-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

async function request(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await response.text();
  let json = null;
  if (raw) {
    try { json = JSON.parse(raw); } catch { json = { raw }; }
  }
  return { status: response.status, body: json, headers: response.headers };
}

async function register(base, phone, nickname, password = 'pass-1234') {
  const response = await request(base, '/api/auth/register', {
    method: 'POST',
    body: { phone, password, nickname }
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return { ...response.body.user, token: response.body.token };
}

const candidate = (id, title) => ({ id, title });

test('service accounts use scrypt hashes, server sessions and survive a restart', async t => {
  const directory = tempDir(t);
  const base = await serve(t, directory);
  const owner = await register(base, '13800138000', '组织者');
  assert.match(owner.id, /^[a-f0-9-]{36}$/);

  const duplicate = await request(base, '/api/auth/register', {
    method: 'POST', body: { phone: '13800138000', password: 'pass-1234', nickname: '重复' }
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, 'ACCOUNT_EXISTS');

  // 未注册与密码错误返回同一个 401，登录接口不能用来探测手机号是否已注册。
  const unknown = await request(base, '/api/auth/login', {
    method: 'POST', body: { phone: '13900139000', password: 'pass-1234' }
  });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.code, 'INVALID_CREDENTIALS');

  const wrong = await request(base, '/api/auth/login', {
    method: 'POST', body: { phone: '13800138000', password: 'wrong-pass' }
  });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.code, 'INVALID_CREDENTIALS');
  assert.equal(unknown.body.error, wrong.body.error, '两种失败提示必须一致');

  const me = await request(base, '/api/auth/me', { token: owner.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.nickname, '组织者');
  assert.equal(me.body.user.phone, '13800138000');

  const authorization = await request(base, '/api/collaboration/trips/route-1');
  assert.equal(authorization.status, 401);

  const accountsFile = JSON.parse(readFileSync(join(directory, 'accounts.json'), 'utf8'));
  const stored = Object.values(accountsFile)[0];
  assert.ok(stored.passwordHash);
  assert.ok(stored.salt);
  assert.equal(JSON.stringify(accountsFile).includes('pass-1234'), false);

  const loggedOut = await request(base, '/api/auth/logout', { method: 'POST', token: owner.token });
  assert.equal(loggedOut.status, 204);
  assert.equal((await request(base, '/api/auth/me', { token: owner.token })).status, 401);

  const restarted = await serve(t, directory);
  const login = await request(restarted, '/api/auth/login', {
    method: 'POST', body: { phone: '13800138000', password: 'pass-1234' }
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, owner.id);
});

test('register attempts are rate limited per IP so accounts cannot be enumerated freely', async t => {
  const directory = tempDir(t);
  const base = await serve(t, directory, { authOptions: { registerLimit: 2 } });
  for (const phone of ['13800138001', '13800138002']) {
    const created = await request(base, '/api/auth/register', {
      method: 'POST', body: { phone, password: 'pass-1234' }
    });
    assert.equal(created.status, 201);
  }
  const blocked = await request(base, '/api/auth/register', {
    method: 'POST', body: { phone: '13800138003', password: 'pass-1234' }
  });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'RATE_LIMIT');
});

test('membership roles gate reads, planning edits, votes, comments, tasks and invites', async t => {
  const base = await serve(t, tempDir(t));
  const owner = await register(base, '13800138000', '组织者');
  const member = await register(base, '13900139000', '成员');
  const viewer = await register(base, '13700137000', '访客');

  const created = await request(base, '/api/collaboration/trips', {
    method: 'POST',
    token: owner.token,
    body: { id: 'route-1', title: '杭州三日', candidates: [candidate('c1', '西湖'), candidate('c2', '灵隐寺')] }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.trip.myRole, 'owner');
  assert.equal(created.body.trip.chat.configured, true);
  assert.equal(created.body.trip.version, 1);

  const duplicate = await request(base, '/api/collaboration/trips', {
    method: 'POST', token: owner.token, body: { id: 'route-1', title: '重复' }
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, 'TRIP_EXISTS');

  assert.equal((await request(base, '/api/collaboration/trips/route-1', { token: member.token })).status, 403);

  const memberInvite = await request(base, '/api/collaboration/trips/route-1/invites', {
    method: 'POST', token: owner.token, body: { role: 'member', canEdit: false, expiresInDays: 7 }
  });
  assert.equal(memberInvite.status, 201);
  assert.match(memberInvite.body.code, /^[A-Za-z0-9_-]{16}$/);

  const joined = await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: member.token, body: { code: memberInvite.body.code }
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.trip.myRole, 'member');
  assert.equal(joined.body.trip.myCanEdit, false);

  // 同一邀请码可重复使用；已是成员时幂等返回。
  const rejoined = await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: member.token, body: { code: memberInvite.body.code }
  });
  assert.equal(rejoined.status, 200);
  assert.equal(rejoined.body.trip.members.length, 2);

  const viewerInvite = await request(base, '/api/collaboration/trips/route-1/invites', {
    method: 'POST', token: owner.token, body: { role: 'viewer', expiresInDays: 3 }
  });
  const viewerJoin = await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: viewer.token, body: { code: viewerInvite.body.code }
  });
  assert.equal(viewerJoin.body.trip.myRole, 'viewer');

  const viewerVote = await request(base, '/api/collaboration/trips/route-1/votes', {
    method: 'POST', token: viewer.token, body: { candidateId: 'c1', value: 'support' }
  });
  assert.equal(viewerVote.status, 403);
  const viewerComment = await request(base, '/api/collaboration/trips/route-1/comments', {
    method: 'POST', token: viewer.token, body: { content: '只读留言' }
  });
  assert.equal(viewerComment.status, 403);
  const viewerTask = await request(base, '/api/collaboration/trips/route-1/tasks', {
    method: 'POST', token: viewer.token, body: { title: '只读任务' }
  });
  assert.equal(viewerTask.status, 403);

  const support1 = await request(base, '/api/collaboration/trips/route-1/votes', {
    method: 'POST', token: member.token, body: { candidateId: 'c1', value: 'support' }
  });
  assert.equal(support1.status, 200);
  const versionAfterVote = support1.body.trip.version;
  const support2 = await request(base, '/api/collaboration/trips/route-1/votes', {
    method: 'POST', token: member.token, body: { candidateId: 'c1', value: 'support' }
  });
  assert.equal(support2.body.trip.version, versionAfterVote, '重复相同投票不重复计数也不产生版本变化');
  const c1 = support2.body.trip.votes.find(vote => vote.candidateId === 'c1');
  assert.deepEqual(c1.support, [member.id]);
  assert.equal(c1.oppose.length, 0);

  const switched = await request(base, '/api/collaboration/trips/route-1/votes', {
    method: 'POST', token: member.token, body: { candidateId: 'c1', value: 'oppose' }
  });
  const switchedC1 = switched.body.trip.votes.find(vote => vote.candidateId === 'c1');
  assert.deepEqual(switchedC1.support, []);
  assert.deepEqual(switchedC1.oppose, [member.id]);
  assert.equal(switchedC1.myVote, 'oppose');

  const ownerComment = await request(base, '/api/collaboration/trips/route-1/comments', {
    method: 'POST', token: owner.token, body: { content: '组织者留言', dayDate: '2026-11-20' }
  });
  const memberComment = await request(base, '/api/collaboration/trips/route-1/comments', {
    method: 'POST', token: member.token, body: { content: '成员留言', dayDate: '2026-11-20' }
  });
  assert.equal(ownerComment.status, 201);
  assert.equal(memberComment.status, 201);
  const deleteOther = await request(base, `/api/collaboration/trips/route-1/comments/${ownerComment.body.comment.id}`, {
    method: 'DELETE', token: member.token
  });
  assert.equal(deleteOther.status, 403);
  const deleteOwn = await request(base, `/api/collaboration/trips/route-1/comments/${memberComment.body.comment.id}`, {
    method: 'DELETE', token: member.token
  });
  assert.equal(deleteOwn.status, 200);

  const createdTask = await request(base, '/api/collaboration/trips/route-1/tasks', {
    method: 'POST', token: member.token, body: { title: '订民宿', note: '两晚' }
  });
  assert.equal(createdTask.status, 201);
  const taskId = createdTask.body.task.id;
  assert.equal((await request(base, `/api/collaboration/trips/route-1/tasks/${taskId}/claim`, {
    method: 'POST', token: viewer.token
  })).status, 403);
  const claimed = await request(base, `/api/collaboration/trips/route-1/tasks/${taskId}/claim`, {
    method: 'POST', token: member.token
  });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.task.claimedBy, member.id);
  const conflict = await request(base, `/api/collaboration/trips/route-1/tasks/${taskId}/claim`, {
    method: 'POST', token: owner.token
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'TASK_ALREADY_CLAIMED');
  assert.equal((await request(base, `/api/collaboration/trips/route-1/tasks/${taskId}/complete`, {
    method: 'POST', token: member.token, body: { completed: true }
  })).status, 200);

  const forbiddenEdit = await request(base, '/api/collaboration/trips/route-1', {
    method: 'PUT', token: member.token, body: { version: 1, title: '成员改标题' }
  });
  assert.equal(forbiddenEdit.status, 403);

  const granted = await request(base, `/api/collaboration/trips/route-1/members/${member.id}`, {
    method: 'PATCH', token: owner.token, body: { canEdit: true }
  });
  assert.equal(granted.status, 200);
  const currentVersion = granted.body.trip.version;

  const stale = await request(base, '/api/collaboration/trips/route-1', {
    method: 'PUT', token: member.token, body: { version: 1, title: '过期版本' }
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'VERSION_CONFLICT');

  const edited = await request(base, '/api/collaboration/trips/route-1', {
    method: 'PUT', token: member.token,
    body: { version: currentVersion, title: '杭州四日', candidates: [candidate('c2', '灵隐寺'), candidate('c3', '西溪湿地')] }
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.trip.title, '杭州四日');
  assert.equal(edited.body.trip.candidates.length, 2);

  const removed = await request(base, `/api/collaboration/trips/route-1/members/${member.id}`, {
    method: 'DELETE', token: owner.token
  });
  assert.equal(removed.status, 200);
  assert.equal((await request(base, '/api/collaboration/trips/route-1', { token: member.token })).status, 403);
  assert.equal((await request(base, '/api/collaboration/trips/route-1/chat-token', { method: 'POST', token: member.token })).status, 403);

  // 移除成员会作废旧邀请码，不能凭旧链接立即回到空间。
  const oldInvite = await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: member.token, body: { code: memberInvite.body.code }
  });
  assert.equal(oldInvite.status, 404);
  assert.equal(oldInvite.body.code, 'INVITE_INVALID');

  assert.equal((await request(base, '/api/collaboration/trips/route-1/leave', {
    method: 'POST', token: owner.token
  })).status, 409);

  const viewerLeave = await request(base, '/api/collaboration/trips/route-1/leave', {
    method: 'POST', token: viewer.token
  });
  assert.equal(viewerLeave.status, 204);
  assert.equal((await request(base, '/api/collaboration/trips/route-1', { token: viewer.token })).status, 403);
});

test('shared daily itinerary is sanitized, versioned, and readable by every member', async t => {
  const base = await serve(t, tempDir(t));
  const owner = await register(base, '13800138000', '组织者');
  const editor = await register(base, '13900139000', '编辑成员');
  const viewer = await register(base, '13700137000', '只读成员');
  const created = await request(base, '/api/collaboration/trips', {
    method: 'POST', token: owner.token, body: { id: 'route-days', title: '共享行程' }
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.trip.days, []);
  assert.equal(created.body.trip.daysUpdatedAt, null);
  assert.equal(created.body.trip.daysUpdatedByName, '');

  const invite = await request(base, '/api/collaboration/trips/route-days/invites', {
    method: 'POST', token: owner.token, body: { role: 'member', canEdit: true }
  });
  const joined = await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: editor.token, body: { code: invite.body.code }
  });
  assert.equal(joined.status, 200);
  const viewerInvite = await request(base, '/api/collaboration/trips/route-days/invites', {
    method: 'POST', token: owner.token, body: { role: 'viewer' }
  });
  const viewerJoined = await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: viewer.token, body: { code: viewerInvite.body.code }
  });
  assert.equal(viewerJoined.status, 200);

  const days = [
    {
      date: '2026-11-18',
      budget: 300.456,
      activities: [{
        id: 'act-1',
        time: '12:00',
        title: '楼外楼午餐',
        description: '西湖边用餐',
        notes: '提前订位',
        category: 'meal',
        slot: 'lunch',
        slotLabel: '午餐',
        durationMinutes: 90,
        timeLocked: true,
        travelMinutes: 15,
        completed: false,
        skipped: false,
        place: {
          id: 'place-1',
          name: '楼外楼',
          address: '孤山路30号',
          city: '杭州',
          location: [120.14, 30.25],
          coordinateSystem: 'GCJ-02',
          source: 'amap'
        },
        meal: {
          restaurantId: 'B001',
          restaurantSource: 'amap',
          note: '少辣',
          persons: 3,
          budgetPerPerson: 88.5,
          budgetPerPersonCents: 8850,
          estimatedTotal: 265.5
        },
        travelEstimate: {
          mode: 'walking',
          minutes: 12,
          distanceMeters: 900,
          origin: [120.1, 30.2],
          destination: [120.11, 30.21],
          checkedAt: '2026-11-01T00:00:00.000Z'
        }
      }]
    },
    { date: '2026-11-19', activities: [] }
  ];
  const pushed = await request(base, '/api/collaboration/trips/route-days', {
    method: 'PUT', token: editor.token, body: { version: viewerJoined.body.trip.version, days }
  });
  assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
  assert.equal(pushed.body.trip.days.length, 2);
  assert.equal(pushed.body.trip.days[0].budget, 300.46);
  const sharedActivity = pushed.body.trip.days[0].activities[0];
  assert.equal(sharedActivity.title, '楼外楼午餐');
  assert.deepEqual(sharedActivity.place.location, [120.14, 30.25]);
  assert.equal(sharedActivity.meal.estimatedTotal, 265.5);
  assert.equal(sharedActivity.travelEstimate.mode, 'walking');
  assert.equal(sharedActivity.completed, false);
  assert.equal(sharedActivity.timeLocked, true);
  assert.ok(pushed.body.trip.daysUpdatedAt);
  assert.equal(pushed.body.trip.daysUpdatedBy, editor.id);
  assert.equal(pushed.body.trip.daysUpdatedByName, '编辑成员');
  assert.equal(pushed.body.trip.version, viewerJoined.body.trip.version + 1);

  // 只改标题的请求不能顺手清空共享行程。
  const titleOnly = await request(base, '/api/collaboration/trips/route-days', {
    method: 'PUT', token: owner.token, body: { version: pushed.body.trip.version, title: '共享行程改' }
  });
  assert.equal(titleOnly.status, 200);
  assert.equal(titleOnly.body.trip.title, '共享行程改');
  assert.equal(titleOnly.body.trip.days.length, 2);

  const readByViewer = await request(base, '/api/collaboration/trips/route-days', { token: viewer.token });
  assert.equal(readByViewer.status, 200);
  assert.deepEqual(readByViewer.body.trip.days, pushed.body.trip.days);

  const viewerWrite = await request(base, '/api/collaboration/trips/route-days', {
    method: 'PUT', token: viewer.token, body: { version: titleOnly.body.trip.version, days: [] }
  });
  assert.equal(viewerWrite.status, 403);

  const stale = await request(base, '/api/collaboration/trips/route-days', {
    method: 'PUT', token: owner.token, body: { version: joined.body.trip.version, days: [] }
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'VERSION_CONFLICT');

  const invalidDate = await request(base, '/api/collaboration/trips/route-days', {
    method: 'PUT', token: owner.token,
    body: { version: titleOnly.body.trip.version, days: [{ date: '2026-02-30', activities: [] }] }
  });
  assert.equal(invalidDate.status, 400);
  assert.equal(invalidDate.body.code, 'VALIDATION');

  const duplicateDate = await request(base, '/api/collaboration/trips/route-days', {
    method: 'PUT', token: owner.token,
    body: {
      version: titleOnly.body.trip.version,
      days: [{ date: '2026-11-18', activities: [] }, { date: '2026-11-18', activities: [] }]
    }
  });
  assert.equal(duplicateDate.status, 400);
  assert.equal(duplicateDate.body.code, 'VALIDATION');

  const blankTitle = await request(base, '/api/collaboration/trips/route-days', {
    method: 'PUT', token: owner.token,
    body: { version: titleOnly.body.trip.version, days: [{ date: '2026-11-18', activities: [{ title: '   ' }] }] }
  });
  assert.equal(blankTitle.status, 400);
  assert.equal(blankTitle.body.code, 'VALIDATION');

  // 非法请求不能推进版本号，随后仍可用同一版本清空共享行程。
  const cleared = await request(base, '/api/collaboration/trips/route-days', {
    method: 'PUT', token: owner.token, body: { version: titleOnly.body.trip.version, days: [] }
  });
  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.body.trip.days, []);
  assert.equal(cleared.body.trip.daysUpdatedByName, '组织者');
});

test('invites can be cancelled and never expose reusable secrets in the trip payload', async t => {
  const base = await serve(t, tempDir(t));
  const owner = await register(base, '13800138000', '组织者');
  const other = await register(base, '13900139000', '成员');
  await request(base, '/api/collaboration/trips', {
    method: 'POST', token: owner.token, body: { id: 'route-2', title: '测试邀请' }
  });
  const invite = await request(base, '/api/collaboration/trips/route-2/invites', {
    method: 'POST', token: owner.token, body: { role: 'member', canEdit: true, expiresInDays: 5 }
  });
  assert.equal(invite.body.trip.invites.length, 1);
  assert.equal(invite.body.trip.invites[0].codePreview, invite.body.code.slice(-4));
  assert.equal(JSON.stringify(invite.body.trip).includes(invite.body.code), false);

  const cancelled = await request(base, `/api/collaboration/trips/route-2/invites/${invite.body.invite.id}`, {
    method: 'DELETE', token: owner.token
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.trip.invites.length, 0);
  const rejected = await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: other.token, body: { code: invite.body.code }
  });
  assert.equal(rejected.status, 404);
  assert.equal(rejected.body.code, 'INVITE_INVALID');
});

test('task claims and version changes remain consistent under concurrent requests', async t => {
  const base = await serve(t, tempDir(t));
  const owner = await register(base, '13800138000', '组织者');
  const a = await register(base, '13900139000', '成员A');
  const b = await register(base, '13700137000', '成员B');
  const created = await request(base, '/api/collaboration/trips', {
    method: 'POST', token: owner.token, body: { id: 'route-3', title: '并发测试' }
  });
  for (const account of [a, b]) {
    const invite = await request(base, '/api/collaboration/trips/route-3/invites', {
      method: 'POST', token: owner.token, body: { role: 'member' }
    });
    await request(base, '/api/collaboration/invites/accept', {
      method: 'POST', token: account.token, body: { code: invite.body.code }
    });
    await request(base, `/api/collaboration/trips/route-3/members/${account.id}`, {
      method: 'PATCH', token: owner.token, body: { canEdit: true }
    });
  }

  const task = await request(base, '/api/collaboration/trips/route-3/tasks', {
    method: 'POST', token: owner.token, body: { title: '抢任务' }
  });
  const taskId = task.body.task.id;
  const claims = await Promise.all([a, b].map(account => request(base, `/api/collaboration/trips/route-3/tasks/${taskId}/claim`, {
    method: 'POST', token: account.token
  })));
  assert.deepEqual(claims.map(item => item.status).sort(), [200, 409]);
  assert.equal(claims.find(item => item.status === 409).body.code, 'TASK_ALREADY_CLAIMED');

  const trip = await request(base, '/api/collaboration/trips/route-3', { token: owner.token });
  const stored = trip.body.trip.tasks.find(item => item.id === taskId);
  assert.ok([a.id, b.id].includes(stored.claimedBy));

  const version = trip.body.trip.version;
  const edits = await Promise.all([a, b].map((account, index) => request(base, '/api/collaboration/trips/route-3', {
    method: 'PUT', token: account.token, body: { version, title: `并发标题${index}` }
  })));
  assert.deepEqual(edits.map(item => item.status).sort(), [200, 409], '同一版本的并发编辑只有一个成功');
  assert.equal(edits.find(item => item.status === 409).body.code, 'VERSION_CONFLICT');
});

test('chat tokens are only issued to active non-viewer members and carry the signed room', async t => {
  const base = await serve(t, tempDir(t), { chatSecret: '0123456789abcdef' });
  const owner = await register(base, '13800138000', '组织者');
  const viewer = await register(base, '13900139000', '访客');
  await request(base, '/api/collaboration/trips', {
    method: 'POST', token: owner.token, body: { id: 'route-4', title: '聊天权限' }
  });
  const viewerInvite = await request(base, '/api/collaboration/trips/route-4/invites', {
    method: 'POST', token: owner.token, body: { role: 'viewer' }
  });
  await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: viewer.token, body: { code: viewerInvite.body.code }
  });

  const denied = await request(base, '/api/collaboration/trips/route-4/chat-token', {
    method: 'POST', token: viewer.token
  });
  assert.equal(denied.status, 403);

  const token = await request(base, '/api/collaboration/trips/route-4/chat-token', {
    method: 'POST', token: owner.token
  });
  assert.equal(token.status, 200);
  assert.equal(token.body.roomId, 'trip-route-4');
  const [payload, signature] = token.body.token.split('.');
  assert.ok(payload && signature);
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.equal(decoded.v, 1);
  assert.equal(decoded.sub, owner.id);
  assert.equal(decoded.room, 'trip-route-4');
  assert.ok(decoded.exp * 1000 > Date.now());

  const unconfigured = await serve(t, tempDir(t), { chatSecret: '' });
  const noSecretOwner = await register(unconfigured, '13600136000', '未配置');
  await request(unconfigured, '/api/collaboration/trips', {
    method: 'POST', token: noSecretOwner.token, body: { id: 'route-5', title: '无聊天密钥' }
  });
  const unavailable = await request(unconfigured, '/api/collaboration/trips/route-5/chat-token', {
    method: 'POST', token: noSecretOwner.token
  });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.code, 'CHAT_NOT_CONFIGURED');
  const status = await request(unconfigured, '/api/collaboration/status');
  assert.equal(status.body.chatConfigured, false);
});

test('removing a member asks the chat service to close their live socket', async t => {
  const calls = [];
  const directory = tempDir(t);
  const base = await serve(t, directory, {
    chatAdminSecret: 'admin-secret-0123456789',
    chatInternalUrl: 'http://chat.internal:8080',
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return new Response('{"revoked":1}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const owner = await register(base, '13800138000', '组织者');
  const member = await register(base, '13900139000', '成员');
  await request(base, '/api/collaboration/trips', {
    method: 'POST', token: owner.token,
    body: { id: 'route-revoke', title: '撤销聊天', candidates: [candidate('c1', '西湖')] }
  });
  const invite = await request(base, '/api/collaboration/trips/route-revoke/invites', {
    method: 'POST', token: owner.token, body: { role: 'member', canEdit: false, expiresInDays: 3 }
  });
  await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: member.token, body: { code: invite.body.code }
  });

  const removed = await request(base, '/api/collaboration/trips/route-revoke/members/' + member.id, {
    method: 'DELETE', token: owner.token
  });
  assert.equal(removed.status, 200);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://chat.internal:8080/internal/revoke');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['X-Chat-Admin-Secret'], 'admin-secret-0123456789');
  assert.deepEqual(calls[0].body, { roomId: 'trip-route-revoke', userId: member.id, revoked: true });
});

test('a member removed earlier regains chat access after rejoining', async t => {
  const calls = [];
  const directory = tempDir(t);
  const base = await serve(t, directory, {
    chatAdminSecret: 'admin-secret-0123456789',
    chatInternalUrl: 'http://chat.internal:8080',
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return new Response('{"revoked":0}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const owner = await register(base, '13800138000', '组织者');
  const member = await register(base, '13900139000', '成员');
  await request(base, '/api/collaboration/trips', {
    method: 'POST', token: owner.token,
    body: { id: 'route-rejoin', title: '重新加入', candidates: [candidate('c1', '西湖')] }
  });
  const invite = await request(base, '/api/collaboration/trips/route-rejoin/invites', {
    method: 'POST', token: owner.token, body: { role: 'member', canEdit: false, expiresInDays: 3 }
  });
  await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: member.token, body: { code: invite.body.code }
  });
  await request(base, '/api/collaboration/trips/route-rejoin/members/' + member.id, {
    method: 'DELETE', token: owner.token
  });
  await new Promise(resolve => setImmediate(resolve));

  // 移除时加入聊天黑名单，重新加入时必须显式解除，否则 16 分钟内无法聊天。
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.revoked, true);

  const rejoinInvite = await request(base, '/api/collaboration/trips/route-rejoin/invites', {
    method: 'POST', token: owner.token, body: { role: 'member', expiresInDays: 3 }
  });
  const rejoined = await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: member.token, body: { code: rejoinInvite.body.code }
  });
  assert.equal(rejoined.status, 200);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.revoked, false);
  assert.equal(calls[1].body.roomId, 'trip-route-rejoin');
  assert.equal(calls[1].body.userId, member.id);
  // 再加入一次（已是成员）不应重复调用聊天服务。
  await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: member.token, body: { code: rejoinInvite.body.code }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2);
});

test('chat revocation failure never blocks member removal', async t => {
  const directory = tempDir(t);
  const base = await serve(t, directory, {
    chatAdminSecret: 'admin-secret-0123456789',
    chatInternalUrl: 'http://chat.internal:8080',
    fetchImpl: async () => { throw new Error('chat service down') }
  });
  const owner = await register(base, '13800138000', '组织者');
  const member = await register(base, '13900139000', '成员');
  await request(base, '/api/collaboration/trips', {
    method: 'POST', token: owner.token, body: { id: 'route-revoke-fail', title: '撤销失败' }
  });
  const invite = await request(base, '/api/collaboration/trips/route-revoke-fail/invites', {
    method: 'POST', token: owner.token, body: { role: 'member' }
  });
  await request(base, '/api/collaboration/invites/accept', {
    method: 'POST', token: member.token, body: { code: invite.body.code }
  });
  const removed = await request(base, '/api/collaboration/trips/route-revoke-fail/members/' + member.id, {
    method: 'DELETE', token: owner.token
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.trip.members.length, 1);
});

test('shared ledger accepts simultaneous members, replays receipts once and preserves balances after removal', async t => {
  const directory = tempDir(t);
  const base = await serve(t, directory);
  const owner = await register(base, '13800138000', '阿青');
  const member = await register(base, '13900139000', '小周');
  const viewer = await register(base, '13700137000', '访客');
  const path = '/api/collaboration/trips/ledger-trip';
  await request(base, '/api/collaboration/trips', {
    method: 'POST', token: owner.token, body: { id: 'ledger-trip', title: '出游' }
  });
  const post = (token, body, url = base) => request(url, path + '/ledger/expenses', { method: 'POST', token, body });
  const bill = { title: '三人午饭', amountCents: 100, requestId: 'operation-1', participantIds: [viewer.id, member.id, owner.id] };
  assert.equal((await post(null, bill)).status, 401);
  assert.equal((await post(member.token, bill)).status, 403);
  for (const [account, role] of [[member, 'member'], [viewer, 'viewer']]) {
    const invite = await request(base, path + '/invites', { method: 'POST', token: owner.token, body: { role } });
    await request(base, '/api/collaboration/invites/accept', {
      method: 'POST', token: account.token, body: { code: invite.body.code }
    });
  }
  assert.equal((await post(viewer.token, bill)).status, 403);
  assert.equal((await post(member.token, { ...bill, expectedPayerId: owner.id })).body.code, 'CONTEXT_CHANGED');
  assert.equal((await post(member.token, { ...bill, payerId: owner.id })).status, 409);
  for (const invalid of [{ amountCents: 1.5 }, { participantIds: [] }, { participantIds: [owner.id, owner.id] }, { participantIds: ['other'] }]) {
    assert.equal((await post(member.token, { ...bill, ...invalid })).status, 400);
  }
  const empty = (await request(base, path, { token: owner.token })).body.trip;
  assert.deepEqual(empty.sharedLedger.expenses, []);
  // Same client request retried concurrently; the other member can independently
  // record a different expense, even if their device happened to pick the same ID.
  const train = { requestId: bill.requestId, amountCents: 55, title: '车票', participantIds: [member.id] };
  const [a, b, c] = await Promise.all([
    post(member.token, bill), post(member.token, { ...bill, participantIds: [...bill.participantIds].reverse() }), post(owner.token, train)
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(c.status, 201);
  const { trip } = (await request(base, path, { token: viewer.token })).body;
  assert.equal(trip.version, empty.version + 2);
  assert.equal(trip.sharedLedger.totalCents, 155);
  assert.equal(trip.sharedLedger.expenses.length, 2);
  const receipt = trip.sharedLedger.expenses.find(item => item.payerId === member.id);
  assert.deepEqual(receipt.shares, { [owner.id]: 34, [member.id]: 33, [viewer.id]: 33 });
  const balances = Object.fromEntries(trip.sharedLedger.balances.map(row => [row.id, row.netCents]));
  assert.deepEqual(balances, { [owner.id]: 21, [member.id]: 12, [viewer.id]: -33 });
  assert.equal((await post(member.token, { ...bill, amountCents: 101 })).body.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await post(owner.token, { ...train, requestId: 'overflow', amountCents: Number.MAX_SAFE_INTEGER })).status, 400);
  await request(base, path + '/members/' + viewer.id, { method: 'DELETE', token: owner.token });
  assert.equal((await request(base, path, { token: viewer.token })).status, 403);
  const restarted = await serve(t, directory);
  const replay = await post(member.token, bill, restarted);
  assert.equal(replay.status, 200, 'a recorded request remains replayable when another participant leaves');
  assert.deepEqual(replay.body.trip.sharedLedger, trip.sharedLedger);
  assert.equal((await post(member.token, { ...bill, requestId: 'new-bill' }, restarted)).status, 400);
});
