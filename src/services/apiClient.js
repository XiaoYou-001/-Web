import { readSSE } from './sse.js'
import { apiConfig } from '../config/api.js'

const messages = {
  VALIDATION: '请求参数无效，请检查后重试。',
  CANCELLED: '请求已取消。',
  TIMEOUT: '服务响应超时，请稍后重试。',
  NETWORK: '无法连接服务，请检查网络或稍后重试。',
  UNAUTHORIZED: '登录状态无效，请重新登录。',
  FORBIDDEN: '暂时没有访问此功能的权限。',
  NOT_FOUND: '服务接口不存在，请联系管理员检查配置。',
  RATE_LIMIT: '请求过于频繁，请稍后重试。',
  SERVICE_UNAVAILABLE: '服务暂时不可用，请稍后重试。',
  SERVER_ERROR: '服务处理失败，请稍后重试。',
  HTTP_ERROR: '请求失败，请稍后重试。',
  INVALID_RESPONSE: '服务返回的数据格式异常，请稍后重试。',
  BUSINESS_ERROR: '服务未能完成此请求，请稍后重试。',
  NOT_CONFIGURED: '此接口尚未接入，请联系管理员。',
  AI_NOT_CONFIGURED: 'AI服务尚未配置，请联系管理员。',
  AI_AUTH_FAILED: 'AI服务认证失败，请联系管理员。',
  AI_ENDPOINT_INVALID: 'AI服务地址配置有误，请联系管理员。'
}
const retryableCodes = new Set(['TIMEOUT', 'NETWORK', 'RATE_LIMIT', 'SERVICE_UNAVAILABLE', 'SERVER_ERROR', 'INVALID_RESPONSE'])

export class ApiError extends Error {
  constructor(code, { status = 0, message, cause } = {}) {
    super(message || messages[code] || messages.HTTP_ERROR, { cause })
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.retryable = retryableCodes.has(code)
  }
}

export const isRequestCancelled = error => error instanceof ApiError && error.code === 'CANCELLED'
export const apiErrorMessage = error => error instanceof ApiError ? error.message : messages.HTTP_ERROR

function responseError(status, data) {
  const knownCodes = ['AI_NOT_CONFIGURED', 'AI_AUTH_FAILED', 'AI_ENDPOINT_INVALID', 'TIMEOUT', 'VALIDATION', 'INVALID_RESPONSE', 'RATE_LIMIT', 'SERVICE_UNAVAILABLE', 'SERVER_ERROR']
  let code = status === 200 ? 'BUSINESS_ERROR' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN'
    : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMIT'
      : status === 504 ? 'TIMEOUT' : status === 502 || status === 503 ? 'SERVICE_UNAVAILABLE'
        : status >= 500 ? 'SERVER_ERROR' : status === 400 || status === 422 ? 'VALIDATION' : 'HTTP_ERROR'
  if (knownCodes.includes(data?.code)) code = data.code
  return new ApiError(code, { status })
}

function requestUrl(baseUrl, path, params) {
  if (typeof path !== 'string' || /[?#\\]/.test(path) || path.startsWith('//') || /^\w+:/.test(path)) throw new ApiError('VALIDATION')
  const segments = path.replace(/^\//, '').split('/')
  try {
    if (segments.some(segment => ['.', '..'].includes(decodeURIComponent(segment)))) throw new Error('Invalid path')
  } catch { throw new ApiError('VALIDATION') }
  const url = `${baseUrl.replace(/\/+$/, '')}/${segments.join('/')}`
  const query = new URLSearchParams()
  for (const [key, values] of Object.entries(params || {})) {
    for (const value of Array.isArray(values) ? values : [values]) {
      if (value === undefined || value === null) continue
      if (!['string', 'boolean', 'number'].includes(typeof value)) throw new ApiError('VALIDATION')
      query.append(key, String(value))
    }
  }
  return query.size ? `${url}?${query}` : url
}

export function createApiClient({ baseUrl = apiConfig.baseUrl, timeoutMs = apiConfig.timeoutMs, fetchImpl = (...args) => globalThis.fetch(...args), timers = globalThis } = {}) {
  return {
    async request(path, { method = 'GET', json, params, signal, timeoutMs: requestTimeout = timeoutMs, onDelta } = {}) {
      if (!Number.isInteger(requestTimeout) || requestTimeout <= 0 || requestTimeout > 300000) throw new ApiError('VALIDATION')
      if (signal?.aborted) throw new ApiError('CANCELLED')
      const url = requestUrl(baseUrl, path, params)
      let body
      try { if (json !== undefined) body = JSON.stringify(json) } catch { throw new ApiError('VALIDATION') }
      const controller = new AbortController()
      let abortCode
      const abort = code => { if (!controller.signal.aborted) { abortCode = code; controller.abort() } }
      const cancel = () => abort('CANCELLED')
      signal?.addEventListener('abort', cancel, { once: true })
      const timer = timers.setTimeout(() => abort('TIMEOUT'), requestTimeout)
      try {
        const response = await fetchImpl(url, {
          method, headers: { Accept: onDelta ? 'text/event-stream' : 'application/json', ...(json === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(json === undefined ? {} : { body }),
          credentials: 'same-origin', signal: controller.signal
        })
        if (response.ok && onDelta) {
          if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new ApiError('INVALID_RESPONSE')
          let text = ''
          try {
            for await (const raw of readSSE(response.body)) {
              if (controller.signal.aborted) throw new ApiError(abortCode)
              const data = JSON.parse(raw)
              if (data.error) throw responseError(200, data)
              if (typeof data.delta === 'string') { text += data.delta; onDelta(text) }
              if (data.done === true) {
                if (!text.trim()) throw new ApiError('INVALID_RESPONSE')
                return { choices: [{ message: { content: text } }], structuredInfo: data.structuredInfo }
              }
            }
            throw new ApiError('INVALID_RESPONSE')
          } catch (error) {
            if (error instanceof SyntaxError) throw new ApiError('INVALID_RESPONSE')
            throw error
          }
        }
        const raw = await response.text()
        if (controller.signal.aborted) throw new ApiError(abortCode)
        let data = null
        try { data = raw ? JSON.parse(raw) : null } catch {
          if (response.ok) throw new ApiError('INVALID_RESPONSE', { status: response.status })
        }
        if (!response.ok) throw responseError(response.status, data)
        if (response.status === 204) return null
        if (data === null) throw new ApiError('INVALID_RESPONSE', { status: response.status })
        if (data?.success === false || data?.error) throw responseError(200, data?.code ? data : { code: 'BUSINESS_ERROR' })
        return data
      } catch (error) {
        if (error instanceof ApiError) throw error
        if (controller.signal.aborted) throw new ApiError(abortCode, { cause: error })
        throw new ApiError('NETWORK', { cause: error })
      } finally {
        timers.clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
      }
    }
  }
}

export const apiClient = createApiClient()
