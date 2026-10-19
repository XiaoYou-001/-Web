import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { test } from 'node:test';
import { createRenderer, createSSRApp, h, nextTick, reactive } from 'vue';
import { renderToString } from 'vue/server-renderer';
import AppImage from '../src/ui/AppImage.js';
import { FontAwesomeIcon } from '../src/ui/fontAwesome.js';
import { AVATAR_FALLBACK, LANDSCAPE_FALLBACK, resolveImageSource } from '../src/utils/images.js';
import { createViewState, loadView } from './helpers/vueView.js';

function mountImage(initial) {
  const props = reactive(initial);
  const renderer = createRenderer({
    createElement: type => ({ type, props: {}, children: [] }),
    patchProp: (element, key, _previous, value) => { element.props[key] = value; },
    insert: (child, parent) => { child.parent = parent; parent.children.push(child); },
    remove: child => { child.parent.children = child.parent.children.filter(item => item !== child); },
    createText: text => ({ text }), createComment: text => ({ text }),
    setText: (node, text) => { node.text = text; },
    setElementText: (node, text) => { node.text = text; },
    parentNode: node => node.parent, nextSibling: () => null
  });
  const root = { children: [] };
  renderer.render(h({ render: () => h(AppImage, props) }), root);
  return { props, image: root.children[0], unmount: () => renderer.render(null, root) };
}

test('image sources keep valid URLs and uploaded avatars while suppressing known dummy/invalid URLs', () => {
  for (const source of ['', null, 'https://example.com/images/missing.jpg', 'https://cdn.example.com/avatar.jpg', 'javascript:alert(1)', 'data:text/html,bad']) {
    assert.equal(resolveImageSource(source), LANDSCAPE_FALLBACK);
  }
  for (const source of ['/images/placeholder-landscape.svg', 'https://images.unsplash.com/photo-test?w=800&signature=original', 'data:image/png;base64,YWJj', 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E']) {
    assert.equal(resolveImageSource(source), source);
  }
  assert.equal(resolveImageSource(null, AVATAR_FALLBACK), AVATAR_FALLBACK);
});

test('images default to lazy async loading with reserved dimensions and avatars have a square fallback', async () => {
  const photo = await renderToString(createSSRApp({ render: () => h(AppImage, { src: '/photo.jpg', alt: '旅行照片', class: 'cover' }) }));
  assert.match(photo, /loading="lazy"/);
  assert.match(photo, /decoding="async"/);
  assert.match(photo, /width="640" height="400"/);
  assert.match(photo, /alt="旅行照片"/);
  assert.match(photo, /class="cover"/);
  const avatar = await renderToString(createSSRApp({ render: () => h(AppImage, { kind: 'avatar', loading: 'eager' }) }));
  assert.match(avatar, /src="\/default-avatar.svg"/);
  assert.match(avatar, /width="160" height="160"/);
  assert.match(avatar, /loading="eager"/);
});

test('failed photo loads switch once to a local fallback and new sources retry normally', async t => {
  const { props, image, unmount } = mountImage({ src: '/broken.jpg' });
  t.after(unmount);
  image.props.onError();
  await nextTick();
  assert.equal(image.props.src, LANDSCAPE_FALLBACK);
  image.props.onError();
  await nextTick();
  assert.equal(image.props.src, LANDSCAPE_FALLBACK);
  props.src = '/replacement.jpg';
  await nextTick();
  assert.equal(image.props.src, '/replacement.jpg');
  props.kind = 'avatar';
  await nextTick();
  image.props.onError();
  await nextTick();
  assert.equal(image.props.src, AVATAR_FALLBACK);
});

test('late errors from replaced image requests cannot replace the current image', async t => {
  const { props, image, unmount } = mountImage({ src: '/old.jpg' });
  t.after(unmount);
  const staleError = image.props.onError;
  props.src = '/new.jpg';
  await nextTick();
  staleError();
  await nextTick();
  assert.equal(image.props.src, '/new.jpg');
});

test('all existing class-based icons render without an external font, including empty rating stars', async () => {
  const files = await readdir(new URL('../src/views/', import.meta.url));
  const names = new Set();
  for (const file of files.filter(file => file.endsWith('.vue'))) {
    const source = await readFile(new URL(`../src/views/${file}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/\bfa-([a-z][a-z0-9-]*)/g)) names.add(match[1]);
  }
  for (const name of names) {
    const html = await renderToString(createSSRApp({ render: () => h(FontAwesomeIcon, { class: ['fas', `fa-${name}`, { selected: true }] }) }));
    assert.match(html, /<svg/, `missing ${name}`);
    assert.match(html, /<path/, `missing path ${name}`);
    assert.match(html, /selected/);
    if (name === 'star-o') assert.match(html, /fill="none"/);
  }
});

test('entry styles/icons and fallback assets are local, and customer service does not present a photo as a QR code', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/<link\b[^>]+https?:\/\//.test(html));
  assert.match(html, /lang="zh-CN"/);
  for (const file of ['favicon.svg', 'default-avatar.svg', 'images/placeholder-landscape.svg', 'images/home-backdrop.svg', 'images/ai-avatar.svg']) {
    await access(new URL(`../public/${file}`, import.meta.url));
  }
  const Customer = await loadView('CustomerServiceView');
  const state = await createViewState(Customer);
  const render = () => renderToString(createSSRApp({ ...Customer, setup: () => state }));
  const human = await render();
  assert.match(human, /微信客服正在准备中/);
  assert.ok(!human.includes('picsum.photos'));
  assert.match(human, /src="\/default-avatar.svg"/);
  // 死按钮已移除：不应再出现「查看历史」「举报」等无功能入口
  assert.ok(!human.includes('title="查看历史"'));
  assert.ok(!human.includes('title="举报"'));
  // 「其他联系方式」弹窗打开后应渲染具体渠道，而不再是空遮罩
  state.currentAgent.value = 'ai';
  state.showContactOptions.value = true;
  const withContact = await render();
  assert.match(withContact, /其他联系方式/);
  assert.match(withContact, /400-123-4567/);
  assert.match(withContact, /support@zhiyou\.com/);
  state.currentAgent.value = 'ai';
  const ai = await render();
  assert.match(ai, /src="\/images\/ai-avatar.svg"/);
});
