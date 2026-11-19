import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import express from 'express';
import { createWeatherRouter, describeWeatherCode } from '../server/weather.js';

const NOW = Date.UTC(2026, 10, 16, 8, 0, 0);

async function serve(t, options) {
  const app = express();
  app.use('/api/weather', createWeatherRouter(options));
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}/api/weather`;
}

const queryUrl = (base, params) => `${base}?${new URLSearchParams(params)}`;

const forecast = () => ({
  latitude: 39.904,
  longitude: 116.407,
  timezone: 'Asia/Shanghai',
  daily: {
    time: ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'],
    weather_code: [3, 0, 61, 82],
    temperature_2m_max: [7, 12.4, 9.8, 13],
    temperature_2m_min: [1, 3.1, null, 5],
    precipitation_probability_max: [10, 0]
  }
});

const validQuery = {
  lat: '39.9',
  lng: '116.4',
  start: '2026-11-16',
  end: '2026-11-17'
};

test('status describes the weather proxy and is never cached', async t => {
  const base = await serve(t, { fetchImpl: async () => { throw new Error('should not fetch'); } });
  const response = await fetch(`${base}/status`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    enabled: true,
    source: 'Open-Meteo',
    coordinateSystem: 'WGS-84',
    maxForecastDays: 16
  });
});

test('forwards the expected Open-Meteo request and maps daily data safely', async t => {
  let captured;
  const base = await serve(t, {
    endpoint: 'https://weather.test',
    now: () => NOW,
    fetchImpl: async url => {
      captured = new URL(url);
      return Response.json(forecast());
    }
  });

  const response = await fetch(queryUrl(base, {
    lat: '39.9044',
    lng: '116.4072',
    start: '2026-11-16',
    end: '2026-11-19'
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();

  assert.equal(captured.origin, 'https://weather.test');
  assert.equal(captured.pathname, '/v1/forecast');
  assert.equal(captured.searchParams.get('latitude'), '39.904');
  assert.equal(captured.searchParams.get('longitude'), '116.407');
  assert.equal(captured.searchParams.get('daily'), 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  assert.equal(captured.searchParams.get('timezone'), 'auto');
  assert.equal(captured.searchParams.get('start_date'), '2026-11-16');
  assert.equal(captured.searchParams.get('end_date'), '2026-11-19');
  // forecast_days is mutually exclusive with explicit dates upstream; sending both
  // makes Open-Meteo answer 400 and the proxy surface WEATHER_UPSTREAM_FAILED.
  assert.equal(captured.searchParams.get('forecast_days'), null);
  assert.deepEqual([...captured.searchParams.keys()].sort(), [
    'daily', 'end_date', 'latitude', 'longitude', 'start_date', 'timezone'
  ]);
  assert.doesNotMatch(captured.href, /api[-_]?key|token|secret/i);

  assert.equal(body.source, 'Open-Meteo');
  assert.equal(body.coordinateSystem, 'WGS-84');
  assert.equal(body.fetchedAt, new Date(NOW).toISOString());
  assert.equal(body.latitude, 39.904);
  assert.equal(body.longitude, 116.407);
  assert.equal(body.timezone, 'Asia/Shanghai');
  assert.deepEqual(body.range, { start: '2026-11-16', end: '2026-11-19' });
  assert.equal(body.days.length, 3);
  assert.deepEqual(body.days[0], {
    date: '2026-11-16',
    code: 0,
    description: '晴',
    isRain: false,
    tempMax: 12.4,
    tempMin: 3.1,
    precipitationProbability: 0
  });
  assert.deepEqual(body.days[1], {
    date: '2026-11-17',
    code: 61,
    description: '小雨',
    isRain: true,
    tempMax: 9.8,
    tempMin: null,
    precipitationProbability: null
  });
  assert.equal(body.days[2].date, '2026-11-18');
  assert.equal(body.days[2].description, '强阵雨');
  assert.equal(body.days[2].precipitationProbability, null);
  assert.deepEqual(body.unavailableDates, ['2026-11-19']);
  assert.ok(!body.days.some(day => day.date === '2026-11-19'), 'missing dates are not fabricated');
  assert.doesNotMatch(JSON.stringify(body), /NaN/);
});

test('successful responses are cached by rounded coordinates and keep their fetchedAt', async t => {
  let calls = 0;
  const base = await serve(t, {
    now: () => NOW,
    fetchImpl: async () => {
      calls += 1;
      return Response.json(forecast());
    }
  });
  const params = { lat: '39.9044', lng: '116.4072', start: '2026-11-16', end: '2026-11-17' };

  const first = await (await fetch(queryUrl(base, params))).json();
  const second = await (await fetch(queryUrl(base, params))).json();
  const nearby = await (await fetch(queryUrl(base, { ...params, lat: '39.9041' }))).json();

  assert.equal(calls, 1);
  assert.equal(first.cached, undefined);
  assert.equal(second.cached, true);
  assert.equal(nearby.cached, true);
  assert.equal(second.fetchedAt, first.fetchedAt);
  assert.deepEqual(second.days, first.days);
});

test('cache entries expire after the configured TTL and failures are not cached', async t => {
  let calls = 0;
  let clock = NOW;
  let fail = true;
  const base = await serve(t, {
    cacheTtlMs: 1000,
    now: () => clock,
    fetchImpl: async () => {
      calls += 1;
      return fail ? new Response('temporarily down', { status: 500 }) : Response.json(forecast());
    }
  });
  const params = { ...validQuery };

  assert.equal((await fetch(queryUrl(base, params))).status, 502);
  fail = false;
  const first = await (await fetch(queryUrl(base, params))).json();
  assert.equal(first.cached, undefined);
  assert.equal(calls, 2, 'the failed response was not cached');

  clock += 1001;
  const second = await (await fetch(queryUrl(base, params))).json();
  assert.equal(second.cached, undefined);
  assert.equal(calls, 3, 'the expired entry triggered a fresh upstream call');
});

test('invalid coordinates, dates and spans are rejected before any upstream call', async t => {
  let calls = 0;
  const base = await serve(t, {
    fetchImpl: async () => {
      calls += 1;
      return Response.json(forecast());
    }
  });
  const cases = [
    [{ ...validQuery, lat: '90.1' }, '天气查询参数无效'],
    [{ ...validQuery, lat: '-90.1' }, '天气查询参数无效'],
    [{ ...validQuery, lat: 'north' }, '天气查询参数无效'],
    [{ ...validQuery, lat: '' }, '天气查询参数无效'],
    [{ ...validQuery, lng: '180.1' }, '天气查询参数无效'],
    [{ ...validQuery, lng: '-180.1' }, '天气查询参数无效'],
    [{ ...validQuery, lng: 'east' }, '天气查询参数无效'],
    [{ ...validQuery, start: '2026-02-30' }, '天气查询参数无效'],
    [{ ...validQuery, end: 'not-a-date' }, '天气查询参数无效'],
    [{ ...validQuery, start: '2026-11-18', end: '2026-11-17' }, '天气查询参数无效'],
    [{ ...validQuery, start: '2026-01-01', end: '2026-01-17' }, '天气查询最多支持16天']
  ];

  for (const [params, error] of cases) {
    const response = await fetch(queryUrl(base, params));
    assert.equal(response.status, 400, JSON.stringify(params));
    assert.deepEqual(await response.json(), { code: 'VALIDATION', error });
  }
  assert.equal(calls, 0);
});

test('upstream HTTP failures return a sanitized 502 and release the body', async t => {
  let cancelled = 0;
  let mode = 'spy';
  const base = await serve(t, {
    fetchImpl: async () => {
      if (mode === 'spy') {
        return {
          ok: false,
          status: 500,
          body: { cancel: async () => { cancelled += 1; } },
          json: async () => { throw new Error('must not parse a failed response'); }
        };
      }
      return new Response('upstream secret details', { status: 503 });
    }
  });
  const params = { lat: '31.2', lng: '121.5', start: '2026-11-16', end: '2026-11-17' };

  const failed = await fetch(queryUrl(base, params));
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), {
    code: 'WEATHER_UPSTREAM_FAILED',
    error: '天气服务暂时不可用，请稍后重试'
  });
  assert.equal(cancelled, 1);

  mode = 'text';
  const leaking = await fetch(queryUrl(base, params));
  assert.equal(leaking.status, 502);
  assert.doesNotMatch(JSON.stringify(await leaking.json()), /secret|details/i);
});

test('an upstream timeout returns 504 and aborts the request', async t => {
  let observedSignal;
  const base = await serve(t, {
    timeoutMs: 20,
    now: () => NOW,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      observedSignal = signal;
      const abort = () => {
        const error = new Error('upstream request aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    })
  });

  const response = await fetch(queryUrl(base, validQuery));
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), {
    code: 'WEATHER_TIMEOUT',
    error: '天气服务响应超时，请稍后重试'
  });
  assert.equal(observedSignal.aborted, true);
});

test('malformed upstream payloads return WEATHER_INVALID_RESPONSE', async t => {
  let mode = 'missing-arrays';
  const base = await serve(t, {
    fetchImpl: async () => {
      if (mode === 'missing-arrays') return Response.json({ daily: { time: ['2026-11-16'], weather_code: [0] } });
      if (mode === 'null') return Response.json(null);
      return new Response('<html>not json</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
  });
  const params = { ...validQuery };

  for (mode of ['missing-arrays', 'null', 'html']) {
    const response = await fetch(queryUrl(base, params));
    assert.equal(response.status, 502, mode);
    assert.deepEqual(await response.json(), {
      code: 'WEATHER_INVALID_RESPONSE',
      error: '天气服务返回的数据格式异常'
    }, mode);
  }
});

test('WMO weather codes map to Chinese descriptions with accurate rain flags', () => {
  assert.deepEqual(describeWeatherCode(0), { code: 0, description: '晴', isRain: false });
  assert.deepEqual(describeWeatherCode(61), { code: 61, description: '小雨', isRain: true });
  assert.deepEqual(describeWeatherCode(95), { code: 95, description: '雷阵雨', isRain: true });

  const codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
  for (const code of codes) {
    const described = describeWeatherCode(code);
    assert.equal(described.code, code);
    assert.notEqual(described.description, '未知天气', `code ${code}`);
  }

  for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]) {
    assert.equal(describeWeatherCode(code).isRain, true, `rain code ${code}`);
  }
  for (const code of [0, 1, 2, 3, 45, 48, 71, 73, 75, 77, 85, 86]) {
    assert.equal(describeWeatherCode(code).isRain, false, `non-rain code ${code}`);
  }
  assert.equal(describeWeatherCode(71).description, '小雪');

  assert.deepEqual(describeWeatherCode(1234), { code: 1234, description: '未知天气', isRain: false });
});
