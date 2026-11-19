import { useFeedback } from '../composables/useFeedback.js'
import { markRaw } from 'vue'
import { chatService } from '../services/chatService.js'
import { collaborationService } from '../services/collaborationService.js'
import { useAuthStore } from '../stores/auth.js'
import { createId } from '../utils/id.js'

const TRIP_ROOM = /^trip-[A-Za-z0-9_-]{1,64}$/

function isTripRoomId(value) {
  return typeof value === 'string' && TRIP_ROOM.test(value)
}

// 同行聊天室由 Go 服务端用“协作账号 id”覆盖消息的 userId，而本页面展示用的是本地账号 id。
// 读取自己聊天令牌里的 sub（只用于把回显消息归一到本地身份，不作为鉴权依据），
// 否则自己发的消息会被当成他人消息：重复一条、乐观消息永远停在“未确认”、还会误触发提示音。
export function readChatTokenSubject(token) {
  try {
    const part = String(token ?? '').split('.')[0]
    if (!part) return ''
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(globalThis.atob(padded))
    return typeof payload?.sub === 'string' ? payload.sub : ''
  } catch { return '' }
}

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
      replaying: false, replayNotice: '', replayNoticeTimer: null,
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
      tripRoomToken: '', tripRoomId: '', tripRoomExpiresAt: 0, tripServerUserId: '', tripEntry: '', tripTokenTimer: null,
      chatRooms: [
        { id: 'general', name: '综合交流', icon: '💬', description: '畅聊旅游话题，分享旅行经验', tags: ['旅游', '资讯', '交友'], accent: 'indigo', cover: '/images/web/scenic-1.jpg' },
        { id: 'scenery', name: '名胜古迹', icon: '🏞️', description: '分享美景，推荐必去景点', tags: ['打卡', '景点', '风景'], accent: 'teal', cover: '/images/web/attr-2.jpg' },
        { id: 'food', name: '美食探店', icon: '🍜', description: '讨论当地美食，寻找好吃的', tags: ['美食', '探店', '攻略'], accent: 'warm', cover: '/images/web/food-noodles.jpg' },
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
    this.enterRoomFromQuery()
  },
  beforeUnmount() {
    globalThis.document?.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.clearTripTokenTimer()
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
    isTripRoom(roomId) { return isTripRoomId(roomId) },
    enterRoomFromQuery() {
      const room = this.$route?.query?.room
      if (!isTripRoomId(room)) return false
      const name = typeof this.$route.query.name === 'string' && this.$route.query.name.trim()
        ? this.$route.query.name.trim().slice(0, 60)
        : '同行聊天室'
      this.joinRoom({ id: room, name, icon: '👥', description: '该旅行协作成员的私密聊天室', tags: ['同行', '私密'], accent: 'teal' })
      return true
    },
    normalizeTripRoom(value) {
      const raw = String(value || '').trim()
      if (!raw) return ''
      return isTripRoomId(raw) ? raw : `trip-${raw}`
    },
    enterTripRoomFromInput() {
      const roomId = this.normalizeTripRoom(this.tripEntry)
      if (!isTripRoomId(roomId)) { this.chatError = '请输入有效的同行聊天室 ID（trip-…）'; return }
      this.tripEntry = ''
      return this.joinRoom({ id: roomId, name: '同行聊天室', icon: '👥', description: '该旅行协作成员的私密聊天室', tags: ['同行', '私密'], accent: 'teal' })
    },
    clearTripToken() {
      this.clearTripTokenTimer()
      this.tripRoomToken = ''
      this.tripRoomId = ''
      this.tripRoomExpiresAt = 0
      this.tripServerUserId = ''
    },
    clearTripTokenTimer() {
      if (this.tripTokenTimer) { clearTimeout(this.tripTokenTimer); this.tripTokenTimer = null }
    },
    async ensureTripToken(roomId, { force = false } = {}) {
      const now = Date.now()
      if (!force && this.tripRoomToken && this.tripRoomId === roomId && this.tripRoomExpiresAt - now > 60000) {
        return this.tripRoomToken
      }
      try {
        const data = await collaborationService.chatToken(this.userId, roomId.slice('trip-'.length))
        if (!data?.token) throw new Error('聊天令牌返回为空')
        this.tripRoomToken = data.token
        this.tripRoomId = roomId
        this.tripRoomExpiresAt = Number(data.expiresAt) || (now + 15 * 60 * 1000)
        this.tripServerUserId = readChatTokenSubject(data.token)
        this.clearTripTokenTimer()
        const wait = Math.max(30000, this.tripRoomExpiresAt - Date.now() - 120000)
        this.tripTokenTimer = setTimeout(() => {
          this.tripTokenTimer = null
          if (this.currentRoom?.id === roomId && this.userId) this.ensureTripToken(roomId, { force: true }).catch(() => {})
        }, wait)
        this.chatError = ''
        return this.tripRoomToken
      } catch (error) {
        this.chatError = error?.message || '无法获取同行聊天室令牌，请先在工作台连接协作身份'
        this.connectionState = 'offline'
        this.connected = false
        return ''
      }
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
      this.showSearch = false
      this.searchQuery = ''
      this.showFavorites = false
      this.actionMsg = null
      // A1：返回房间时统计“新消息”提示
      const last = this.lastSeenCount[room.id] ?? 0
      const current = this.messages.filter(m => m.type === 'message' && !this.isRemoved(m)).length
      this.unreadHint = current > last ? current - last : 0
      return this.connectToChat(room.id)
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
      this.clearTripToken()
      this.currentRoom = null
      this.roomOwnerId = ''
      this.messages = []
      this.newMessage = ''
      this.connected = false
      this.onlineUsers = 0
      this.historyLoaded = false
      this.connectionState = 'idle'
      this.replaying = false
      this.replayNotice = ''
      clearTimeout(this.replayNoticeTimer)
      this.replayNoticeTimer = null
      this.showEmoji = false
      this.typingUsers = {}
      this.clearTypingTimer()
      this.reactions = {}
      this.replyingTo = null
    },
    async connectToChat(roomId) {
      const owner = this.userId
      let token = ''
      if (isTripRoomId(roomId)) {
        token = await this.ensureTripToken(roomId)
        if (this.userId !== owner || this.currentRoom?.id !== roomId) return
        if (!token) return
      }
      const sameOpen = chatService.isConnected() && chatService.username === this.username && chatService.userId === this.userId && chatService.roomId === roomId && chatService.token === token
      if (!sameOpen) this.markUnconfirmed()
      this.releaseChatHandlers()
      this.connected = false
      if (!sameOpen) this.onlineUsers = 0
      const active = () => this.userId === owner && this.currentRoom?.id === roomId
      this.chatUnsubscribers = [
        chatService.onMessage(message => { if (active()) this.receiveMessage(message) }),
        chatService.onConnect(() => {
          if (!active()) return
          this.connected = true
          // 首次进入或断线重连后，从服务端补收本机缺失的消息，再重发仍未确认的发送。
          const initial = !this.loadedHistoryCount
          this.restoreFromServer({ initial }).finally(() => {
            if (active() && this.connected) this.autoResendPending()
          })
        }),
        chatService.onDisconnect(() => {
          if (!active()) return
          this.connected = false
          this.onlineUsers = 0
          this.markUnconfirmed()
          this.saveRoomHistory(roomId)
        }),
        chatService.onState(state => { if (active()) this.connectionState = state })
      ]
      chatService.connect(this.username, this.userId, roomId, token)
      this.connected = chatService.isConnected()
      this.connectionState = chatService.state
    },
    // 服务端在同行房间用协作账号 id 覆盖 userId；把属于“自己”的消息归一化成本地身份。
    withLocalIdentity(message) {
      if (!message || typeof message !== 'object') return message
      if (this.tripServerUserId && message.userId === this.tripServerUserId) return { ...message, userId: this.userId }
      return message
    },
    receiveMessage(incoming) {
      if (!incoming || typeof incoming !== 'object') return
      const message = { ...this.withLocalIdentity(incoming) }
      // 兜底：令牌无法解析时，用自己生成的乐观消息 id 认领服务端回显。
      if (message.type === 'message' && message.userId !== this.userId
        && this.messages.some(item => item.id === message.id && item.userId === this.userId)) {
        message.userId = this.userId
      }
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
    /* —— 断线重连：从服务端补收缺失消息，并自动重发未确认消息 —— */
    serverCursor() {
      for (let i = this.messages.length - 1; i >= 0; i--) {
        const message = this.messages[i]
        if (message?.type === 'message' && message.status === 'sent' && typeof message.id === 'string' && message.id) return message.id
      }
      return ''
    },
    sortMessagesByTime() {
      this.messages.sort((a, b) => (Date.parse(a?.timestamp) || 0) - (Date.parse(b?.timestamp) || 0))
    },
    mergeServerHistory(list, { initial = false } = {}) {
      let added = 0
      let lastIncoming = null
      for (const item of list) {
        if (!item || item.roomId !== this.currentRoom?.id) continue
        if (!['message', 'join', 'leave'].includes(item.type)) continue
        if (typeof item.id !== 'string' || typeof item.userId !== 'string' || typeof item.content !== 'string') continue
        const message = this.withLocalIdentity(item)
        if (this.clearedMessages.has(`${message.userId}:${message.id}`)) continue
        const existing = this.messages.find(entry => entry.id === message.id && entry.userId === message.userId)
        if (existing) {
          Object.assign(existing, message, { status: 'sent' })
          if (existing.userId === this.userId) this.cancelConfirmation(existing.id)
          continue
        }
        this.messages.push({ ...message, status: 'sent' })
        if (message.userId === this.userId) this.cancelConfirmation(message.id)
        if (message.type === 'message' && message.userId !== this.userId) lastIncoming = message
        added++
      }
      if (added) {
        this.sortMessagesByTime()
        this.limitMessages()
        this.loadedHistoryCount = this.messages.filter(message => message.type === 'message').length
        this.historyLoaded = this.loadedHistoryCount > 0
        if (!initial && lastIncoming) this.alertNewMessage(lastIncoming)
        this.saveRoomHistory(this.currentRoom.id)
        this.$nextTick(this.scrollToBottom)
      }
      return added
    },
    async restoreFromServer({ initial = false } = {}) {
      const roomId = this.currentRoom?.id
      if (!roomId || this.replaying) return 0
      this.replaying = true
      let cursor = this.serverCursor()
      let added = 0
      try {
        // 服务端历史文件最多保留 500 行，按 100 条一页最多翻 5 页即可覆盖。
        for (let page = 0; page < 5; page++) {
          const batch = await chatService.fetchHistory({ roomId, afterId: cursor, limit: 100 })
          if (this.currentRoom?.id !== roomId) break
          if (!Array.isArray(batch) || !batch.length) break
          added += this.mergeServerHistory(batch, { initial })
          const lastId = batch[batch.length - 1]?.id
          if (!lastId || lastId === cursor) break
          cursor = lastId
          if (batch.length < 100) break
        }
        if (added) this.showReplayNotice(initial ? `已从服务器加载 ${added} 条历史消息` : `连接已恢复，已补收 ${added} 条消息`)
      } catch (error) {
        if (error?.status === 503) {
          this.showReplayNotice('服务器未启用聊天记录存储，仅显示本机记录')
        } else {
          this.chatError = initial ? '服务器历史消息加载失败，可刷新页面重试' : '连接已恢复，但补收服务器消息失败；可刷新页面重试'
        }
      } finally {
        this.replaying = false
      }
      return added
    },
    autoResendPending() {
      if (!this.connected || !this.currentRoom) return 0
      let sent = 0
      for (const message of this.messages) {
        if (message.type !== 'message' || message.userId !== this.userId || message.status !== 'unconfirmed') continue
        if (message.roomId && message.roomId !== this.currentRoom.id) continue
        // 自动重试有上限，避免连接反复闪断时无限重发；超过后保留手动重发。
        if ((message.autoRetries || 0) >= 3) continue
        message.autoRetries = (message.autoRetries || 0) + 1
        if (!chatService.sendMessage(message)) { message.status = 'unconfirmed'; continue }
        message.status = 'pending'
        this.awaitConfirmation(message)
        sent++
      }
      if (sent) {
        this.saveRoomHistory(this.currentRoom.id)
        this.showReplayNotice(`已自动重发 ${sent} 条未确认消息`)
      }
      return sent
    },
    showReplayNotice(text) {
      this.replayNotice = text
      clearTimeout(this.replayNoticeTimer)
      this.replayNoticeTimer = setTimeout(() => {
        this.replayNotice = ''
        this.replayNoticeTimer = null
      }, 6000)
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
    handleMessageEnter(event) {
      if (event.isComposing || event.keyCode === 229) return
      event.preventDefault()
      this.sendMessage()
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
    manualReconnect() {
      if (!this.currentRoom) return
      if (this.isTripRoom(this.currentRoom.id)) {
        this.clearTripToken()
        this.connectToChat(this.currentRoom.id)
        return
      }
      chatService.reconnect()
    },
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
      } catch {
        this.chatError = '自动复制未完成，请选中消息文本手动复制。'
        return false
      }
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
