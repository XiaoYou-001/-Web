import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import * as service from '../src/services/authService.js';
import { useAuthStore } from '../src/stores/auth.js';
import { chatService } from '../src/services/chatService.js';
import { clearVerificationCodes, sendVerificationCode, verifyCode } from '../src/services/smsService.js';
import wechat from '../src/services/wechatLoginService.js';

let storage;
const originalStorage = globalThis.localStorage;
beforeEach(t => {
  storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  clearVerificationCodes();
  wechat.stopPolling();
  setActivePinia(createPinia());
  t.mock.method(chatService, 'disconnect', () => {});
});
afterEach(() => {
  wechat.stopPolling();
  globalThis.localStorage = originalStorage;
});

const register = (phone = '13800138000', password = 'old-pass') => {
  const result = service.registerUser(phone, password);
  assert.equal(result.success, true);
  return result.user;
};

test('registration and login expose one account identity without leaking password in session', () => {
  const registered = register();
  assert.equal(registered.password, undefined);
  assert.equal(service.registerUser('13800138000', 'another-pass').success, false);
  const auth = useAuthStore();
  assert.equal(auth.login('13800138000', 'wrong-pass').success, false);
  assert.equal(auth.isAuthenticated, false);
  assert.equal(auth.login('13800138000', 'old-pass').success, true);
  assert.equal(auth.user.id, registered.id);
  assert.equal(auth.user.nickname, '用户8000');
  assert.equal(service.getCurrentUser().id, registered.id);
  assert.equal(JSON.parse(storage.get('currentUser')).password, undefined);
  assert.equal(service.isLoggedIn(), true);
});

test('profile changes persist per account across logout and login', () => {
  register();
  register('13900139000');
  const auth = useAuthStore();
  auth.login('13800138000', 'old-pass');
  const id = auth.user.id;
  const avatar = 'data:image/png;base64,aGVsbG8=';
  assert.equal(auth.updateProfile({ nickname: '  小游  ', avatar }).success, true);
  assert.equal(auth.user.nickname, '小游');
  auth.logout();
  auth.login('13900139000', 'old-pass');
  assert.notEqual(auth.user.id, id);
  assert.equal(auth.user.nickname, '用户9000');
  assert.equal(auth.user.avatar, service.DEFAULT_AVATAR);
  auth.logout();
  auth.login('13800138000', 'old-pass');
  assert.equal(auth.user.id, id);
  assert.equal(auth.user.nickname, '小游');
  assert.equal(auth.user.avatar, avatar);
});

test('password change rejects incorrect old password and forces login with the new password', () => {
  register();
  const auth = useAuthStore();
  auth.login('13800138000', 'old-pass');
  assert.equal(auth.changePassword('wrong', 'new-pass').success, false);
  assert.equal(auth.changePassword('old-pass', '123').success, false);
  assert.equal(auth.changePassword('old-pass', 'old-pass').success, false);
  assert.equal(auth.user.hasPassword, true);
  assert.equal(auth.changePassword('old-pass', 'new-pass').success, true);
  assert.equal(auth.isAuthenticated, false);
  assert.equal(service.isLoggedIn(), false);
  assert.equal(auth.login('13800138000', 'old-pass').success, false);
  assert.equal(auth.login('13800138000', 'new-pass').success, true);
});

test('logout removes all session and legacy profile fields while retaining registered accounts', () => {
  register();
  const auth = useAuthStore();
  auth.login('13800138000', 'old-pass');
  for (const key of ['authToken', 'userInfo', 'userNickname', 'userAvatar', 'userPhone', 'userPassword', 'username', 'userId']) storage.set(key, 'old-value');
  auth.logout();
  assert.deepEqual([...storage.keys()], ['users']);
  assert.equal(auth.user, null);
  assert.ok(chatService.disconnect.mock.callCount() > 0);
  assert.equal(service.getCurrentUser(), null);
});

test('a flag or invalid session does not authenticate and legacy account sessions still load', () => {
  const user = register();
  storage.set('isAuthenticated', 'true');
  assert.equal(service.isLoggedIn(), false);
  storage.set('currentUser', '{broken-json');
  assert.equal(service.isLoggedIn(), false);
  storage.set('currentUser', JSON.stringify({ id: 'missing-user' }));
  assert.equal(service.isLoggedIn(), false);
  storage.set('currentUser', JSON.stringify({ id: user.id, phone: 'stale', nickname: 'stale', loginType: 'phone' }));
  assert.equal(service.getCurrentUser().phone, '13800138000');
  assert.equal(service.getCurrentUser().nickname, '用户8000');
  storage.set('users', '{broken-json');
  assert.doesNotThrow(service.getCurrentUser);
  assert.equal(service.isLoggedIn(), false);
});

test('storage quota failures do not change the displayed or saved profile', () => {
  register();
  const auth = useAuthStore();
  auth.login('13800138000', 'old-pass');
  const originalUsers = storage.get('users');
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(auth.updateProfile({ nickname: 'not-saved' }).success, false);
  assert.equal(auth.user.nickname, '用户8000');
  assert.equal(storage.get('users'), originalUsers);
});

test('failed session persistence clears partial session state instead of reporting login success', () => {
  register();
  const auth = useAuthStore();
  auth.login('13800138000', 'old-pass');
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(auth.login('13800138000', 'old-pass').success, false);
  assert.equal(auth.user, null);
  assert.equal(service.isLoggedIn(), false);
});

test('phone binding verifies the code for the current account and prevents duplicate bindings', async () => {
  register();
  register('13900139000');
  const auth = useAuthStore();
  auth.login('13800138000', 'old-pass');
  assert.equal(auth.bindPhone('13700137000', '123456').success, false);
  const demo = await sendVerificationCode('13700137000', auth.user.id);
  assert.equal(demo.provider, 'demo');
  const wrongCode = demo.code === '000000' ? '111111' : '000000';
  assert.equal(auth.bindPhone('13700137000', wrongCode).success, false);
  assert.equal(auth.user.phone, '13800138000');
  assert.equal(auth.bindPhone('13700137000', demo.code).success, true);
  assert.equal(auth.user.phone, '13700137000');
  assert.equal(auth.bindPhone('13900139000', demo.code).success, false);
  assert.equal(auth.login('13800138000', 'old-pass').success, false);
  assert.equal(auth.login('13700137000', 'old-pass').success, true);
});

test('demo verification codes cannot be reused, crossed between accounts or guessed indefinitely', async () => {
  const demo = await sendVerificationCode('13800138000', 'account-a');
  assert.equal(verifyCode('13800138000', demo.code, 'account-b').success, false);
  await assert.rejects(sendVerificationCode('13800138000', 'account-a'), /60秒/);
  for (let i = 0; i < 5; i++) assert.equal(verifyCode('13800138000', demo.code + 'x', 'account-a').success, false);
  assert.equal(verifyCode('13800138000', demo.code, 'account-a').success, false);
  const other = await sendVerificationCode('13900139000', 'account-a');
  assert.equal(verifyCode('13900139000', other.code, 'account-a').success, true);
  assert.equal(verifyCode('13900139000', other.code, 'account-a').success, false);
});

test('WeChat demo waits for explicit confirmation and reuses a stable account identity', async () => {
  const session = await wechat.getQRCode();
  assert.equal((await wechat.getLoginStatus(session.data.loginId)).status, 'waiting');
  assert.equal(service.isLoggedIn(), false);
  const confirmed = await wechat.confirmDemoLogin(session.data.loginId);
  const auth = useAuthStore();
  auth.loginWithWechat(confirmed.userInfo);
  const id = auth.user.id;
  auth.updateProfile({ nickname: '自定义微信昵称' });
  assert.equal(auth.changePassword('', 'new-pass').success, false);
  auth.logout();
  auth.loginWithWechat(confirmed.userInfo);
  assert.equal(auth.user.id, id);
  assert.equal(auth.user.nickname, '自定义微信昵称');
  assert.equal(JSON.parse(storage.get('users')).length, 1);
  assert.equal(storage.has('authToken'), false);
});

test('a WeChat demo account can bind a phone and set a password without creating another identity', async () => {
  const auth = useAuthStore();
  auth.loginWithWechat({ openId: 'demo-account', nickname: '演示用户' });
  const id = auth.user.id;
  const demo = await sendVerificationCode('13800138000', id);
  assert.equal(auth.bindPhone('13800138000', demo.code).success, true);
  assert.equal(auth.changePassword('', 'phone-pass').success, true);
  assert.equal(auth.user, null);
  assert.equal(auth.login('13800138000', 'phone-pass').success, true);
  assert.equal(auth.user.id, id);
  assert.equal(auth.user.hasPassword, true);
  assert.equal(JSON.parse(storage.get('users')).length, 1);
});

test('expired demo codes and codes cleared by logout cannot bind a phone', async t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const demo = await sendVerificationCode('13800138000', 'account-a');
  now += 600000;
  assert.equal(verifyCode('13800138000', demo.code, 'account-a').success, false);
  const next = await sendVerificationCode('13900139000', 'account-a');
  service.logout();
  assert.equal(verifyCode('13900139000', next.code, 'account-a').success, false);
});

test('stopping WeChat polling suppresses a pending result and does not restart timers', async t => {
  let resolveStatus;
  let deliveries = 0;
  let resolveEntered;
  const entered = new Promise(resolve => { resolveEntered = resolve; });
  t.mock.method(wechat, 'getLoginStatus', () => {
    resolveEntered();
    return new Promise(resolve => { resolveStatus = resolve; });
  });
  wechat.startPolling('test', () => { deliveries++; }, 1);
  await entered;
  wechat.stopPolling();
  resolveStatus({ success: true, status: 'confirmed', userInfo: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(deliveries, 0);
  assert.equal(wechat.pollingTimer, null);
});

test('store refresh reflects another tab logging out and disconnects stale chat identity', () => {
  register();
  const auth = useAuthStore();
  auth.login('13800138000', 'old-pass');
  storage.delete('currentUser');
  auth.refresh();
  assert.equal(auth.user, null);
  assert.equal(auth.isAuthenticated, false);
  assert.ok(chatService.disconnect.mock.callCount() > 0);
});
