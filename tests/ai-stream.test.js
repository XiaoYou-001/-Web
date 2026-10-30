import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from '../src/services/apiClient.js';

test('SSE renders split UTF-8 deltas before completion and rejects truncated streams', async () => {
  const encoder = new TextEncoder();
  const chunks = [];
  let finish;
  const stream = new ReadableStream({ start(controller) {
    for (const byte of encoder.encode('data: {"delta":"你好"}\r\n\r\n')) controller.enqueue(Uint8Array.of(byte));
    finish = () => { controller.enqueue(encoder.encode('data: {"done":true}\n\n')); controller.close(); };
  } });
  const client = createApiClient({ fetchImpl: async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }) });
  const result = await client.request('ai/chat', { onDelta(text) { chunks.push(text); finish(); } });
  assert.deepEqual(chunks, ['你好']);
  assert.equal(result.choices[0].message.content, '你好');
  const broken = createApiClient({ fetchImpl: async () => new Response('data: {"delta":"部分"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }) });
  await assert.rejects(broken.request('ai/chat', { onDelta() {} }), { code: 'INVALID_RESPONSE' });
});
