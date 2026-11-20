import { getCurrentUser } from './authService.js'

const offlineKey = (ownerId, routeId) => 'offline-trip:v1:' + encodeURIComponent(ownerId) + ':' + encodeURIComponent(routeId)

export function preparedAt(ownerId, routeId) {
  if (!ownerId || getCurrentUser()?.id !== ownerId) return null
  return localStorage.getItem(offlineKey(ownerId, routeId))
}

export function markPrepared(ownerId, routeId) {
  if (!ownerId || getCurrentUser()?.id !== ownerId) throw new Error('账号已切换，请重新打开旅行')
  const prepared = new Date().toISOString()
  localStorage.setItem(offlineKey(ownerId, routeId), prepared)
  return prepared
}

export async function prepareReader(base) {
  if (!window.isSecureContext || !navigator.serviceWorker) throw new Error('当前浏览器需要 HTTPS 或本机地址才能保存离线阅读器')
  let timer, port
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('准备离线阅读器超时，请联网重试')), 20000)
  })
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.register(base + 'offline-sw.js', {scope:base, updateViaCache:'none'}), deadline
    ])
    await Promise.race([navigator.serviceWorker.ready, deadline])
    if (!registration.active) throw new Error('离线阅读器未激活，请重试')
    const channel = new MessageChannel()
    port = channel.port1
    const confirmed = new Promise((resolve, reject) => {
      port.onmessage = ({data}) => data?.ready ? resolve() : reject(new Error('离线资源未保存，请检查网络和浏览器存储'))
      registration.active.postMessage('prepare-offline-reader', [channel.port2])
    })
    await Promise.race([confirmed, deadline])
  } finally { clearTimeout(timer); port?.close() }
}
