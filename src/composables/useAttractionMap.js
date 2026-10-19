import { ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import { loadMap, MapLoadError } from '../services/mapLoader.js'

const regionCenters = {
  华北: [116.397428, 39.90923], 华东: [121.473701, 31.230416], 华南: [113.264385, 23.129163],
  华中: [114.305469, 30.592755], 西南: [104.066541, 30.572761], 西北: [108.954028, 34.265414], 东北: [123.43146, 41.805742]
}

// 现有景点数据没有真实坐标。固定的区域示意位置不会随筛选和排序漂移。
export function demonstrationPosition(item) {
  const center = regionCenters[item.region] || [104.114129, 37.550339]
  let hash = 0
  for (const character of String(item.id)) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  return [center[0] + ((hash % 101) / 100 - 0.5), center[1] + (((hash >>> 4) % 101) / 100 - 0.5)]
}

export function useAttractionMap({ viewMode, items, onSelect, focusId = null, loader = loadMap, timers = globalThis }) {
  const mapContainer = shallowRef(null)
  const mapLoading = ref(false)
  const mapError = ref('')
  let generation = 0, disposed = false, controller, map, sdk, container, renderTimer
  let markers = [], completeHandler, errorHandler

  // 一个已失效的 SDK 对象清理失败，不应阻止其余资源释放。
  const cleanup = action => { try { action() } catch { /* SDK 可能已经自行销毁对象 */ } }

  function clearMarkers() {
    for (const entry of markers) {
      entry.active = false
      const { marker, click } = entry
      cleanup(() => marker.off('click', click))
      cleanup(() => marker.setMap(null))
    }
    markers = []
  }

  function release() {
    generation++
    controller?.abort(); controller = null
    timers.clearTimeout(renderTimer); renderTimer = undefined
    clearMarkers()
    if (map) {
      cleanup(() => map.off('complete', completeHandler))
      cleanup(() => map.off('error', errorHandler))
      cleanup(() => map.destroy())
    }
    cleanup(() => container?.replaceChildren?.())
    map = sdk = container = null
    mapLoading.value = false
  }

  function updateMarkers() {
    clearMarkers()
    const focus = focusId?.value ?? null
    for (const item of items.value) {
      const isFocused = focus !== null && String(item.id) === String(focus)
      const marker = new sdk.Marker({ position: demonstrationPosition(item), title: item.name, map, zIndex: isFocused ? 100 : 1, offset: isFocused ? new sdk.Pixel(-13, -30) : new sdk.Pixel(-13, -30) })
      const entry = { marker, active: true, focused: isFocused }
      entry.click = () => { if (entry.active && !disposed && viewMode.value === 'map') onSelect(item) }
      markers.push(entry)
      marker.on('click', entry.click)
      if (isFocused) {
        try { marker.setAnimation && marker.setAnimation('AMAP_ANIMATION_BOUNCE') } catch { /* 不支持动画则忽略 */ }
      }
    }
    if (markers.length) {
      const focused = markers.find(e => e.focused)
      if (focused) map.setFitView([focused.marker], true, [80, 80, 80, 80], 60)
      else map.setFitView(markers.map(entry => entry.marker), true, [60, 60, 60, 60], 10)
    } else map.setZoomAndCenter(4, [104.114129, 37.550339])
  }

  function fail(error) {
    release()
    mapError.value = error instanceof MapLoadError ? error.message : '地图暂时无法显示，请稍后重试。'
  }

  async function retryMap() {
    release()
    mapError.value = ''
    if (disposed || viewMode.value !== 'map' || !mapContainer.value) return
    const version = generation
    const target = mapContainer.value
    container = target
    const current = () => !disposed && generation === version && viewMode.value === 'map' && mapContainer.value === target
    controller = new AbortController()
    mapLoading.value = true
    try {
      const loaded = await loader({ signal: controller.signal })
      if (!current()) return
      sdk = loaded
      // SDK 实例保留在普通变量中，避免被 Vue 深度代理。
      map = new sdk.Map(target, { zoom: 4, center: [104.114129, 37.550339], resizeEnable: true })
      completeHandler = () => {
        if (!current()) return
        timers.clearTimeout(renderTimer); renderTimer = undefined
        try { updateMarkers(); mapLoading.value = false } catch (error) { fail(error) }
      }
      errorHandler = () => { if (current()) fail(new Error('render')) }
      map.on('complete', completeHandler)
      map.on('error', errorHandler)
      renderTimer = timers.setTimeout(() => { if (current()) fail(new MapLoadError('TIMEOUT')) }, 10000)
      for (const Control of [sdk.ToolBar, sdk.Scale, sdk.MapType]) {
        if (Control) map.addControl(new Control())
      }
    } catch (error) { if (current()) fail(error) }
  }

  watch([viewMode, mapContainer, items, focusId], () => {
    if (viewMode.value !== 'map' || !mapContainer.value) { release(); return }
    if (container && container !== mapContainer.value) release()
    if (map && container === mapContainer.value) {
      if (!mapLoading.value) { try { updateMarkers() } catch (error) { fail(error) } }
    } else if (!mapLoading.value) retryMap()
  }, { flush: 'post' })
  onBeforeUnmount(() => { disposed = true; release() })
  return { mapContainer, mapLoading, mapError, retryMap }
}
