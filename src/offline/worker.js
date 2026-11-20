const scope = new URL(self.registration.scope)
const cachePrefix = 'travel-offline-reader:' + scope.pathname + ':'
const cacheName = cachePrefix + 'BUILD_REVISION'
const shell = new URL('offline.html', scope).href
const script = new URL('offline-reader-BUILD_REVISION.js', scope).href
const assets = [shell, script]

async function hasReader(cache) {
  const [html, js] = await Promise.all(assets.map(url => cache.match(url)))
  // A static host can return the SPA index with 200 for a missing release asset.
  return html?.headers.get('content-type')?.includes('text/html') &&
    /javascript|ecmascript/i.test(js?.headers.get('content-type') || '') &&
    (await html.text()).includes('offline-reader-BUILD_REVISION.js')
}
async function storeReader(cache) {
  await cache.addAll(assets.map(url => new Request(url, {cache:'reload'})))
  if (!await hasReader(cache)) throw new Error('Offline reader files are incomplete')
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    await storeReader(cache)
    await self.skipWaiting()
  })())
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(cachePrefix) && key !== cacheName) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})
self.addEventListener('message', event => {
  if (event.data !== 'prepare-offline-reader' || !event.ports[0]) return
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName)
      if (!await hasReader(cache)) await storeReader(cache)
      event.ports[0].postMessage({ready:true})
    } catch { event.ports[0].postMessage({ready:false}) }
  })())
})
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return
  if (url.href === script) {
    event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(script)) || fetch(request)))
    return
  }
  const path = url.pathname.slice(scope.pathname.length)
  if (request.mode !== 'navigate' || !/^(|index\.html|offline\.html|routes\/?|routes\/[^/]+\/?)$/.test(path)) return
  event.respondWith((async () => {
    if (path !== 'offline.html') {
      try { return await fetch(request, {cache:'no-store'}) } catch { /* Open the local reader if the server is unreachable. */ }
    }
    const cache = await caches.open(cacheName)
    return (await cache.match(shell)) || fetch(request)
  })())
})
