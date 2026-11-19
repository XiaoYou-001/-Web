import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reactive } from 'vue';
import { loadComponent, renderView } from './helpers/vueView.js';
import { ApiError } from '../src/services/apiClient.js';
import {
  MAX_FORECAST_DAYS,
  WEATHER_CACHE_TTL_MS,
  dayWeatherLocation,
  gcj02ToWgs84,
  loadRouteWeather,
  normalizeWeather,
  readWeatherCache,
  weatherCacheKey,
  weatherTargets,
  writeWeatherCache
} from '../src/services/weatherService.js';
import {
  addBackup,
  applyBackupSwap,
  backupFromCandidate,
  backupsOf,
  hasBackupUndo,
  normalizeBackupInput,
  planBackupSwap,
  removeBackup,
  undoBackupSwap
} from '../src/utils/weatherBackup.js';
import { addCalendarDays } from '../src/utils/date.js';

const BEIJING = [116.397428, 39.90923];
const SHANGHAI = [121.473701, 31.230416];

function place(name, location, coordinateSystem = 'GCJ-02') {
  return { id: `${name}-id`, name, address: `${name}地址`, location, coordinateSystem };
}

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
}

function fakeClient(responses, calls = []) {
  return {
    calls,
    async request(path, options) {
      calls.push({ path, options });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next(options);
      return next;
    }
  };
}

function payloadFor(date, overrides = {}) {
  return {
    source: 'Open-Meteo',
    coordinateSystem: 'WGS-84',
    fetchedAt: '2026-11-16T08:00:00.000Z',
    latitude: 39.9077,
    longitude: 116.3917,
    timezone: 'Asia/Shanghai',
    range: { start: date, end: date },
    days: [{
      date,
      description: '小雨',
      isRain: true,
      tempMax: 18,
      tempMin: 9,
      precipitationProbability: 70
    }],
    unavailableDates: [],
    ...overrides
  };
}

function routeWithDays(days, extra = {}) {
  return {
    id: 'weather-route',
    title: '天气测试旅行',
    startDate: days[0]?.date,
    endDate: days[days.length - 1]?.date,
    themes: [],
    preferences: {},
    days,
    ...extra
  };
}

function activity(id, title, location, extra = {}) {
  return {
    id,
    time: '09:00',
    title,
    description: '',
    durationMinutes: 120,
    place: location ? place(title, location) : undefined,
    ...extra
  };
}

test('GCJ-02 coordinates are converted for Open-Meteo and overseas points stay intact', () => {
  const [lng, lat] = gcj02ToWgs84(BEIJING);
  assert.ok(lng < BEIJING[0] && lng > BEIJING[0] - 0.01);
  assert.ok(lat < BEIJING[1] && lat > BEIJING[1] - 0.01);
  assert.equal(lng.toFixed(3), '116.391');
  assert.equal(lat.toFixed(3), '39.908');
  assert.deepEqual(gcj02ToWgs84([-122.4194, 37.7749]), [-122.4194, 37.7749]);
  assert.throws(() => gcj02ToWgs84([Number.NaN, 30]), /坐标无效/);
});

test('weather payloads are validated instead of trusting the server response', () => {
  const weather = normalizeWeather(payloadFor('2026-11-20'), { start: '2026-11-20', end: '2026-11-20' });
  assert.equal(weather.source, 'Open-Meteo');
  assert.equal(weather.days[0].description, '小雨');
  assert.equal(weather.days[0].isRain, true);
  assert.equal(weather.days[0].tempMax, 18);
  assert.equal(weather.range.start, '2026-11-20');

  const noNumbers = normalizeWeather({
    source: 'Open-Meteo',
    days: [{ date: '2026-11-20', description: '晴', isRain: false, tempMax: null, tempMin: null, precipitationProbability: null }]
  }, { start: '2026-11-20', end: '2026-11-20' });
  assert.equal(noNumbers.days[0].tempMax, null);
  assert.equal(noNumbers.days[0].precipitationProbability, null);

  const invalid = [
    [],
    { source: '', days: [] },
    { source: 'Open-Meteo', days: {} },
    payloadFor('2026-11-20', { days: [{ date: '2026-11-19', description: '晴', isRain: false }] }),
    payloadFor('2026-11-20', { days: [
      { date: '2026-11-20', description: '晴', isRain: false },
      { date: '2026-11-20', description: '阴', isRain: false }
    ] }),
    payloadFor('2026-11-20', { days: [{ date: '2026-11-20', description: ' ', isRain: false }] }),
    payloadFor('2026-11-20', { days: [{ date: '2026-11-20', description: '晴', isRain: 'no' }] }),
    payloadFor('2026-11-20', { days: [{ date: '2026-11-20', description: '晴', isRain: false, precipitationProbability: '70' }] }),
    payloadFor('2026-11-20', { unavailableDates: ['2026-11-21'] }),
    payloadFor('2026-11-20', { latitude: 'north' })
  ];
  for (const body of invalid) {
    assert.throws(
      () => normalizeWeather(body, { start: '2026-11-20', end: '2026-11-20' }),
      error => error instanceof ApiError && error.code === 'INVALID_RESPONSE'
    );
  }
});

test('weather cache expires, ignores corrupted entries and fails silently without storage', () => {
  const storage = memoryStorage();
  const key = weatherCacheKey({ lat: 39.9077, lng: 116.3917, start: '2026-11-20', end: '2026-11-21' });
  assert.match(key, /^weather_cache:v1:39\.908,116\.392,2026-11-20,2026-11-21$/);
  assert.throws(() => weatherCacheKey({ lat: 'x', lng: 1, start: 'a', end: 'b' }), /缓存参数无效/);

  const weather = normalizeWeather(payloadFor('2026-11-20'), { start: '2026-11-20', end: '2026-11-20' });
  assert.equal(writeWeatherCache(key, weather, { storage, now: 1000 }), true);
  const fresh = readWeatherCache(key, { storage, now: 1000 + WEATHER_CACHE_TTL_MS - 1 });
  assert.equal(fresh.stale, false);
  assert.equal(fresh.weather.days[0].description, '小雨');
  const stale = readWeatherCache(key, { storage, now: 1000 + WEATHER_CACHE_TTL_MS });
  assert.equal(stale.stale, true);
  assert.equal(readWeatherCache(key, { storage, now: 500 }).stale, true);

  storage.setItem(key, '{bad json');
  assert.equal(readWeatherCache(key, { storage }), null);
  storage.setItem(key, JSON.stringify({ cachedAt: 1000, weather: { source: 'x' } }));
  assert.equal(readWeatherCache(key, { storage }), null);
  assert.equal(readWeatherCache('missing', { storage }), null);

  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readWeatherCache(key, { storage: broken }), null);
  assert.equal(writeWeatherCache(key, weather, { storage: broken }), false);
});

test('each day uses its first confirmed location and targets clamp to the forecast range', () => {
  const dayOne = {
    date: '2026-11-20',
    activities: [
      activity('a1', '无地点活动', null),
      activity('a2', '故宫', BEIJING),
      activity('a3', '天坛', [116.41, 39.88])
    ]
  };
  const location = dayWeatherLocation(dayOne);
  assert.equal(location.name, '故宫');
  assert.equal(location.lng.toFixed(3), '116.391');
  assert.equal(location.lat.toFixed(3), '39.908');
  assert.equal(location.coordinateSystem, 'GCJ-02');
  assert.equal(dayWeatherLocation({ activities: [activity('x', '无坐标', null)] }), null);
  assert.equal(dayWeatherLocation({ activities: [{ place: { name: '坏坐标', location: ['x', 1] } }] }), null);

  const wgsActivity = activity('w1', '境外景点', [-122.4194, 37.7749], {});
  wgsActivity.place.coordinateSystem = 'WGS-84';
  assert.deepEqual(dayWeatherLocation({ activities: [wgsActivity] }).lng, -122.419);

  const route = routeWithDays([
    { date: '2026-11-20', activities: [activity('b1', '故宫', BEIJING)] },
    { date: '2026-11-21', activities: [activity('b2', '景山', BEIJING)] },
    { date: '2026-11-22', activities: [activity('s1', '外滩', SHANGHAI)] },
    { date: '2026-11-23', activities: [activity('n1', '休息', null)] }
  ]);
  const targets = weatherTargets(route, { today: '2026-11-16' });
  assert.equal(targets.length, 2);
  assert.deepEqual(targets[0].dates, ['2026-11-20', '2026-11-21']);
  assert.equal(targets[0].start, '2026-11-20');
  assert.equal(targets[0].end, '2026-11-21');
  assert.equal(targets[0].outOfRange, false);
  assert.equal(targets[1].start, targets[1].end);
  assert.equal(targets[1].end, '2026-11-22');
  assert.ok(targets.every(target => target.dates.length > 0));

  const far = routeWithDays([
    { date: '2026-11-20', activities: [activity('f1', '故宫', BEIJING)] },
    { date: '2026-12-20', activities: [activity('f2', '故宫', BEIJING)] }
  ]);
  // 预报窗口锚定“今天”而不是旅行首日：窗口以今天的 16 天为准。
  const farTargets = weatherTargets(far, { today: '2026-11-16' });
  assert.equal(farTargets.length, 1);
  assert.equal(farTargets[0].windowEnd, addCalendarDays('2026-11-16', MAX_FORECAST_DAYS - 1));
  assert.equal(farTargets[0].start, '2026-11-20');
  assert.equal(farTargets[0].end, '2026-11-20');
  assert.equal(farTargets[0].outOfRange, false);

  // 出发日还在 16 天之外时，不再请求上游，直接标记超出预报范围。
  const future = weatherTargets(routeWithDays([
    { date: '2026-12-20', activities: [activity('g1', '故宫', BEIJING)] }
  ]), { today: '2026-11-16' });
  assert.equal(future[0].outOfRange, true);
  assert.equal(future[0].windowEnd, '2026-12-01');
});

test('route weather uses fresh cache, retries with force and falls back to stale data', async () => {
  const storage = memoryStorage();
  const day = { date: '2026-11-20', activities: [activity('a1', '故宫', BEIJING)] };
  const route = routeWithDays([day]);
  const client = fakeClient([
    payloadFor('2026-11-20'),
    payloadFor('2026-11-20', { days: [{ date: '2026-11-20', description: '晴', isRain: false, tempMax: 10, tempMin: 2, precipitationProbability: 5 }] }),
    new ApiError('WEATHER_UPSTREAM_FAILED'),
    new ApiError('WEATHER_TIMEOUT')
  ]);

  const first = await loadRouteWeather(route, { client, storage, now: () => 1000 });
  assert.equal(first.byDate['2026-11-20'].status, 'ok');
  assert.equal(first.byDate['2026-11-20'].cached, false);
  assert.equal(first.byDate['2026-11-20'].weather.description, '小雨');
  assert.equal(first.byDate['2026-11-20'].location.name, '故宫');
  assert.equal(first.byDate['2026-11-20'].source, 'Open-Meteo');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].path, 'weather');
  assert.equal(client.calls[0].options.params.start, '2026-11-20');
  assert.equal(client.calls[0].options.params.end, '2026-11-20');
  assert.notEqual(client.calls[0].options.params.lat, BEIJING[1]);

  const second = await loadRouteWeather(route, { client, storage, now: () => 1000 + 60_000 });
  assert.equal(second.byDate['2026-11-20'].cached, true);
  assert.equal(second.byDate['2026-11-20'].stale, false);
  assert.equal(client.calls.length, 1);

  const forced = await loadRouteWeather(route, { client, storage, now: () => 1000 + 120_000, force: true });
  assert.equal(forced.byDate['2026-11-20'].weather.description, '晴');
  assert.equal(client.calls.length, 2);

  const failedFresh = await loadRouteWeather(route, { client, storage, now: () => 1000 + 180_000, force: true });
  assert.equal(failedFresh.byDate['2026-11-20'].status, 'ok');
  assert.equal(failedFresh.byDate['2026-11-20'].cached, true);
  assert.equal(failedFresh.byDate['2026-11-20'].stale, false);
  assert.equal(failedFresh.byDate['2026-11-20'].weather.description, '晴');
  assert.match(failedFresh.byDate['2026-11-20'].error, /天气服务/);

  const stale = await loadRouteWeather(route, {
    client,
    storage,
    now: () => 1000 + 120_000 + WEATHER_CACHE_TTL_MS + 1,
    force: true
  });
  assert.equal(stale.byDate['2026-11-20'].status, 'ok');
  assert.equal(stale.byDate['2026-11-20'].stale, true);
  assert.equal(stale.byDate['2026-11-20'].weather.description, '晴');
  assert.match(stale.byDate['2026-11-20'].error, /天气服务/);
});

test('weather failures never invent forecasts and keep every day explainable', async () => {
  const failing = fakeClient([new ApiError('WEATHER_TIMEOUT'), new ApiError('WEATHER_INVALID_RESPONSE')]);
  const storage = memoryStorage();
  const day = { date: '2026-11-20', activities: [activity('a1', '故宫', BEIJING)] };
  const result = await loadRouteWeather(routeWithDays([day]), { client: failing, storage });
  assert.equal(result.byDate['2026-11-20'].status, 'error');
  assert.match(result.byDate['2026-11-20'].error, /天气服务响应超时/);

  const noLocation = await loadRouteWeather(routeWithDays([
    { date: '2026-11-20', activities: [activity('n1', '休息', null)] }
  ]), { client: fakeClient([]) });
  assert.equal(noLocation.byDate['2026-11-20'].status, 'no-location');

  const unavailableClient = fakeClient([payloadFor('2026-11-20', { days: [], unavailableDates: ['2026-11-20'] })]);
  const unavailable = await loadRouteWeather(
    routeWithDays([{ date: '2026-11-20', activities: [activity('a1', '故宫', BEIJING)] }]),
    { client: unavailableClient }
  );
  assert.equal(unavailable.byDate['2026-11-20'].status, 'unavailable');

  const outOfRangeClient = fakeClient([payloadFor('2026-11-20')]);
  const outOfRange = await loadRouteWeather(routeWithDays([
    { date: '2026-11-20', activities: [activity('a1', '故宫', BEIJING)] },
    { date: '2026-12-20', activities: [activity('a2', '故宫', BEIJING)] }
  ]), { client: outOfRangeClient });
  assert.equal(outOfRange.byDate['2026-11-20'].status, 'ok');
  assert.equal(outOfRange.byDate['2026-12-20'].status, 'out-of-range');

  const cancelled = new ApiError('CANCELLED');
  await assert.rejects(
    loadRouteWeather(routeWithDays([day]), { client: fakeClient([cancelled]) }),
    error => error === cancelled
  );
});

test('backup input is validated and meal activities cannot use weather backups', () => {
  assert.deepEqual(normalizeBackupInput({ title: '  博物馆  ' }), {
    title: '博物馆',
    note: '',
    durationMinutes: null,
    place: null,
    indoor: true,
    source: 'manual'
  });
  assert.equal(normalizeBackupInput({ title: '咖啡馆', indoor: false, source: 'pool' }).indoor, false);
  assert.equal(normalizeBackupInput({ title: '咖啡馆', source: 'pool' }).source, 'pool');
  assert.equal(normalizeBackupInput({ title: '展馆', durationMinutes: '90' }).durationMinutes, 90);
  assert.throws(() => normalizeBackupInput({}), /请填写备选名称/);
  assert.throws(() => normalizeBackupInput({ title: 'x'.repeat(61) }), /60 字以内/);
  assert.throws(() => normalizeBackupInput({ title: '展馆', note: 'x'.repeat(201) }), /200 字以内/);
  assert.throws(() => normalizeBackupInput({ title: '展馆', durationMinutes: -1 }), /0 到 1440/);
  assert.throws(() => normalizeBackupInput({ title: '展馆', durationMinutes: 1441 }), /0 到 1440/);
  assert.throws(() => normalizeBackupInput({ title: '展馆', durationMinutes: 'abc' }), /0 到 1440/);
  assert.throws(() => normalizeBackupInput({ title: '展馆', place: { name: '', location: [1, 2] } }), /缺少名称/);
  assert.throws(() => normalizeBackupInput({ title: '展馆', place: { name: '展馆', location: ['x', 2] } }), /缺少有效坐标/);

  const meal = { id: 'm1', title: '午餐', category: '用餐', time: '12:00' };
  assert.throws(() => addBackup(meal, { title: '面馆' }), /替换餐厅功能/);
  assert.throws(() => planBackupSwap(meal, 'any'), /替换餐厅功能/);

  const candidate = backupFromCandidate({
    title: '首都博物馆',
    description: '室内展馆',
    durationMinutes: 120,
    place: place('首都博物馆', [116.34, 39.9])
  });
  assert.equal(candidate.source, 'pool');
  assert.equal(candidate.indoor, true);
  assert.equal(candidate.durationMinutes, 120);
  assert.equal(candidate.place.name, '首都博物馆');
  assert.throws(() => backupFromCandidate(null), /候选信息无效/);
});

test('backup swaps preview differences, clear transport estimates and can be undone exactly', () => {
  const previous = {
    id: 'stay',
    title: '酒店',
    travelEstimate: { mode: 'walking', minutes: 20, checkedAt: '2026-11-01T00:00:00Z' },
    travelMinutes: 20
  };
  const park = activity('park', '公园', BEIJING, {
    travelEstimate: { mode: 'transit', minutes: 35, checkedAt: '2026-11-01T00:00:00Z' },
    travelMinutes: 35,
    category: '景点'
  });
  const day = { date: '2026-11-20', activities: [previous, park] };
  const museum = place('首都博物馆', [116.34, 39.9]);
  addBackup(park, { title: '首都博物馆', note: '室内展馆', durationMinutes: 120, place: museum });
  assert.equal(backupsOf(park).length, 1);
  assert.equal(backupsOf({}).length, 0);
  const backup = park.backups[0];

  const preview = planBackupSwap(park, backup.id);
  assert.equal(preview.activityId, 'park');
  assert.equal(preview.current.title, '公园');
  assert.equal(preview.next.title, '首都博物馆');
  assert.equal(preview.next.placeName, '首都博物馆');
  assert.equal(preview.next.durationMinutes, 120);
  assert.ok(preview.warnings.some(warning => /交通耗时/.test(warning)));
  assert.ok(preview.warnings.some(warning => /账本/.test(warning)));
  assert.throws(() => planBackupSwap(park, 'missing'), /备选已不存在/);

  const applied = applyBackupSwap(day, 'park', backup.id, { now: () => '2026-11-16T00:00:00Z' });
  const swapped = day.activities[1];
  assert.equal(applied.invalidatedPrevious, true);
  assert.equal(swapped.id, 'park');
  assert.equal(swapped.title, '首都博物馆');
  assert.equal(swapped.place.name, '首都博物馆');
  assert.equal(swapped.weatherBackupApplied, true);
  assert.equal(swapped.swappedFromTitle, '公园');
  assert.equal(Object.hasOwn(swapped, 'travelEstimate'), false);
  assert.equal(swapped.travelMinutes, null);
  assert.equal(swapped.completed, false);
  assert.equal(Object.hasOwn(day.activities[0], 'travelEstimate'), false);
  assert.equal(day.activities[0].travelMinutes, null);
  assert.equal(hasBackupUndo(swapped), true);
  assert.throws(() => planBackupSwap(swapped, backup.id), /撤销上一次替换/);
  assert.throws(() => applyBackupSwap(day, 'park', backup.id), /撤销上一次替换/);

  const undone = undoBackupSwap(day, 'park');
  const restored = day.activities[1];
  assert.equal(undone.title, '公园');
  assert.equal(restored.title, '公园');
  assert.equal(restored.place.name, '公园');
  assert.equal(restored.travelEstimate.minutes, 35);
  assert.equal(restored.travelMinutes, 35);
  assert.equal(restored.weatherBackupApplied, undefined);
  assert.equal(day.activities[0].travelEstimate.minutes, 20);
  assert.equal(day.activities[0].travelMinutes, 20);
  assert.equal(hasBackupUndo(restored), false);

  removeBackup(restored, backup.id);
  assert.equal(backupsOf(restored).length, 0);
  assert.throws(() => removeBackup(restored, backup.id), /备选已不存在/);
  assert.throws(() => undoBackupSwap(day, 'park'), /没有可撤销的替换/);
  assert.throws(() => applyBackupSwap(day, 'missing', backup.id), /活动已不存在/);

  const noPlace = activity('walk', '散步', null, { category: '景点' });
  const walkDay = { activities: [noPlace] };
  addBackup(noPlace, { title: '商场', indoor: true });
  const noPlacePreview = planBackupSwap(noPlace, noPlace.backups[0].id);
  assert.ok(noPlacePreview.warnings.some(warning => /没有确认地点/.test(warning)));
  applyBackupSwap(walkDay, 'walk', noPlace.backups[0].id);
  assert.equal(Object.hasOwn(walkDay.activities[0], 'place'), false);
});

function weatherTrip() {
  const day = {
    date: '2026-11-20',
    budget: null,
    expenses: [],
    activities: [
      activity('a1', '故宫', BEIJING, {
        travelEstimate: { mode: 'walking', minutes: 15, checkedAt: '2026-11-01T00:00:00Z' },
        travelMinutes: 15
      })
    ]
  };
  const route = routeWithDays([day, { date: '2026-11-21', activities: [] }]);
  route.pendingActivities = [{
    id: 'c1',
    title: '首都博物馆',
    description: '室内展馆',
    durationMinutes: 120,
    place: place('首都博物馆', [116.34, 39.9])
  }];
  return { route, day };
}

async function setupWeather(props) {
  const component = await loadComponent('components/TravelWeather.vue');
  const state = component.setup(reactive(props), { expose: () => {}, emit: () => {}, attrs: {}, slots: {} });
  return { component, state };
}

test('weather component renders forecast, source, rain advice and backup controls', async () => {
  const { route, day } = weatherTrip();
  const storage = memoryStorage();
  const client = fakeClient([payloadFor('2026-11-20')]);
  const { component, state } = await setupWeather({ route, day, dayIndex: 0, weatherClient: client, storage });

  await state.reload(true);
  assert.equal(state.dayInfo.value.status, 'ok');

  const html = await renderView(component, state);
  assert.match(html, /天气与备选方案/);
  assert.match(html, /2026-11-20/);
  assert.match(html, /小雨/);
  assert.match(html, /9~18℃/);
  assert.match(html, /降水概率 70%/);
  assert.match(html, /来源 Open-Meteo/);
  assert.match(html, /更新于/);
  assert.match(html, /预报有雨/);
  assert.match(html, /故宫/);
  assert.match(html, /室内\/雨天备选（0）/);
  assert.match(html, /添加备选/);
  assert.match(html, /刷新天气/);
  assert.match(html, /替换前会展示前后差异/);
  // 天气只做建议，不会自动改动行程。
  assert.equal(day.activities[0].title, '故宫');
  assert.equal(day.activities[0].weatherBackupApplied, undefined);
});

test('weather failure and missing locations stay usable and allow manual backups', async () => {
  const { route, day } = weatherTrip();
  const failing = fakeClient([new ApiError('WEATHER_UPSTREAM_FAILED')]);
  const failed = await setupWeather({ route, day, weatherClient: failing, storage: memoryStorage() });
  await failed.state.reload(true);
  const failedHtml = await renderView(failed.component, failed.state);
  assert.match(failedHtml, /天气获取失败/);
  assert.match(failedHtml, /天气服务暂时不可用/);
  assert.match(failedHtml, /重试/);
  assert.match(failedHtml, /添加备选/);

  const noPlaceDay = { date: '2026-11-20', activities: [activity('n1', '休息', null)] };
  const noPlaceRoute = routeWithDays([noPlaceDay]);
  const noLocation = await setupWeather({ route: noPlaceRoute, day: noPlaceDay, weatherClient: fakeClient([]) });
  await noLocation.state.reload(true);
  assert.equal(noLocation.state.dayInfo.value.status, 'no-location');
  const noLocationHtml = await renderView(noLocation.component, noLocation.state);
  assert.match(noLocationHtml, /无法匹配天气/);
  assert.match(noLocationHtml, /手动添加/);

  // 未加载天气时，手动备选入口仍然存在。
  const { route: offlineRoute, day: offlineDay } = weatherTrip();
  const offline = await setupWeather({ route: offlineRoute, day: offlineDay });
  const offlineHtml = await renderView(offline.component, offline.state);
  assert.match(offlineHtml, /暂无天气数据/);
  assert.match(offlineHtml, /室内\/雨天备选（0）/);
});

test('component adds manual and pool backups, previews a swap and can undo it', async () => {
  const { route, day } = weatherTrip();
  const client = fakeClient([payloadFor('2026-11-20')]);
  const { component, state } = await setupWeather({
    route,
    day,
    weatherClient: client,
    storage: memoryStorage()
  });
  await state.reload(true);
  const act = day.activities[0];

  state.manualFor(act).title = '中国国家博物馆';
  state.manualFor(act).note = '室内，需预约';
  state.manualFor(act).durationMinutes = '90';
  state.addManual(act);
  assert.equal(act.backups.length, 1);
  assert.equal(act.backups[0].title, '中国国家博物馆');
  assert.equal(act.backups[0].indoor, true);
  assert.equal(act.backups[0].durationMinutes, 90);
  assert.equal(state.manualFor(act).title, '');

  state.poolPicks.a1 = 0;
  state.addFromPool(act, 'a1');
  assert.equal(act.backups.length, 2);
  assert.equal(act.backups[1].title, '首都博物馆');
  assert.equal(act.backups[1].source, 'pool');
  assert.equal(state.poolPicks.a1, '');

  state.startSwap(act, act.backups[1]);
  assert.equal(state.pendingSwap.value.preview.next.title, '首都博物馆');
  const previewHtml = await renderView(component, state);
  assert.match(previewHtml, /确认替换/);
  assert.match(previewHtml, /替换前/);
  assert.match(previewHtml, /替换后/);
  assert.match(previewHtml, /账本和已记录的实际支出不会自动改动/);

  state.confirmSwap();
  assert.equal(state.pendingSwap.value, null);
  const swapped = day.activities[0];
  assert.equal(swapped.title, '首都博物馆');
  assert.equal(swapped.weatherBackupApplied, true);
  assert.equal(swapped.swappedFromTitle, '故宫');
  assert.equal(Object.hasOwn(swapped, 'travelEstimate'), false);
  const swappedHtml = await renderView(component, state);
  assert.match(swappedHtml, /已替换自「故宫」/);
  assert.match(swappedHtml, /撤销替换/);

  state.undoSwap(swapped);
  assert.equal(day.activities[0].title, '故宫');
  assert.equal(day.activities[0].travelEstimate.minutes, 15);
  assert.equal(day.activities[0].weatherBackupApplied, undefined);
});

test('component ignores meal activities for weather backups', async () => {
  const mealDay = {
    date: '2026-11-20',
    activities: [{ id: 'm1', time: '12:00', title: '午餐', category: '用餐', meal: { persons: 2 } }]
  };
  const route = routeWithDays([mealDay]);
  const { component, state } = await setupWeather({ route, day: mealDay });
  const html = await renderView(component, state);
  assert.match(html, /当天还没有可添加备选的活动/);
  assert.match(html, /用餐请使用替换餐厅功能/);
  assert.doesNotMatch(html, /m1/);
});
