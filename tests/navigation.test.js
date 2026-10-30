import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { scrollBehavior, pageTitle } from '../src/router/navigation.js';
import { loadComponent } from './helpers/vueView.js';
import { FontAwesomeIcon } from '../src/ui/navigationIcons.js';

test('navigation icon subset renders every entry icon without global registration', async () => {
  for (const icon of ['camera', 'map', 'route', 'ticket', 'ticket-simple', 'hotel', 'headset', 'comments', 'right-left', 'palette', 'arrow-right']) {
    const html = await renderToString(createSSRApp({ render: () => h(FontAwesomeIcon, { icon: ['fas', icon] }) }));
    assert.match(html, /<path/, icon);
  }
});

test('navigation restores history scroll and preserves in-page filters', () => {
  const saved = { top: 480, left: 0 };
  assert.equal(scrollBehavior({ path: '/hotels' }, { path: '/routes' }, saved), saved);
  assert.equal(scrollBehavior({ path: '/hotels', query: { page: 2 } }, { path: '/hotels' }), false);
  assert.deepEqual(scrollBehavior({ path: '/hotels' }, { path: '/routes' }), { left: 0, top: 0 });
  assert.equal(pageTitle('hotels'), '住宿方案 · 智绘旅游');
  assert.equal(pageTitle('not-found'), '页面未找到 · 智绘旅游');
});

test('home navigation cards use native buttons for Enter and Space activation', async () => {
  const Card = await loadComponent('components/NavButton.vue');
  const html = await renderToString(createSSRApp({ render: () => h(Card, { icon: 'camera', title: '景点推荐', description: '探索目的地' }) }));
  assert.match(html, /^<button[^>]*type="button"/);
  assert.match(html, /景点推荐/);
  assert.match(html, /<\/button>$/);
});
import { loginDestination } from '../src/router/navigation.js';

test('login restores local destination but rejects external and auth destinations', () => {
  assert.equal(loginDestination('/routes/123?day=2'), '/routes/123?day=2');
  for (const value of [undefined, ['https://example.org'], '//example.org', 'https://example.org', '/\\example.org', '/login?redirect=/routes', '/register']) {
    assert.equal(loginDestination(value), '/');
  }
});
