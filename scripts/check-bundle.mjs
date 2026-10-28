import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const directory = resolve('dist');
const manifest = JSON.parse(await readFile(resolve(directory, '.vite/manifest.json'), 'utf8'));
const entry = Object.keys(manifest).find(key => manifest[key].isEntry);
if (!entry) throw new Error('Build manifest has no application entry');

// 遍历静态依赖，不把尚未访问的动态路由计入首屏；共享文件只计一次。
function staticFiles(roots) {
  const visited = new Set();
  const files = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing manifest chunk: ${key}`);
    files.add(chunk.file);
    for (const file of chunk.css || []) files.add(file);
    for (const imported of chunk.imports || []) visit(imported);
  }
  roots.forEach(visit);
  return files;
}

const profiles = [
  { name: 'Entry', roots: [entry], jsKB: 160, cssKB: 10 },
  { name: 'Login (cold)', roots: [entry, 'src/views/LoginView.vue'], jsKB: 180, cssKB: 10 },
  { name: 'Home (cold)', roots: [entry, 'src/views/HomeView.vue'], jsKB: 256, cssKB: 32 },
  { name: 'Tickets (cold)', roots: [entry, 'src/views/TicketsView.vue', 'src/components/AppHeader.vue'], jsKB: 550, cssKB: 150 }
];
const contents = new Map();
let failed = false;
for (const profile of profiles) {
  const sizes = { js: 0, css: 0, gzipJs: 0, gzipCss: 0 };
  for (const file of staticFiles(profile.roots)) {
    const kind = file.endsWith('.js') ? 'js' : file.endsWith('.css') ? 'css' : null;
    if (!kind) continue;
    if (!contents.has(file)) contents.set(file, await readFile(resolve(directory, file)));
    const content = contents.get(file);
    sizes[kind] += content.length;
    sizes[kind === 'js' ? 'gzipJs' : 'gzipCss'] += gzipSync(content).length;
  }
  const exceeded = sizes.js > profile.jsKB * 1024 || sizes.css > profile.cssKB * 1024;
  failed ||= exceeded;
  const kb = bytes => (bytes / 1024).toFixed(1);
  console.log(`${exceeded ? 'FAIL' : 'PASS'} ${profile.name}: JS ${kb(sizes.js)} KiB (gzip ${kb(sizes.gzipJs)}), CSS ${kb(sizes.css)} KiB (gzip ${kb(sizes.gzipCss)})`);
  if (exceeded) console.error(`  Budget: JS <= ${profile.jsKB} KiB, CSS <= ${profile.cssKB} KiB`);
}
if (!manifest['src/views/TicketsView.vue']?.isDynamicEntry) {
  console.error('FAIL Tickets must remain a lazy-loaded route');
  failed = true;
}
if (failed) process.exitCode = 1;
