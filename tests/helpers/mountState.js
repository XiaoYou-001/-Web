import { createRenderer } from 'vue';

// 挂载真实 setup 与生命周期；无需浏览器 DOM，也不跳过卸载清理。
export function mountState(component, plugins = []) {
  const renderer = createRenderer({
    createElement: type => ({ type, children: [] }),
    createComment: text => ({ text }), createText: text => ({ text }),
    insert: (child, parent) => { child.parent = parent; parent.children.push(child); },
    remove: child => { child.parent.children = child.parent.children.filter(node => node !== child); },
    parentNode: node => node.parent, nextSibling: () => null,
    patchProp: () => {}, setText: () => {}, setElementText: () => {}
  });
  let state;
  const app = renderer.createApp({ setup() { state = component.setup(); return () => null; } });
  plugins.forEach(plugin => app.use(plugin));
  app.mount({ children: [] });
  let mounted = true;
  return { state, unmount: () => { if (mounted) { app.unmount(); mounted = false; } } };
}
