import { useFeedback } from '../composables/useFeedback.js'
import { markRaw } from 'vue'
import { chatService } from '../services/chatService.js'
import { useAuthStore } from '../stores/auth.js'
import { createId } from '../utils/id.js'

export default {
  name: 'ChatView',
  setup() { return { auth: useAuthStore(), feedback: useFeedback() } },
  computed: {
    username() { return this.auth.user?.nickname || '游客' },
    userId() { return this.auth.user?.id || '' },
    connectionText() {
      return { idle: '尚未连接', connecting: '正在连接聊天室…', reconnecting: '连接已断开，正在重连…', offline: '暂时无法连接，自动重连已停止' }[this.connectionState] || ''
    }
  },
  data() {
    return {
      messages: [], newMessage: '', connected: false, onlineUsers: 0,
      currentRoom: null, roomOwnerId: '', historyLoaded: false, loadedHistoryCount: 0,
      connectionState: 'idle', chatError: '', historyWritable: true, chatUnsubscribers: [], pendingTimers: markRaw(new Map()), clearedMessages: markRaw(new Set()),
      chatRooms: [
        { id: 'general', name: '综合交流', icon: '💬', description: '畅聊旅游话题，分享旅行经验' },
        { id: 'scenery', name: '名胜古迹', icon: '🏞️', description: '分享美景，推荐必去景点' },
        { id: 'food', name: '美食探店', icon: '🍜', description: '讨论当地美食，寻找好吃的' },
        { id: 'photography', name: '摄影交流', icon: '📷', description: '摄影技巧分享，作品展示' },
        { id: 'hiking', name: '徒步登山', icon: '🥾', description: '户外徒步，登山攻略交流' },
        { id: 'team', name: '组队拼团', icon: '👥', description: '寻找旅伴，组队出行' }
      ]
    }
  },
  watch: {
    userId(next, previous) { if (previous && next !== previous && this.currentRoom) this.leaveRoom() },
    username(next, previous) {
      if (next !== previous && this.currentRoom && this.userId === this.roomOwnerId) this.connectToChat(this.currentRoom.id)
    }
  },
  mounted() { document.addEventListener('visibilitychange', this.handleVisibilityChange) },
  beforeUnmount() {
    globalThis.document?.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.leaveRoom()
  },
  methods: {
    releaseChatHandlers() {
      this.chatUnsubscribers.forEach(unsubscribe => unsubscribe())
      this.chatUnsubscribers = []
    },
    joinRoom(room) {
      if (!this.userId) { this.$router.replace('/login'); return }
      if (this.currentRoom) this.leaveRoom()
      this.currentRoom = room
      this.roomOwnerId = this.userId
      this.chatError = ''
      this.clearedMessages.clear()
      this.loadRoomHistory(room.id)
      this.connectToChat(room.id)
    },
    leaveRoom() {
      this.feedback.cancelConfirmations()
      this.markUnconfirmed()
      if (this.currentRoom) this.saveRoomHistory(this.currentRoom.id)
      this.releaseChatHandlers()
      chatService.disconnect()
      this.currentRoom = null
      this.roomOwnerId = ''
      this.messages = []
      this.newMessage = ''
      this.connected = false
      this.onlineUsers = 0
      this.historyLoaded = false
      this.connectionState = 'idle'
    },
    connectToChat(roomId) {
      const sameOpen = chatService.isConnected() && chatService.username === this.username && chatService.userId === this.userId && chatService.roomId === roomId
      if (!sameOpen) this.markUnconfirmed()
      this.releaseChatHandlers()
      this.connected = false
      if (!sameOpen) this.onlineUsers = 0
      const owner = this.userId
      const active = () => this.userId === owner && this.currentRoom?.id === roomId
      this.chatUnsubscribers = [
        chatService.onMessage(message => { if (active()) this.receiveMessage(message) }),
        chatService.onConnect(() => { if (active()) this.connected = true }),
        chatService.onDisconnect(() => {
          if (!active()) return
          this.connected = false
          this.onlineUsers = 0
          this.markUnconfirmed()
          this.saveRoomHistory(roomId)
        }),
        chatService.onState(state => { if (active()) this.connectionState = state })
      ]
      chatService.connect(this.username, this.userId, roomId)
      this.connected = chatService.isConnected()
      this.connectionState = chatService.state
    },
    receiveMessage(message) {
      if (message.roomId !== this.currentRoom?.id) return
      if (this.clearedMessages.has(`${message.userId}:${message.id}`)) return
      if (message.type === 'error') {
        const pending = this.messages.find(item => item.id === message.id && item.userId === this.userId)
        if (pending) { pending.status = 'unconfirmed'; this.cancelConfirmation(pending.id) }
        this.chatError = message.content || '消息未被接受，请检查后重发'
        this.saveRoomHistory(this.currentRoom.id)
        return
      }
      if (!['message', 'join', 'leave'].includes(message.type) || typeof message.id !== 'string' || typeof message.content !== 'string' || typeof message.userId !== 'string') return
      if (['join', 'leave'].includes(message.type) && Number.isInteger(message.onlineUsers) && message.onlineUsers >= 0) {
        this.onlineUsers = message.onlineUsers
        this.currentRoom.online = message.onlineUsers
      }
      const existing = this.messages.find(item => item.id === message.id && item.userId === message.userId)
      if (existing) Object.assign(existing, message, { status: 'sent' })
      else this.messages.push({ ...message, status: 'sent' })
      if (message.userId === this.userId) this.cancelConfirmation(message.id)
      this.limitMessages()
      this.saveRoomHistory(this.currentRoom.id)
      this.$nextTick(this.scrollToBottom)
    },
    historyKey(roomId) { return `chat_history_${this.roomOwnerId || this.userId}_${roomId}` },
    saveRoomHistory(roomId) {
      if (!this.historyWritable) { this.chatError = '聊天记录无法读取，原始记录已保留；清除记录后可重新保存'; return }
      try { localStorage.setItem(this.historyKey(roomId), JSON.stringify(this.messages.slice(-100))) }
      catch { this.chatError = '聊天记录保存失败，请检查浏览器存储空间' }
    },
    loadRoomHistory(roomId) {
      this.historyWritable = true
      try {
        const raw = localStorage.getItem(this.historyKey(roomId))
        const saved = raw ? JSON.parse(raw) : []
        if (!Array.isArray(saved)) throw new Error('Invalid history')
        this.messages = saved.filter(message => message && ['message', 'join', 'leave'].includes(message.type) && typeof message.content === 'string')
          .filter(message => !message.roomId || message.roomId === roomId).slice(-100)
          .map(message => ({ ...message, id: message.id || createId(), roomId, userId: message.userId || this.userId, status: message.status === 'pending' ? 'unconfirmed' : message.status || 'sent' }))
        this.loadedHistoryCount = this.messages.filter(message => message.type === 'message').length
        this.historyLoaded = this.loadedHistoryCount > 0
        this.$nextTick(this.scrollToBottom)
      } catch {
        this.historyWritable = false
        this.messages = []
        this.historyLoaded = false
        this.loadedHistoryCount = 0
        this.chatError = '聊天记录无法读取，原始记录已保留'
      }
    },
    limitMessages() {
      const removed = this.messages.splice(0, Math.max(0, this.messages.length - 100))
      removed.forEach(message => this.cancelConfirmation(message.id))
    },
    cancelConfirmation(id) {
      clearTimeout(this.pendingTimers.get(id))
      this.pendingTimers.delete(id)
    },
    awaitConfirmation(message) {
      this.cancelConfirmation(message.id)
      this.pendingTimers.set(message.id, setTimeout(() => {
        this.pendingTimers.delete(message.id)
        if (message.status === 'pending') message.status = 'unconfirmed'
        if (this.currentRoom) this.saveRoomHistory(this.currentRoom.id)
      }, 10000))
    },
    markUnconfirmed() {
      for (const timer of this.pendingTimers.values()) clearTimeout(timer)
      this.pendingTimers.clear()
      this.messages.forEach(message => { if (message.status === 'pending') message.status = 'unconfirmed' })
    },
    sendMessage() {
      const content = this.newMessage.trim()
      if (!content || !this.currentRoom || !this.connected) return
      if ([...content].length > 2000) { this.chatError = '消息最多2000个字符'; return }
      const message = { id: createId(), type: 'message', roomId: this.currentRoom.id, content, username: this.username, userId: this.userId, timestamp: new Date().toISOString(), status: 'pending' }
      if (!chatService.sendMessage(message)) { this.chatError = '消息未发出，请重连后再试'; return }
      this.messages.push(message)
      this.limitMessages()
      this.awaitConfirmation(this.messages[this.messages.length - 1])
      this.newMessage = ''
      this.chatError = ''
      this.saveRoomHistory(this.currentRoom.id)
      this.$nextTick(this.scrollToBottom)
    },
    retryMessage(message) {
      if (!this.connected || message.userId !== this.userId || message.roomId !== this.currentRoom?.id) return
      if (!chatService.sendMessage(message)) { this.chatError = '消息未发出，请重连后再试'; return }
      message.status = 'pending'
      this.awaitConfirmation(message)
      this.saveRoomHistory(this.currentRoom.id)
    },
    scrollToBottom() {
      const container = this.$refs.messagesContainer
      if (container) container.scrollTop = container.scrollHeight
    },
    formatTime(timestamp) {
      if (!timestamp) return ''
      return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    },
    getMessageClass(message) {
      if (['join', 'leave'].includes(message.type)) return 'system-message'
      return message.userId === this.userId ? 'my-message' : 'other-message'
    },
    goBack() { this.leaveRoom(); this.$router.push('/') },
    manualReconnect() { if (this.currentRoom) chatService.reconnect() },
    handleVisibilityChange() {
      if (!document.hidden && this.currentRoom && chatService.state === 'offline') this.manualReconnect()
    },
    async clearHistory() {
      const room = this.currentRoom, ownerId = this.roomOwnerId
      if (!room || !await this.feedback.confirm('确定要清除此聊天室的历史记录吗？清除后无法恢复。', { title: '清除聊天记录', confirmLabel: '清除记录', danger: true })) return
      if (this.currentRoom !== room || this.roomOwnerId !== ownerId || this.userId !== ownerId) return
      try { localStorage.removeItem(this.historyKey(this.currentRoom.id)) }
      catch { this.chatError = '聊天记录清除失败，请稍后重试'; return }
      this.markUnconfirmed()
      this.historyWritable = true
      this.chatError = ''
      this.messages.forEach(message => this.clearedMessages.add(`${message.userId}:${message.id}`))
      while (this.clearedMessages.size > 2048) this.clearedMessages.delete(this.clearedMessages.values().next().value)
      this.messages = []
      this.historyLoaded = false
      this.loadedHistoryCount = 0
    }
  }
}
