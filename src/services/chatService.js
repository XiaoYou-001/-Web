import { createId } from '../utils/id.js'

function defaultEndpoint() {
  const url = new URL(import.meta.env?.VITE_CHAT_WS_URL || '/ws', globalThis.location?.origin || 'http://localhost:8080')
  if (url.protocol === 'http:') url.protocol = 'ws:'
  if (url.protocol === 'https:') url.protocol = 'wss:'
  return url.href
}

export class ChatService {
  constructor({ createSocket = url => new WebSocket(url), timers = globalThis, endpoint = defaultEndpoint() } = {}) {
    this.createSocket = createSocket
    this.timers = timers
    this.endpoint = endpoint
    this.ws = null
    this.state = 'idle'
    this.messageHandlers = new Set()
    this.connectHandlers = new Set()
    this.disconnectHandlers = new Set()
    this.stateHandlers = new Set()
    this.username = ''
    this.userId = ''
    this.roomId = ''
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

  connect(username, userId, roomId = 'general') {
    if (!userId || !roomId) return false
    const same = this.username === username && this.userId === userId && this.roomId === roomId
    if (same && this.ws && [0, 1].includes(this.ws.readyState)) return true
    this.username = username
    this.userId = userId
    this.roomId = roomId
    this.reconnectAttempts = 0
    this.shouldReconnect = true
    this.cancelReconnect()
    this.openConnection()
    return true
  }

  openConnection() {
    this.disposeSocket()
    const generation = this.generation
    this.setState(this.reconnectAttempts ? 'reconnecting' : 'connecting')
    try {
      const url = new URL(this.endpoint)
      url.searchParams.set('username', this.username)
      url.searchParams.set('userId', this.userId)
      url.searchParams.set('roomId', this.roomId)
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
        if (!['message', 'join', 'leave', 'pong', 'error'].includes(message.type)) return
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

  subscribe(handlers, handler) { handlers.add(handler); return () => handlers.delete(handler) }
  onMessage(handler) { return this.subscribe(this.messageHandlers, handler) }
  onConnect(handler) { return this.subscribe(this.connectHandlers, handler) }
  onDisconnect(handler) { return this.subscribe(this.disconnectHandlers, handler) }
  onState(handler) { return this.subscribe(this.stateHandlers, handler) }
  isConnected() { return this.ws?.readyState === 1 && this.state === 'connected' }

  reconnect() {
    if (!this.userId || !this.roomId) return
    this.emit(this.disconnectHandlers)
    this.reconnectAttempts = 0
    this.shouldReconnect = true
    this.cancelReconnect()
    this.openConnection()
  }

  disconnect() {
    this.shouldReconnect = false
    this.cancelReconnect()
    this.disposeSocket()
    this.emit(this.disconnectHandlers)
    this.setState('idle')
    for (const handlers of [this.messageHandlers, this.connectHandlers, this.disconnectHandlers, this.stateHandlers]) handlers.clear()
  }
}

export const chatService = new ChatService()
