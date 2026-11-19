import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  JOURNAL_MOODS,
  journalKey,
  parseTags,
  normalizeJournalEntry,
  validateJournalEntry,
  readJournal,
  saveJournalEntry,
  deleteJournalEntry,
  listJournalEntries,
  sortJournalEntries,
  groupEntriesByMonth,
  journalStats,
  confirmedCoordinate,
  collectFootprints,
  entryRouteState,
  buildJournalExport,
  journalDraftKey,
  readJournalDraft,
  saveJournalDraft,
  clearJournalDraft
} from '../src/services/journalService.js';
import { validatePhotoFile, PHOTO_MAX_BYTES } from '../src/services/photoStore.js';

function withStorage(fn) {
  const original = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  try {
    return fn(storage);
  } finally {
    globalThis.localStorage = original;
  }
}

const entryInput = (patch = {}) => ({
  routeId: 'route-1', routeTitle: '杭州三日', date: '2026-11-03', title: '西湖边的一天',
  content: '沿着苏堤走了很久，傍晚的湖面很好看。', mood: '平静', placeName: '苏堤', tags: ['西湖', '散步'],
  ...patch
});

test('tags and entry fields are normalized with strict limits', () => {
  assert.deepEqual(parseTags('西湖, 散步，日落 西湖'), ['西湖', '散步', '日落']);
  assert.deepEqual(parseTags(['a', 'a', ' b ']), ['a', 'b']);
  assert.throws(() => parseTags('x'.repeat(21)), /20字以内/);
  assert.throws(() => parseTags(Array.from({ length: 11 }, (_, index) => `t${index}`)), /10 个标签/);

  const entry = normalizeJournalEntry({ title: '  标题  ', date: '2026-02-30', mood: '未知', lat: 200, lng: 10, tags: ['a'] });
  assert.equal(entry.title, '标题');
  assert.notEqual(entry.date, '2026-02-30');
  assert.equal(entry.mood, '');
  assert.equal(entry.lat, null);
  assert.equal(entry.lng, null);
  assert.ok(entry.id);
  assert.deepEqual(entry.tags, ['a']);
  assert.ok(JOURNAL_MOODS.includes('惊喜'));

  assert.throws(() => validateJournalEntry(entryInput({ title: ' ' })), /请输入手账标题/);
  assert.throws(() => validateJournalEntry(entryInput({ content: '' })), /请输入手账内容/);
  assert.throws(() => validateJournalEntry(entryInput({ date: '2026-13-01' })), /请输入有效日期/);
  const valid = validateJournalEntry(entryInput({ title: 'x'.repeat(90) }));
  assert.equal(valid.title.length, 80);
});

test('journal entries save, update, sort and delete per month', () => withStorage(() => {
  const owner = 'user-a';
  const first = saveJournalEntry(owner, entryInput({ date: '2026-11-03' }));
  const second = saveJournalEntry(owner, entryInput({ date: '2026-09-20', title: '初秋骑行', routeId: 'route-2', routeTitle: '千岛湖' }));
  const third = saveJournalEntry(owner, entryInput({ date: '2026-11-18', title: '河坊街夜游', mood: '开心' }));

  const journal = readJournal(owner);
  assert.equal(journal.corrupted, false);
  assert.equal(journal.entries.length, 3);
  assert.deepEqual(listJournalEntries(owner).map(item => item.id), [third.id, first.id, second.id]);
  assert.deepEqual(listJournalEntries(owner, { routeId: 'route-2' }).map(item => item.id), [second.id]);

  const groups = groupEntriesByMonth(journal.entries);
  assert.deepEqual(groups.map(group => [group.key, group.entries.length]), [['2026-11', 2], ['2026-09', 1]]);
  assert.equal(groups[0].label, '2026 年 11 月');
  assert.deepEqual(journalStats(journal.entries), { total: 3, routes: 2, months: 2, withPhotos: 0 });

  const updated = saveJournalEntry(owner, { ...first, title: '西湖边的清晨', content: '早起看雾。', photoIds: ['p1', 'p2'] });
  assert.equal(updated.id, first.id);
  assert.equal(updated.title, '西湖边的清晨');
  assert.equal(updated.createdAt, first.createdAt);
  assert.ok(updated.updatedAt);
  assert.deepEqual(updated.photoIds, ['p1', 'p2']);
  assert.equal(readJournal(owner).entries.find(item => item.id === first.id).title, '西湖边的清晨');

  const removed = deleteJournalEntry(owner, second.id);
  assert.equal(removed.id, second.id);
  assert.equal(readJournal(owner).entries.length, 2);
  assert.throws(() => deleteJournalEntry(owner, second.id), /已不存在/);

  // 手动排序不修改原数组。
  const source = [{ date: '2026-01-01', createdAt: '1' }, { date: '2026-02-01', createdAt: '2' }];
  assert.deepEqual(sortJournalEntries(source).map(item => item.date), ['2026-02-01', '2026-01-01']);
  assert.equal(source[0].date, '2026-01-01');
}));

test('journal data is isolated, corruption is surfaced and never overwritten', () => withStorage(storage => {
  saveJournalEntry('user-a', entryInput());
  assert.equal(readJournal('user-b').entries.length, 0);
  assert.equal(readJournal('user-b').corrupted, false);
  assert.equal(listJournalEntries('user-b').length, 0);

  storage.set(journalKey('user-a'), '{broken');
  const corrupted = readJournal('user-a');
  assert.equal(corrupted.corrupted, true);
  assert.equal(corrupted.entries.length, 0);
  assert.throws(() => saveJournalEntry('user-a', entryInput({ title: '无法保存' })), /数据已损坏/);
  assert.equal(storage.get(journalKey('user-a')), '{broken');

  storage.set(journalKey('user-a'), JSON.stringify({ version: 1, ownerId: 'someone-else', entries: [] }));
  assert.equal(readJournal('user-a').corrupted, true);
}));

test('journal drafts are per account and per location and never mix with saved entries', () => withStorage(storage => {
  assert.equal(readJournalDraft('user-a'), null);
  saveJournalDraft('user-a', { title: '未完成的标题', content: '写到一半', date: '2026-11-05' });
  const draft = readJournalDraft('user-a');
  assert.equal(draft.title, '未完成的标题');
  assert.equal(draft.content, '写到一半');
  assert.ok(draft.savedAt);

  // 账号与记录位置隔离：工作台快速记录不会覆盖整页编辑的草稿。
  assert.equal(readJournalDraft('user-b'), null);
  assert.equal(readJournalDraft('user-a', 'route:r1'), null);
  saveJournalDraft('user-a', { title: '快速记录', content: '工作台' }, 'route:r1');
  assert.equal(readJournalDraft('user-a').title, '未完成的标题');
  assert.equal(readJournalDraft('user-a', 'route:r1').title, '快速记录');

  // 草稿不写入正式手账，也不出现在列表里。
  assert.equal(readJournal('user-a').entries.length, 0);

  // 空内容等于没有草稿；清除后彻底消失。
  saveJournalDraft('user-a', { title: '  ', content: '' });
  assert.equal(readJournalDraft('user-a'), null);
  clearJournalDraft('user-a', 'route:r1');
  assert.equal(readJournalDraft('user-a', 'route:r1'), null);
  assert.equal(storage.has(journalDraftKey('user-a')), false);

  // 损坏的草稿只当作没有草稿，不影响正式手账。
  storage.set(journalDraftKey('user-a'), '{broken');
  assert.equal(readJournalDraft('user-a'), null);
  assert.throws(() => saveJournalDraft('', { title: 'x' }), /请先登录/);
}));

test('deleted routes keep their journal entries with a snapshot title', () => withStorage(() => {
  const entry = saveJournalEntry('user-a', entryInput({ routeId: 'gone', routeTitle: '已删除的旅行' }));
  assert.equal(entryRouteState(entry, []), 'deleted');
  assert.equal(entryRouteState(entry, [{ id: 'gone', title: '已删除的旅行' }]), 'active');
  assert.equal(entryRouteState({ routeId: '', title: 'x' }, []), 'unlinked');
  assert.equal(readJournal('user-a').entries[0].routeTitle, '已删除的旅行');
}));

test('footprints only use confirmed coordinates and merge duplicate places', () => {
  assert.deepEqual(confirmedCoordinate({ location: ['120.15', '30.25'] }), { lat: 30.25, lng: 120.15 });
  assert.deepEqual(confirmedCoordinate({ lat: 30.25, lng: 120.15 }), { lat: 30.25, lng: 120.15 });
  assert.equal(confirmedCoordinate({ name: '只有名称' }), null);
  assert.equal(confirmedCoordinate({ location: ['abc', 30] }), null);
  assert.equal(confirmedCoordinate({ lat: 200, lng: 10 }), null);
  // Number('') / Number(null) 都是 0，不能被当成 (0,0) 的有效坐标。
  assert.equal(confirmedCoordinate({ location: ['', ''] }), null);
  assert.equal(confirmedCoordinate({ lat: null, lng: null }), null);
  assert.equal(confirmedCoordinate({ lat: '', lng: '' }), null);
  assert.equal(confirmedCoordinate({ location: [null, 30.25] }), null);

  const routes = [{
    id: 'r1', title: '杭州',
    days: [
      { date: '2026-11-01', activities: [
        { title: '西湖', place: { name: '断桥', location: ['120.1501', '30.2501'] } },
        { title: '待确认地点' },
        { title: '坏坐标', place: { location: ['x', 'y'] } }
      ] },
      { date: '2026-11-02', activities: [
        { title: '灵隐寺', place: { name: '灵隐寺', location: ['120.1000', '30.2400'] } }
      ] }
    ]
  }];
  const entries = [
    { id: 'e1', date: '2026-11-03', title: '湖边', placeName: '断桥', lat: 30.2501, lng: 120.1501, routeId: 'r1', routeTitle: '杭州' },
    { id: 'e2', date: '2026-11-04', title: '没有坐标', placeName: '某地', lat: null, lng: null }
  ];
  const places = collectFootprints(routes, entries);
  assert.equal(places.length, 2);
  const bridge = places.find(place => place.name === '断桥');
  assert.equal(bridge.visits.length, 2);
  assert.deepEqual(bridge.visits.map(visit => visit.source), ['journal', 'route']);
  assert.equal(bridge.lastDate, '2026-11-03');
  assert.equal(places[0].name, '断桥');
  assert.equal(places.some(place => place.name === '某地'), false);
  assert.deepEqual(collectFootprints([], []), []);
});

test('export requires an explicit selection and omits unselected entries', () => {
  const entries = [
    normalizeJournalEntry(entryInput({ title: 'A', photoIds: ['p'] })),
    normalizeJournalEntry(entryInput({ title: 'B', date: '2026-10-01' }))
  ];
  assert.throws(() => buildJournalExport(entries, []), /勾选/);
  assert.throws(() => buildJournalExport(entries, ['missing']), /勾选/);
  const text = buildJournalExport(entries, [entries[0].id]);
  assert.ok(text.includes('## A'));
  assert.ok(!text.includes('## B'));
  assert.ok(text.includes('仅包含手动勾选的内容'));
  assert.ok(text.includes('照片：1 张'));
  assert.ok(text.includes('文字导出不包含照片文件'));
  const all = buildJournalExport(entries, entries.map(entry => entry.id));
  assert.ok(all.includes('## A') && all.includes('## B'));
});

test('photo files are validated before compression or storage', () => {
  assert.equal(validatePhotoFile(null).valid, false);
  assert.equal(validatePhotoFile({ type: 'image/gif', size: 10 }).valid, false);
  assert.equal(validatePhotoFile({ type: 'image/jpeg', size: 0 }).valid, false);
  assert.equal(validatePhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_BYTES + 1 }).valid, false);
  assert.equal(validatePhotoFile({ type: 'image/webp', size: 10 }).valid, true);
});

test('journal view renders entries, stats and confirmed footprints', async () => {
  const { loadView } = await import('./helpers/vueView.js');
  const { createPinia } = await import('pinia');
  const { createSSRApp, h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  const { registerUser, loginUser } = await import('../src/services/authService.js');
  const { useTravelStore } = await import('../src/stores/travel.js');
  const original = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  try {
    registerUser('13920000001', 'pass-1234');
    loginUser('13920000001', 'pass-1234');
    const pinia = createPinia();
    const travel = useTravelStore(pinia);
    const route = travel.saveRoute({
      title: '杭州三日', startDate: '2026-11-01', endDate: '2026-11-03', themes: [], preferences: {},
      days: [{ date: '2026-11-01', activities: [{ title: '断桥', time: '09:00', description: '散步', place: { name: '断桥', location: ['120.1501', '30.2501'] } }] }]
    });
    saveJournalEntry(travel.ownerId, entryInput({ routeId: route.id, routeTitle: route.title, placeName: '断桥', lat: 30.2501, lng: 120.1501 }));
    const JournalView = await loadView('JournalView');
    const app = createSSRApp({ render: () => h(JournalView) });
    app.use(pinia);
    app.component('router-link', { props: ['to'], render() { return h('a', { href: String(this.to) }, this.$slots.default?.()) } });
    const html = await renderToString(app);
    assert.match(html, /旅行手账与足迹/);
    assert.match(html, /西湖边的一天/);
    assert.match(html, /断桥/);
    assert.match(html, /导出所选（0）/);
    assert.match(html, /足迹地图/);
    assert.match(html, /在高德地图查看/);
    // 足迹用真实地图展示（SDK 在浏览器端加载），SSR 时至少要有地图容器。
    assert.match(html, /aria-label="足迹地图"/);
    assert.match(html, /map-canvas/);
  } finally {
    globalThis.localStorage = original;
  }
});

test('workbench journal section shows entries for the current route only', async () => {
  const { loadComponent } = await import('./helpers/vueView.js');
  const { createSSRApp, h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  const { createPinia } = await import('pinia');
  const { registerUser, loginUser } = await import('../src/services/authService.js');
  const original = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  try {
    registerUser('13920000002', 'pass-1234');
    loginUser('13920000002', 'pass-1234');
    const user = JSON.parse(storage.get('currentUser'));
    saveJournalEntry(user.id, entryInput({ routeId: 'r1', routeTitle: '杭州三日', title: '本篇属于当前旅行' }));
    saveJournalEntry(user.id, entryInput({ routeId: 'r2', routeTitle: '别的旅行', title: '不该出现在这里' }));
    const component = await loadComponent('components/TravelJournal.vue');
    const app = createSSRApp({ render: () => h(component, { route: { id: 'r1', title: '杭州三日' } }) });
    app.use(createPinia());
    app.component('router-link', { props: ['to'], render() { return h('a', { href: String(this.to) }, this.$slots.default?.()) } });
    const html = await renderToString(app);
    assert.match(html, /旅行手账/);
    assert.match(html, /已写 1 篇/);
    assert.match(html, /本篇属于当前旅行/);
    assert.doesNotMatch(html, /不该出现在这里/);
    assert.match(html, /打开全部手账与足迹/);
  } finally {
    globalThis.localStorage = original;
  }
});
