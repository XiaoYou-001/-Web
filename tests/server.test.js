import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readServerConfig } from '../server/config.js';

const root = fileURLToPath(new URL('../', import.meta.url));

async function startBackend(t, env) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  });
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Backend startup timed out')), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Backend exited before startup')); });
    child.stdout.setEncoding('utf8');
    child.stderr.resume();
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)\/api\/health/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
}

const chat = (base, body) => fetch(`${base}/api/ai/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

test('server configuration validates port, endpoint and timeout', () => {
  assert.equal(readServerConfig({}).aiModelApiKey, '');
  assert.equal(readServerConfig({ AI_API_KEY: 'old-provider-key' }).aiModelApiKey, '');
  assert.equal(readServerConfig({}).aiModelApiEndpoint, 'https://glai2.wuxidata.com.cn:4001/v1/chat/completions');
  assert.equal(readServerConfig({ GLAI2_API_KEY: ' test ' }).aiModelApiKey, 'test');
  assert.throws(() => readServerConfig({ PORT: 'invalid' }));
  assert.throws(() => readServerConfig({ PORT: '65536' }));
  assert.throws(() => readServerConfig({ AI_REQUEST_TIMEOUT_MS: '0' }));
  assert.throws(() => readServerConfig({ AI_API_ENDPOINT: 'file:///tmp/ai' }));
  assert.throws(() => readServerConfig({ AI_API_ENDPOINT: 'https://user:pass@example.com' }));
});

test('missing API key disables chat while health and models remain available', async t => {
  const base = await startBackend(t, { GLAI2_API_KEY: '', AI_API_ENDPOINT: 'http://127.0.0.1:1' });
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/ai/models`)).status, 200);
  const response = await chat(base, { message: '你好' });
  assert.equal(response.status, 503);
  const unavailable = await response.json();
  assert.match(unavailable.error, /尚未配置/);
  assert.equal(unavailable.code, 'AI_NOT_CONFIGURED');
});

test('AI proxy classifies upstream failures and invalid responses without exposing raw diagnostics', async t => {
  const upstream = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const action = JSON.parse(raw).messages[1].content;
    if (action === 'bad-json') { res.end('<html>private-upstream-debug</html>'); return; }
    if (action === 'empty-reply') { res.end(JSON.stringify({ choices: [] })); return; }
    if (action === 'slow-body') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); return; }
    res.writeHead(Number(action), { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'private-upstream-debug' }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => new Promise(resolve => { upstream.close(resolve); upstream.closeAllConnections(); }));
  const base = await startBackend(t, { GLAI2_API_KEY: 'test-only-key', AI_API_ENDPOINT: `http://127.0.0.1:${upstream.address().port}`, AI_REQUEST_TIMEOUT_MS: '200' });
  for (const [message, status, code] of [
    ['401', 401, 'AI_AUTH_FAILED'], ['403', 401, 'AI_AUTH_FAILED'],
    ['404', 404, 'AI_ENDPOINT_INVALID'], ['429', 429, 'RATE_LIMIT'],
    ['500', 502, 'SERVICE_UNAVAILABLE'], ['bad-json', 502, 'INVALID_RESPONSE'],
    ['empty-reply', 502, 'INVALID_RESPONSE'], ['slow-body', 504, 'TIMEOUT']
  ]) {
    const response = await chat(base, { message });
    assert.equal(response.status, status, message);
    const data = await response.json();
    assert.equal(data.code, code, message);
    assert.ok(!JSON.stringify(data).includes('private-upstream-debug'));
  }
  const tooLong = await chat(base, { message: '字'.repeat(2001) });
  assert.equal(tooLong.status, 400);
  assert.equal((await tooLong.json()).code, 'VALIDATION');
  const invalidJSON = await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(invalidJSON.status, 400);
  assert.equal((await invalidJSON.json()).code, 'VALIDATION');
});

test('disconnecting the browser request aborts the upstream AI connection', { timeout: 5000 }, async t => {
  let started, closed;
  const upstreamStarted = new Promise(resolve => { started = resolve; });
  const upstreamClosed = new Promise(resolve => { closed = resolve; });
  const upstream = createServer(async (req, res) => {
    for await (const _chunk of req) { /* 等待完整请求体 */ }
    res.once('close', closed);
    started();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => new Promise(resolve => { upstream.close(resolve); upstream.closeAllConnections(); }));
  const base = await startBackend(t, { GLAI2_API_KEY: 'test-only-key', AI_API_ENDPOINT: `http://127.0.0.1:${upstream.address().port}`, AI_REQUEST_TIMEOUT_MS: '30000' });
  const controller = new AbortController();
  const pending = fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'abort test' }), signal: controller.signal });
  await upstreamStarted;
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  await upstreamClosed;
});

test('AI proxy uses JSON, validates input and aborts slow upstream requests', async t => {
  const requests = [];
  const upstream = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ body, authorization: req.headers.authorization });
    if (body.messages[1].content === 'slow') return;
    if (body.messages[1].content === 'rate-limit') {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '酒店预订流程：请联系客服。' } }] }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => new Promise(resolve => {
    upstream.close(resolve);
    upstream.closeAllConnections();
  }));
  const base = await startBackend(t, {
    GLAI2_API_KEY: 'test-only-key',
    AI_API_ENDPOINT: `http://127.0.0.1:${upstream.address().port}/chat`,
    AI_REQUEST_TIMEOUT_MS: '1000'
  });

  for (const message of ['', '   ', 42, { text: 'hello' }]) {
    assert.equal((await chat(base, { message })).status, 400);
  }
  assert.equal(requests.length, 0);

  for (const stream of [undefined, false]) {
    const response = await chat(base, { message: '你好', stream });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.match(data.choices[0].message.content, /酒店/);
    assert.ok(data.structuredInfo.categories.includes('hotel'));
    assert.equal(requests.at(-1).body.stream, false);
    assert.equal(requests.at(-1).body.model, 'deepseek-v4-flash');
    assert.equal(requests.at(-1).authorization, 'Bearer test-only-key');
  }
  const unknownModel = await chat(base, { message: '你好', model: 'constructor', structured: false });
  assert.equal(unknownModel.status, 200);
  assert.equal((await unknownModel.json()).structuredInfo, null);
  assert.equal(requests.at(-1).body.model, 'deepseek-v4-flash');
  assert.equal((await chat(base, { message: 'rate-limit' })).status, 429);
  assert.equal((await chat(base, { message: 'slow' })).status, 504);
});
