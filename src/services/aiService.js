import { apiConfig } from '../config/api.js'
import { apiClient, ApiError } from './apiClient.js'

export function createAiService(client = apiClient) {
  return {
    async sendMessage(message, { model = 'open-source-llm', signal, onDelta } = {}) {
      if (typeof message !== 'string' || !message.trim() || [...message.trim()].length > 2000) {
        throw new ApiError('VALIDATION', { message: '请输入 1 至 2000 个字符的消息。' })
      }
      const data = await client.request('ai/chat', {
        method: 'POST', timeoutMs: apiConfig.aiTimeoutMs, signal, onDelta,
        json: { message: message.trim(), model, structured: true, stream: typeof onDelta === 'function', systemPrompt: '你是一个专业的旅行客服AI助手，需要帮助用户解决旅行相关的问题。请用简洁清晰的 Markdown 排版：按主题分段，段落之间空一行，每段不超过三句话；多个建议使用列表，较长回答使用简短标题，重点适度加粗。不要把整篇回答挤成一段，不要用代码块包裹普通回答。' }
      })
      const text = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text
      if (typeof text !== 'string' || !text.trim()) throw new ApiError('INVALID_RESPONSE')
      return {
        text,
        structuredInfo: {
          categories: Array.isArray(data.structuredInfo?.categories) ? data.structuredInfo.categories.filter(item => typeof item === 'string') : [],
          keyPoints: Array.isArray(data.structuredInfo?.keyPoints) ? data.structuredInfo.keyPoints.filter(item => typeof item === 'string') : []
        }
      }
    }
  }
}

export const aiService = createAiService()
