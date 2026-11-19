import { createId } from '../utils/id.js'

function defaultEndpoint() {
  const url = new URL(import.meta.env?.VITE_CHAT_WS_URL || '/ws', globalThis.location?.origin || 'http://localhost:8080')
  if (url.protocol === 'http:') url.protocol = 'ws:'
  if (url.protocol === 'https:') url.protocol = 'wss:'
  return url.href
}

// 历史补收走普通 HTTP；默认与 WebSocket 同源同端口，只把 /ws 换成 /history。
function defaultHttpEndpoint() {
  if (import.meta.env?.VITE_CHAT_HTTP_URL) return import.meta.env.VITE_CHAT_HTTP_URL
  const url = new URL(defaultEndpoint())
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  url.pathname = /\/ws\/?$/.test(url.pathname) ? url.pathname.replace(/\/ws\/?$/, '/history') : '/history'
  url.search = ''
  url.hash = ''
  return url.href
}

export class ChatService {
  constructor({
    createSocket = url => new WebSocket(url),
    timers = globalThis,
    endpoint = defaultEndpoint(),
    httpEndpoint = defaultHttpEndpoint(),
    fetchImpl = (...args) => globalThis.fetch(...args),
    listenerTarget = globalThis
  } = {}) {
    this.createSocket = createSocket
    this.timers = timers
    this.endpoint = endpoint
    this.httpEndpoint = httpEndpoint
    this.fetchImpl = fetchImpl
    this.listenerTarget = listenerTarget
    this.ws = null
    this.state = 'idle'
    this.messageHandlers = new Set()
    this.connectHandlers = new Set()
    this.disconnectHandlers = new Set()
    this.stateHandlers = new Set()
    this.username = ''
    this.userId = ''
    this.roomId = ''
    this.token = ''
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.baseReconnectDelay = 1000
    this.maxReconnectDelay = 30000
    this.heartbeatInterval = 15000
    this.maxMissedPongs = 3
    this.missedPongs = 0
    this.shouldReconnect = false
    this.reconnectTimer = null
    this.connectionTimeout = null
    this.heartbeatTimer = null
    this.generation = 0
    this.lastTypingAt = 0
    this.typingThrottle = 1200
    this.offline = false
    this.boundOffline = () => this.handleOffline()
    this.boundOnline = () => this.handleOnline()
    this.listenersAttached = false
  }

  emit(handlers, value) {
    for (const handler of [...handlers]) {
      try { handler(value) } catch (error) { console.error('聊天事件处理失败:', error) }
    }
  }

  setState(state) {
    this.state = state
    this.emit(this.stateHandlers, state)
  }

  connect(username, userId, roomId = 'general', token = '') {
    if (!userId || !roomId) return false
    const same = this.username === username && this.userId === userId && this.roomId === roomId && this.token === token
    if (same && this.ws && [0, 1].includes(this.ws.readyState)) return true
    this.username = username
    this.userId = userId
    this.roomId = roomId
    this.token = token
    // navigator.onLine 只在明确为 false 时才阻止连接；测试环境通常没有该字段。
    this.offline = this.listenerTarget?.navigator?.onLine === false
    this.reconnectAttempts = 0
    this.shouldReconnect = true
    this.attachNetworkListeners()
    this.cancelReconnect()
    this.openConnection()
    return true
  }

  attachNetworkListeners() {
    if (this.listenersAttached) return
    const target = this.listenerTarget
    if (!target || typeof target.addEventListener !== 'function') return
    target.addEventListener('offline', this.boundOffline)
    target.addEventListener('online', this.boundOnline)
    this.listenersAttached = true
  }

  detachNetworkListeners() {
    if (!this.listenersAttached) return
    const target = this.listenerTarget
    if (target && typeof target.removeEventListener === 'function') {
      target.removeEventListener('offline', this.boundOffline)
      target.removeEventListener('online', this.boundOnline)
    }
    this.listenersAttached = false
  }

  // 浏览器进入离线状态时立即断开并停止重试，等待 online 事件再恢复。
  handleOffline() {
    this.offline = true
    if (!this.shouldReconnect) return
    if (this.ws) this.connectionFailed()
    else this.setState('reconnecting')
  }

  handleOnline() {
    this.offline = false
    if (!this.shouldReconnect || this.isConnected()) return
    this.reconnectAttempts = 0
    this.cancelReconnect()
    this.openConnection()
  }

  openConnection() {
    this.disposeSocket()
    const generation = this.generation
    if (this.offline) {
      this.setState('reconnecting')
      return
    }
    this.setState(this.reconnectAttempts ? 'reconnecting' : 'connecting')
    try {
      const url = new URL(this.endpoint)
      url.searchParams.set('username', this.username)
      url.searchParams.set('userId', this.userId)
      url.searchParams.set('roomId', this.roomId)
      // 行程房间使用服务端签发的短期令牌；综合房间保持无令牌模式。
      if (this.token) url.searchParams.set('token', this.token)
      const socket = this.createSocket(url.href)
      this.ws = socket
      const current = () => this.ws === socket && this.generation === generation
      socket.onopen = () => {
        if (!current()) return
        this.timers.clearTimeout(this.connectionTimeout)
        this.connectionTimeout = null
        this.reconnectAttempts = 0
        this.missedPongs = 0
        this.setState('connected')
        this.startHeartbeat(socket)
        this.emit(this.connectHandlers)
      }
      socket.onmessage = event => {
        if (!current()) return
        let message
        try { message = JSON.parse(event.data) } catch { return }
        if (!message || typeof message !== 'object' || message.roomId !== this.roomId) return
        if (!['message', 'join', 'leave', 'pong', 'error', 'typing', 'reaction'].includes(message.type)) return
        this.missedPongs = 0
        if (message.type !== 'pong') this.emit(this.messageHandlers, message)
      }
      socket.onerror = socket.onclose = () => {
        if (current()) this.connectionFailed()
      }
      this.connectionTimeout = this.timers.setTimeout(() => {
        if (current()) this.connectionFailed()
      }, 10000)
    } catch {
      this.connectionFailed()
    }
  }

  connectionFailed() {
    this.disposeSocket()
    this.emit(this.disconnectHandlers)
    this.attemptReconnect()
  }

  attemptReconnect() {
    this.cancelReconnect()
    if (!this.shouldReconnect) return
    if (this.offline) {
      this.setState('reconnecting')
      return
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.shouldReconnect = false
      this.setState('offline')
      return
    }
    this.reconnectAttempts++
    this.setState('reconnecting')
    const delay = Math.min(this.baseReconnectDelay * 2 ** (this.reconnectAttempts - 1), this.maxReconnectDelay)
    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = null
      if (this.shouldReconnect) this.openConnection()
    }, delay)
  }

  cancelReconnect() {
    this.timers.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  startHeartbeat(socket) {
    this.timers.clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = this.timers.setInterval(() => {
      if (this.ws !== socket || socket.readyState !== 1) return
      if (this.missedPongs >= this.maxMissedPongs) { this.connectionFailed(); return }
      try {
        socket.send(JSON.stringify({ type: 'ping', roomId: this.roomId }))
        this.missedPongs++
      } catch { this.connectionFailed() }
    }, this.heartbeatInterval)
  }

  disposeSocket() {
    this.generation++
    this.timers.clearTimeout(this.connectionTimeout)
    this.timers.clearInterval(this.heartbeatTimer)
    this.connectionTimeout = this.heartbeatTimer = null
    const socket = this.ws
    this.ws = null
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
      try { socket.close(1000, 'Connection replaced') } catch { /* 已关闭的连接无需再次处理 */ }
    }
  }

  sendMessage(message) {
    if (!this.isConnected() || typeof message?.content !== 'string') return false
    if (!message.content.trim() || [...message.content].length > 2000) return false
    try {
      this.ws.send(JSON.stringify({ ...message, id: message.id || createId(), type: 'message', roomId: this.roomId, userId: this.userId, username: this.username }))
      return true
    } catch { this.connectionFailed(); return false }
  }

  // 轻量事件（正在输入 / 表情回应）：不经历消息去重与正文校验。
  sendEvent(type, payload = {}) {
    if (!this.isConnected()) return false
    try {
      this.ws.send(JSON.stringify({ type, roomId: this.roomId, userId: this.userId, username: this.username, ...payload }))
      return true
    } catch { this.connectionFailed(); return false }
  }

  sendTyping() {
    const now = Date.now()
    if (now - this.lastTypingAt < this.typingThrottle) return false
    this.lastTypingAt = now
    return this.sendEvent('typing')
  }

  sendReaction(targetId, emoji) {
    if (!targetId || !emoji) return false
    return this.sendEvent('reaction', { reaction: targetId, content: emoji })
  }

  // 拉取服务端历史：首次加载传空游标取最近一页；断线重连后传最后一条已确认消息 id 只取增量。
  async fetchHistory({ roomId = this.roomId, token = this.token, afterId = '', limit = 100 } = {}) {
    if (!roomId) throw new Error('缺少聊天室，无法读取聊天记录')
    const url = new URL(this.httpEndpoint)
    url.searchParams.set('roomId', roomId)
    url.searchParams.set('limit', String(limit))
    if (afterId) url.searchParams.set('afterId', afterId)
    if (token) url.searchParams.set('token', token)
    const response = await this.fetchImpl(url.href, { headers: { Accept: 'application/json' } })
    if (!response?.ok) {
      const error = new Error(`聊天记录读取失败（${response?.status ?? '网络错误'}）`)
      error.status = response?.status
      throw error
    }
    const payload = await response.json()
    if (!payload || !Array.isArray(payload.messages)) throw new Error('聊天记录格式不正确')
    return payload.messages.filter(message => message && message.roomId === roomId)
  }

  subscribe(handlers, handler) { handlers.add(handler); return () => handlers.delete(handler) }
  onMessage(handler) { return this.subscribe(this.messageHandlers, handler) }
  onConnect(handler) { return this.subscribe(this.connectHandlers, handler) }
  onDisconnect(handler) { return this.subscribe(this.disconnectHandlers, handler) }
  onState(handler) { return this.subscribe(this.stateHandlers, handler) }
  isConnected() { return this.ws?.readyState === 1 && this.state === 'connected' }

  reconnect() {
    if (!this.userId || !this.roomId) return
    this.emit(this.disconnectHandlers)
    // 手动重连视为用户明确要求再试；只有在浏览器明确离线时才继续阻止。
    this.offline = this.listenerTarget?.navigator?.onLine === false
    this.reconnectAttempts = 0
    this.shouldReconnect = true
    this.cancelReconnect()
    this.openConnection()
  }

  disconnect() {
    this.shouldReconnect = false
    this.cancelReconnect()
    this.detachNetworkListeners()
    this.offline = false
    this.disposeSocket()
    this.emit(this.disconnectHandlers)
    this.setState('idle')
    for (const handlers of [this.messageHandlers, this.connectHandlers, this.disconnectHandlers, this.stateHandlers]) handlers.clear()
  }
}

export const chatService = new ChatService()
