import express from 'express';
import { addCalendarDays, inclusiveDayCount, parseDateOnly } from '../src/utils/date.js';

const SOURCE = 'Open-Meteo';
const COORDINATE_SYSTEM = 'WGS-84';
const MAX_FORECAST_DAYS = 16;
const MAX_CACHE_ENTRIES = 500;
const NUMERIC_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

// Open-Meteo uses the WMO 4677 weather interpretation codes. Snow codes are
// deliberately not flagged as rain, even though they are precipitation.
const WEATHER_CODES = new Map([
  [0, { description: '晴', isRain: false }],
  [1, { description: '大部晴朗', isRain: false }],
  [2, { description: '局部多云', isRain: false }],
  [3, { description: '阴', isRain: false }],
  [45, { description: '雾', isRain: false }],
  [48, { description: '雾凇', isRain: false }],
  [51, { description: '小毛毛雨', isRain: true }],
  [53, { description: '中毛毛雨', isRain: true }],
  [55, { description: '大毛毛雨', isRain: true }],
  [56, { description: '小冻毛毛雨', isRain: true }],
  [57, { description: '大冻毛毛雨', isRain: true }],
  [61, { description: '小雨', isRain: true }],
  [63, { description: '中雨', isRain: true }],
  [65, { description: '大雨', isRain: true }],
  [66, { description: '小冻雨', isRain: true }],
  [67, { description: '大冻雨', isRain: true }],
  [71, { description: '小雪', isRain: false }],
  [73, { description: '中雪', isRain: false }],
  [75, { description: '大雪', isRain: false }],
  [77, { description: '雪粒', isRain: false }],
  [80, { description: '小阵雨', isRain: true }],
  [81, { description: '阵雨', isRain: true }],
  [82, { description: '强阵雨', isRain: true }],
  [85, { description: '小阵雪', isRain: false }],
  [86, { description: '大阵雪', isRain: false }],
  [95, { description: '雷阵雨', isRain: true }],
  [96, { description: '雷阵雨伴有小冰雹', isRain: true }],
  [99, { description: '雷阵雨伴有大冰雹', isRain: true }]
]);

export function describeWeatherCode(code) {
  const numeric = typeof code === 'number'
    ? code
    : typeof code === 'string' && code.trim() !== '' ? Number(code) : Number.NaN;
  const known = Number.isInteger(numeric) ? WEATHER_CODES.get(numeric) : undefined;
  return {
    code,
    description: known ? known.description : '未知天气',
    isRain: known ? known.isRain : false
  };
}

const parseCoordinate = (value, limit) => {
  if (typeof value !== 'string' || !NUMERIC_TEXT.test(value)) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= -limit && coordinate <= limit ? coordinate : null;
};

// Coordinates are cached and requested at roughly 100 m precision. Adding zero
// normalizes -0 so the cache key is stable.
const roundCoordinate = value => Math.round(value * 1000) / 1000 + 0;

const finiteNumber = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

const disposeBody = async response => {
  const body = response?.body;
  if (!body) return;
  try {
    if (typeof body.cancel === 'function') await body.cancel();
    else if (typeof body.destroy === 'function') body.destroy();
  } catch {
    // The body is already closed, locked, or errored; nothing left to release.
  }
};

const failure = (res, status, code, error) => res.status(status).json({ code, error });

export function createWeatherRouter({
  fetchImpl = fetch,
  now = Date.now,
  cacheTtlMs = 30 * 60 * 1000,
  endpoint = 'https://api.open-meteo.com',
  timeoutMs = 8000
} = {}) {
  const router = express.Router();
  const cache = new Map();
  const baseEndpoint = String(endpoint).replace(/\/+$/, '');
  const requestTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : 8000;
  const ttl = Number.isFinite(Number(cacheTtlMs)) && Number(cacheTtlMs) > 0 ? Number(cacheTtlMs) : 0;

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/status', (_req, res) => {
    res.json({
      enabled: true,
      source: SOURCE,
      coordinateSystem: COORDINATE_SYSTEM,
      maxForecastDays: MAX_FORECAST_DAYS
    });
  });

  const loadForecast = async target => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);

    try {
      let response;
      try {
        response = await fetchImpl(target, {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });
      } catch {
        return { error: timedOut ? 'timeout' : 'upstream' };
      }

      const status = Number(response?.status);
      const failed = !response || response.ok === false
        || (Number.isFinite(status) && (status < 200 || status > 299));
      if (failed) {
        await disposeBody(response);
        return { error: timedOut ? 'timeout' : 'upstream' };
      }

      try {
        return { payload: await response.json() };
      } catch {
        await disposeBody(response);
        return { error: timedOut ? 'timeout' : 'invalid' };
      }
    } finally {
      clearTimeout(timer);
    }
  };

  router.get('/', async (req, res) => {
    const { lat, lng, start, end } = req.query || {};
    const latitude = parseCoordinate(lat, 90);
    const longitude = parseCoordinate(lng, 180);
    let dayCount;
    try {
      if (latitude === null || longitude === null) throw new Error('Invalid coordinate');
      parseDateOnly(start);
      parseDateOnly(end);
      dayCount = inclusiveDayCount(start, end);
    } catch {
      return failure(res, 400, 'VALIDATION', '天气查询参数无效');
    }
    if (dayCount > MAX_FORECAST_DAYS) {
      return failure(res, 400, 'VALIDATION', '天气查询最多支持16天');
    }

    const roundedLatitude = roundCoordinate(latitude);
    const roundedLongitude = roundCoordinate(longitude);
    const cacheKey = `${roundedLatitude.toFixed(3)},${roundedLongitude.toFixed(3)},${start},${end}`;
    const requestedAt = now();

    const cached = cache.get(cacheKey);
    if (cached) {
      if (cached.expiresAt > requestedAt) {
        return res.json({ ...cached.value, cached: true });
      }
      cache.delete(cacheKey);
    }

    const target = new URL(`${baseEndpoint}/v1/forecast`);
    target.searchParams.set('latitude', String(roundedLatitude));
    target.searchParams.set('longitude', String(roundedLongitude));
    target.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
    target.searchParams.set('timezone', 'auto');
    // Open-Meteo rejects forecast_days together with start_date/end_date; the
    // requested range is already bounded to MAX_FORECAST_DAYS above.
    target.searchParams.set('start_date', start);
    target.searchParams.set('end_date', end);

    const result = await loadForecast(target.toString());
    if (result.error === 'timeout') {
      return failure(res, 504, 'WEATHER_TIMEOUT', '天气服务响应超时，请稍后重试');
    }
    if (result.error === 'upstream') {
      return failure(res, 502, 'WEATHER_UPSTREAM_FAILED', '天气服务暂时不可用，请稍后重试');
    }
    if (result.error === 'invalid') {
      return failure(res, 502, 'WEATHER_INVALID_RESPONSE', '天气服务返回的数据格式异常');
    }

    const payload = result.payload;
    const daily = payload && typeof payload === 'object' ? payload.daily : null;
    if (!daily || typeof daily !== 'object'
      || !Array.isArray(daily.time)
      || !Array.isArray(daily.weather_code)
      || !Array.isArray(daily.temperature_2m_max)
      || !Array.isArray(daily.temperature_2m_min)) {
      return failure(res, 502, 'WEATHER_INVALID_RESPONSE', '天气服务返回的数据格式异常');
    }

    // Only dates inside the requested range are returned. Upstream dates outside
    // the range are ignored, and requested dates without upstream data are
    // listed as unavailable instead of being invented.
    const rows = new Map();
    for (let index = 0; index < daily.time.length; index += 1) {
      const date = daily.time[index];
      if (typeof date === 'string' && date >= start && date <= end) rows.set(date, index);
    }

    const days = [];
    const unavailableDates = [];
    for (let offset = 0; offset < dayCount; offset += 1) {
      const date = addCalendarDays(start, offset);
      const index = rows.get(date);
      if (index === undefined) {
        unavailableDates.push(date);
        continue;
      }
      const code = finiteNumber(daily.weather_code[index]);
      const described = describeWeatherCode(code);
      days.push({
        date,
        code: described.code,
        description: described.description,
        isRain: described.isRain,
        tempMax: finiteNumber(daily.temperature_2m_max[index]),
        tempMin: finiteNumber(daily.temperature_2m_min[index]),
        // Missing probabilities stay null; they must never be mistaken for 0%.
        precipitationProbability: finiteNumber(daily.precipitation_probability_max?.[index])
      });
    }

    const upstreamLatitude = finiteNumber(payload.latitude);
    const upstreamLongitude = finiteNumber(payload.longitude);
    const timezone = typeof payload.timezone === 'string' && payload.timezone.trim()
      ? payload.timezone
      : 'UTC';
    const body = {
      source: SOURCE,
      coordinateSystem: COORDINATE_SYSTEM,
      fetchedAt: new Date(requestedAt).toISOString(),
      latitude: upstreamLatitude === null ? roundedLatitude : upstreamLatitude,
      longitude: upstreamLongitude === null ? roundedLongitude : upstreamLongitude,
      timezone,
      range: { start, end },
      days,
      unavailableDates
    };

    if (ttl > 0) {
      cache.delete(cacheKey);
      cache.set(cacheKey, { value: body, expiresAt: requestedAt + ttl });
      while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    }

    return res.json(body);
  });

  return router;
}
