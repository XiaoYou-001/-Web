import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import * as service from '../src/services/authService.js';
import { useAuthStore } from '../src/stores/auth.js';
import { sha256, hashPassword, verifyPassword, hasStoredPassword } from '../src/utils/passwordHash.js';

let storage;
const originalStorage = globalThis.localStorage;
beforeEach(() => {
  storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  setActivePinia(createPinia());
});
afterEach(() => {
  globalThis.localStorage = originalStorage;
});

const users = () => JSON.parse(storage.get('users') || '[]');

const register = (phone = '13800138000', password = 'old-pass') => {
  const result = service.registerUser(phone, password);
  assert.equal(result.success, true);
  return result.user;
};

test('sha256 matches the standard empty-message and abc vectors', () => {
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('identical plaintext passwords produce different salted hashes', () => {
  const a = hashPassword('same-pass');
  const b = hashPassword('same-pass');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.equal(a.hash.length, 64);
  assert.equal(a.salt.length, 16);
  assert.equal(verifyPassword('same-pass', a).ok, true);
  assert.equal(verifyPassword('wrong', a).ok, false);
});

test('registering no longer stores a plaintext password', () => {
  register();
  const [user] = users();
  assert.equal(user.password, undefined);
  assert.equal(typeof user.passwordHash, 'string');
  assert.equal(typeof user.salt, 'string');
  assert.equal(hasStoredPassword(user), true);
  // 登录后，会话与公开用户同样不泄露摘要/明文
  const auth = useAuthStore();
  auth.login('13800138000', 'old-pass');
  assert.equal(auth.user.passwordHash, undefined);
  assert.equal(auth.user.password, undefined);
});

test('login verifies against the salted hash and rejects a wrong password', () => {
  register();
  const auth = useAuthStore();
  assert.equal(auth.login('13800138000', 'wrong').success, false);
  assert.equal(auth.login('13800138000', 'old-pass').success, true);
  assert.equal(auth.user.phone, '13800138000');
});

test('a legacy plaintext account is upgraded to salted hash on first successful login', () => {
  // 模拟历史遗留的明文账号
  storage.set('users', JSON.stringify([{ id: 'legacy-1', phone: '13800138000', password: 'plain-pass', createdAt: new Date().toISOString(), isWechatUser: false }]));
  const auth = useAuthStore();
  assert.equal(auth.login('13800138000', 'plain-pass').success, true);
  const [user] = users();
  assert.equal(user.password, undefined);
  assert.equal(typeof user.passwordHash, 'string');
  // 升级后仍可用新密码登录，且错误密码被拒绝
  auth.logout();
  assert.equal(service.loginUser('13800138000', 'plain-pass').success, true);
  assert.equal(service.loginUser('13800138000', 'wrong').success, false);
});

test('changing password stores a hashed value and old plaintext is removed', () => {
  // 先用明文写入一个账号并登录，随后修改密码
  storage.set('users', JSON.stringify([{ id: 'legacy-1', phone: '13800138000', password: 'old-pass', createdAt: new Date().toISOString(), isWechatUser: false }]));
  const auth = useAuthStore();
  auth.login('13800138000', 'old-pass'); // 触发升级为摘要
  assert.equal(auth.changePassword('old-pass', 'new-pass').success, true);
  const [user] = users();
  assert.equal(user.password, undefined);
  assert.equal(typeof user.passwordHash, 'string');
  assert.equal(service.loginUser('13800138000', 'old-pass').success, false);
  assert.equal(service.loginUser('13800138000', 'new-pass').success, true);
});

test('hashed auth still rejects wrong old password on change', () => {
  register();
  const auth = useAuthStore();
  auth.login('13800138000', 'old-pass');
  const before = JSON.stringify(users());
  assert.equal(auth.changePassword('nope', 'new-pass').success, false);
  assert.equal(JSON.stringify(users()), before);
});
