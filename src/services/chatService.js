class ChatService {
  constructor() {
    this.ws = null
    this.messageHandlers = []
    this.connectHandlers = []
    this.disconnectHandlers = []
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10 // 重连次数
    this.baseReconnectDelay = 1000 // 基础重连延迟
    this.maxReconnectDelay = 30000 // 最大重连延迟
    this.isConnecting = false
    this.shouldReconnect = true // 控制是否应该重连
    this.username = ''
    this.userId = ''
    this.roomId = ''
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.heartbeatInterval = 15000 // 15秒发送一次心跳（更频繁）
    this.connectionTimeout = null
    this.manualClose = false // 是否是手动关闭
    this.lastPingTime = null
    this.missedPongs = 0
    this.maxMissedPongs = 3
  }

  connect(username, userId, roomId = 'general') {
    // 清理之前的连接
    if (this.isConnecting) {
      console.log('正在连接中，请稍候...')
      return
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('已经连接，无需重复连接')
      return
    }

    // 清理旧的WebSocket
    this.cleanupConnection(false)

    this.isConnecting = true
    this.shouldReconnect = true
    this.manualClose = false
    this.username = username
    this.userId = userId
    this.roomId = roomId

    const wsUrl = `ws://localhost:8080/ws?username=${encodeURIComponent(username)}&userId=${encodeURIComponent(userId)}&roomId=${encodeURIComponent(roomId)}`
    
    console.log(`正在连接到: ${wsUrl}`)

    // 设置连接超时
    this.connectionTimeout = setTimeout(() => {
      if (this.isConnecting) {
        console.log('连接超时，关闭连接')
        this.cleanupConnection(false)
        this.attemptReconnect()
      }
    }, 10000) // 10秒连接超时
    
    try {
      this.ws = new WebSocket(wsUrl)
      
      // 防止WebSocket被浏览器意外关闭
      this.ws.binaryType = 'arraybuffer'

      this.ws.onopen = () => {
        console.log('✅ WebSocket连接成功')
        clearTimeout(this.connectionTimeout)
        this.isConnecting = false
        this.reconnectAttempts = 0
        this.missedPongs = 0
        this.lastPingTime = null
        this.startHeartbeat()
        this.connectHandlers.forEach(handler => {
          try {
            handler()
          } catch (error) {
            console.error('连接处理器错误:', error)
          }
        })
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          
          // 处理pong响应（虽然服务器可能不发送pong，但收到任何消息都说明连接正常）
          if (message.type === 'pong') {
            this.missedPongs = 0
            const latency = Date.now() - this.lastPingTime
            console.log(`💚 收到pong响应，延迟: ${latency}ms`)
            return
          }
          
          // 收到任何消息都重置未响应计数
          this.missedPongs = 0
          
          this.messageHandlers.forEach(handler => {
            try {
              handler(message)
            } catch (error) {
              console.error('消息处理器错误:', error)
            }
          })
        } catch (error) {
          console.error('解析消息失败:', error, event.data)
        }
      }

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket错误:', error)
        clearTimeout(this.connectionTimeout)
        this.isConnecting = false
      }

      this.ws.onclose = (event) => {
        console.log(`🔌 WebSocket连接关闭 - Code: ${event.code}, Reason: ${event.reason || '无原因'}, Clean: ${event.wasClean}`)
        clearTimeout(this.connectionTimeout)
        this.isConnecting = false
        this.stopHeartbeat()
        
        this.disconnectHandlers.forEach(handler => {
          try {
            handler()
          } catch (error) {
            console.error('断开处理器错误:', error)
          }
        })

        // 只有在非手动关闭且应该重连的情况下才重连
        if (!this.manualClose && this.shouldReconnect) {
          this.attemptReconnect()
        }
      }
    } catch (error) {
      console.error('创建WebSocket失败:', error)
      clearTimeout(this.connectionTimeout)
      this.isConnecting = false
      this.attemptReconnect()
    }
  }

  attemptReconnect() {
    // 清理之前的重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (!this.shouldReconnect) {
      console.log('已停止自动重连')
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`⚠️ 达到最大重连次数(${this.maxReconnectAttempts})，停止重连`)
      this.shouldReconnect = false
      return
    }

    this.reconnectAttempts++
    
    // 指数退避算法：每次重连延迟时间翻倍，但不超过最大值
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    )
    
    console.log(`🔄 尝试重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts}) - 等待 ${delay}ms`)
    
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect && !this.isConnecting) {
        this.connect(this.username, this.userId, this.roomId)
      }
    }, delay)
  }

  startHeartbeat() {
    this.stopHeartbeat()
    console.log(`💓 启动心跳检测，间隔: ${this.heartbeatInterval}ms`)
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          // 检查是否有太多未响应的ping
          if (this.missedPongs >= this.maxMissedPongs) {
            console.error(`❌ 心跳超时，未收到${this.maxMissedPongs}次pong响应，主动断开重连`)
            this.ws.close()
            return
          }
          
          // 发送心跳ping消息
          this.ws.send(JSON.stringify({ type: 'ping' }))
          this.lastPingTime = Date.now()
          this.missedPongs++
          console.log(`💓 发送心跳 (未响应计数: ${this.missedPongs})`)
        } catch (error) {
          console.error('发送心跳失败:', error)
          // 发送失败说明连接有问题，关闭重连
          if (this.ws) {
            this.ws.close()
          }
        }
      } else {
        console.warn('WebSocket未处于OPEN状态，停止心跳')
        this.stopHeartbeat()
      }
    }, this.heartbeatInterval)
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  cleanupConnection(notifyHandlers = true) {
    this.stopHeartbeat()
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }

    if (this.ws) {
      const oldWs = this.ws
      this.ws = null
      
      // 移除所有事件监听器，防止意外触发
      try {
        oldWs.onopen = null
        oldWs.onmessage = null
        oldWs.onerror = null
        oldWs.onclose = null
        
        if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) {
          oldWs.close(1000, 'Normal closure') // 使用正常关闭代码
        }
      } catch (error) {
        console.error('关闭WebSocket失败:', error)
      }
    }

    this.isConnecting = false
  }

  sendMessage(message) {
    if (!this.ws) {
      console.warn('WebSocket未初始化')
      return false
    }
    
    if (this.ws.readyState === WebSocket.CONNECTING) {
      console.warn('WebSocket正在连接中，请稍候...')
      return false
    }
    
    if (this.ws.readyState === WebSocket.OPEN) {
      try {
        const data = JSON.stringify(message)
        this.ws.send(data)
        return true
      } catch (error) {
        console.error('发送消息失败:', error)
        return false
      }
    } else {
      console.warn('WebSocket未连接，当前状态:', ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][this.ws.readyState])
      return false
    }
  }

  onMessage(handler) {
    this.messageHandlers.push(handler)
  }

  onConnect(handler) {
    this.connectHandlers.push(handler)
  }

  onDisconnect(handler) {
    this.disconnectHandlers.push(handler)
  }

  disconnect() {
    console.log('手动断开连接')
    this.manualClose = true
    this.shouldReconnect = false
    this.reconnectAttempts = this.maxReconnectAttempts
    this.cleanupConnection()
    this.messageHandlers = []
    this.connectHandlers = []
    this.disconnectHandlers = []
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN
  }

  // 重置重连计数器，允许重新尝试连接
  resetReconnection() {
    this.reconnectAttempts = 0
    this.shouldReconnect = true
    this.manualClose = false
  }
}

export const chatService = new ChatService()
