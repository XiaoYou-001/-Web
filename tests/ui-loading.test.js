import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { ID_INJECTION_KEY, ZINDEX_INJECTION_KEY } from 'element-plus';
import { FontAwesomeIcon } from '../src/ui/fontAwesome.js';
import { createViewState, loadView } from './helpers/vueView.js';

test('lazy page icons render without global registration, including aliases and dynamic choices', async () => {
  for (const name of ['camera', 'home', 'plus', 'th-large', 'search', 'wand-magic-sparkles', 'walking', 'person', 'children', 'user-group', 'star-half-stroke', 'share-nodes', 'calendar-days', 'download', 'save']) {
    const html = await renderToString(createSSRApp({ render: () => h(FontAwesomeIcon, { icon: ['fas', name], class: 'feature-icon', size: '2x' }) }));
    assert.match(html, /<svg/, `missing icon ${name}`);
    assert.match(html, /<path/, `missing path ${name}`);
    assert.match(html, /feature-icon/);
    assert.match(html, /fa-2x/);
  }
});

test('ticket page renders real forms, tabs and date picker with no global component plugin', async () => {
  const Tickets = await loadView('TicketsView');
  const state = await createViewState(Tickets);
  const warnings = [];
  const render = () => {
    const app = createSSRApp({ ...Tickets, setup: () => state });
    // Element Plus 的 SSR 环境需要确定性的 ID 与层级提供器；浏览器不需要。
    app.provide(ID_INJECTION_KEY, { prefix: 1, current: 0 });
    app.provide(ZINDEX_INJECTION_KEY, { current: 0 });
    app.config.warnHandler = message => warnings.push(message);
    return renderToString(app);
  };
  const html = await render();
  assert.deepEqual(warnings, []);
  assert.match(html, /el-tabs--border-card/);
  assert.match(html, /el-date-editor/);
  assert.match(html, /el-input__prefix/);
  assert.match(html, /搜索票务/);
  assert.match(html, /出行票务/);
  assert.match(html, /景区票务/);
  assert.ok(!html.includes('<el-'), 'all Element Plus tags should resolve to real components');
  state.activeTab.value = 'scenic';
  state.scenicResults.value = [{ id: 'rating-fixture', name: '测试景区', rating: '4.5', tags: [], city: '北京', ticketPrice: 60 }];
  const results = await render();
  assert.deepEqual(warnings, []);
  assert.match(results, /aria-valuenow="4.5"/);
});
