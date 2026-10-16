export function readServerConfig(env = process.env) {
  const port = Number(env.PORT ?? 3001);
  const timeoutMs = Number(env.AI_REQUEST_TIMEOUT_MS ?? 30000);
  const endpoint = env.AI_API_ENDPOINT || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
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
    aiModelApiKey: env.AI_API_KEY?.trim() || '',
    models: {
      'open-source-llm': 'qwen3-max',
      'qwen-turbo': 'qwen-turbo',
      'llama3-8b-instruct': 'llama3-8b-instruct',
      'qwen3-max': 'qwen3-max'
    }
  };
}
