import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

// 编译真实 SFC，不复制页面逻辑，也不需要浏览器或新增测试依赖。
export async function loadView(name) {
  return loadComponent(`views/${name}.vue`);
}

export async function loadComponent(path) {
  const url = new URL(`../../src/${path}`, import.meta.url);
  return (await import(await compileVueModule(url))).default;
}

async function compileVueModule(url) {
  const name = url.pathname;
  const source = await readFile(url, 'utf8');
  const { descriptor, errors } = parse(source, { filename: url.pathname });
  if (errors.length) throw errors[0];
  const script = compileScript(descriptor, { id: name, genDefaultAs: '__component' });
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: url.pathname,
    id: name,
    ssr: true,
    ssrCssVars: []
  });
  if (template.errors.length) throw template.errors[0];
  const code = `${script.content}\n${template.code}\n__component.ssrRender = ssrRender;\nexport default __component;`;
  let resolved = code;
  for (const match of code.matchAll(/(from\s+)(['"])([^'"]+)\2/g)) {
    const [, prefix, quote, specifier] = match;
    let target;
    if (specifier.startsWith('.')) {
      target = new URL(specifier, url);
      if (!existsSync(target) && existsSync(new URL(`${target.href}.js`))) target = new URL(`${target.href}.js`);
      target = target.pathname.endsWith('.vue') ? await compileVueModule(target) : target.href;
    } else {
      target = import.meta.resolve(specifier);
    }
    resolved = resolved.replace(match[0], `${prefix}${quote}${target}${quote}`);
  }
  resolved += `\n//# sourceURL=${url.href}?compiled-test`;
  return `data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`;
}

export async function createViewState(component, plugins = []) {
  let state;
  const app = createSSRApp({
    setup() {
      state = component.setup();
      return () => null;
    }
  });
  plugins.forEach(plugin => app.use(plugin));
  await renderToString(app);
  return state;
}

export async function createOptionsView(component, plugins = []) {
  let instance;
  const app = createSSRApp({ ...component, ssrRender: undefined, render: () => null });
  plugins.forEach(plugin => app.use(plugin));
  app.mixin({ created() { instance = this; } });
  await renderToString(app);
  return instance;
}

export async function renderView(component, state, plugins = []) {
  const app = createSSRApp({ ...component, setup: () => state });
  plugins.forEach(plugin => app.use(plugin));
  app.component('font-awesome-icon', { render: () => null });
  return renderToString(app);
}
