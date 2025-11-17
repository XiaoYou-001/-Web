<template>
  <div class="chat-container">
    <!-- Room Selection Screen -->
    <div v-if="!currentRoom" class="room-selection">
      <div class="room-selection-header">
        <h2>🏔️ 选择聊天室</h2>
        <button class="btn-back" @click="goBack">返回首页</button>
      </div>
      <div class="room-grid">
        <div 
          v-for="room in chatRooms" 
          :key="room.id"
          class="room-card"
          @click="joinRoom(room)"
        >
          <div class="room-icon">{{ room.icon }}</div>
          <h3>{{ room.name }}</h3>
          <p>{{ room.description }}</p>
          <div class="room-stats">
            <span>👥 在线: {{ room.online || 0 }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Chat Room Screen -->
    <div v-else class="chat-room">
      <div class="chat-header">
        <div class="header-left">
          <button class="btn-back-room" @click="leaveRoom">← 返回</button>
          <h2>{{ currentRoom.icon }} {{ currentRoom.name }}</h2>
        </div>
        <div class="header-actions">
          <button class="btn-clear-history" @click="clearHistory" title="清除聊天记录">
            🗑️ 清除记录
          </button>
          <p class="online-count">在线人数: {{ onlineUsers }}</p>
        </div>
        <button class="btn-back" @click="goBack">返回首页</button>
      </div>

    <div class="chat-main">
      <!-- History loaded indicator -->
      <div v-if="historyLoaded && messages.length > 0" class="history-indicator">
        📜 已加载 {{ messages.filter(m => m.type === 'message').length }} 条历史消息
      </div>
      <div class="messages-container" ref="messagesContainer">
        <div
          v-for="(msg, index) in messages"
          :key="index"
          :class="['message-item', getMessageClass(msg)]"
        >
          <div class="message-info">
            <span class="username">{{ msg.username }}</span>
            <span class="timestamp">{{ formatTime(msg.timestamp) }}</span>
          </div>
          <div class="message-content">
            {{ msg.content }}
          </div>
        </div>
      </div>

      <div class="input-container">
        <input
          v-model="newMessage"
          @keyup.enter="sendMessage"
          placeholder="输入消息... (按Enter发送)"
          class="message-input"
          :disabled="!connected"
        />
        <button @click="sendMessage" :disabled="!connected" class="btn-send">
          发送
        </button>
      </div>

      <div v-if="!connected" class="connection-status">
        <span>连接已断开，正在重连...</span>
        <button @click="manualReconnect" class="btn-reconnect">手动重连</button>
      </div>
    </div>
    </div>
  </div>
</template>

<script>
import { chatService } from '../services/chatService'

export default {
  name: 'ChatView',
  data() {
    return {
      messages: [],
      newMessage: '',
      connected: false,
      username: localStorage.getItem('username') || '游客',
      userId: localStorage.getItem('userId') || this.generateUserId(),
      onlineUsers: 0,
      currentRoom: null,
      historyLoaded: false,
      chatRooms: [
        {
          id: 'general',
          name: '综合交流',
          icon: '💬',
          description: '畅聊旅游话题，分享旅行经验',
          online: 0
        },
        {
          id: 'scenery',
          name: '名胜古迹',
          icon: '🏞️',
          description: '分享美景，推荐必去景点',
          online: 0
        },
        {
          id: 'food',
          name: '美食探店',
          icon: '🍜',
          description: '讨论当地美食，寻找好吃的',
          online: 0
        },
        {
          id: 'photography',
          name: '摄影交流',
          icon: '📷',
          description: '摄影技巧分享，作品展示',
          online: 0
        },
        {
          id: 'hiking',
          name: '徒步登山',
          icon: '🥾',
          description: '户外徒步，登山攻略交流',
          online: 0
        },
        {
          id: 'team',
          name: '组队拼团',
          icon: '👥',
          description: '寻找旅伴，组队出行',
          online: 0
        }
      ]
    }
  },
  mounted() {
    
    // 防止浏览器后台运行时关闭WebSocket
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  },
  beforeUnmount() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    chatService.disconnect()
  },
  methods: {
    generateUserId() {
      const id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
      localStorage.setItem('userId', id)
      return id
    },
    joinRoom(room) {
      this.currentRoom = room
      this.onlineUsers = 0
      // 历史记录存储
      this.loadRoomHistory(room.id)
      this.connectToChat(room.id)
    },
    leaveRoom() {
      // 保存历史记录
      if (this.currentRoom) {
        this.saveRoomHistory(this.currentRoom.id)
      }
      chatService.disconnect()
      this.currentRoom = null
      this.messages = []
      this.connected = false
      this.onlineUsers = 0
    },
    connectToChat(roomId) {
      chatService.connect(this.username, this.userId, roomId)

      chatService.onMessage((message) => {
        // Skip duplicate messages from server if it's our own message
        if (message.type === 'message' && message.userId === this.userId) {
          // 更碎时间戳更新最近上一条信息记录
          const lastMsg = this.messages[this.messages.length - 1]
          if (lastMsg && lastMsg.userId === this.userId && lastMsg.content === message.content) {
            lastMsg.timestamp = message.timestamp
            // 保存最新的历史记录
            if (this.currentRoom) {
              this.saveRoomHistory(this.currentRoom.id)
            }
            return
          }
        }

        this.messages.push(message)
        this.$nextTick(() => {
          this.scrollToBottom()
        })

        // 当有新信息发送时进行一次自动保存
        if (this.currentRoom && message.type === 'message') {
          this.saveRoomHistory(this.currentRoom.id)
        }

        // 更新在线人数（简单估算）
        if (message.type === 'join') {
          this.onlineUsers++
        } else if (message.type === 'leave') {
          this.onlineUsers = Math.max(0, this.onlineUsers - 1)
        }
      })

      chatService.onConnect(() => {
        this.connected = true
        console.log('已连接到聊天室')
      })

      chatService.onDisconnect(() => {
        this.connected = false
        console.log('已断开连接')
      })
    },
    saveRoomHistory(roomId) {
      const historyKey = `chat_history_${roomId}`
      const maxMessages = 100 // 最高上限100条记录进行保存
      const messagesToSave = this.messages.slice(-maxMessages)
      try {
        localStorage.setItem(historyKey, JSON.stringify(messagesToSave))
      } catch (error) {
        console.error('保存聊天记录失败:', error)
      }
    },
    loadRoomHistory(roomId) {
      const historyKey = `chat_history_${roomId}`
      try {
        const savedHistory = localStorage.getItem(historyKey)
        if (savedHistory) {
          this.messages = JSON.parse(savedHistory)
          this.historyLoaded = true
          this.$nextTick(() => {
            this.scrollToBottom()
          })
        } else {
          this.messages = []
          this.historyLoaded = false
        }
      } catch (error) {
        console.error('加载聊天记录失败:', error)
        this.messages = []
        this.historyLoaded = false
      }
    },
    sendMessage() {
      if (!this.newMessage.trim() || !this.connected) {
        return
      }

      const messageData = {
        type: 'message',
        content: this.newMessage,
        username: this.username,
        userId: this.userId,
        timestamp: new Date()
      }

      // Optimistic UI update - show message immediately
      this.messages.push(messageData)
      this.$nextTick(() => {
        this.scrollToBottom()
      })

      chatService.sendMessage(messageData)

      this.newMessage = ''
    },
    scrollToBottom() {
      const container = this.$refs.messagesContainer
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    },
    formatTime(timestamp) {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      return date.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    },
    getMessageClass(msg) {
      if (msg.type === 'join' || msg.type === 'leave') {
        return 'system-message'
      }
      if (msg.userId === this.userId) {
        return 'my-message'
      }
      return 'other-message'
    },
    goBack() {
      if (this.currentRoom) {
        this.saveRoomHistory(this.currentRoom.id)
        this.leaveRoom()
      }
      this.$router.push('/')
    },
    manualReconnect() {
      console.log('手动重连...')
      chatService.resetReconnection()
      if (this.currentRoom) {
        this.connectToChat(this.currentRoom.id)
      }
    },
    handleVisibilityChange() {
      if (document.hidden) {
        console.log('😴 页面进入后台，保持连接')
        // 不关闭连接，让它继续运行
      } else {
        console.log('👁️ 页面恢复前台')
        // 检查连接状态，如果断开则重连
        if (this.currentRoom && !chatService.isConnected()) {
          console.log('🔄 检测到连接断开，尝试重连...')
          chatService.resetReconnection()
          this.connectToChat(this.currentRoom.id)
        }
      }
    },
    clearHistory() {
      if (confirm('确定要清除此聊天室的历史记录吗？')) {
        const historyKey = `chat_history_${this.currentRoom.id}`
        localStorage.removeItem(historyKey)
        // Only clear message history, keep system messages (join/leave)
        this.messages = this.messages.filter(msg => msg.type !== 'message')
      }
    }
  }
}
</script>

<style scoped>
.chat-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* Room Selection Styles */
.room-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.room-selection-header {
  background: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.room-selection-header h2 {
  margin: 0;
  color: #4361ee;
  font-size: 28px;
}

.room-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  padding: 10px;
}

.room-card {
  background: white;
  padding: 30px;
  border-radius: 15px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
}

.room-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
}

.room-icon {
  font-size: 48px;
  margin-bottom: 15px;
}

.room-card h3 {
  color: #4361ee;
  margin: 10px 0;
  font-size: 22px;
}

.room-card p {
  color: #666;
  font-size: 14px;
  margin: 10px 0;
  line-height: 1.5;
}

.room-stats {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #e0e0e0;
  color: #888;
  font-size: 14px;
}

/* Chat Room Styles */
.chat-room {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 40px);
}

.chat-header {
  background: white;
  padding: 20px;
  border-radius: 10px 10px 0 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}

.btn-clear-history {
  padding: 6px 12px;
  background: #ff6b6b;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.3s;
  white-space: nowrap;
}

.btn-clear-history:hover {
  background: #ee5a52;
}

.btn-back-room {
  padding: 8px 15px;
  background: #e0e0e0;
  color: #333;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.3s;
}

.btn-back-room:hover {
  background: #d0d0d0;
}

.chat-header h2 {
  margin: 0;
  color: #4361ee;
}

.online-count {
  color: #666;
  font-size: 14px;
  margin: 0;
}

.btn-back {
  padding: 8px 20px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-back:hover {
  background: #764ba2;
}

.chat-main {
  flex: 1;
  background: white;
  border-radius: 0 0 10px 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-indicator {
  background: #e3f2fd;
  color: #1976d2;
  padding: 8px 15px;
  text-align: center;
  font-size: 13px;
  border-bottom: 1px solid #bbdefb;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #f5f5f5;
}

.message-item {
  margin-bottom: 15px;
  padding: 10px 15px;
  border-radius: 8px;
  max-width: 70%;
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.my-message {
  background: #667eea;
  color: white;
  margin-left: auto;
}

.other-message {
  background: white;
  color: #333;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.system-message {
  background: #e3f2fd;
  color: #1976d2;
  text-align: center;
  margin: 10px auto;
  font-size: 14px;
  max-width: 80%;
}

.message-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  font-size: 12px;
  opacity: 0.8;
}

.username {
  font-weight: bold;
}

.timestamp {
  font-size: 11px;
}

.message-content {
  word-wrap: break-word;
  line-height: 1.4;
}

.input-container {
  display: flex;
  padding: 15px;
  background: white;
  border-top: 1px solid #e0e0e0;
  gap: 10px;
}

.message-input {
  flex: 1;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 25px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.3s;
}

.message-input:focus {
  border-color: #667eea;
}

.message-input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.btn-send {
  padding: 12px 30px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  transition: background 0.3s;
}

.btn-send:hover:not(:disabled) {
  background: #764ba2;
}

.btn-send:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.connection-status {
  padding: 10px;
  background: #fff3cd;
  color: #856404;
  text-align: center;
  font-size: 14px;
  border-top: 1px solid #ffc107;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
}

.btn-reconnect {
  padding: 6px 15px;
  background: #ffc107;
  color: #333;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  font-weight: bold;
  transition: background 0.3s;
}

.btn-reconnect:hover {
  background: #ffb300;
}

/* 滚动条样式 */
.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.messages-container::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
