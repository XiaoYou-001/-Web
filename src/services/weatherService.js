import { ApiError, apiClient, apiErrorMessage, isRequestCancelled } from './apiClient.js'
import { addCalendarDays, localDateString } from '../utils/date.js'

// 天气数据来自服务端代理（Open-Meteo），浏览器只与本站 /api/weather 通信。
export const WEATHER_CACHE_PREFIX = 'weather_cache:v1:'
export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000
export const MAX_FORECAST_DAYS = 16

const round = value => Math.round(value * 1000) / 1000 + 0
const invalid = () => new ApiError('INVALID_RESPONSE')
const optionalNumber = value => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

// GCJ-02（高德）转 WGS-84（Open-Meteo 使用）。误差约 1–2 米，仅用于天气。
const PI = Math.PI
const EARTH_A = 6378245
const EARTH_EE = 0.00669342162296594323

function transformLat(x, y) {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  value += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3
  value += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3
  value += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3
  return value
}

function transformLng(x, y) {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  value += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3
  value += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3
  value += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3
  return value
}

export function gcj02ToWgs84([lng, lat]) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error('坐标无效')
  // 境外坐标不做偏移；高德返回的境外点位本身已接近 WGS-84。
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lng, lat]
  let dLat = transformLat(lng - 105, lat - 35)
  let dLng = transformLng(lng - 105, lat - 35)
  const radLat = lat / 180 * PI
  let magic = Math.sin(radLat)
  magic = 1 - EARTH_EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180) / ((EARTH_A * (1 - EARTH_EE)) / (magic * sqrtMagic) * PI)
  dLng = (dLng * 180) / (EARTH_A / sqrtMagic * Math.cos(radLat) * PI)
  return [round(lng - dLng), round(lat - dLat)]
}

export function weatherCacheKey({ lat, lng, start, end }) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || !start || !end) throw new Error('天气缓存参数无效')
  return `${WEATHER_CACHE_PREFIX}${round(Number(lat)).toFixed(3)},${round(Number(lng)).toFixed(3)},${start},${end}`
}

function resolveStorage(storage) {
  try {
    return storage || globalThis.localStorage || null
  } catch {
    return null
  }
}

export function readWeatherCache(key, { storage, now = Date.now() } = {}) {
  const store = resolveStorage(storage)
  if (!store) return null
  let raw
  try { raw = store.getItem(key) } catch { return null }
  if (!raw) return null
  let entry
  try { entry = JSON.parse(raw) } catch { return null }
  if (!entry || typeof entry !== 'object' || !isUsableWeather(entry.weather) || !Number.isFinite(entry.cachedAt)) return null
  const age = now - entry.cachedAt
  return { weather: entry.weather, cachedAt: entry.cachedAt, stale: !(age >= 0 && age < WEATHER_CACHE_TTL_MS) }
}

export function writeWeatherCache(key, weather, { storage, now = Date.now() } = {}) {
  const store = resolveStorage(storage)
  if (!store) return false
  try {
    store.setItem(key, JSON.stringify({ cachedAt: now, weather }))
    return true
  } catch {
    return false
  }
}

function isUsableWeather(weather) {
  return Boolean(weather) && typeof weather === 'object'
    && typeof weather.source === 'string'
    && Array.isArray(weather.days)
    && weather.days.every(day => day && typeof day.date === 'string' && typeof day.description === 'string')
}

export function normalizeWeather(payload, { start, end } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalid()
  const range = payload.range && typeof payload.range === 'object' ? payload.range : {}
  const rangeStart = typeof range.start === 'string' ? range.start : start
  const rangeEnd = typeof range.end === 'string' ? range.end : end
  if (typeof rangeStart !== 'string' || typeof rangeEnd !== 'string') throw invalid()
  if (typeof payload.source !== 'string' || !payload.source.trim()) throw invalid()
  if (!Array.isArray(payload.days)) throw invalid()
  const seen = new Set()
  const days = payload.days.map(row => {
    if (!row || typeof row !== 'object') throw invalid()
    if (typeof row.date !== 'string' || row.date < rangeStart || row.date > rangeEnd) throw invalid()
    if (seen.has(row.date)) throw invalid()
    seen.add(row.date)
    if (typeof row.description !== 'string' || !row.description.trim()) throw invalid()
    if (typeof row.isRain !== 'boolean') throw invalid()
    const tempMax = optionalNumber(row.tempMax)
    const tempMin = optionalNumber(row.tempMin)
    const precipitation = optionalNumber(row.precipitationProbability)
    if (tempMax === undefined || tempMin === undefined || precipitation === undefined) throw invalid()
    return { date: row.date, description: row.description, isRain: row.isRain, tempMax, tempMin, precipitationProbability: precipitation }
  })
  const unavailableDates = Array.isArray(payload.unavailableDates) ? payload.unavailableDates : []
  if (!unavailableDates.every(date => typeof date === 'string' && date >= rangeStart && date <= rangeEnd)) throw invalid()
  const latitude = optionalNumber(payload.latitude)
  const longitude = optionalNumber(payload.longitude)
  if (latitude === undefined || longitude === undefined) throw invalid()
  return {
    source: payload.source,
    coordinateSystem: payload.coordinateSystem === 'GCJ-02' ? 'GCJ-02' : 'WGS-84',
    fetchedAt: typeof payload.fetchedAt === 'string' ? payload.fetchedAt : '',
    latitude,
    longitude,
    timezone: typeof payload.timezone === 'string' && payload.timezone.trim() ? payload.timezone : 'UTC',
    range: { start: rangeStart, end: rangeEnd },
    days,
    unavailableDates
  }
}

function normalizeLocation(place, activity) {
  const location = Array.isArray(place?.location) ? place.location : null
  if (!location || location.length < 2) return null
  const lng = Number(location[0])
  const lat = Number(location[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  const system = place?.coordinateSystem === 'WGS-84' ? 'WGS-84' : 'GCJ-02'
  const [wgsLng, wgsLat] = system === 'WGS-84' ? [lng, lat] : gcj02ToWgs84([lng, lat])
  return {
    name: typeof place?.name === 'string' && place.name.trim() ? place.name.trim() : (activity?.title || ''),
    placeId: typeof place?.id === 'string' ? place.id : '',
    coordinateSystem: system,
    lat: round(wgsLat),
    lng: round(wgsLng)
  }
}

// 每日天气按当天第一个已确认地点匹配；没有确认坐标的日期不猜测城市。
export function dayWeatherLocation(day) {
  const activities = Array.isArray(day?.activities) ? day.activities : []
  for (const activity of activities) {
    const location = normalizeLocation(activity?.place, activity)
    if (location) return location
  }
  return null
}

// 预报窗口固定锚定“今天”：Open-Meteo 只能提供今天起 16 天内的逐日预报。
// 若锚定旅行首日，提前 16 天以上规划的行程会请求到窗口外，被上游拒绝后只能显示“获取失败”。
export function weatherTargets(route, { today = localDateString() } = {}) {
  const windowEnd = addCalendarDays(today, MAX_FORECAST_DAYS - 1)
  const groups = new Map()
  for (const day of Array.isArray(route?.days) ? route.days : []) {
    if (!day || typeof day.date !== 'string') continue
    const location = dayWeatherLocation(day)
    if (!location) continue
    const key = `${location.lat.toFixed(3)},${location.lng.toFixed(3)}`
    const group = groups.get(key) || { key, location, dates: [] }
    if (!group.dates.includes(day.date)) group.dates.push(day.date)
    groups.set(key, group)
  }
  return [...groups.values()].map(group => {
    const dates = [...group.dates].sort()
    const inWindow = dates.filter(date => date >= today && date <= windowEnd)
    return {
      ...group,
      dates,
      today,
      windowEnd,
      // 只请求预报窗口内的日期；窗口外的日期直接标注，不再请求上游。
      start: inWindow[0] || dates[0],
      end: inWindow[inWindow.length - 1] || dates[0],
      outOfRange: inWindow.length === 0
    }
  })
}

// 读取旅行中所有可匹配日期的天气；失败时优先退回本地缓存，不使用编造数据。
export async function loadRouteWeather(route, {
  client = apiClient,
  storage,
  now = Date.now,
  force = false,
  signal,
  today
} = {}) {
  const at = typeof now === 'function' ? Number(now()) : Number(now)
  const resolvedNow = Number.isFinite(at) ? at : Date.now()
  const targets = weatherTargets(route, { today: today || localDateString() })
  const byDate = {}
  for (const day of Array.isArray(route?.days) ? route.days : []) {
    if (day && typeof day.date === 'string') byDate[day.date] = { status: 'no-location' }
  }

  for (const target of targets) {
    if (signal?.aborted) throw new ApiError('CANCELLED')
    if (target.outOfRange) {
      for (const date of target.dates) {
        byDate[date] = { status: date < target.today ? 'unavailable' : 'out-of-range', location: target.location }
      }
      continue
    }
    const key = weatherCacheKey({ lat: target.location.lat, lng: target.location.lng, start: target.start, end: target.end })
    const cached = readWeatherCache(key, { storage, now: resolvedNow })
    let outcome
    if (!force && cached && !cached.stale) {
      outcome = { weather: cached.weather, cached: true, stale: false }
    } else {
      try {
        const payload = await client.request('weather', {
          params: { lat: target.location.lat, lng: target.location.lng, start: target.start, end: target.end },
          signal
        })
        const weather = normalizeWeather(payload, { start: target.start, end: target.end })
        writeWeatherCache(key, weather, { storage, now: at })
        outcome = { weather, cached: false, stale: false }
      } catch (error) {
        if (isRequestCancelled(error)) throw error
        const stale = readWeatherCache(key, { storage, now: at })
        outcome = stale && stale.weather
          ? { weather: stale.weather, cached: true, stale: Boolean(stale.stale), error: apiErrorMessage(error) }
          : { error: apiErrorMessage(error), errorCode: error?.code || 'WEATHER_FAILED' }
      }
    }

    for (const date of target.dates) {
      const base = { location: target.location }
      // 窗口外的日期不参与本次请求：过去日期无预报，未来超出窗口明确标注范围。
      if (date < target.today) { byDate[date] = { status: 'unavailable', ...base }; continue }
      if (date > target.windowEnd) { byDate[date] = { status: 'out-of-range', ...base }; continue }
      if (!outcome.weather) {
        byDate[date] = { status: 'error', ...base, error: outcome.error }
        continue
      }
      const weather = outcome.weather
      const dayWeather = weather.days.find(item => item.date === date)
      if (dayWeather) {
        byDate[date] = {
          status: 'ok',
          ...base,
          weather: dayWeather,
          source: weather.source,
          fetchedAt: weather.fetchedAt,
          timezone: weather.timezone,
          cached: outcome.cached,
          stale: outcome.stale,
          error: outcome.error || ''
        }
      } else if (weather.unavailableDates.includes(date)) {
        byDate[date] = { status: 'unavailable', ...base }
      } else {
        byDate[date] = { status: 'unavailable', ...base }
      }
    }
  }
  return { byDate, targets }
}
