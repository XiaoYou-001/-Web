package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/gorilla/websocket"
)

var allowedRooms = map[string]bool{"general": true, "scenery": true, "food": true, "photography": true, "hiking": true, "team": true}
var validMessageID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
var eventSequence atomic.Uint64
var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }, HandshakeTimeout: 10 * time.Second}

// Reference 表示一条消息引用的原文（回复/引用功能）。
type Reference struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Content  string `json:"content"`
}

type Message struct {
	ID          string     `json:"id"`
	Type        string     `json:"type"`
	RoomID      string     `json:"roomId"`
	Username    string     `json:"username"`
	Content     string     `json:"content"`
	Timestamp   time.Time  `json:"timestamp"`
	UserID      string     `json:"userId"`
	OnlineUsers int        `json:"onlineUsers"`
	ReplyTo     *Reference `json:"replyTo,omitempty"`
	Mentions    []string   `json:"mentions,omitempty"`
	Reaction    string     `json:"reaction,omitempty"`
}

const typingThrottle = 1500 * time.Millisecond
const reactionMaxLen = 64

type Client struct {
	hub        *Hub
	conn       *websocket.Conn
	send       chan []byte
	done       chan struct{}
	closeOne   sync.Once
	username   string
	userID     string
	roomID     string
	lastTyping time.Time
}

func (c *Client) close() {
	c.closeOne.Do(func() {
		close(c.done)
		if c.conn != nil {
			c.conn.Close()
		}
	})
}

type incomingMessage struct {
	client  *Client
	message Message
}

// 连接、房间在线状态和短期消息去重缓存都仅由事件循环修改。
type Hub struct {
	clients     map[*Client]bool
	broadcast   chan incomingMessage
	register    chan *Client
	unregister  chan *Client
	done        chan struct{}
	stopOne     sync.Once
	recent      map[string]Message
	recentOrder []string
}

func newHub() *Hub {
	return &Hub{clients: make(map[*Client]bool), broadcast: make(chan incomingMessage), register: make(chan *Client), unregister: make(chan *Client), done: make(chan struct{}), recent: make(map[string]Message)}
}

func (h *Hub) stop() { h.stopOne.Do(func() { close(h.done) }) }
func newEventID() string {
	return fmt.Sprintf("event-%d-%d", time.Now().UnixNano(), eventSequence.Add(1))
}

func (h *Hub) onlineUsers(roomID string) int {
	users := make(map[string]bool)
	for client := range h.clients {
		select {
		case <-client.done:
			continue
		default:
		}
		if client.roomID == roomID {
			users[client.userID] = true
		}
	}
	return len(users)
}

func (h *Hub) presence(client *Client, kind string) Message {
	content := client.username + " 加入了聊天室"
	if kind == "leave" {
		content = client.username + " 离开了聊天室"
	}
	return Message{ID: newEventID(), Type: kind, RoomID: client.roomID, Username: client.username, UserID: client.userID, Content: content, Timestamp: time.Now(), OnlineUsers: h.onlineUsers(client.roomID)}
}

func (h *Hub) run() {
	for {
		select {
		case <-h.done:
			for client := range h.clients {
				client.close()
			}
			return
		case client := <-h.register:
			h.clients[client] = true
			h.broadcastMessage(h.presence(client, "join"))
		case client := <-h.unregister:
			if h.clients[client] {
				delete(h.clients, client)
				client.close()
				h.broadcastMessage(h.presence(client, "leave"))
			}
		case incoming := <-h.broadcast:
			if !h.clients[incoming.client] {
				continue
			}
			msg := incoming.message
			// 以连接所属房间和身份为准，不能通过消息体跨房间广播。
			msg.RoomID, msg.UserID, msg.Username = incoming.client.roomID, incoming.client.userID, incoming.client.username
			msg.OnlineUsers = 0
			// 轻量事件（正在输入 / 表情回应）不进历史去重缓存，直接广播。
			if msg.Type == "typing" || msg.Type == "reaction" {
				if msg.Type == "reaction" && (strings.TrimSpace(msg.Content) == "" || utf8.RuneCountInString(msg.Content) > reactionMaxLen) {
					continue
				}
				h.broadcastMessage(msg)
				continue
			}
			key := msg.RoomID + "\x00" + msg.UserID + "\x00" + msg.ID
			if previous, ok := h.recent[key]; ok {
				// 重发只向发送者回执，其他用户不会重复收到。
				h.sendMessage(incoming.client, previous)
				continue
			}
			msg.Timestamp = time.Now()
			h.recent[key] = msg
			h.recentOrder = append(h.recentOrder, key)
			if len(h.recentOrder) > 2048 {
				delete(h.recent, h.recentOrder[0])
				h.recentOrder = h.recentOrder[1:]
			}
			h.broadcastMessage(msg)
		}
	}
}

func (h *Hub) sendMessage(client *Client, message Message) {
	raw, err := json.Marshal(message)
	if err != nil {
		return
	}
	select {
	case <-client.done:
	case client.send <- raw:
	default:
		// 不向慢连接静默丢消息，让客户端断开后明确重连。
		client.close()
	}
}

func (h *Hub) broadcastMessage(message Message) {
	for client := range h.clients {
		if client.roomID == message.RoomID {
			h.sendMessage(client, message)
		}
	}
}

// sendTyping 向整个房间广播“正在输入”状态，按客户端节流，避免刷屏。
// 事件经 h.broadcast 交给事件循环，避免并发读取 h.clients。
func (h *Hub) sendTyping(client *Client) {
	if time.Since(client.lastTyping) < typingThrottle {
		return
	}
	client.lastTyping = time.Now()
	event := Message{Type: "typing", RoomID: client.roomID, Username: client.username, UserID: client.userID, Content: client.username + " 正在输入…", Timestamp: time.Now()}
	select {
	case h.broadcast <- incomingMessage{client: client, message: event}:
	case <-client.done:
	case <-h.done:
	}
}

// broadcastReaction 广播一条轻量的表情回应事件（不进入历史去重缓存）。
func (h *Hub) broadcastReaction(client *Client, msg Message) {
	content := strings.TrimSpace(msg.Content)
	if content == "" || utf8.RuneCountInString(content) > reactionMaxLen {
		return
	}
	// 让发送者也收到自己的回应，便于即时回显；Reaction 字段标记所回应的消息 id。
	event := Message{ID: newEventID(), Type: "reaction", RoomID: client.roomID, Username: client.username, UserID: client.userID, Content: content, Timestamp: time.Now(), Reaction: msg.Reaction}
	select {
	case h.broadcast <- incomingMessage{client: client, message: event}:
	case <-client.done:
	case <-h.done:
	}
}

func (c *Client) readPump() {
	defer func() {
		c.close()
		select {
		case c.hub.unregister <- c:
		case <-c.hub.done:
		}
	}()
	const pongWait = 60 * time.Second
	c.conn.SetReadLimit(16 * 1024)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error { return c.conn.SetReadDeadline(time.Now().Add(pongWait)) })
	for {
		var msg Message
		if err := c.conn.ReadJSON(&msg); err != nil {
			return
		}
		if msg.Type == "ping" {
			c.hub.sendMessage(c, Message{Type: "pong", RoomID: c.roomID})
			continue
		}
		switch msg.Type {
		case "typing":
			c.hub.sendTyping(c)
			continue
		case "reaction":
			c.hub.broadcastReaction(c, msg)
			continue
		case "message":
			// 走下面的校验与广播
		default:
			continue
		}
		if msg.ID == "" {
			msg.ID = newEventID()
		}
		if !validMessageID.MatchString(msg.ID) || strings.TrimSpace(msg.Content) == "" || utf8.RuneCountInString(msg.Content) > 2000 {
			c.hub.sendMessage(c, Message{ID: msg.ID, Type: "error", RoomID: c.roomID, Content: "消息无效，内容需为1至2000个字符"})
			continue
		}
		select {
		case c.hub.broadcast <- incomingMessage{client: c, message: msg}:
		case <-c.done:
			return
		case <-c.hub.done:
			return
		}
	}
}

func (c *Client) writePump() {
	pingTicker := time.NewTicker(20 * time.Second)
	defer func() { pingTicker.Stop(); c.close() }()
	for {
		select {
		case <-c.done:
			return
		case raw := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.TextMessage, raw); err != nil {
				return
			}
		case <-pingTicker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func serveWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("roomId")
	if roomID == "" {
		roomID = "general"
	}
	if !allowedRooms[roomID] {
		http.Error(w, "未知聊天室", http.StatusBadRequest)
		return
	}
	username, userID := r.URL.Query().Get("username"), r.URL.Query().Get("userId")
	if username == "" {
		username = "游客"
	}
	if userID == "" {
		userID = newEventID()
	}
	if utf8.RuneCountInString(username) > 30 || !validMessageID.MatchString(userID) {
		http.Error(w, "用户信息无效", http.StatusBadRequest)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	client := &Client{hub: hub, conn: conn, send: make(chan []byte, 128), done: make(chan struct{}), username: username, userID: userID, roomID: roomID}
	select {
	case hub.register <- client:
		go client.writePump()
		go client.readPump()
	case <-hub.done:
		client.close()
	}
}

func main() {
	hub := newHub()
	go hub.run()
	defer hub.stop()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) { serveWs(hub, w, r) })
	log.Println("WebSocket 聊天服务器已启动，监听 :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
