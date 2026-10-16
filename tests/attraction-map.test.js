import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { ref, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { useAttractionMap, demonstrationPosition } from '../src/composables/useAttractionMap.js';
import { mountState } from './helpers/mountState.js';
import { FakeTimers } from './helpers/chat.js';
import { loadView, renderView } from './helpers/vueView.js';

function sdkFixture() {
  const maps = [], markers = [];
  class Map {
    handlers = new globalThis.Map(); controls = [];
    constructor(container) { this.container = container; maps.push(this); }
    on(name, handler) { this.handlers.set(name, handler); }
    off(name, handler) { assert.equal(this.handlers.get(name), handler); this.handlers.delete(name); }
    emit(name) { this.handlers.get(name)?.(); }
    addControl(control) { this.controls.push(control); }
    setFitView(...args) { this.fit = args; }
    setZoomAndCenter(zoom, center) { this.center = [zoom, center]; }
    destroy() { this.destroyed = true; }
  }
  class Marker {
    constructor(options) { this.options = options; this.map = options.map; markers.push(this); }
    on(_name, handler) { this.click = handler; }
    off(_name, handler) { assert.equal(this.click, handler); this.click = null; }
    setMap(map) { this.map = map; }
  }
  return { sdk: { Map, Marker, ToolBar: class {}, Scale: class {}, MapType: class {} }, maps, markers };
}
const data = [{ id: 1, name: '景点一', region: '华北' }, { id: 2, name: '景点二', region: '华北' }];
function page(t, loader) {
  const viewMode = ref('grid'), items = ref([...data]), selected = [], timers = new FakeTimers();
  const mounted = mountState({ setup: () => useAttractionMap({ viewMode, items, onSelect: item => selected.push(item), loader, timers }) });
  t.after(() => { mounted.unmount(); assert.equal(timers.jobs.size, 0); });
  const enter = async () => {
    viewMode.value = 'map'; mounted.state.mapContainer.value = { replaceChildren() {} };
    await nextTick(); await setImmediate();
  };
  return { ...mounted, enter, viewMode, items, selected, timers };
}

test('leaving while SDK is loading aborts the consumer and ignores late success or failure', async t => {
  const f = sdkFixture(), requests = [];
  const p = page(t, ({ signal }) => new Promise((resolve, reject) => requests.push({ signal, resolve, reject })));
  await p.enter();
  p.viewMode.value = 'list'; await nextTick();
  assert.equal(requests[0].signal.aborted, true);
  await p.enter();
  requests[0].resolve(f.sdk); await setImmediate();
  assert.equal(f.maps.length, 0);
  assert.equal(p.state.mapLoading.value, true);
  requests[1].resolve(f.sdk); await setImmediate();
  assert.equal(f.maps.length, 1);
  f.maps[0].emit('complete');
  assert.equal(p.state.mapLoading.value, false);
  p.viewMode.value = 'grid'; await nextTick();
  assert.equal(f.maps[0].destroyed, true);
  assert.equal(f.maps[0].handlers.size, 0);
  assert.ok(f.markers.every(marker => marker.click === null && marker.map === null));
  await p.enter();
  p.unmount();
  requests[2].reject(new Error('late private diagnostics')); await setImmediate();
  assert.equal(p.state.mapError.value, '');
  assert.equal(f.maps.length, 1);
});

test('filter changes reuse the map and dispose old markers; fit view uses marker objects', async t => {
  const f = sdkFixture(), p = page(t, async () => f.sdk);
  await p.enter();
  assert.equal(p.state.mapLoading.value, true);
  f.maps[0].emit('complete');
  assert.equal(f.maps[0].controls.length, 3);
  assert.deepEqual(f.maps[0].fit, [[f.markers[0], f.markers[1]], true, [60, 60, 60, 60], 10]);
  const original = [...f.markers];
  const staleClick = original[0].click;
  original[0].click();
  assert.equal(p.selected[0].id, 1);
  p.items.value = [...p.items.value].reverse(); await nextTick();
  assert.equal(f.maps.length, 1);
  assert.ok(original.every(marker => marker.map === null && marker.click === null));
  staleClick();
  assert.equal(p.selected.length, 1);
  assert.deepEqual(f.markers.at(-1).options.position, original[0].options.position);
  p.items.value = []; await nextTick();
  assert.deepEqual(f.maps[0].center, [4, [104.114129, 37.550339]]);
  p.unmount();
  assert.equal(f.maps[0].destroyed, true);
});

test('render failure and timeout release resources and retry creates a fresh instance', async t => {
  const f = sdkFixture(), p = page(t, async () => f.sdk);
  await p.enter();
  const staleComplete = f.maps[0].handlers.get('complete');
  p.timers.advance(10000);
  assert.match(p.state.mapError.value, /超时/);
  assert.equal(f.maps[0].destroyed, true);
  await p.state.retryMap();
  staleComplete();
  assert.equal(p.state.mapLoading.value, true);
  f.maps[1].emit('complete');
  f.maps[1].emit('error');
  assert.equal(f.maps[1].destroyed, true);
  assert.ok(f.markers.every(marker => marker.map === null && marker.click === null));
  assert.match(p.state.mapError.value, /重试/);
  await p.state.retryMap();
  f.maps[2].emit('complete');
  assert.equal(p.state.mapLoading.value, false);
  assert.equal(p.state.mapError.value, '');
});

test('replacing the container during SDK loading cancels the old target and starts a new request', async t => {
  const f = sdkFixture(), requests = [];
  const p = page(t, ({ signal }) => new Promise(resolve => requests.push({ signal, resolve })));
  await p.enter();
  p.state.mapContainer.value = { replaceChildren() {} };
  await nextTick();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve(f.sdk); await setImmediate();
  assert.equal(p.state.mapLoading.value, true);
  assert.equal(f.maps.length, 0);
  requests[1].resolve(f.sdk); await setImmediate();
  f.maps[0].emit('complete');
  assert.equal(p.state.mapLoading.value, false);
});

test('unmount removes the render timeout and all resources even if one SDK cleanup method fails', async t => {
  const f = sdkFixture(), p = page(t, async () => f.sdk);
  await p.enter(); f.maps[0].emit('complete');
  f.markers[0].off = () => { throw new Error('already gone'); };
  f.maps[0].off = () => { throw new Error('already gone'); };
  p.unmount();
  assert.ok(f.markers.every(marker => marker.map === null));
  assert.equal(f.maps[0].destroyed, true);
  await p.enter();
  assert.equal(f.maps.length, 1);
});

test('missing map key renders an inline retry and list action without SDK loading or blocking alert', async t => {
  const Attractions = await loadView('AttractionsView');
  const { state, unmount } = mountState(Attractions, [createPinia()]);
  t.after(unmount);
  state.viewMode.value = 'map'; state.mapContainer.value = {};
  await nextTick(); await setImmediate();
  assert.match(state.mapError.value, /尚未配置/);
  assert.equal(state.mapLoading.value, false);
  const html = await renderView(Attractions, state);
  for (const text of ['role="alert"', '重试加载', '切换列表', '非景点精确坐标']) assert.ok(html.includes(text));
  assert.ok(!html.includes('class="pagination"'));
  assert.equal(state.filteredAttractions.value.length, 12);
  assert.ok(!html.includes('window.location.reload'));
  await state.retryMap();
  assert.match(state.mapError.value, /尚未配置/);
});

test('demonstration coordinates are stable across filtering and differ by attraction id', () => {
  assert.deepEqual(demonstrationPosition(data[0]), demonstrationPosition({ ...data[0], name: '改名' }));
  assert.notDeepEqual(demonstrationPosition(data[0]), demonstrationPosition(data[1]));
});
