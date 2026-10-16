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
            <span>👥 最近在线: {{ room.online ?? '—' }}</span>
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
          <p class="online-count">在线人数: {{ connected ? onlineUsers : '—' }}</p>
        </div>
        <button class="btn-back" @click="goBack">返回首页</button>
      </div>

    <div class="chat-main">
      <!-- History loaded indicator -->
      <div v-if="historyLoaded && messages.length > 0" class="history-indicator">
        📜 已加载 {{ loadedHistoryCount }} 条历史消息
      </div>
      <div class="messages-container" ref="messagesContainer">
        <div
          v-for="msg in messages"
          :key="`${msg.userId}:${msg.id}`"
          :class="['message-item', getMessageClass(msg)]"
        >
          <div class="message-info">
            <span class="username">{{ msg.username }}</span>
            <span class="timestamp">{{ formatTime(msg.timestamp) }}</span>
          </div>
          <div class="message-content">
            {{ msg.content }}
          </div>
          <div v-if="msg.type === 'message' && msg.userId === userId" class="message-delivery">
            <span v-if="msg.status === 'pending'">等待送达确认…</span>
            <template v-else-if="msg.status === 'unconfirmed'">
              <span>未确认送达</span>
              <button @click="retryMessage(msg)" :disabled="!connected">重发</button>
            </template>
          </div>
        </div>
      </div>

      <div class="input-container">
        <input
          v-model="newMessage"
          @keyup.enter="sendMessage"
          placeholder="输入消息... (按Enter发送，最多2000个字符)"
          maxlength="4000"
          class="message-input"
          :disabled="!connected"
        />
        <button @click="sendMessage" :disabled="!connected" class="btn-send">
          发送
        </button>
      </div>

      <div v-if="!connected" class="connection-status">
        <span>{{ connectionText }}</span>
        <button @click="manualReconnect" class="btn-reconnect">手动重连</button>
      </div>
      <p v-if="chatError" role="alert">{{ chatError }}</p>
    </div>
    </div>
  </div>
</template>

<script>
import chatViewModel from './chatViewModel.js'
export default chatViewModel
</script>

<style scoped>
.message-delivery {
  margin-top: 5px;
  font-size: 12px;
  color: #666;
}

.message-delivery button {
  margin-left: 8px;
  cursor: pointer;
}

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
