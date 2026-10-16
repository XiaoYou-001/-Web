import { apiConfig } from '../config/api.js'
import { apiClient, ApiError } from './apiClient.js'

export function createAiService(client = apiClient) {
  return {
    async sendMessage(message, { model = 'open-source-llm', signal } = {}) {
      if (typeof message !== 'string' || !message.trim() || [...message.trim()].length > 2000) {
        throw new ApiError('VALIDATION', { message: '请输入 1 至 2000 个字符的消息。' })
      }
      const data = await client.request('ai/chat', {
        method: 'POST', timeoutMs: apiConfig.aiTimeoutMs, signal,
        json: { message: message.trim(), model, structured: true, stream: false, systemPrompt: '你是一个专业的旅行客服AI助手，需要帮助用户解决旅行相关的问题。' }
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
