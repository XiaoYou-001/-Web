import { mockFeedback } from './helpers/feedback.js';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { registerUser } from '../src/services/authService.js';
import { useAuthStore } from '../src/stores/auth.js';
import { chatService } from '../src/services/chatService.js';
import wechat from '../src/services/wechatLoginService.js';
import { clearVerificationCodes } from '../src/services/smsService.js';
import { createOptionsView, createViewState, loadView, renderView } from './helpers/vueView.js';

const Profile = await loadView('ProfileView');
const Home = await loadView('HomeView');
const Chat = await loadView('ChatView');
const Login = await loadView('LoginView');
let pinia, router, auth, storage, notices;
const originals = { localStorage: globalThis.localStorage, alert: globalThis.alert, confirm: globalThis.confirm };

beforeEach(t => {
  storage = new Map();
  notices = [];
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  mockFeedback(t, notices);

  pinia = createPinia();
  setActivePinia(pinia);
  router = createRouter({ history: createMemoryHistory(), routes: ['/', '/login'].map(path => ({ path, component: { render: () => null } })) });
  auth = useAuthStore();
  t.mock.method(chatService, 'disconnect', () => {});
  clearVerificationCodes();
  registerUser('13800138000', 'old-pass');
  auth.login('13800138000', 'old-pass');
});
afterEach(() => {
  wechat.stopPolling();
  Object.assign(globalThis, originals);
});

test('profile, home and chat share the same account identity and updated nickname', async () => {
  const profile = await createViewState(Profile, [pinia, router]);
  const home = await createOptionsView(Home, [pinia, router]);
  const chat = await createOptionsView(Chat, [pinia, router]);
  assert.equal(profile.userProfile.value.userId, auth.user.id);
  assert.equal(chat.userId, auth.user.id);
  assert.equal(home.username, auth.user.nickname);
  profile.startNicknameEdit();
  assert.equal(profile.tempNickname.value, auth.user.nickname);
  profile.tempNickname.value = '统一昵称';
  profile.saveNickname();
  assert.equal(home.username, '统一昵称');
  assert.equal(chat.username, '统一昵称');
  const html = await renderView(Profile, profile);
  assert.ok(html.includes('统一昵称'));
  assert.ok(html.includes(auth.user.createdAt.slice(0, 10)));
  assert.ok(!storage.has('userNickname'));
});

test('profile password change validates confirmation and old password, then redirects to login', async () => {
  const profile = await createViewState(Profile, [pinia, router]);
  profile.oldPassword.value = 'old-pass';
  profile.newPassword.value = 'new-pass';
  profile.confirmPassword.value = 'different';
  profile.changePassword();
  assert.match(notices.at(-1), /不一致/);
  profile.confirmPassword.value = 'new-pass';
  profile.oldPassword.value = 'wrong-pass';
  profile.changePassword();
  assert.match(notices.at(-1), /当前密码错误/);
  profile.oldPassword.value = 'old-pass';
  profile.changePassword();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(auth.isAuthenticated, false);
  assert.equal(router.currentRoute.value.path, '/login');
  assert.equal(profile.newPassword.value, '');
  assert.equal(auth.login('13800138000', 'old-pass').success, false);
  assert.equal(auth.login('13800138000', 'new-pass').success, true);
});

test('profile phone binding requires the displayed demo code and updates the actual account', async t => {
  t.mock.method(globalThis, 'setInterval', () => 123);
  const profile = await createViewState(Profile, [pinia, router]);
  profile.phoneNumber.value = '13700137000';
  profile.verificationCode.value = '123456';
  profile.bindPhone();
  assert.equal(auth.user.phone, '13800138000');
  await profile.sendVerificationCode();
  assert.equal(profile.demoCode.value.length, 6);
  profile.verificationCode.value = profile.demoCode.value;
  profile.bindPhone();
  assert.equal(auth.user.phone, '13700137000');
  assert.equal(profile.userProfile.value.phone, '13700137000');
  assert.equal(profile.demoCode.value, '');
});

test('home logout and profile account switch clear the shared session', async () => {
  const home = await createOptionsView(Home, [pinia, router]);
  home.logout();
  assert.equal(auth.user, null);
  assert.equal(home.isAuthenticated, false);
  assert.equal(storage.has('currentUser'), false);
  auth.login('13800138000', 'old-pass');
  const profile = await createViewState(Profile, [pinia, router]);
  await profile.switchAccount();
  assert.equal(auth.user, null);
  assert.ok(chatService.disconnect.mock.callCount() >= 2);
});

test('chat history is separated by account while retaining each account history', async () => {
  const chat = await createOptionsView(Chat, [pinia, router]);
  const id = chat.userId;
  chat.messages = [{ type: 'message', content: 'account-a-only' }];
  chat.saveRoomHistory('general');
  registerUser('13900139000', 'old-pass');
  auth.login('13900139000', 'old-pass');
  chat.loadRoomHistory('general');
  assert.equal(chat.messages.length, 0);
  assert.notEqual(chat.userId, id);
  auth.login('13800138000', 'old-pass');
  chat.loadRoomHistory('general');
  assert.equal(chat.messages[0].content, 'account-a-only');
  assert.ok(storage.has(`chat_history_${id}_general`));
});

test('WeChat login view requires explicit demo authorization and clears its timers', async t => {
  auth.logout();
  const login = await createOptionsView(Login, [pinia, router]);
  t.after(() => Login.beforeUnmount.call(login));
  login.activeTab = 'wechat';
  await login.getQRCode();
  assert.equal(auth.isAuthenticated, false);
  assert.equal(login.isPolling, true);
  await login.simulateWechatLogin();
  assert.equal(auth.user.nickname, '微信演示用户');
  assert.equal(login.isPolling, false);
  assert.equal(login.countdownTimer, null);
  assert.equal(wechat.pollingTimer, null);
});

test('switching login tabs suppresses an unfinished WeChat initialization', async t => {
  auth.logout();
  let finish;
  t.mock.method(wechat, 'getQRCode', () => new Promise(resolve => { finish = resolve; }));
  const login = await createOptionsView(Login, [pinia, router]);
  login.activeTab = 'wechat';
  const pending = login.getQRCode();
  login.switchToPhone();
  finish({ success: true, data: { loginId: 'late', expireTime: Date.now() + 10000 } });
  await pending;
  assert.equal(login.loginId, '');
  assert.equal(login.isPolling, false);
  assert.equal(auth.isAuthenticated, false);
});
