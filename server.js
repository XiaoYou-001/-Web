import express from 'express';
import { readSSE } from './src/services/sse.js';
import fetch from 'node-fetch';
import cors from 'cors';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { readServerConfig } from './server/config.js';

try {
  loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const app = express();
const config = readServerConfig();

// 中间件配置
app.use(cors());
app.use(express.json());

/**
 * 转发 AI 请求，统一返回 JSON 和结构化信息。
 */
app.post('/api/ai/chat', async (req, res) => {
  let cleanup = () => {};
  let timedOut = false;
  let disconnected = false;
  try {
    const { message, model = 'open-source-llm', systemPrompt = '你是一个专业的旅行客服AI助手，需要帮助用户解决旅行相关的问题。其他的日常问题也可以回答', structured = true, stream = false } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || [...message.trim()].length > 2000) {
      return res.status(400).json({ code: 'VALIDATION', error: '消息内容需为1至2000个字符' });
    }
    if (!config.aiModelApiKey) {
      return res.status(503).json({ code: 'AI_NOT_CONFIGURED', error: 'AI服务尚未配置，请联系管理员。' });
    }
    const actualModel = typeof model === 'string' && Object.hasOwn(config.models, model)
      ? config.models[model] : config.models['open-source-llm'];
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) { disconnected = true; controller.abort(); } };
    req.on('aborted', cancel);
    res.on('close', cancel);
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutMs);
    cleanup = () => { clearTimeout(timer); req.off('aborted', cancel); res.off('close', cancel); };
    if (res.destroyed) { cancel(); return; }

    const response = await fetch(config.aiModelApiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.aiModelApiKey },
      body: JSON.stringify({
        model: actualModel,
        messages: [
          { role: 'system', content: typeof systemPrompt === 'string' ? systemPrompt : JSON.stringify(systemPrompt) },
          { role: 'user', content: message.trim() }
        ],
        max_tokens: 500, temperature: 0.7, stream: stream === true
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      // 只根据状态码分类，不把上游原文或敏感诊断返回浏览器。
      response.body?.destroy();
      const failure = response.status === 401 || response.status === 403
        ? { status: 401, code: 'AI_AUTH_FAILED', error: 'AI服务认证失败，请联系管理员。' }
        : response.status === 404
          ? { status: 404, code: 'AI_ENDPOINT_INVALID', error: 'AI服务地址配置有误，请联系管理员。' }
          : response.status === 429
            ? { status: 429, code: 'RATE_LIMIT', error: '当前请求过多，请稍后重试。' }
            : { status: 502, code: 'SERVICE_UNAVAILABLE', error: 'AI服务暂时不可用，请稍后重试。' };
      return res.status(failure.status).json({ code: failure.code, error: failure.error });
    }
    if (stream === true) {
      if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        response.body?.destroy();
        throw new SyntaxError('Expected SSE');
      }
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      const emit = data => res.write(`data: ${JSON.stringify(data)}\n\n`);
      let text = '', completed = false;
      for await (const raw of readSSE(response.body)) {
        if (raw === '[DONE]') { completed = true; break; }
        const data = JSON.parse(raw);
        if (data.error) throw new Error('Upstream stream failure');
        const delta = data.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) { text += delta; emit({ delta }); }
      }
      if (!completed || !text.trim()) throw new SyntaxError('Incomplete reply');
      emit({ done: true, structuredInfo: structured ? analyzeAndStructureResponse(text) : null });
      res.end();
      return;
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(502).json({ code: 'INVALID_RESPONSE', error: 'AI服务返回的数据格式异常，请稍后重试。' });
    }
    if (!disconnected && !res.destroyed) res.json({
      ...data, structuredInfo: structured ? analyzeAndStructureResponse(text) : null
    });
  } catch (error) {
    if (disconnected || res.destroyed) return;
    const failure = timedOut
      ? { status: 504, code: 'TIMEOUT', error: 'AI服务响应超时，请稍后重试。' }
      : error instanceof SyntaxError
        ? { status: 502, code: 'INVALID_RESPONSE', error: 'AI服务返回的数据格式异常，请稍后重试。' }
        : { status: 502, code: 'SERVICE_UNAVAILABLE', error: 'AI服务暂时不可用，请稍后重试。' };
    if (res.headersSent) res.end(`data: ${JSON.stringify({ code: failure.code, error: failure.error })}\n\n`);
    else res.status(failure.status).json({ code: failure.code, error: failure.error });
  } finally { cleanup(); }
});

// 获取可用模型列表
app.get('/api/ai/models', (req, res) => {
  res.json({
    models: Object.keys(config.models)
  });
});

/**
 * 分析响应文本并生成结构化信息
 */
function analyzeAndStructureResponse(responseText) {
  const structuredInfo = {
    categories: [],
    hasContactInfo: false,
    keyPoints: []
  };

  // 分析内容类别
  if (responseText.includes('订单') || responseText.includes('booking') || responseText.includes('预订')) {
    structuredInfo.categories.push('order');
  }
  if (responseText.includes('退款') || responseText.includes('refund') || responseText.includes('退订')) {
    structuredInfo.categories.push('refund');
  }
  if (responseText.includes('酒店') || responseText.includes('hotel') || responseText.includes('住宿')) {
    structuredInfo.categories.push('hotel');
  }
  if (responseText.includes('机票') || responseText.includes('flight') || responseText.includes('航班')) {
    structuredInfo.categories.push('flight');
  }
  if (responseText.includes('服务') || responseText.includes('客服') || responseText.includes('帮助')) {
    structuredInfo.categories.push('service');
  }
  if (responseText.includes('信息') || responseText.includes('info') || responseText.includes('详情')) {
    structuredInfo.categories.push('info');
  }

  // 分析关键点
  if (responseText.includes('步骤') || responseText.includes('流程') || responseText.includes('steps')) {
    structuredInfo.keyPoints.push('steps_info');
  }
  
  // 检测是否包含联系信息建议
  if (responseText.includes('客服') || responseText.includes('电话') || responseText.includes('联系')) {
    structuredInfo.hasContactInfo = true;
  }
  
  return structuredInfo;
}

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// 启动服务器
// 无效 JSON 和请求体过大也返回与业务接口一致的 JSON 错误。
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
    return res.status(error.type === 'entity.too.large' ? 413 : 400).json({ code: 'VALIDATION', error: '请求内容格式无效或过大' });
  }
  next(error);
});

const server = app.listen(config.port, () => {
  const port = server.address().port;
  console.log(`Node.js后端服务器已启动，监听端口 ${port}`);
  console.log(`- 健康检查: http://localhost:${port}/api/health`);
  console.log(`- 模型列表: http://localhost:${port}/api/ai/models`);
  console.log(`- AI聊天接口: http://localhost:${port}/api/ai/chat (JSON 和结构化输出)`);
  if (!config.aiModelApiKey) {
    console.warn('未配置 GLAI2_API_KEY，AI 聊天接口暂不可用。');
  }
});
