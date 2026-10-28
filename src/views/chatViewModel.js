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
    },
    fontClass() { return `fs-${this.settings.fontSize}` },
    themeClass() { return `theme-${this.settings.theme}` },
    // 本地搜索：只搜普通消息，返回 [index] 列表 (A4)
    searchResults() {
      if (!this.searchQuery.trim()) return []
      const q = this.searchQuery.trim().toLowerCase()
      const out = []
      this.messages.forEach((m, i) => {
        if (m.type === 'message' && !this.isRemoved(m) && m.content.toLowerCase().includes(q)) out.push(i)
      })
      return out
    },
    // 收藏列表（当前房间）(A5)
    favoriteList() {
      return this.messages.filter(m => this.isFavorite(m))
    },
    // 展示列表：剔除本地删除的消息，保留原始索引用于搜索定位 (A4/A5)
    displayMessages() {
      const out = []
      this.messages.forEach((m, i) => { if (!this.isRemoved(m)) out.push({ m, i }) })
      return out
    },
    // 搜索命中的原始索引集合 (A4)
    searchMatchSet() {
      const set = new Set()
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.trim().toLowerCase()
        this.messages.forEach((m, i) => {
          if (m.type === 'message' && !this.isRemoved(m) && m.content.toLowerCase().includes(q)) set.add(i)
        })
      }
      return set
    },
    greetings() {
      const saved = Array.isArray(this.settings.quickReplies) && this.settings.quickReplies.length ? this.settings.quickReplies : this.defaultGreetings
      return saved.slice(0, 8)
    },
    // 仍在有效期内的“正在输入”用户（排除自己） (B9)
    typingVisible() {
      const now = Date.now()
      const names = []
      for (const id in this.typingUsers) {
        if (id === this.userId) continue
        const u = this.typingUsers[id]
        if (u.expiresAt > now) names.push(u.username)
      }
      return names
    },
    typingText() {
      const n = this.typingVisible
      if (!n.length) return ''
      if (n.length === 1) return `${n[0]} 正在输入…`
      return `${n.slice(0, 2).join('、')}${n.length > 2 ? ' 等' : ''} 正在输入…`
    }
  },
  data() {
    return {
      messages: [], newMessage: '', connected: false, onlineUsers: 0,
      currentRoom: null, roomOwnerId: '', historyLoaded: false, loadedHistoryCount: 0,
      connectionState: 'idle', chatError: '', historyWritable: true, chatUnsubscribers: [], pendingTimers: markRaw(new Map()), clearedMessages: markRaw(new Set()), showEmoji: false,
      typingUsers: {},                                     // userId -> {username, expiresAt} 正在输入 (B9)
      typingTimer: null,
      replyingTo: null,                                    // 正在回复的消息 (B10)
      reactions: {},                                       // targetId -> [{emoji,userId,username}] 表情回应 (B10)
      drafts: {},                                          // roomId -> 未发送草稿 (A7)
      showSearch: false, searchQuery: '', searchFocused: 0, // 本地搜索 (A4)
      favorites: markRaw(new Set()),                       // 收藏 (A5)
      showFavorites: false,
      actionMsg: null,                                     // 长按/悬停操作目标 (A5)
      settings: { sound: true, notify: true, theme: 'light', fontSize: 'md', quickReplies: [] }, // A6/A8/A3
      settingsOpen: false,
      greetingInput: '',                                   // 自定义常用语 (A3)
      unreadHint: 0,                                       // 返回房间时的“新消息”提示 (A1)
      lastSeenCount: {},                                   // roomId -> 上次离开时的消息数 (A1)
      unreadByRoom: {},                                    // roomId -> 选择页未读角标 (A1)
      chatRooms: [
        { id: 'general', name: '综合交流', icon: '💬', description: '畅聊旅游话题，分享旅行经验', tags: ['旅游', '资讯', '交友'], accent: 'indigo', cover: '/images/web/scenic-1.jpg' },
        { id: 'scenery', name: '名胜古迹', icon: '🏞️', description: '分享美景，推荐必去景点', tags: ['打卡', '景点', '风景'], accent: 'teal', cover: '/images/web/attr-2.jpg' },
        { id: 'food', name: '美食探店', icon: '🍜', description: '讨论当地美食，寻找好吃的', tags: ['美食', '探店', '攻略'], accent: 'warm', cover: '/images/web/hotel-deal-1.jpg' },
        { id: 'photography', name: '摄影交流', icon: '📷', description: '摄影技巧分享，作品展示', tags: ['摄影', '器材', '分享'], accent: 'violet', cover: '/images/web/attr-8.jpg' },
        { id: 'hiking', name: '徒步登山', icon: '🥾', description: '户外徒步，登山攻略交流', tags: ['户外', '登山', '装备'], accent: 'green', cover: '/images/web/scenic-4.jpg' },
        { id: 'team', name: '组队拼团', icon: '👥', description: '寻找旅伴，组队出行', tags: ['拼团', '伙伴', '出行'], accent: 'coral', cover: '/images/web/route-2.jpg' }
      ],
      quickReplies: ['🏔️ 有一起去过的小伙伴吗？', '📍 求推荐当地必打卡景点', '🍜 附近有什么好吃的？', '🧳 出行要注意哪些事项？', '📷 刚拍的美景分享给大家', '👋 大家好，新人报道'],
      defaultGreetings: ['🏔️ 有一起去过的小伙伴吗？', '📍 求推荐当地必打卡景点', '🍜 附近有什么好吃的？', '🧳 出行要注意哪些事项？', '📷 刚拍的美景分享给大家', '👋 大家好，新人报道'],
      emojiList: ['😀','😂','😍','🤩','🥰','😎','🤔','😅','😊','🤗','👍','👏','🙌','💪','🔥','💯','✨','🎉','❤️','🌹','🏔️','🌄','🏖️','⛰️','🍜','☕','📷','🎒','🧭','✈️']
    }
  },
  watch: {
    userId(next, previous) { if (previous && next !== previous && this.currentRoom) this.leaveRoom() },
    username(next, previous) {
      if (next !== previous && this.currentRoom && this.userId === this.roomOwnerId) this.connectToChat(this.currentRoom.id)
    },
    // 设置变化时持久化 (A6/A8/A3)
    'settings.quickReplies': { deep: true, handler() { this.saveSettings() } }
  },
  created() { this.loadSettings() },
  mounted() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.loadFavorites()
    this.loadUnread()
  },
  beforeUnmount() {
    globalThis.document?.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.leaveRoom()
  },
  methods: {
    /* —— 设置 / 收藏 / 未读 持久化 (A6/A8/A3/A1) —— */
    settingsKey() { return `chat_settings_${this.userId || 'guest'}` },
    favoritesKey() { return `chat_favorites_${this.userId || 'guest'}` },
    unreadKey() { return `chat_unread_${this.userId || 'guest'}` },
    loadSettings() {
      try {
        const raw = localStorage.getItem(this.settingsKey())
        if (raw) this.settings = { ...this.settings, ...JSON.parse(raw) }
      } catch { /* 忽略读取失败 */ }
    },
    saveSettings() {
      try { localStorage.setItem(this.settingsKey(), JSON.stringify(this.settings)) } catch { /* 存储受限则忽略 */ }
    },
    loadFavorites() {
      this.favorites.clear()
      try {
        const raw = localStorage.getItem(this.favoritesKey())
        if (raw) JSON.parse(raw).forEach(key => this.favorites.add(key))
      } catch { /* 忽略 */ }
    },
    loadUnread() {
      try {
        const raw = localStorage.getItem(this.unreadKey())
        this.unreadByRoom = raw ? JSON.parse(raw) : {}
      } catch { this.unreadByRoom = {} }
    },
    saveUnread() {
      try { localStorage.setItem(this.unreadKey(), JSON.stringify(this.unreadByRoom)) } catch { /* 忽略 */ }
    },
    setTheme(value) { this.settings.theme = value; this.saveSettings() },
    setFontSize(value) { this.settings.fontSize = value; this.saveSettings() },
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
      // A7：恢复该房间上次未发送的草稿
      this.newMessage = this.drafts[room.id] || ''
      this.loadRoomHistory(room.id)
      this.connectToChat(room.id)
      this.showSearch = false
      this.searchQuery = ''
      this.showFavorites = false
      this.actionMsg = null
      // A1：返回房间时统计“新消息”提示
      const last = this.lastSeenCount[room.id] ?? 0
      const current = this.messages.filter(m => m.type === 'message' && !this.isRemoved(m)).length
      this.unreadHint = current > last ? current - last : 0
    },
    leaveRoom() {
      this.feedback.cancelConfirmations()
      this.markUnconfirmed()
      if (this.currentRoom) {
        this.saveRoomHistory(this.currentRoom.id)
        // A7：保存草稿；A1：记录离开时的消息数（排除本地删除）
        this.drafts[this.currentRoom.id] = this.newMessage
        this.lastSeenCount[this.currentRoom.id] = this.messages.filter(m => m.type === 'message' && !this.isRemoved(m)).length
      }
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
      this.showEmoji = false
      this.typingUsers = {}
      this.clearTypingTimer()
      this.reactions = {}
      this.replyingTo = null
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
      // B9 正在输入：不进入消息列表
      if (message.type === 'typing') { this.markTyping(message); return }
      // B10 表情回应：不进入消息列表，挂到对应消息上
      if (message.type === 'reaction') { this.applyReaction(message); return }
      if (!['message', 'join', 'leave'].includes(message.type) || typeof message.id !== 'string' || typeof message.content !== 'string' || typeof message.userId !== 'string') return
      if (['join', 'leave'].includes(message.type) && Number.isInteger(message.onlineUsers) && message.onlineUsers >= 0) {
        this.onlineUsers = message.onlineUsers
        this.currentRoom.online = message.onlineUsers
      }
      const existing = this.messages.find(item => item.id === message.id && item.userId === message.userId)
      if (existing) Object.assign(existing, message, { status: 'sent' })
      else this.messages.push({ ...message, status: 'sent' })
      if (message.userId === this.userId) this.cancelConfirmation(message.id)
      // A6：新消息提示（他人的普通消息）
      if (message.type === 'message' && message.userId !== this.userId && !existing) {
        this.alertNewMessage(message)
      }
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
      if (this.replyingTo) {
        message.replyTo = { id: this.replyingTo.id, username: this.replyingTo.username, content: this.replyingTo.content.slice(0, 80) }
      }
      if (!chatService.sendMessage(message)) { this.chatError = '消息未发出，请重连后再试'; return }
      this.messages.push(message)
      this.limitMessages()
      this.awaitConfirmation(this.messages[this.messages.length - 1])
      this.newMessage = ''
      this.replyingTo = null
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
      this.lastSeenCount[this.currentRoom.id] = 0
    },
    /* —— 展示辅助：头像 / 时间 —— */
    avatarHue(id) {
      let hash = 0
      const seed = String(id || 'x')
      for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i)
      return Math.abs(hash) % 360
    },
    avatarLetter(name) { return (name || '客').trim().charAt(0).toUpperCase() },
    avatarColor(id) { return `hsl(${this.avatarHue(id)}, 70%, 52%)` },
    isToday(ts) {
      if (!ts) return false
      const d = new Date(ts), now = new Date()
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    },
    isSystem(msg) { return ['join', 'leave'].includes(msg && msg.type) },
    isDayBoundary(messages, idx) {
      if (idx <= 0) return true
      const prev = messages[idx - 1], cur = messages[idx]
      if (!cur?.timestamp || !prev?.timestamp) return idx === 0
      const d1 = new Date(prev.timestamp).toDateString()
      const d2 = new Date(cur.timestamp).toDateString()
      return d1 !== d2
    },
    formatDay(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      const base = d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
      return this.isToday(ts) ? '今天' : base
    },
    formatFullTime(ts) {
      if (!ts) return ''
      return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    },
    toggleEmoji() { this.showEmoji = !this.showEmoji },
    closeEmoji() { this.showEmoji = false },
    useQuickReply(text) { this.newMessage = text; this.closeEmoji() },
    insertEmoji(emoji) { this.newMessage += emoji; this.$refs.messageInput?.focus() },

    /* —— A6 声音 / 系统通知 —— */
    alertNewMessage(message) {
      if (this.settings.sound) this.playPing()
      if (this.settings.notify) this.notifyNewMessage(message)
    },
    playPing() {
      try {
        if (typeof window === 'undefined' || !window.AudioContext) return
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) return
        const ctx = new Ctx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.08, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.2)
      } catch { /* 音频不可用则静默 */ }
    },
    notifyNewMessage(message) {
      if (typeof window === 'undefined' || !('Notification' in window)) return
      try {
        if (Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
          new Notification(`${message.username} 在「${this.currentRoom?.name || '聊天室'}」发来消息`, {
            body: message.content,
            tag: 'chat-new-message'
          })
        } else if (Notification.permission === 'default') {
          Notification.requestPermission()
        }
      } catch { /* 通知被拦截则忽略 */ }
    },

    /* —— A2 富文本：转义并高亮链接 / @提及 —— */
    renderContent(content) {
      const esc = String(content || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
      return esc
        .replace(/(https?:\/\/[^\s<>"']+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="msg-link">$1</a>')
        .replace(/(^|\s)@([\u4e00-\u9fa5\w\-]{1,20})/g, '$1<span class="msg-mention">@$2</span>')
    },

    /* —— A4 本地搜索 —— */
    toggleSearch() { this.showSearch = !this.showSearch; if (this.showSearch) this.$nextTick(() => this.$refs.searchInput?.focus()) },
    jumpToSearchResult(index) {
      this.$nextTick(() => {
        const el = this.$refs.messagesContainer
        const target = el?.querySelector(`[data-msg-index="${index}"]`)
        if (el && target) el.scrollTop = target.offsetTop - el.offsetTop - 16
      })
    },

    /* —— A5 复制 / 本地删除 / 收藏 —— */
    isRemoved(msg) { return !!(msg && msg._removed) },
    favKey(msg) { return `${this.currentRoom?.id || ''}:${msg.userId}:${msg.id}` },
    isFavorite(msg) { return this.favorites.has(this.favKey(msg)) },
    toggleFavorite(msg) {
      const key = this.favKey(msg)
      if (this.favorites.has(key)) this.favorites.delete(key)
      else this.favorites.add(key)
      try { localStorage.setItem(this.favoritesKey(), JSON.stringify([...this.favorites])) } catch { /* 忽略 */ }
    },
    async copyMessage(msg) {
      try {
        await navigator.clipboard.writeText(msg.content)
        this.chatError = ''
        return true
      } catch { return false }
    },
    removeMessage(msg) {
      if (msg.userId !== this.userId) return
      msg._removed = true
      this.cancelConfirmation(msg.id)
      if (this.favorites.has(this.favKey(msg))) this.favorites.delete(this.favKey(msg))
      this.saveRoomHistory(this.currentRoom.id)
      this.actionMsg = null
    },
    setAction(msg) { this.actionMsg = this.actionMsg === msg ? null : msg },
    clearAction() { this.actionMsg = null },

    /* —— A1 房间选择页：本地记录条数 —— */
    storedCount(roomId) {
      try {
        const raw = localStorage.getItem(`chat_history_${this.userId}_${roomId}`)
        const arr = raw ? JSON.parse(raw) : []
        return Array.isArray(arr) ? arr.filter(m => m && m.type === 'message' && !m._removed).length : 0
      } catch { return 0 }
    },

    /* —— A3 常用语自定义 —— */
    addGreeting() {
      const text = this.greetingInput.trim()
      if (!text) return
      const list = Array.isArray(this.settings.quickReplies) ? [...this.settings.quickReplies] : []
      list.push(text)
      this.settings.quickReplies = list.slice(-12)
      this.greetingInput = ''
      this.saveSettings()
    },
    removeGreeting(text) {
      if (!Array.isArray(this.settings.quickReplies)) return
      this.settings.quickReplies = this.settings.quickReplies.filter(g => g !== text)
      this.saveSettings()
    },
    resetGreetings() {
      this.settings.quickReplies = [...this.defaultGreetings]
      this.saveSettings()
    },

    /* —— B9 正在输入 —— */
    markTyping(message) {
      if (!message.userId || !message.username) return
      this.typingUsers = { ...this.typingUsers, [message.userId]: { username: message.username, expiresAt: Date.now() + 2600 } }
      this.scheduleTypingPrune()
    },
    clearTypingTimer() {
      if (this.typingTimer) { clearTimeout(this.typingTimer); this.typingTimer = null }
    },
    scheduleTypingPrune() {
      this.clearTypingTimer()
      this.typingTimer = setTimeout(() => {
        this.typingTimer = null
        const now = Date.now()
        const keep = {}
        for (const id in this.typingUsers) { if (this.typingUsers[id].expiresAt > now) keep[id] = this.typingUsers[id] }
        this.typingUsers = keep
      }, 2600)
    },
    onTypingInput() { if (this.connected && chatService) chatService.sendTyping() },

    /* —— B10 回复 —— */
    setReplying(msg) {
      if (msg.type !== 'message') return
      this.replyingTo = msg
      this.closeEmoji()
      this.$refs.messageInput?.focus()
    },
    clearReply() { this.replyingTo = null },

    /* —— B10 表情回应 —— */
    applyReaction(message) {
      if (!message.content || !message.reaction || !message.userId) return
      const targetId = message.reaction
      const list = this.reactions[targetId] || []
      const dup = list.some(r => r.userId === message.userId && r.emoji === message.content)
      if (!dup) {
        this.reactions = { ...this.reactions, [targetId]: [...list, { emoji: message.content, userId: message.userId, username: message.username }] }
      }
    },
    toggleReaction(msg, emoji) {
      if (!msg || !this.connected) return
      chatService.sendReaction(msg.id, emoji)
    },
    reactionsFor(msg) {
      if (!msg || !msg.id || !this.reactions[msg.id]) return []
      return this.reactions[msg.id]
    },
    hasMyReaction(msg, emoji) {
      const list = this.reactionsFor(msg)
      return list.some(r => r.userId === this.userId && r.emoji === emoji)
    },
    reactionGroup(msg) {
      const map = {}
      for (const r of this.reactionsFor(msg)) {
        if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, count: 0, users: [] }
        map[r.emoji].count++
        map[r.emoji].users.push(r.username)
      }
      return Object.values(map)
    }
  }
}
