import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { createSSRApp, h, reactive } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { routerKey } from 'vue-router';
import { useAuthStore } from '../src/stores/auth.js';
import { collaborationService } from '../src/services/collaborationService.js';
import { loadComponent } from './helpers/vueView.js';
import { mockFeedback } from './helpers/feedback.js';

const Collaboration = await loadComponent('components/TravelCollaboration.vue');
const now = '2026-11-16T09:00:00.000Z';

function tripRoute() {
  return {
    id: 'route-1',
    title: '杭州三日',
    days: [
      {
        date: '2026-11-20',
        activities: [
          { id: 'a1', title: '西湖', time: '09:00' },
          { id: 'a2', title: '灵隐寺', time: '14:00' }
        ]
      },
      { date: '2026-11-21', activities: [] }
    ],
    pendingActivities: [
      { id: 'p1', title: '河坊街' },
      { id: 'bad id!', title: '南宋御街' }
    ]
  };
}

function tripFixture(overrides = {}) {
  return {
    id: 'route-1',
    title: '杭州三日',
    version: 3,
    createdAt: now,
    updatedAt: now,
    myRole: 'owner',
    myCanEdit: true,
    members: [
      { id: 'acc-1', name: '小明', role: 'owner', canEdit: true, joinedAt: now, isMe: true },
      { id: 'acc-2', name: '小红', role: 'member', canEdit: false, joinedAt: now, isMe: false }
    ],
    invites: [
      { id: 'inv-1', role: 'member', canEdit: false, createdAt: now, expiresAt: '2026-11-23T09:00:00.000Z', codePreview: 'AB12' }
    ],
    candidates: [
      { id: 'p1', title: '河坊街' },
      { id: 'pending-1', title: '南宋御街' }
    ],
    votes: [
      { candidateId: 'p1', support: ['acc-2'], oppose: [], myVote: 'support' },
      { candidateId: 'pending-1', support: [], oppose: ['acc-2'], myVote: '' }
    ],
    comments: [
      {
        id: 'cm-1', accountId: 'acc-2', authorName: '小红', dayDate: '2026-11-20', activityId: 'a1',
        content: '第二天下午想改成室内展馆', createdAt: now
      }
    ],
    tasks: [
      {
        id: 'task-1', title: '预订民宿', note: '近地铁', dayDate: '2026-11-20', activityId: '',
        createdBy: 'acc-1', creatorName: '小明', createdAt: now,
        claimedBy: null, claimedByName: '', claimedAt: null, completedAt: null
      }
    ],
    chat: { roomId: 'trip-route-1', configured: true },
    ...overrides
  };
}

function sessionFixture() {
  return {
    token: 'session-token',
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    user: { id: 'acc-1', phone: '13800138000', nickname: '小明' }
  };
}

async function mount({ route = tripRoute(), user = { id: 'local-1', phone: '13800138000', nickname: '小明' }, extraProps = {} } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.user = user;
  const pushed = [];
  let state;
  const app = createSSRApp({
    setup() {
      state = Collaboration.setup(reactive({ route, ...extraProps }), { expose: () => {}, emit: () => {}, attrs: {}, slots: {} });
      return () => null;
    }
  });
  app.use(pinia);
  app.provide(routerKey, { push: async target => { pushed.push(target) }, replace: async () => {} });
  await renderToString(app);
  return { component: Collaboration, state, route, pushed };
}

function stubSession(t, { trip = null } = {}) {
  t.mock.method(collaborationService, 'restore', async () => sessionFixture());
  t.mock.method(collaborationService, 'status', async () => ({ enabled: true, chatConfigured: true, chatTokenTtlMs: 900000, roles: ['owner', 'member', 'viewer'] }));
  t.mock.method(collaborationService, 'getTrip', async () => trip);
}

async function renderCollaboration(component, state, route) {
  const app = createSSRApp({
    render: () => h({ ...component, setup: () => state }, { route })
  });
  return renderToString(app);
}

test('unbound collaboration shows a server-identity gate and validates the password', async t => {
  mockFeedback(t);
  t.mock.method(collaborationService, 'restore', async () => null);
  const { component, state, route } = await mount();
  await state.load();

  const html = await renderCollaboration(component, state, route);
  assert.match(html, /同行协商/);
  assert.match(html, /连接协作服务/);
  assert.match(html, /首次连接会用当前手机号创建协作账号/);
  assert.match(html, /13800138000/);
  assert.doesNotMatch(html, /创建协作空间/);

  state.password.value = '123';
  await state.bind();
  assert.match(state.error.value, /6-20位/);
});

test('binding creates or logs into the server account and then offers create/join', async t => {
  mockFeedback(t);
  t.mock.method(collaborationService, 'restore', async () => null);
  const bind = t.mock.method(collaborationService, 'bind', async (ownerId, identity) => {
    assert.equal(ownerId, 'local-1');
    assert.equal(identity.phone, '13800138000');
    assert.equal(identity.password, 'secret1');
    assert.equal(identity.nickname, '小明');
    return sessionFixture();
  });
  t.mock.method(collaborationService, 'status', async () => ({ enabled: true, chatConfigured: true }));
  t.mock.method(collaborationService, 'getTrip', async () => null);

  const { component, state, route } = await mount();
  await state.load();
  assert.equal(state.boundPhone.value, '13800138000');
  state.password.value = 'secret1';
  await state.bind();
  assert.equal(state.error.value, '');

  assert.equal(bind.mock.callCount(), 1);
  assert.equal(state.session.value.user.id, 'acc-1');
  const html = await renderCollaboration(component, state, route);
  assert.match(html, /协作身份：小明/);
  assert.match(html, /创建协作空间/);
  assert.match(html, /已有邀请码/);
  assert.match(html, /当前旅行还没有协作空间/);
});

test('creating a space syncs only safe local candidates and renders every negotiation panel', async t => {
  mockFeedback(t);
  t.mock.method(collaborationService, 'restore', async () => sessionFixture());
  t.mock.method(collaborationService, 'status', async () => ({ enabled: true, chatConfigured: true }));
  let current = null;
  t.mock.method(collaborationService, 'getTrip', async () => current);
  const create = t.mock.method(collaborationService, 'createTrip', async (ownerId, payload) => {
    assert.equal(ownerId, 'local-1');
    assert.equal(payload.id, 'route-1');
    assert.deepEqual(payload.candidates, [
      { id: 'p1', title: '河坊街' },
      { id: 'pending-1', title: '南宋御街' }
    ]);
    current = tripFixture();
    return current;
  });

  const { component, state, route, pushed } = await mount();
  await state.load();
  await state.createSpace();
  assert.equal(create.mock.callCount(), 1);

  const html = await renderCollaboration(component, state, route);
  assert.match(html, /组织者 · v3/);
  assert.match(html, /成员（2）/);
  assert.match(html, /允许编辑共享资料/);
  assert.match(html, /候选地点投票/);
  assert.match(html, /支持 1 · 反对 0/);
  assert.match(html, /按天留言/);
  assert.match(html, /第二天下午想改成室内展馆/);
  assert.match(html, /任务认领/);
  assert.match(html, /预订民宿/);
  assert.match(html, /打开同行聊天室/);
  assert.match(html, /生成邀请码/);
  assert.match(html, /尾号 AB12/);

  state.openChat();
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].name, 'chat');
  assert.deepEqual(pushed[0].query, { room: 'trip-route-1', name: '杭州三日' });
});

test('daily itinerary snapshot can be pushed to the cloud and written back locally', async t => {
  mockFeedback(t);
  const sharedDays = [
    { date: '2026-11-20', budget: 180, activities: [{ id: 'a1', title: '西湖', time: '09:00' }] }
  ];
  stubSession(t, {
    trip: tripFixture({ days: sharedDays, daysUpdatedAt: now, daysUpdatedByName: '小红' })
  });
  let updatePayload = null;
  const update = t.mock.method(collaborationService, 'updateTrip', async (ownerId, tripId, payload) => {
    updatePayload = payload;
    return tripFixture({
      version: 4,
      days: [{ date: '2026-11-22', activities: [{ id: 'cloud-1', title: '云端活动', time: '10:00' }] }],
      daysUpdatedAt: now,
      daysUpdatedByName: '小明'
    });
  });
  let savedPlan = null;
  const savePlan = t.mock.fn(async () => {
    savedPlan = JSON.parse(JSON.stringify(route));
    return true;
  });
  const { component, state, route } = await mount({ extraProps: { savePlan } });
  await state.load();

  const html = await renderCollaboration(component, state, route);
  assert.match(html, /共享每日行程/);
  assert.match(html, /1 天 \/ 1 项/);
  assert.match(html, /最近同步/);
  assert.match(html, /同步本地行程到云端/);
  assert.match(html, /把云端行程写回本机/);

  await state.syncItinerary();
  assert.equal(update.mock.callCount(), 1);
  assert.equal(updatePayload.version, 3);
  assert.equal(updatePayload.days.length, 2);
  assert.equal(updatePayload.days[0].activities[0].title, '西湖');
  assert.match(state.notice.value, /已同步本机 2 天/);

  await state.applySharedItinerary();
  assert.equal(savePlan.mock.callCount(), 1);
  assert.equal(savedPlan.days.length, 1);
  assert.equal(savedPlan.days[0].activities[0].title, '云端活动');
  assert.deepEqual(route.days, [{ date: '2026-11-22', activities: [{ id: 'cloud-1', title: '云端活动', time: '10:00' }] }]);
  assert.match(state.notice.value, /写回本机并保存/);
});

test('viewer and plain member see read-only or limited controls', async t => {
  mockFeedback(t);
  stubSession(t, {
    trip: tripFixture({
      myRole: 'viewer',
      myCanEdit: false,
      invites: [],
      members: [
        { id: 'acc-1', name: '小明', role: 'owner', canEdit: true, joinedAt: now, isMe: false },
        { id: 'acc-3', name: '访客', role: 'viewer', canEdit: false, joinedAt: now, isMe: true }
      ]
    })
  });
  const { component, state, route } = await mount();
  await state.load();

  const html = await renderCollaboration(component, state, route);
  assert.match(html, /只读访客/);
  assert.match(html, /只读访客可以查看留言，不能发布或删除/);
  assert.match(html, /只读访客不能进入聊天室/);
  assert.doesNotMatch(html, /同步本地候选地点/);
  assert.doesNotMatch(html, /发布留言/);
  assert.doesNotMatch(html, /生成邀请码/);

  state.trip.value = tripFixture({ myRole: 'member', myCanEdit: false, invites: [], chat: { configured: true } });
  const memberHtml = await renderCollaboration(component, state, route);
  assert.match(memberHtml, /仅参与协商/);
  assert.doesNotMatch(memberHtml, /同步本地候选地点/);
  assert.doesNotMatch(memberHtml, /生成邀请码/);
  assert.match(memberHtml, /支持/);
  assert.match(memberHtml, /发布留言/);
  assert.match(memberHtml, /打开同行聊天室/);
});

test('concurrent cloud edits surface a version conflict and can be refreshed', async t => {
  mockFeedback(t);
  stubSession(t, { trip: tripFixture() });
  const update = t.mock.method(collaborationService, 'updateTrip', async () => {
    const error = new Error('云端内容已被其他成员更新，请刷新后重试');
    error.code = 'VERSION_CONFLICT';
    throw error;
  });
  const { component, state, route } = await mount();
  await state.load();
  await state.syncCandidates();

  assert.equal(update.mock.callCount(), 1);
  assert.match(state.conflict.value, /其他成员更新/);
  const html = await renderCollaboration(component, state, route);
  assert.match(html, /刷新云端内容/);

  await state.resolveConflict();
  assert.equal(state.conflict.value, '');
  assert.equal(state.trip.value.version, 3);
});

test('access loss after removal clears private content and disables negotiation', async t => {
  mockFeedback(t);
  t.mock.method(collaborationService, 'restore', async () => sessionFixture());
  t.mock.method(collaborationService, 'status', async () => ({ enabled: true, chatConfigured: true }));
  t.mock.method(collaborationService, 'getTrip', async () => {
    const error = new Error('你不在该旅行的协作空间中');
    error.code = 'FORBIDDEN';
    throw error;
  });

  const { component, state, route } = await mount();
  await state.load();
  assert.equal(state.accessLost.value, true);
  assert.equal(state.trip.value, null);
  const html = await renderCollaboration(component, state, route);
  assert.match(html, /你已不在该旅行的协作空间中/);
  assert.doesNotMatch(html, /预订民宿/);
});

test('invite creation reveals the one-time code, and mutations refresh the trip', async t => {
  mockFeedback(t);
  stubSession(t, { trip: tripFixture() });
  const invite = t.mock.method(collaborationService, 'createInvite', async (ownerId, tripId, payload) => {
    assert.equal(ownerId, 'local-1');
    assert.equal(tripId, 'route-1');
    assert.deepEqual(payload, { role: 'member', canEdit: true, expiresInDays: 7 });
    return {
      code: 'JOIN-CODE-1234',
      invite: { id: 'inv-2', role: 'member', canEdit: true, expiresAt: '2026-11-23T09:00:00.000Z', codePreview: '1234' },
      trip: tripFixture()
    };
  });
  const vote = t.mock.method(collaborationService, 'vote', async () => tripFixture({ version: 4 }));
  const comment = t.mock.method(collaborationService, 'addComment', async () => tripFixture({ version: 5 }));
  const task = t.mock.method(collaborationService, 'addTask', async () => tripFixture({ version: 6 }));

  const { component, state, route } = await mount();
  await state.load();
  state.inviteForm.canEdit = true;
  await state.createInvite();
  assert.equal(invite.mock.callCount(), 1);
  assert.equal(state.inviteCode.value, 'JOIN-CODE-1234');

  const html = await renderCollaboration(component, state, route);
  assert.match(html, /新邀请码/);
  assert.match(html, /JOIN-CODE-1234/);

  await state.vote('p1', 'oppose');
  assert.equal(vote.mock.callCount(), 1);
  state.commentDraft.content = ' 想坐船 ';
  await state.addComment();
  assert.equal(comment.mock.callCount(), 1);
  assert.equal(state.commentDraft.content, '');
  state.taskDraft.title = '买门票';
  await state.addTask();
  assert.equal(task.mock.callCount(), 1);
  assert.equal(state.taskDraft.title, '');
  assert.equal(state.trip.value.version, 6);
});

test('task claim conflict refreshes the authoritative owner and shows the reason', async t => {
  mockFeedback(t);
  t.mock.method(collaborationService, 'restore', async () => sessionFixture());
  t.mock.method(collaborationService, 'status', async () => ({ enabled: true, chatConfigured: true }));
  let reads = 0;
  t.mock.method(collaborationService, 'getTrip', async () => {
    reads++
    return reads === 1
      ? tripFixture()
      : tripFixture({
        tasks: [{
          id: 'task-1', title: '预订民宿', note: '', dayDate: '2026-11-20', activityId: '',
          createdBy: 'acc-1', creatorName: '小明', createdAt: now,
          claimedBy: 'acc-2', claimedByName: '小红', claimedAt: now, completedAt: null
        }]
      });
  });
  t.mock.method(collaborationService, 'claimTask', async () => {
    const error = new Error('任务已被其他成员认领');
    error.code = 'TASK_ALREADY_CLAIMED';
    throw error;
  });

  const { state } = await mount();
  await state.load();
  await state.claimTask(state.trip.value.tasks[0]);

  assert.equal(reads, 2, '冲突后重新读取云端状态');
  assert.match(state.error.value, /已被其他成员认领/);
  assert.equal(state.trip.value.tasks[0].claimedByName, '小红');
});
