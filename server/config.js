export function readServerConfig(env = process.env) {
  const port = Number(env.PORT ?? 3001);
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS ?? 30000);
  const endpoint = env.AI_API_ENDPOINT || 'https://glai2.wuxidata.com.cn:4001/v1/chat/completions';
  const url = new URL(endpoint);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT 必须为 0 到 65535 之间的整数');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300000) {
    throw new Error('AI_REQUEST_TIMEOUT_MS 必须为 1 到 300000 之间的整数');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('AI_API_ENDPOINT 必须是无内嵌凭证的 HTTP 或 HTTPS 地址');
  }

  return {
    port,
    timeoutMs,
    aiModelApiEndpoint: endpoint,
    aiModelApiKey: env.GLAI2_API_KEY?.trim() || '',
    models: {
      'open-source-llm': 'deepseek-v4-flash',
      'deepseek-v4-flash': 'deepseek-v4-flash'
    }
  };
}
