import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMapLoader } from '../src/services/mapLoader.js';
import { FakeTimers } from './helpers/chat.js';

function fixture(options = {}) {
  const win = {}, scripts = [], timers = new FakeTimers();
  const doc = {
    head: { appendChild: script => scripts.push(script) },
    createElement: () => ({ remove() { this.removed = true; } })
  };
  const load = createMapLoader({ key: 'test-public-key', getWindow: () => win, getDocument: () => doc, timers, ...options });
  const callback = index => win[new URL(scripts[index].src).searchParams.get('callback')];
  const succeed = index => { win.AMap = { Map: class {}, Marker: class {} }; callback(index)(); return win.AMap; };
  return { win, scripts, timers, load, callback, succeed };
}

test('concurrent map consumers share one script and cancelling one leaves the other active', async () => {
  const f = fixture({ serviceHost: '/_AMapService' });
  const a = new AbortController(), b = new AbortController();
  const first = f.load({ signal: a.signal }), second = f.load({ signal: b.signal });
  assert.equal(f.scripts.length, 1);
  assert.equal(f.win._AMapSecurityConfig.serviceHost, '/_AMapService');
  assert.equal(new URL(f.scripts[0].src).searchParams.get('plugin'), 'AMap.ToolBar,AMap.Scale,AMap.MapType');
  a.abort();
  await assert.rejects(first, { code: 'CANCELLED' });
  assert.ok(!f.scripts[0].removed);
  const sdk = f.succeed(0);
  assert.equal(await second, sdk);
  assert.equal(f.timers.jobs.size, 0);
  assert.equal(f.callback(0), undefined);
  assert.equal(f.scripts[0].onerror, null);
  assert.equal(await f.load(), sdk);
  b.abort();
  assert.equal(f.scripts.length, 1);
});

test('last consumer abort removes only the owned script and stale completion cannot resolve a retry', async () => {
  const f = fixture();
  const foreign = { src: 'https://webapi.amap.com/unrelated.js' };
  f.scripts.push(foreign);
  const controller = new AbortController();
  const first = f.load({ signal: controller.signal });
  const stale = f.callback(1);
  controller.abort();
  await assert.rejects(first, { code: 'CANCELLED' });
  assert.equal(f.scripts[1].removed, true);
  assert.equal(foreign.removed, undefined);
  assert.equal(f.timers.jobs.size, 0);
  const retry = f.load();
  stale();
  assert.equal(f.timers.jobs.size, 1);
  const sdk = f.succeed(2);
  assert.equal(await retry, sdk);
});

test('script failure, timeout and malformed SDK clean up and allow subsequent attempts', async () => {
  const f = fixture();
  const first = f.load();
  f.scripts[0].onerror();
  await assert.rejects(first, { code: 'LOAD_FAILED' });
  assert.equal(f.scripts[0].removed, true);
  assert.equal(f.callback(0), undefined);
  const second = f.load();
  const timedOut = assert.rejects(second, { code: 'TIMEOUT' });
  f.timers.advance(10000);
  await timedOut;
  assert.equal(f.scripts[1].removed, true);
  assert.equal(f.callback(1), undefined);
  const third = f.load();
  f.win.AMap = {};
  f.callback(2)();
  await assert.rejects(third, { code: 'LOAD_FAILED' });
  const fourth = f.load();
  const sdk = f.succeed(3);
  assert.equal(await fourth, sdk);
  assert.equal(f.timers.jobs.size, 0);
});

test('missing key, invalid configuration and already cancelled calls never create scripts', async () => {
  for (const options of [{ key: '' }, { serviceHost: '//evil.invalid/_AMapService' },
    { serviceHost: 'https://user:secret@proxy.invalid/_AMapService' }, { serviceHost: '/proxy' }, { timeoutMs: -1 }]) {
    const f = fixture(options);
    await assert.rejects(f.load(), { code: options.key === '' ? 'NOT_CONFIGURED' : 'CONFIG_INVALID' });
    assert.equal(f.scripts.length, 0);
    assert.equal(f.timers.jobs.size, 0);
  }
  const f = fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.load({ signal: controller.signal }), { code: 'CANCELLED' });
  assert.equal(f.scripts.length, 0);
});

test('synchronous DOM failure removes callbacks and timers instead of wedging the loader', async () => {
  const f = fixture({ getDocument: () => ({ createElement() { throw new Error('blocked'); } }) });
  await assert.rejects(f.load(), { code: 'LOAD_FAILED' });
  assert.equal(Object.keys(f.win).length, 0);
  assert.equal(f.timers.jobs.size, 0);
  await assert.rejects(f.load(), { code: 'LOAD_FAILED' });
});
