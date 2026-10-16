const messages = {
  NOT_CONFIGURED: '地图服务尚未配置，可继续使用列表浏览景点。',
  CONFIG_INVALID: '地图服务配置有误，请联系管理员。',
  LOAD_FAILED: '地图加载失败，请检查网络后重试。',
  TIMEOUT: '地图加载超时，请稍后重试。',
  CANCELLED: '地图加载已取消。'
}

export class MapLoadError extends Error {
  constructor(code) { super(messages[code]); this.code = code }
}

// 每个调用方有自己的取消信号；最后一个调用方离开后才取消共享加载。
export function createMapLoader({ key = '', serviceHost = '', timeoutMs = 10000,
  getWindow = () => globalThis.window, getDocument = () => globalThis.document,
  timers = globalThis } = {}) {
  let pending = null
  let sequence = 0
  const prefix = `__travelAMap_${Math.random().toString(36).slice(2)}_`
  const usable = sdk => typeof sdk?.Map === 'function' && typeof sdk?.Marker === 'function'

  function start(attempt, win, doc) {
    attempt.started = true
    const callbackName = `${prefix}${++sequence}`
    let script, timer
    const callback = () => {
      if (!attempt.settled) attempt.finish(usable(win.AMap) ? null : new MapLoadError('LOAD_FAILED'), win.AMap)
    }
    attempt.cleanup = failed => {
      timers.clearTimeout(timer)
      if (script) { script.onerror = null; if (failed) script.remove() }
      if (win[callbackName] === callback) delete win[callbackName]
    }
    try {
      // 生产部署由高德安全代理保管安全密钥，前端仅公开代理地址。
      if (serviceHost) win._AMapSecurityConfig = { ...win._AMapSecurityConfig, serviceHost }
      win[callbackName] = callback
      script = doc.createElement('script')
      const params = new URLSearchParams({ v: '2.0', key: key.trim(), callback: callbackName,
        plugin: 'AMap.ToolBar,AMap.Scale,AMap.MapType' })
      script.src = `https://webapi.amap.com/maps?${params}`
      script.async = true
      script.onerror = () => attempt.finish(new MapLoadError('LOAD_FAILED'))
      timer = timers.setTimeout(() => attempt.finish(new MapLoadError('TIMEOUT')), timeoutMs)
      doc.head.appendChild(script)
    } catch { attempt.finish(new MapLoadError('LOAD_FAILED')) }
  }

  return function load({ signal } = {}) {
    if (signal?.aborted) return Promise.reject(new MapLoadError('CANCELLED'))
    if (!key.trim()) return Promise.reject(new MapLoadError('NOT_CONFIGURED'))
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300000) return Promise.reject(new MapLoadError('CONFIG_INVALID'))
    if (serviceHost) {
      let url
      try { url = new URL(serviceHost, 'https://local.invalid') } catch { return Promise.reject(new MapLoadError('CONFIG_INVALID')) }
      if ((!serviceHost.startsWith('/') && !/^https?:\/\//.test(serviceHost)) || serviceHost.startsWith('//') ||
        !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/_AMapService')) {
        return Promise.reject(new MapLoadError('CONFIG_INVALID'))
      }
    }
    const win = getWindow(), doc = getDocument()
    if (!win || !doc) return Promise.reject(new MapLoadError('LOAD_FAILED'))
    if (usable(win.AMap)) return Promise.resolve(win.AMap)
    if (!pending) {
      const attempt = { consumers: new Set(), settled: false, started: false }
      attempt.finish = (error, sdk) => {
        if (attempt.settled) return
        attempt.settled = true
        attempt.cleanup?.(!!error)
        if (pending === attempt) pending = null
        for (const consumer of [...attempt.consumers]) consumer.finish(error, sdk)
      }
      pending = attempt
    }
    const attempt = pending
    return new Promise((resolve, reject) => {
      const consumer = {
        finish(error, sdk) {
          attempt.consumers.delete(consumer)
          signal?.removeEventListener('abort', abort)
          if (error) reject(error); else resolve(sdk)
        }
      }
      const abort = () => {
        consumer.finish(new MapLoadError('CANCELLED'))
        if (!attempt.consumers.size) attempt.finish(new MapLoadError('CANCELLED'))
      }
      attempt.consumers.add(consumer)
      signal?.addEventListener('abort', abort, { once: true })
      if (!attempt.started) start(attempt, win, doc)
    })
  }
}

const env = import.meta.env || {}
export const loadMap = createMapLoader({ key: env.VITE_AMAP_KEY || '', serviceHost: env.VITE_AMAP_SERVICE_HOST || '' })
