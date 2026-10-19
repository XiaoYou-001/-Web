import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { nextTick } from 'vue';
import { validateAccountFields, validatePassword } from '../src/utils/validation.js';
import { registerUser } from '../src/services/authService.js';
import { useAuthStore } from '../src/stores/auth.js';
import { useTravelStore } from '../src/stores/travel.js';
import { feedback } from '../src/services/feedbackService.js';
import { createOptionsView, createViewState, loadView, renderView } from './helpers/vueView.js';
import { mountState } from './helpers/mountState.js';

const Login = await loadView('LoginView'), Register = await loadView('RegisterView');
const Routes = await loadView('RoutesView'), Profile = await loadView('ProfileView');
const Tickets = await loadView('TicketsView'), Attractions = await loadView('AttractionsView');
const Chat = await loadView('ChatView');
const originalStorage = globalThis.localStorage;
let pinia, router, auth, travel, storage;
beforeEach(() => {
  feedback.reset(); storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  pinia = createPinia(); setActivePinia(pinia);
  auth = useAuthStore(); travel = useTravelStore();
  router = createRouter({ history: createMemoryHistory(), routes: ['/', '/login'].map(path => ({ path, component: { render: () => null } })) });
});
afterEach(() => { feedback.reset(); globalThis.localStorage = originalStorage; });

test('account rules share password bounds, trim only the phone and report individual fields', () => {
  assert.match(validateAccountFields({}, { registration: true }).confirmPassword, /再次输入/);
  assert.deepEqual(validateAccountFields({ phone: '13800138000', password: '123456', confirmPassword: '123456' }, { registration: true }), {});
  for (const password of ['12345', 'x'.repeat(21)]) {
    assert.equal(validatePassword(password), false);
    assert.match(validateAccountFields({ phone: '13800138000', password }).password, /6-20/);
  }
  const errors = validateAccountFields({ phone: '123', password: '', confirmPassword: 'other' }, { registration: true });
  assert.deepEqual(Object.keys(errors), ['phone', 'password', 'confirmPassword']);
  assert.deepEqual(validateAccountFields({ phone: ' 13800138000 ', password: ' pass ', agreeToTerms: true }, { requireTerms: true }), {});
});

test('registration retains invalid drafts with accessible field errors and reports storage failure inline', async () => {
  const page = await createOptionsView(Register, [router]);
  page.phone = '123'; page.password = '123'; page.confirmPassword = 'different';
  page.register(); await nextTick();
  assert.equal(storage.has('users'), false);
  assert.equal(page.confirmPassword, 'different');
  const html = await renderView({ ...Register, data: () => ({}) }, { ...page.$data }, [router]);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="register-phone-error"/);
  assert.match(html, /两次输入的密码不一致/);
  page.clearFieldError('phone');
  assert.equal(page.fieldErrors.phone, undefined);
  page.phone = ' 13800138000 '; page.password = ' pass '; page.confirmPassword = ' pass ';
  globalThis.localStorage.setItem = () => { throw new Error('quota'); };
  page.register();
  assert.match(page.formError, /保存失败/);
  assert.equal(page.password, ' pass ');
  assert.equal(feedback.notices.value.length, 0);
});

test('login keeps rejected values, requires agreement, and shares the same normalized phone rules', async () => {
  registerUser('13800138000', ' pass ');
  const page = await createOptionsView(Login, [pinia, router]);
  page.phone = ' 13800138000 '; page.password = 'wrong-password';
  page.loginWithPhone();
  assert.match(page.fieldErrors.agreeToTerms, /同意/);
  assert.equal(auth.user, null);
  page.agreeToTerms = true; page.loginWithPhone();
  assert.match(page.formError, /手机号或密码错误/);
  assert.equal(page.password, 'wrong-password');
  page.password = ' pass '; page.loginWithPhone();
  await nextTick();
  assert.equal(auth.user.phone, '13800138000');
  assert.equal(feedback.notices.value.at(-1).type, 'success');
});

test('deleting a route waits for confirmation, cancellation preserves it, and account changes block stale actions', async t => {
  registerUser('13800138000', 'test-pass'); registerUser('13900139000', 'test-pass');
  auth.login('13800138000', 'test-pass');
  travel.saveRoute({ title: '保留线路', startDate: '2030-12-01', endDate: '2030-12-02', themes: [], preferences: {} });
  const page = await createViewState(Routes, [pinia]);
  const id = page.myRoutes.value[0].id;
  let pending = page.deleteRoute(id);
  assert.equal(page.myRoutes.value.length, 1);
  feedback.settleConfirmation(false); await pending;
  assert.equal(page.myRoutes.value.length, 1);
  t.mock.method(travel, 'deleteRoute');
  pending = page.deleteRoute(id);
  auth.login('13900139000', 'test-pass');
  feedback.settleConfirmation(true); await pending;
  assert.equal(travel.deleteRoute.mock.callCount(), 0);
  auth.login('13800138000', 'test-pass');
  pending = page.deleteRoute(id);
  feedback.settleConfirmation(true); await pending;
  assert.equal(page.myRoutes.value.length, 0);
});

test('leaving the route page cancels pending deletion and leaves saved data intact', async () => {
  registerUser('13800138000', 'test-pass'); auth.login('13800138000', 'test-pass');
  travel.saveRoute({ title: '不删除', startDate: '2030-12-01', endDate: '2030-12-02', themes: [], preferences: {} });
  const { state, unmount } = mountState(Routes, [pinia]);
  const pending = state.deleteRoute(state.myRoutes.value[0].id);
  unmount(); feedback.settleConfirmation(true); await pending;
  assert.equal(travel.routes.length, 1);
  assert.equal(feedback.confirmation.value, null);
});

test('demo booking and payment never claim real success or mark orders paid', async () => {
  const profile = await createViewState(Profile, [pinia, router]);
  const order = profile.orders.value.find(order => order.status === 'pending');
  profile.payOrder(order);
  assert.equal(order.status, 'pending');
  assert.match(feedback.notices.value.at(-1).message, /尚未接入/);
  const tickets = await createViewState(Tickets);
  tickets.selectedTravel.value = { transport: 'flight' }; tickets.confirmBooking();
  assert.match(feedback.notices.value.at(-1).message, /未创建真实订单/);
  tickets.selectedScenic.value = { name: '景点' }; tickets.confirmScenicBooking();
  assert.match(feedback.notices.value.at(-1).message, /未创建真实订单/);
  assert.ok(feedback.notices.value.every(notice => notice.type === 'info'));
  registerUser('13800138000', 'test-pass'); auth.login('13800138000', 'test-pass');
  travel.saveRoute({ title: '分享演示', startDate: '2030-12-01', endDate: '2030-12-02', themes: [], preferences: {} });
  const routes = await createViewState(Routes, [pinia]);
  routes.shareRoute(routes.myRoutes.value[0].id);
  // 线路分享已实现：不再提示“尚未接入”，而是生成可分享内容（本地环境回退为提示已生成）
  assert.match(feedback.notices.value.at(-1).message, /已生成|已复制|已导出/);
});

test('changing chat rooms during confirmation cannot clear either room history', async () => {
  registerUser('13800138000', 'test-pass'); auth.login('13800138000', 'test-pass');
  const page = await createOptionsView(Chat, [pinia]);
  page.currentRoom = page.chatRooms[0]; page.roomOwnerId = auth.user.id;
  const firstKey = page.historyKey(page.chatRooms[0].id), secondKey = page.historyKey(page.chatRooms[1].id);
  storage.set(firstKey, 'first room history'); storage.set(secondKey, 'second room history');
  const pending = page.clearHistory();
  page.currentRoom = page.chatRooms[1];
  feedback.settleConfirmation(true); await pending;
  assert.equal(storage.get(firstKey), 'first room history');
  assert.equal(storage.get(secondKey), 'second room history');
});

test('clipboard failure is handled and only a successful copy shows success', async t => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const browser = { clipboard: { writeText: async () => { throw new Error('denied'); } } };
  Object.defineProperty(globalThis, 'navigator', { value: browser, configurable: true });
  t.after(() => { if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator; });
  const page = await createViewState(Attractions, [pinia]);
  await page.shareAttraction({ name: '测试景点', description: '介绍' });
  assert.equal(feedback.notices.value.at(-1).type, 'error');
  let copied;
  browser.clipboard.writeText = async text => { copied = text; };
  await page.shareAttraction({ name: '测试景点', description: '介绍' });
  assert.equal(copied, '测试景点 - 介绍');
  assert.equal(feedback.notices.value.at(-1).type, 'success');
});
