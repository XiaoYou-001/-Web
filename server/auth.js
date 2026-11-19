import express from 'express';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// 服务端账号与会话。密码只在服务端用 scrypt 加盐保存；浏览器只持有随机会话令牌。
// 这是同行协商功能所需的正式身份，不把本地演示账号 ID 当作认证凭证。
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 20;

const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const MAX_ACCOUNTS = 10000;

export class AuthError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

export function validPhone(phone) {
  return typeof phone === 'string' && PHONE_PATTERN.test(phone);
}

export function validPassword(password) {
  return typeof password === 'string' && password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

export function normalizeNickname(value) {
  const nickname = typeof value === 'string' ? value.trim() : '';
  if (!nickname || [...nickname].length > 30) throw new AuthError('VALIDATION', '昵称需为1至30个字符', 400);
  return nickname;
}

const digest = value => createHash('sha256').update(value).digest('hex');

function readJSON(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new AuthError('STORAGE_UNAVAILABLE', '账号数据读取失败，请稍后重试', 503);
  }
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, path);
}

function hashPassword(password, salt) {
  return scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex');
}

function safeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function bearerToken(header) {
  if (typeof header !== 'string') return '';
  const match = /^Bearer\s+([A-Za-z0-9_-]{32,200})$/i.exec(header.trim());
  return match ? match[1] : '';
}

function publicAccount(account) {
  return {
    id: account.id,
    phone: account.phone,
    nickname: account.nickname,
    createdAt: account.createdAt
  };
}

export function createAuthService({ directory, now = Date.now } = {}) {
  if (!directory) throw new Error('缺少协作账号存储目录');
  const root = resolve(directory);
  const accountsFile = join(root, 'accounts.json');
  const sessionsFile = join(root, 'sessions.json');

  function readAccounts() {
    const value = readJSON(accountsFile, {});
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AuthError('STORAGE_UNAVAILABLE', '账号数据格式异常，请联系管理员', 503);
    }
    return value;
  }

  function readSessions() {
    const value = readJSON(sessionsFile, {});
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AuthError('STORAGE_UNAVAILABLE', '会话数据格式异常，请联系管理员', 503);
    }
    return value;
  }

  function pruneSessions(sessions) {
    let changed = false;
    for (const [key, session] of Object.entries(sessions)) {
      if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt <= now()) {
        delete sessions[key];
        changed = true;
      }
    }
    return changed;
  }

  function saveSessions(sessions) {
    pruneSessions(sessions);
    atomicWrite(sessionsFile, sessions);
  }

  function createSession(accountId) {
    const sessions = readSessions();
    const token = randomBytes(32).toString('hex');
    const expiresAt = now() + SESSION_TTL_MS;
    sessions[digest(token)] = { accountId, createdAt: now(), expiresAt };
    // 单个账号最多保留 20 个有效会话，避免会话文件无限增长。
    const mine = Object.entries(sessions)
      .filter(([, session]) => session.accountId === accountId)
      .sort((a, b) => b[1].createdAt - a[1].createdAt);
    for (const [key] of mine.slice(20)) delete sessions[key];
    saveSessions(sessions);
    return { token, expiresAt };
  }

  function findAccountByPhone(phone) {
    return Object.values(readAccounts()).find(account => account.phone === phone) || null;
  }

  function register({ phone, password, nickname } = {}) {
    if (!validPhone(phone)) throw new AuthError('VALIDATION', '手机号格式不正确', 400);
    if (!validPassword(password)) throw new AuthError('VALIDATION', `密码长度应为${PASSWORD_MIN}-${PASSWORD_MAX}位`, 400);
    const displayName = nickname === undefined || nickname === '' ? `用户${phone.slice(-4)}` : normalizeNickname(nickname);
    const accounts = readAccounts();
    if (Object.values(accounts).some(account => account.phone === phone)) {
      throw new AuthError('ACCOUNT_EXISTS', '该手机号已创建协作账号', 409);
    }
    if (Object.keys(accounts).length >= MAX_ACCOUNTS) {
      throw new AuthError('SERVICE_UNAVAILABLE', '账号数量已达上限', 503);
    }
    const salt = randomBytes(16).toString('hex');
    const account = {
      id: randomUUID(),
      phone,
      nickname: displayName,
      salt,
      passwordHash: hashPassword(password, salt),
      createdAt: new Date(now()).toISOString()
    };
    accounts[account.id] = account;
    atomicWrite(accountsFile, accounts);
    return { user: publicAccount(account), ...createSession(account.id) };
  }

  function login({ phone, password } = {}) {
    // 手机号不存在与密码错误返回同一个错误，避免把登录接口当成“手机号是否注册”的查询器。
    if (typeof phone !== 'string' || typeof password !== 'string') {
      throw new AuthError('INVALID_CREDENTIALS', '手机号或密码错误', 401);
    }
    const account = findAccountByPhone(phone);
    if (!account) throw new AuthError('INVALID_CREDENTIALS', '手机号或密码错误', 401);
    if (!validPassword(password)) throw new AuthError('INVALID_CREDENTIALS', '手机号或密码错误', 401);
    let ok = false;
    try {
      ok = safeEqualHex(hashPassword(password, account.salt), account.passwordHash);
    } catch {
      ok = false;
    }
    if (!ok) throw new AuthError('INVALID_CREDENTIALS', '手机号或密码错误', 401);
    return { user: publicAccount(account), ...createSession(account.id) };
  }

  function authenticate(authorization) {
    const token = bearerToken(authorization);
    if (!token) return null;
    const sessions = readSessions();
    const key = digest(token);
    const session = sessions[key];
    if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt <= now()) {
      if (session) {
        delete sessions[key];
        atomicWrite(sessionsFile, sessions);
      }
      return null;
    }
    const account = readAccounts()[session.accountId];
    if (!account) {
      delete sessions[key];
      atomicWrite(sessionsFile, sessions);
      return null;
    }
    return publicAccount(account);
  }

  function logout(authorization) {
    const token = bearerToken(authorization);
    if (!token) return;
    const sessions = readSessions();
    const key = digest(token);
    if (sessions[key]) {
      delete sessions[key];
      atomicWrite(sessionsFile, sessions);
    }
  }

  function updateProfile(accountId, patch = {}) {
    const accounts = readAccounts();
    const account = accounts[accountId];
    if (!account) throw new AuthError('AUTH_REQUIRED', '登录状态已失效，请重新登录', 401);
    if ('nickname' in patch) account.nickname = normalizeNickname(patch.nickname);
    atomicWrite(accountsFile, accounts);
    return publicAccount(account);
  }

  function accountById(accountId) {
    const account = readAccounts()[accountId];
    return account ? publicAccount(account) : null;
  }

  return {
    directory: root,
    register,
    login,
    authenticate,
    logout,
    updateProfile,
    accountById,
    publicAccount
  };
}

function sendError(res, error) {
  if (error instanceof AuthError) {
    return res.status(error.status).json({ code: error.code, error: error.message });
  }
  console.error('协作账号请求失败:', error);
  return res.status(503).json({ code: 'SERVICE_UNAVAILABLE', error: '协作账号服务暂时不可用，请稍后重试' });
}

export function createAuthRouter({ directory, now = Date.now, loginLimit = 10, registerLimit = 20 } = {}) {
  const service = createAuthService({ directory, now });
  const router = express.Router();
  const attempts = new Map();
  const registrations = new Map();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });

  function attemptKey(req, phone) {
    return `${req.ip || req.socket?.remoteAddress || 'unknown'}:${phone || ''}`;
  }

  function checkAttempt(req, phone) {
    const key = attemptKey(req, phone);
    const entry = attempts.get(key);
    if (entry && entry.until <= now()) attempts.delete(key);
    const current = attempts.get(key);
    if (current && current.count >= loginLimit) {
      throw new AuthError('RATE_LIMIT', '登录尝试过于频繁，请15分钟后再试', 429);
    }
  }

  function recordFailure(req, phone) {
    if (attempts.size > 5000) attempts.clear();
    const key = attemptKey(req, phone);
    const entry = attempts.get(key) || { count: 0, until: now() + 15 * 60 * 1000 };
    entry.count += 1;
    attempts.set(key, entry);
  }

  // 注册接口会暴露手机号是否已存在，按 IP 限流，避免被批量试探。
  function checkRegisterLimit(req) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const current = registrations.get(key);
    if (current && current.until <= now()) registrations.delete(key);
    const active = registrations.get(key);
    if (active && active.count >= registerLimit) {
      throw new AuthError('RATE_LIMIT', '注册请求过于频繁，请稍后再试', 429);
    }
    if (registrations.size > 5000) registrations.clear();
    registrations.set(key, { count: (active?.count || 0) + 1, until: active?.until ?? now() + 15 * 60 * 1000 });
  }

  router.get('/status', (_req, res) => res.json({ enabled: true, sessionTtlMs: SESSION_TTL_MS }));

  router.post('/register', (req, res) => {
    try {
      checkRegisterLimit(req);
      const result = service.register(req.body || {});
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/login', (req, res) => {
    const { phone, password } = req.body || {};
    try {
      checkAttempt(req, phone);
      const result = service.login({ phone, password });
      attempts.delete(attemptKey(req, phone));
      res.json(result);
    } catch (error) {
      if (error instanceof AuthError && error.code === 'INVALID_CREDENTIALS') recordFailure(req, phone);
      sendError(res, error);
    }
  });

  router.get('/me', (req, res) => {
    try {
      const user = service.authenticate(req.headers['x-travel-authorization'] ?? req.headers.authorization);
      if (!user) throw new AuthError('AUTH_REQUIRED', '登录状态已失效，请重新登录', 401);
      res.json({ user });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/me', (req, res) => {
    try {
      const user = service.authenticate(req.headers['x-travel-authorization'] ?? req.headers.authorization);
      if (!user) throw new AuthError('AUTH_REQUIRED', '登录状态已失效，请重新登录', 401);
      res.json({ user: service.updateProfile(user.id, req.body || {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/logout', (req, res) => {
    try {
      service.logout(req.headers['x-travel-authorization'] ?? req.headers.authorization);
      res.status(204).end();
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
