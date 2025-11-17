package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	HandshakeTimeout: 10 * time.Second,
	ReadBufferSize:   1024,
	WriteBufferSize:  1024,
}

// Message 表示聊天消息
type Message struct {
	Type      string    `json:"type"` // message, join, leave
	Username  string    `json:"username"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
	UserID    string    `json:"userId"`
}

// Client 表示一个WebSocket客户端
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	username string
	userID   string
}

// Hub 管理所有活跃的客户端
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
}

func newHub() *Hub {
	return &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			// 广播用户加入消息
			msg := Message{
				Type:      "join",
				Username:  client.username,
				Content:   client.username + " 加入了聊天室",
				Timestamp: time.Now(),
				UserID:    client.userID,
			}
			msgBytes, _ := json.Marshal(msg)
			h.broadcast <- msgBytes

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				// 广播用户离开消息
				msg := Message{
					Type:      "leave",
					Username:  client.username,
					Content:   client.username + " 离开了聊天室",
					Timestamp: time.Now(),
					UserID:    client.userID,
				}
				msgBytes, _ := json.Marshal(msg)
				h.broadcast <- msgBytes
			}

		case message := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.send <- message:
					// Successfully sent
				default:
					// Channel full, skip this client without blocking
					log.Printf("WARNING: Channel full for %s, dropping message", client.username)
				}
			}
		}
	}
}

func (c *Client) readPump() {
	defer func() {
		log.Printf("Client %s readPump exiting", c.username)
		c.hub.unregister <- c
		c.conn.Close()
	}()

	// 禁用读取超时 - 依赖ping/pong保持连接
	c.conn.SetReadDeadline(time.Time{})

	// 设置pong处理器
	c.conn.SetPongHandler(func(string) error {
		log.Printf("Received pong from %s", c.username)
		return nil
	})

	// 设置最大消息大小
	c.conn.SetReadLimit(512 * 1024) // 512KB

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure, websocket.CloseNormalClosure) {
				log.Printf("ERROR: Unexpected close for %s: %v", c.username, err)
			} else {
				log.Printf("Client %s disconnected normally", c.username)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Error unmarshaling message from %s: %v", c.username, err)
			continue
		}

		// 处理ping消息（心跳）
		if msg.Type == "ping" {
			log.Printf("Received ping from %s", c.username)
			continue
		}

		// 设置时间戳和用户信息
		msg.Timestamp = time.Now()
		msg.Username = c.username
		msg.UserID = c.userID

		msgBytes, err := json.Marshal(msg)
		if err != nil {
			log.Printf("Error marshaling message: %v", err)
			continue
		}

		// 异步发送到广播频道，避免阻塞
		select {
		case c.hub.broadcast <- msgBytes:
		default:
			log.Printf("WARNING: Broadcast channel full, dropping message from %s", c.username)
		}
	}
}

func (c *Client) writePump() {
	// 每20秒发送一次ping，保持连接活跃
	pingTicker := time.NewTicker(20 * time.Second)
	defer func() {
		pingTicker.Stop()
		log.Printf("Client %s writePump exiting", c.username)
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				// Hub关闭了通道
				log.Printf("Send channel closed for %s", c.username)
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				log.Printf("Error getting writer for %s: %v", c.username, err)
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				log.Printf("Error closing writer for %s: %v", c.username, err)
				return
			}

		case <-pingTicker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("Error sending ping to %s: %v", c.username, err)
				return
			}
			log.Printf("Sent ping to %s", c.username)
		}
	}
}

func serveWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	username := r.URL.Query().Get("username")
	userID := r.URL.Query().Get("userId")

	if username == "" {
		username = "用户" + time.Now().Format("150405")
	}
	if userID == "" {
		userID = time.Now().Format("20060102150405")
	}

	// 增加发送缓冲区大小，减少阻塞
	client := &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 1024),
		username: username,
		userID:   userID,
	}

	log.Printf("New client connected: %s (ID: %s)", username, userID)
	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	hub := newHub()
	go hub.run()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})

	handler := enableCORS(mux)

	log.Println("WebSocket 聊天服务器已启动")
	err := http.ListenAndServe(":8080", handler)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
