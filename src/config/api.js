function apiBase(value, name) {
  if (value.trim().startsWith('//')) throw new Error(`${name} 地址无效`)
  const base = value.trim().replace(/\/+$/, '') || '/'
  const relative = base.startsWith('/') && !base.startsWith('//')
  let url
  try { url = new URL(base || '/', 'https://local.invalid') } catch { throw new Error(`${name} 地址无效`) }
  if ((!relative && !/^https?:\/\//i.test(base)) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} 必须为站点绝对路径或不含凭证、查询参数的 HTTP(S) 地址`)
  }
  return base || '/'
}

function timeout(value, fallback, name) {
  if (value === undefined || value === '') return fallback
  const milliseconds = Number(value)
  if (!Number.isInteger(milliseconds) || milliseconds <= 0 || milliseconds > 300000) throw new Error(`${name} 必须为 1 至 300000 之间的整数`)
  return milliseconds
}

export function readApiConfig(env = {}) {
  const routes = env.VITE_ROUTES_API_BASE_URL?.trim() || env.VITE_APP_API_BASE_URL?.trim()
  return {
    baseUrl: apiBase(env.VITE_API_BASE_URL?.trim() || '/api', 'VITE_API_BASE_URL'),
    routesBaseUrl: routes ? apiBase(routes, 'VITE_ROUTES_API_BASE_URL') : null,
    timeoutMs: timeout(env.VITE_API_REQUEST_TIMEOUT_MS, 10000, 'VITE_API_REQUEST_TIMEOUT_MS'),
    aiTimeoutMs: timeout(env.VITE_AI_REQUEST_TIMEOUT_MS, 45000, 'VITE_AI_REQUEST_TIMEOUT_MS')
  }
}

export const apiConfig = readApiConfig(import.meta.env || {})
