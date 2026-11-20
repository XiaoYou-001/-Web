export const MAX_DAYS = 31;
export const MAX_ACTIVITIES_PER_DAY = 30;

const CANDIDATE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const COORDINATE_SYSTEMS = new Set(['GCJ-02', 'WGS84', 'BD-09']);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class CollabError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'CollabError';
    this.code = code;
    this.status = status;
  }
}

export function text(value, min, max, label) {
  if (typeof value !== 'string') throw new CollabError('VALIDATION', `${label}格式不正确`, 400);
  const trimmed = value.trim();
  const length = [...trimmed].length;
  if (length < min || length > max) throw new CollabError('VALIDATION', `${label}需为${min}至${max}个字符`, 400);
  return trimmed;
}

export function optionalText(value, max, label) {
  if (value === undefined || value === null || value === '') return '';
  return text(value, 0, max, label);
}

export function optionalDate(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) throw new CollabError('VALIDATION', '日期格式应为 YYYY-MM-DD', 400);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new CollabError('VALIDATION', '日期无效', 400);
  }
  return value;
}

export function optionalId(value, pattern, label) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !pattern.test(value)) throw new CollabError('VALIDATION', `${label}格式不正确`, 400);
  return value;
}

function optionalCoordinate(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

function sanitizePlace(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = optionalText(value.name, 200, `${label}地点名称`);
  if (!name) return null;
  const place = { name };
  const id = optionalId(value.id, CANDIDATE_ID, `${label}地点 ID`);
  if (id) place.id = id;
  const address = optionalText(value.address, 300, `${label}地点地址`);
  if (address) place.address = address;
  const city = optionalText(value.city, 100, `${label}地点城市`);
  if (city) place.city = city;
  const location = optionalCoordinate(value.location);
  if (location) place.location = location;
  if (COORDINATE_SYSTEMS.has(value.coordinateSystem)) place.coordinateSystem = value.coordinateSystem;
  const source = optionalText(value.source, 40, `${label}地点来源`);
  if (source) place.source = source;
  return place;
}

function sanitizeTravelEstimate(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.minutes == null || String(value.minutes).trim() === '') return null;
  const minutes = Number(value.minutes);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) return null;
  const mode = typeof value.mode === 'string' && /^[a-z-]{1,20}$/.test(value.mode) ? value.mode : 'driving';
  const estimate = { mode, minutes: Math.round(minutes) };
  const distanceMeters = Number(value.distanceMeters);
  if (Number.isFinite(distanceMeters) && distanceMeters >= 0) estimate.distanceMeters = Math.round(distanceMeters);
  const origin = optionalCoordinate(value.origin);
  if (origin) estimate.origin = origin;
  const destination = optionalCoordinate(value.destination);
  if (destination) estimate.destination = destination;
  if (value.source) estimate.source = optionalText(value.source, 40, label);
  const checkedAt = optionalText(value.checkedAt, 40, `${label}交通估算时间`);
  if (checkedAt) estimate.checkedAt = checkedAt;
  return estimate;
}

function sanitizeMeal(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const meal = {};
  const restaurantId = optionalText(value.restaurantId, 200, `${label}餐厅 ID`);
  if (restaurantId) meal.restaurantId = restaurantId;
  const restaurantSource = optionalText(value.restaurantSource, 40, `${label}餐厅来源`);
  if (restaurantSource) meal.restaurantSource = restaurantSource;
  const note = optionalText(value.note, 200, `${label}用餐备注`);
  if (note) meal.note = note;
  const persons = Number(value.persons);
  if (Number.isFinite(persons) && persons >= 1 && persons <= 99) meal.persons = Math.round(persons);
  for (const key of ['budgetPerPerson', 'budgetPerPersonCents', 'estimatedTotal']) {
    if (value[key] === null) {
      meal[key] = null;
      continue;
    }
    const amount = Number(value[key]);
    if (!Number.isFinite(amount) || amount < 0) continue;
    meal[key] = key === 'budgetPerPersonCents' ? Math.round(amount) : Math.round(amount * 100) / 100;
  }
  return meal;
}

function sanitizeActivity(value, dayIndex, activityIndex) {
  const label = `第${dayIndex + 1}天第${activityIndex + 1}项活动`;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CollabError('VALIDATION', `${label}格式不正确`, 400);
  }
  const activity = {
    title: text(value.title, 1, 200, `${label}标题`),
    time: optionalText(value.time, 40, `${label}时间`),
    description: optionalText(value.description, 2000, `${label}说明`),
    notes: optionalText(value.notes, 1000, `${label}备注`),
    completed: value.completed === true,
    skipped: value.skipped === true
  };
  const id = optionalId(value.id, CANDIDATE_ID, `${label} ID`);
  if (id) activity.id = id;
  if (value.timeLocked === true) activity.timeLocked = true;
  for (const key of ['opensAt', 'closesAt']) {
    if (value[key]) activity[key] = optionalText(value[key], 40, label);
  }
  if (['meal', '餐饮', '用餐'].includes(value.category)) activity.category = value.category;
  const slot = optionalText(value.slot, 20, `${label}用餐时段`);
  if (slot) activity.slot = slot;
  const slotLabel = optionalText(value.slotLabel, 20, `${label}用餐时段名称`);
  if (slotLabel) activity.slotLabel = slotLabel;
  for (const key of ['durationMinutes', 'travelMinutes']) {
    if (value[key] == null || String(value[key]).trim() === '') continue;
    const minutes = Number(value[key]);
    if (Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440) activity[key] = Math.round(minutes);
  }
  const place = sanitizePlace(value.place, label);
  if (place) activity.place = place;
  const travelEstimate = sanitizeTravelEstimate(value.travelEstimate, label);
  if (travelEstimate) activity.travelEstimate = travelEstimate;
  const meal = sanitizeMeal(value.meal, label);
  if (meal) activity.meal = meal;
  return activity;
}

// 共享每日行程只保存可移植的展示字段；账本、准备清单、手账等仍留在各自账号本地。
export function sanitizeDays(input) {
  if (input === undefined) return null;
  if (!Array.isArray(input) || input.length > MAX_DAYS) {
    throw new CollabError('VALIDATION', `每日行程最多${MAX_DAYS}天`, 400);
  }
  const seen = new Set();
  return input.map((day, index) => {
    if (!day || typeof day !== 'object' || Array.isArray(day)) {
      throw new CollabError('VALIDATION', `第${index + 1}天格式不正确`, 400);
    }
    const date = optionalDate(day.date);
    if (!date) throw new CollabError('VALIDATION', `第${index + 1}天缺少有效日期`, 400);
    if (seen.has(date)) throw new CollabError('VALIDATION', `第${index + 1}天日期重复`, 400);
    seen.add(date);
    const activities = Array.isArray(day.activities) ? day.activities : [];
    if (activities.length > MAX_ACTIVITIES_PER_DAY) {
      throw new CollabError('VALIDATION', `每天最多${MAX_ACTIVITIES_PER_DAY}项活动`, 400);
    }
    const normalized = {
      date,
      activities: activities.map((activity, activityIndex) => sanitizeActivity(activity, index, activityIndex))
    };
    if (Number.isFinite(day.budget)) normalized.budget = Math.max(0, Math.round(day.budget * 100) / 100);
    return normalized;
  });
}
