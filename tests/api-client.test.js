import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { readApiConfig } from '../src/config/api.js';
import { ApiError, createApiClient } from '../src/services/apiClient.js';
import { createAiService } from '../src/services/aiService.js';
import { createRouteService } from '../src/services/routeService.js';
import { FakeTimers } from './helpers/chat.js';

test('API config defaults to same-origin, validates URLs/timeouts and keeps the legacy explicit routes URL', () => {
  assert.deepEqual(readApiConfig(), { baseUrl: '/api', routesBaseUrl: null, timeoutMs: 10000, aiTimeoutMs: 45000 });
  assert.equal(readApiConfig({ VITE_API_BASE_URL: '/' }).baseUrl, '/');
  assert.equal(readApiConfig({ VITE_API_BASE_URL: 'https://backend.example/api/' }).baseUrl, 'https://backend.example/api');
  assert.equal(readApiConfig({ VITE_APP_API_BASE_URL: '/legacy' }).routesBaseUrl, '/legacy');
  assert.equal(readApiConfig({ VITE_APP_API_BASE_URL: '/old', VITE_ROUTES_API_BASE_URL: '/new' }).routesBaseUrl, '/new');
  for (const url of ['//backend.example/api', 'file:///api', 'https://name:pass@backend.example/api', '/api?key=public', '/api#fragment', 'relative/api']) {
    assert.throws(() => readApiConfig({ VITE_API_BASE_URL: url }));
  }
  for (const value of ['0', '-1', 'abc', '300001', '1.5']) assert.throws(() => readApiConfig({ VITE_AI_REQUEST_TIMEOUT_MS: value }));
});

test('JSON requests encode query values, avoid stale auth tokens and release their timeout', async t => {
  const timers = new FakeTimers();
  const requests = [];
  const client = createApiClient({ baseUrl: '/api/', timers, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return Response.json({ saved: true });
  } });
  const result = await client.request('/routes', { method: 'POST', params: { city: '北京 上海', tags: ['a', 'b'], empty: null }, json: { title: '出行' } });
  assert.equal(result.saved, true);
  assert.equal(requests[0].url, '/api/routes?city=%E5%8C%97%E4%BA%AC+%E4%B8%8A%E6%B5%B7&tags=a&tags=b');
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(requests[0].options.body).title, '出行');
  assert.equal(timers.jobs.size, 0);
  const empty = createApiClient({ timers, fetchImpl: async () => new Response(null, { status: 204 }) });
  assert.equal(await empty.request('routes/1', { method: 'DELETE' }), null);
  const cyclic = {}; cyclic.self = cyclic;
  for (const path of ['https://other.invalid', '../escape', 'routes/%2e%2e', 'routes/%GG']) {
    await assert.rejects(client.request(path), error => error.code === 'VALIDATION');
  }
  await assert.rejects(client.request('routes', { json: cyclic }), error => error.code === 'VALIDATION');
  assert.equal(requests.length, 1);
});

test('HTTP, business and malformed responses use safe typed errors without leaking server diagnostics', async () => {
  for (const [status, body, code] of [
    [401, 'private details', 'UNAUTHORIZED'], [403, 'private details', 'FORBIDDEN'],
    [404, '<html>wrong route</html>', 'NOT_FOUND'], [429, '{}', 'RATE_LIMIT'],
    [503, '{"code":"AI_NOT_CONFIGURED","error":"upstream private details"}', 'AI_NOT_CONFIGURED'],
    [401, '{"code":"AI_AUTH_FAILED","error":"private details"}', 'AI_AUTH_FAILED'],
    [504, '{}', 'TIMEOUT'], [500, '{}', 'SERVER_ERROR'], [200, '<html>SPA fallback</html>', 'INVALID_RESPONSE'],
    [200, '{"error":"private details"}', 'BUSINESS_ERROR'], [200, '{"success":false}', 'BUSINESS_ERROR']
  ]) {
    const client = createApiClient({ fetchImpl: async () => new Response(body, { status }) });
    await assert.rejects(client.request('resource'), error => {
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.ok(!error.message.includes('private details'));
      return true;
    });
  }
  const broken = createApiClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(broken.request('resource'), error => error.code === 'NETWORK' && error.retryable);
});

test('timeouts include a stalled response body and caller cancellation is distinct from timeout', async t => {
  const server = createServer((req, res) => {
    if (req.url === '/body') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  let receivedHeaders = false;
  const client = createApiClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 200, fetchImpl: async (...args) => {
    const response = await fetch(...args); receivedHeaders = true; return response;
  } });
  await assert.rejects(client.request('body'), error => error.code === 'TIMEOUT');
  assert.equal(receivedHeaders, true);
  const controller = new AbortController();
  const pending = client.request('hang', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.code === 'CANCELLED' && !error.retryable);
  await assert.rejects(client.request('hang', { signal: controller.signal }), error => error.code === 'CANCELLED');
});

test('AI service validates replies, keeps request model/signal and never fabricates a fallback reply', async () => {
  let options;
  const client = { request: async (path, settings) => {
    assert.equal(path, 'ai/chat'); options = settings;
    return { choices: [{ message: { content: '旅行建议' } }], structuredInfo: { categories: ['hotel', 1], keyPoints: ['要点', {}] } };
  } };
  const service = createAiService(client);
  const controller = new AbortController();
  assert.deepEqual(await service.sendMessage('  问题  ', { model: 'qwen-turbo', signal: controller.signal }), { text: '旅行建议', structuredInfo: { categories: ['hotel'], keyPoints: ['要点'] } });
  assert.equal(options.json.model, 'qwen-turbo');
  assert.equal(options.json.message, '问题');
  assert.equal(options.signal, controller.signal);
  assert.equal(options.timeoutMs, 45000);
  await assert.rejects(service.sendMessage('字'.repeat(2001)), error => error.code === 'VALIDATION');
  const invalid = createAiService({ request: async () => ({ choices: [] }) });
  await assert.rejects(invalid.sendMessage('问题'), error => error.code === 'INVALID_RESPONSE');
});

test('unconfigured routes fail explicitly; configured route requests share errors and encode resource IDs', async () => {
  const unavailable = createRouteService({ client: null });
  await assert.rejects(unavailable.getUserRoutes(), error => error.code === 'NOT_CONFIGURED');
  await assert.rejects(unavailable.getSmartRecommendations(), error => error.code === 'NOT_CONFIGURED');
  assert.equal(unavailable.getMockRecommendations().length, 4);
  let path;
  const available = createRouteService({ client: { request: async value => { path = value; throw new ApiError('NETWORK'); } } });
  await assert.rejects(available.getRouteDetail('a/b?c'), error => error.code === 'NETWORK');
  assert.equal(path, 'routes/a%2Fb%3Fc');
  await assert.rejects(available.getSmartRecommendations(), error => error.code === 'NETWORK');
});
