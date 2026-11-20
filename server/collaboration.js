import express from 'express';
import { recordSharedExpense, sharedLedgerView } from './sharedLedger.js';
import { CollabError, optionalDate, optionalId, optionalText, sanitizeDays, text } from '../src/utils/sharedItinerary.js';
export { CollabError, MAX_DAYS, MAX_ACTIVITIES_PER_DAY } from '../src/utils/sharedItinerary.js';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createAuthService, AuthError } from './auth.js';

// 同行协商空间：旅行成员、邀请、只读/编辑权限、投票、留言、任务认领与聊天令牌。
// 所有身份来自服务端会话；客户端提交的账号 ID 只作为被操作对象，不能用于自我认证。
export const CHAT_TOKEN_TTL_MS = 15 * 60 * 1000;
export const MAX_MEMBERS = 50;
export const MAX_INVITES = 20;
export const MAX_CANDIDATES = 100;
export const MAX_COMMENTS = 500;
export const MAX_TASKS = 200;
export const MAX_TRIPS = 5000;
const TRIP_ID = /^[A-Za-z0-9_-]{1,64}$/;
const CANDIDATE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ACCOUNT_ID = /^[A-Za-z0-9-]{1,64}$/;
const INVITE_ID = /^[A-Za-z0-9-]{1,64}$/;
const CODE = /^[A-Za-z0-9_-]{12,64}$/;

const digest = value => createHash('sha256').update(value).digest();
const hashHex = value => digest(value).toString('hex');
const validSecret = secret => typeof secret === 'string' && Buffer.byteLength(secret) >= 16;

function validTripId(value) {
  return typeof value === 'string' && TRIP_ID.test(value);
}

function readJSON(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new CollabError('STORAGE_UNAVAILABLE', '协作数据读取失败，请稍后重试', 503);
  }
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, path);
}

function sanitizeCandidates(input) {
  if (input === undefined) return null;
  if (!Array.isArray(input) || input.length > MAX_CANDIDATES) {
    throw new CollabError('VALIDATION', `候选地点最多${MAX_CANDIDATES}个`, 400);
  }
  const seen = new Set();
  const candidates = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') throw new CollabError('VALIDATION', '候选地点格式不正确', 400);
    const id = optionalId(item.id, CANDIDATE_ID, '候选地点 ID');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    candidates.push({ id, title: text(item.title, 1, 200, '候选地点名称') });
  }
  return candidates;
}

function activeInvites(trip, at) {
  return trip.invites.filter(invite => invite.expiresAt > at);
}

function memberOf(trip, accountId) {
  return trip.members.find(member => member.accountId === accountId) || null;
}

function serialize(trip, accountId, { chatConfigured = false, chatRevokeConfigured = false, at = Date.now() } = {}) {
  const me = memberOf(trip, accountId);
  if (!me) throw new CollabError('FORBIDDEN', '你不在该旅行的协作空间中', 403);
  const invites = me.role === 'owner'
    ? activeInvites(trip, at).map(invite => ({
      id: invite.id,
      role: invite.role,
      canEdit: invite.canEdit,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      codePreview: invite.codePreview
    }))
    : [];
  const votes = trip.candidates.map(candidate => {
    const entries = trip.votes.filter(vote => vote.candidateId === candidate.id);
    const mine = entries.find(vote => vote.accountId === accountId);
    return {
      candidateId: candidate.id,
      support: entries.filter(vote => vote.value === 'support').map(vote => vote.accountId),
      oppose: entries.filter(vote => vote.value === 'oppose').map(vote => vote.accountId),
      myVote: mine ? mine.value : ''
    };
  });
  return {
    id: trip.id,
    title: trip.title,
    version: trip.version,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
    myRole: me.role,
    myCanEdit: me.role === 'owner' || Boolean(me.canEdit),
    members: trip.members.map(member => ({
      id: member.accountId,
      name: member.name,
      role: member.role,
      canEdit: member.role === 'owner' ? true : Boolean(member.canEdit),
      joinedAt: member.joinedAt,
      isMe: member.accountId === accountId
    })),
    invites,
    candidates: trip.candidates,
    votes,
    days: Array.isArray(trip.days) ? trip.days : [],
    daysUpdatedAt: trip.daysUpdatedAt || null,
    daysUpdatedBy: trip.daysUpdatedBy || '',
    daysUpdatedByName: trip.daysUpdatedByName || '',
    comments: [...trip.comments].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200),
    tasks: trip.tasks,
    sharedLedger: sharedLedgerView(trip),
    chat: {
      roomId: `trip-${trip.id}`,
      configured: chatConfigured,
      // 未配置管理员密钥时，移除成员后聊天令牌不会被立即吊销，只能等 15 分钟过期。
      revokeConfigured: chatRevokeConfigured
    }
  };
}

function sendError(res, error) {
  if (error instanceof CollabError || error instanceof AuthError) {
    return res.status(error.status).json({ code: error.code, error: error.message });
  }
  console.error('同行协商请求失败:', error);
  return res.status(503).json({ code: 'SERVICE_UNAVAILABLE', error: '协作服务暂时不可用，请稍后重试' });
}

function requireMember(trip, accountId) {
  const member = memberOf(trip, accountId);
  if (!member) throw new CollabError('FORBIDDEN', '你不在该旅行的协作空间中', 403);
  return member;
}

function requireWriter(trip, accountId) {
  const member = requireMember(trip, accountId);
  if (member.role === 'viewer') throw new CollabError('FORBIDDEN', '只读成员不能修改协商内容', 403);
  return member;
}

function requireEditor(trip, accountId) {
  const member = requireMember(trip, accountId);
  if (!(member.role === 'owner' || (member.role === 'member' && member.canEdit))) {
    throw new CollabError('FORBIDDEN', '当前成员没有修改日程或候选地点的权限', 403);
  }
  return member;
}

function requireOwner(trip, accountId) {
  const member = requireMember(trip, accountId);
  if (member.role !== 'owner') throw new CollabError('FORBIDDEN', '只有组织者可以执行该操作', 403);
  return member;
}

export function signChatToken({ secret, accountId, name, roomId, now = Date.now() }) {
  if (!validSecret(secret)) throw new CollabError('CHAT_NOT_CONFIGURED', '聊天鉴权尚未配置', 503);
  const payload = { v: 1, sub: accountId, name, room: roomId, exp: Math.floor((now + CHAT_TOKEN_TTL_MS) / 1000) };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return { token: `${payloadB64}.${signature}`, expiresAt: now + CHAT_TOKEN_TTL_MS };
}

export function createCollaborationRouter({
  directory,
  now = Date.now,
  chatSecret = '',
  chatInternalUrl = '',
  chatAdminSecret = '',
  fetchImpl = globalThis.fetch
} = {}) {
  if (!directory) throw new Error('缺少协作数据存储目录');
  const root = resolve(directory);
  const tripsDir = join(root, 'trips');
  const auth = createAuthService({ directory: root, now });
  const chatConfigured = validSecret(chatSecret);
  const chatRevokeConfigured = validSecret(chatAdminSecret) && Boolean(chatInternalUrl);
  const router = express.Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });

  function tripPath(tripId) {
    return join(tripsDir, `${tripId}.json`);
  }

  function readTrip(tripId) {
    if (!validTripId(tripId)) throw new CollabError('NOT_FOUND', '旅行协作空间不存在', 404);
    const trip = readJSON(tripPath(tripId), null);
    if (!trip) throw new CollabError('NOT_FOUND', '旅行协作空间不存在或已被删除', 404);
    if (!Array.isArray(trip.members) || !Array.isArray(trip.candidates) || !Array.isArray(trip.votes) ||
        !Array.isArray(trip.comments) || !Array.isArray(trip.tasks) || !Array.isArray(trip.invites) ||
        (trip.sharedExpenses !== undefined && !Array.isArray(trip.sharedExpenses))) {
      throw new CollabError('STORAGE_UNAVAILABLE', '协作数据格式异常，请联系管理员', 503);
    }
    return trip;
  }

  function writeTrip(trip, { touch = true } = {}) {
    if (touch) {
      trip.updatedAt = new Date(now()).toISOString();
      trip.version = Number(trip.version || 0) + 1;
    }
    atomicWrite(tripPath(trip.id), trip);
  }

  function requireAuth(req) {
    const account = auth.authenticate(req.headers['x-travel-authorization'] ?? req.headers.authorization);
    if (!account) throw new CollabError('AUTH_REQUIRED', '请先登录协作账号', 401);
    return account;
  }

  function activeTripCount() {
    try {
      return readdirSync(tripsDir).filter(name => /^[A-Za-z0-9_-]{1,64}\.json$/.test(name)).length;
    } catch (error) {
      if (error.code === 'ENOENT') return 0;
      throw error;
    }
  }

  function findInvite(code) {
    if (typeof code !== 'string' || !CODE.test(code.trim())) return null;
    const wanted = digest(code.trim());
    let names;
    try {
      names = readdirSync(tripsDir).filter(name => /^[A-Za-z0-9_-]{1,64}\.json$/.test(name));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    for (const name of names) {
      const trip = readJSON(join(tripsDir, name), null);
      if (!trip || !Array.isArray(trip.invites)) continue;
      for (const invite of trip.invites) {
        if (!invite || typeof invite.codeHash !== 'string' || invite.expiresAt <= now()) continue;
        let actual;
        try { actual = Buffer.from(invite.codeHash, 'hex'); } catch { continue; }
        if (actual.length === wanted.length && timingSafeEqual(actual, wanted)) {
          return { trip, invite };
        }
      }
    }
    return null;
  }

  function removeMemberState(trip, accountId) {
    trip.members = trip.members.filter(member => member.accountId !== accountId);
    trip.votes = trip.votes.filter(vote => vote.accountId !== accountId);
    for (const task of trip.tasks) {
      if (task.claimedBy === accountId) {
        task.claimedBy = null;
        task.claimedByName = '';
        task.claimedAt = null;
      }
    }
  }

  // 被移除的账号会同时被聊天服务拉黑（旧令牌在有效期内也无法重连），
  // 记录在协作空间里，便于账号重新加入时精确解除拉黑。
  function markChatRevoked(trip, accountId) {
    const list = Array.isArray(trip.revokedMembers) ? trip.revokedMembers.filter(id => id !== accountId) : [];
    list.push(accountId);
    trip.revokedMembers = list.slice(-200);
  }

  function clearChatRevocation(trip, accountId) {
    if (!Array.isArray(trip.revokedMembers) || !trip.revokedMembers.includes(accountId)) return false;
    trip.revokedMembers = trip.revokedMembers.filter(id => id !== accountId);
    return true;
  }

  function revokeChat(tripId, accountId, { revoked = true } = {}) {
    if (!chatAdminSecret || !validSecret(chatAdminSecret) || !chatInternalUrl || typeof fetchImpl !== 'function') return;
    try {
      const url = new URL('/internal/revoke', chatInternalUrl).href;
      const pending = fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Chat-Admin-Secret': chatAdminSecret },
        body: JSON.stringify({ roomId: `trip-${tripId}`, userId: accountId, revoked })
      });
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch {
      // 聊天服务暂时不可达时，令牌仍会在 15 分钟内过期；不能阻塞成员移除。
    }
  }

  function route(handler) {
    return (req, res) => {
      try { handler(req, res); } catch (error) { sendError(res, error); }
    };
  }

  const view = (trip, accountId) => serialize(trip, accountId, { chatConfigured, chatRevokeConfigured, at: now() });

  router.get('/status', (_req, res) => res.json({
    enabled: true,
    chatConfigured,
    chatRevokeConfigured,
    chatTokenTtlMs: CHAT_TOKEN_TTL_MS,
    roles: ['owner', 'member', 'viewer']
  }));

  // 创建协作空间。行程 id 由客户端生成，但创建者身份必须来自服务端会话。
  router.post('/trips', route((req, res) => {
    const account = requireAuth(req);
    const { id, title } = req.body || {};
    if (!validTripId(id)) throw new CollabError('VALIDATION', '旅行 ID 格式不正确', 400);
    const name = text(title, 1, 120, '旅行名称');
    const candidates = sanitizeCandidates(req.body?.candidates) || [];
    const existing = readJSON(tripPath(id), null);
    if (existing) {
      throw new CollabError('TRIP_EXISTS', '该旅行的协作空间已存在，请直接打开或加入', 409);
    }
    if (activeTripCount() >= MAX_TRIPS) throw new CollabError('SERVICE_UNAVAILABLE', '协作空间数量已达上限', 503);
    const at = new Date(now()).toISOString();
    const trip = {
      id,
      title: name,
      creatorId: account.id,
      createdAt: at,
      updatedAt: at,
      version: 1,
      members: [{ accountId: account.id, name: account.nickname, role: 'owner', canEdit: true, joinedAt: at }],
      invites: [],
      candidates,
      votes: [],
      days: [],
      daysUpdatedAt: null,
      daysUpdatedBy: '',
      daysUpdatedByName: '',
      comments: [],
      tasks: [],
      revokedMembers: []
    };
    writeTrip(trip, { touch: false });
    res.status(201).json({ trip: view(trip, account.id) });
  }));

  // 邀请码是可重复使用的加入凭证，直到过期或被组织者取消。
  router.post('/invites/accept', route((req, res) => {
    const account = requireAuth(req);
    const found = findInvite(req.body?.code);
    if (!found) throw new CollabError('INVITE_INVALID', '邀请码无效、已过期或已被取消', 404);
    const { trip, invite } = found;
    if (memberOf(trip, account.id)) {
      return res.json({ trip: view(trip, account.id) });
    }
    if (trip.members.length >= MAX_MEMBERS) throw new CollabError('MEMBER_LIMIT', `成员最多${MAX_MEMBERS}人`, 409);
    trip.members.push({
      accountId: account.id,
      name: account.nickname,
      role: invite.role === 'viewer' ? 'viewer' : 'member',
      canEdit: invite.role === 'member' && Boolean(invite.canEdit),
      joinedAt: new Date(now()).toISOString()
    });
    // 之前被移除的账号重新加入后恢复聊天权限，否则旧令牌拉黑会误伤新会话。
    const restored = clearChatRevocation(trip, account.id);
    writeTrip(trip);
    if (restored) revokeChat(trip.id, account.id, { revoked: false });
    res.json({ trip: view(trip, account.id) });
  }));

  router.get('/trips/:tripId', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    requireMember(trip, account.id);
    res.json({ trip: view(trip, account.id) });
  }));

  router.put('/trips/:tripId', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    requireEditor(trip, account.id);
    const version = Number(req.body?.version);
    if (!Number.isInteger(version)) throw new CollabError('VALIDATION', '缺少协作数据版本号', 400);
    if (version !== trip.version) {
      throw new CollabError('VERSION_CONFLICT', '协作内容已被其他成员更新，请刷新后再试', 409);
    }
    const title = req.body?.title === undefined ? trip.title : text(req.body.title, 1, 120, '旅行名称');
    const candidates = sanitizeCandidates(req.body?.candidates);
    const days = sanitizeDays(req.body?.days);
    let changed = title !== trip.title;
    if (changed) trip.title = title;
    if (candidates) {
      const before = JSON.stringify(trip.candidates);
      trip.candidates = candidates;
      const ids = new Set(candidates.map(candidate => candidate.id));
      trip.votes = trip.votes.filter(vote => ids.has(vote.candidateId));
      if (JSON.stringify(candidates) !== before) changed = true;
    }
    if (days) {
      if (JSON.stringify(days) !== JSON.stringify(Array.isArray(trip.days) ? trip.days : [])) {
        trip.days = days;
        trip.daysUpdatedAt = new Date(now()).toISOString();
        trip.daysUpdatedBy = account.id;
        trip.daysUpdatedByName = account.nickname;
        changed = true;
      }
    }
    if (changed) writeTrip(trip);
    res.json({ trip: view(trip, account.id) });
  }));

  router.post('/trips/:tripId/invites', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    requireOwner(trip, account.id);
    const role = req.body?.role === 'viewer' ? 'viewer' : 'member';
    const canEdit = role === 'member' && req.body?.canEdit === true;
    const days = req.body?.expiresInDays === undefined ? 7 : Number(req.body.expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      throw new CollabError('VALIDATION', '邀请有效期需为1至30天', 400);
    }
    trip.invites = activeInvites(trip, now());
    if (trip.invites.length >= MAX_INVITES) throw new CollabError('INVITE_LIMIT', `最多保留${MAX_INVITES}个有效邀请`, 409);
    const code = randomBytes(12).toString('base64url');
    const invite = {
      id: randomUUID(),
      role,
      canEdit,
      codeHash: hashHex(code),
      codePreview: code.slice(-4),
      createdBy: account.id,
      createdAt: new Date(now()).toISOString(),
      expiresAt: now() + days * 24 * 60 * 60 * 1000
    };
    trip.invites.push(invite);
    writeTrip(trip);
    res.status(201).json({
      code,
      invite: { id: invite.id, role, canEdit, expiresAt: invite.expiresAt, codePreview: invite.codePreview },
      trip: view(trip, account.id)
    });
  }));

  router.delete('/trips/:tripId/invites/:inviteId', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    requireOwner(trip, account.id);
    if (!INVITE_ID.test(req.params.inviteId)) throw new CollabError('NOT_FOUND', '邀请不存在', 404);
    const before = trip.invites.length;
    trip.invites = trip.invites.filter(invite => invite.id !== req.params.inviteId);
    if (trip.invites.length === before) throw new CollabError('NOT_FOUND', '邀请不存在', 404);
    writeTrip(trip);
    res.json({ trip: view(trip, account.id) });
  }));

  router.patch('/trips/:tripId/members/:accountId', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    requireOwner(trip, account.id);
    if (!ACCOUNT_ID.test(req.params.accountId)) throw new CollabError('NOT_FOUND', '成员不存在', 404);
    const target = memberOf(trip, req.params.accountId);
    if (!target) throw new CollabError('NOT_FOUND', '成员不存在', 404);
    if (target.role === 'owner') throw new CollabError('OWNER_PROTECTED', '组织者的权限不能修改', 400);
    if (typeof req.body?.canEdit !== 'boolean') throw new CollabError('VALIDATION', '缺少编辑权限设置', 400);
    const next = target.role === 'viewer' ? false : req.body.canEdit;
    if (target.canEdit !== next) {
      target.canEdit = next;
      writeTrip(trip);
    }
    res.json({ trip: view(trip, account.id) });
  }));

  router.delete('/trips/:tripId/members/:accountId', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    requireOwner(trip, account.id);
    if (!ACCOUNT_ID.test(req.params.accountId)) throw new CollabError('NOT_FOUND', '成员不存在', 404);
    if (req.params.accountId === trip.creatorId) throw new CollabError('OWNER_PROTECTED', '不能移除组织者', 400);
    if (!memberOf(trip, req.params.accountId)) throw new CollabError('NOT_FOUND', '成员不存在', 404);
    removeMemberState(trip, req.params.accountId);
    markChatRevoked(trip, req.params.accountId);
    // 移除成员时同时作废旧邀请，避免被移除者用旧邀请码立即重新加入。
    trip.invites = [];
    writeTrip(trip);
    revokeChat(trip.id, req.params.accountId);
    res.json({ trip: view(trip, account.id) });
  }));

  router.post('/trips/:tripId/leave', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    const member = requireMember(trip, account.id);
    if (member.role === 'owner') {
      throw new CollabError('OWNER_CANNOT_LEAVE', '组织者不能直接退出；请先移除成员，或保留该协作空间', 409);
    }
    removeMemberState(trip, account.id);
    markChatRevoked(trip, account.id);
    writeTrip(trip);
    revokeChat(trip.id, account.id);
    res.status(204).end();
  }));

  router.post('/trips/:tripId/votes', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    requireWriter(trip, account.id);
    const candidateId = optionalId(req.body?.candidateId, CANDIDATE_ID, '候选地点 ID');
    if (!candidateId || !trip.candidates.some(candidate => candidate.id === candidateId)) {
      throw new CollabError('NOT_FOUND', '候选地点不存在', 404);
    }
    const value = req.body?.value;
    if (!['support', 'oppose', 'withdraw'].includes(value)) {
      throw new CollabError('VALIDATION', '投票只能为支持、反对或撤回', 400);
    }
    const index = trip.votes.findIndex(vote => vote.accountId === account.id && vote.candidateId === candidateId);
    let changed = false;
    if (value === 'withdraw') {
      if (index >= 0) {
        trip.votes.splice(index, 1);
        changed = true;
      }
    } else if (index < 0) {
      trip.votes.push({
        candidateId,
        accountId: account.id,
        value,
        updatedAt: new Date(now()).toISOString()
      });
      changed = true;
    } else if (trip.votes[index].value !== value) {
      trip.votes[index].value = value;
      trip.votes[index].updatedAt = new Date(now()).toISOString();
      changed = true;
    }
    if (changed) writeTrip(trip);
    res.json({ trip: view(trip, account.id) });
  }));

  router.post('/trips/:tripId/ledger/expenses', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    const payer = requireWriter(trip, account.id);
    const added = recordSharedExpense(trip, payer, req.body || {}, now());
    if (added) writeTrip(trip);
    res.status(added ? 201 : 200).json({ trip: view(trip, account.id) });
  }));

  router.post('/trips/:tripId/comments', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    requireWriter(trip, account.id);
    const content = text(req.body?.content, 1, 500, '留言');
    const dayDate = optionalDate(req.body?.dayDate);
    const activityId = optionalId(req.body?.activityId, CANDIDATE_ID, '活动 ID');
    const comment = {
      id: randomUUID(),
      accountId: account.id,
      authorName: account.nickname,
      dayDate,
      activityId,
      content,
      createdAt: new Date(now()).toISOString()
    };
    trip.comments.push(comment);
    if (trip.comments.length > MAX_COMMENTS) trip.comments = trip.comments.slice(-MAX_COMMENTS);
    writeTrip(trip);
    res.status(201).json({ comment, trip: view(trip, account.id) });
  }));

  router.delete('/trips/:tripId/comments/:commentId', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    const member = requireMember(trip, account.id);
    const index = trip.comments.findIndex(comment => comment.id === req.params.commentId);
    if (index < 0) throw new CollabError('NOT_FOUND', '留言不存在', 404);
    if (trip.comments[index].accountId !== account.id && member.role !== 'owner') {
      throw new CollabError('FORBIDDEN', '只能删除自己的留言', 403);
    }
    trip.comments.splice(index, 1);
    writeTrip(trip);
    res.json({ trip: view(trip, account.id) });
  }));

  router.post('/trips/:tripId/tasks', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    requireWriter(trip, account.id);
    if (trip.tasks.length >= MAX_TASKS) throw new CollabError('TASK_LIMIT', `任务最多${MAX_TASKS}个`, 409);
    const title = text(req.body?.title, 1, 120, '任务名称');
    const note = optionalText(req.body?.note, 500, '任务备注');
    const dayDate = optionalDate(req.body?.dayDate);
    const activityId = optionalId(req.body?.activityId, CANDIDATE_ID, '活动 ID');
    const task = {
      id: randomUUID(),
      title,
      note,
      dayDate,
      activityId,
      createdBy: account.id,
      creatorName: account.nickname,
      createdAt: new Date(now()).toISOString(),
      claimedBy: null,
      claimedByName: '',
      claimedAt: null,
      completedAt: null
    };
    trip.tasks.push(task);
    writeTrip(trip);
    res.status(201).json({ task, trip: view(trip, account.id) });
  }));

  function taskOf(trip, taskId) {
    const task = trip.tasks.find(item => item.id === taskId);
    if (!task) throw new CollabError('NOT_FOUND', '任务不存在', 404);
    return task;
  }

  router.post('/trips/:tripId/tasks/:taskId/claim', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    requireWriter(trip, account.id);
    const task = taskOf(trip, req.params.taskId);
    if (task.claimedBy && task.claimedBy !== account.id) {
      throw new CollabError('TASK_ALREADY_CLAIMED', `任务已被${task.claimedByName || '其他成员'}认领`, 409);
    }
    if (task.completedAt) throw new CollabError('TASK_COMPLETED', '已完成的任务不能重新认领', 409);
    if (task.claimedBy !== account.id) {
      task.claimedBy = account.id;
      task.claimedByName = account.nickname;
      task.claimedAt = new Date(now()).toISOString();
      writeTrip(trip);
    }
    res.json({ task, trip: view(trip, account.id) });
  }));

  router.post('/trips/:tripId/tasks/:taskId/release', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    const member = requireMember(trip, account.id);
    const task = taskOf(trip, req.params.taskId);
    if (task.claimedBy !== account.id && member.role !== 'owner') {
      throw new CollabError('FORBIDDEN', '只能释放自己认领的任务', 403);
    }
    if (task.claimedBy) {
      task.claimedBy = null;
      task.claimedByName = '';
      task.claimedAt = null;
      writeTrip(trip);
    }
    res.json({ task, trip: view(trip, account.id) });
  }));

  router.post('/trips/:tripId/tasks/:taskId/complete', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    const member = requireMember(trip, account.id);
    const task = taskOf(trip, req.params.taskId);
    if (task.claimedBy !== account.id && member.role !== 'owner') {
      throw new CollabError('FORBIDDEN', '只有认领者或组织者可以确认完成', 403);
    }
    const completed = req.body?.completed !== false;
    if (Boolean(task.completedAt) !== completed) {
      task.completedAt = completed ? new Date(now()).toISOString() : null;
      writeTrip(trip);
    }
    res.json({ task, trip: view(trip, account.id) });
  }));

  router.delete('/trips/:tripId/tasks/:taskId', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    const member = requireMember(trip, account.id);
    const task = taskOf(trip, req.params.taskId);
    if (task.createdBy !== account.id && member.role !== 'owner') {
      throw new CollabError('FORBIDDEN', '只能删除自己创建的任务', 403);
    }
    trip.tasks = trip.tasks.filter(item => item.id !== task.id);
    writeTrip(trip);
    res.json({ trip: view(trip, account.id) });
  }));

  // 聊天令牌只在成员关系有效时签发；房间固定为 trip-<tripId>。
  router.post('/trips/:tripId/chat-token', route((req, res) => {
    const account = requireAuth(req);
    const trip = readTrip(req.params.tripId);
    const member = requireMember(trip, account.id);
    if (member.role === 'viewer') throw new CollabError('FORBIDDEN', '只读成员不能进入聊天室', 403);
    if (!chatConfigured) throw new CollabError('CHAT_NOT_CONFIGURED', '聊天鉴权尚未配置，暂时不能进入同行聊天室', 503);
    const signed = signChatToken({
      secret: chatSecret,
      accountId: account.id,
      name: account.nickname,
      roomId: `trip-${trip.id}`,
      now: now()
    });
    res.json({ ...signed, roomId: `trip-${trip.id}` });
  }));

  return router;
}
