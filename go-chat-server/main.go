package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/gorilla/websocket"
)

var allowedRooms = map[string]bool{"general": true, "scenery": true, "food": true, "photography": true, "hiking": true, "team": true}
var validMessageID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

// 行程专属聊天室由业务后端动态生成，如 trip-<行程id>。
var validTripRoom = regexp.MustCompile(`^trip-[A-Za-z0-9_-]{1,64}$`)

// 访问令牌由 Node 后端签发，Go 侧只做校验，格式为：
// base64url-nopad(payloadJSON) + "." + base64url-nopad(HMAC-SHA256(secret, payloadB64))。
var errUnauthorizedToken = errors.New("access token rejected")

var eventSequence atomic.Uint64

// newUpgrader 用来源白名单替换无条件的 CheckOrigin:true。
// 未配置 CHAT_ALLOWED_ORIGINS 时默认允许同源与本机开发地址，跨站页面一律拒绝。
func newUpgrader(origins map[string]bool) websocket.Upgrader {
	return websocket.Upgrader{
		HandshakeTimeout: 10 * time.Second,
		CheckOrigin: func(r *http.Request) bool {
			return originAllowed(r, origins)
		},
	}
}

// parseAllowedOrigins 读取逗号分隔的完整来源（scheme://host[:port]），统一小写并去掉尾部斜杠。
func parseAllowedOrigins(raw string) map[string]bool {
	origins := map[string]bool{}
	for _, item := range strings.Split(raw, ",") {
		item = strings.ToLower(strings.TrimRight(strings.TrimSpace(item), "/"))
		if item != "" {
			origins[item] = true
		}
	}
	return origins
}

func isLoopbackHost(host string) bool {
	if host == "localhost" || host == "127.0.0.1" || host == "[::1]" || host == "::1" {
		return true
	}
	return strings.HasPrefix(host, "localhost:") || strings.HasPrefix(host, "127.0.0.1:") || strings.HasPrefix(host, "[::1]:")
}

// originAllowed 的规则：
//  1. 没有 Origin 头的客户端（脚本、服务端）按原有令牌/房间校验放行；
//  2. 配置了 CHAT_ALLOWED_ORIGINS 时只接受列表内的完整来源；
//  3. 未配置时接受同源与本机开发地址（localhost / 127.0.0.1 / ::1）。
//
// 仅依赖 Origin 不足以证明身份，身份仍由令牌或固定房间规则决定。
func originAllowed(r *http.Request, allowed map[string]bool) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	normalized := strings.ToLower(strings.TrimRight(origin, "/"))
	if len(allowed) > 0 {
		return allowed[normalized]
	}
	parsed, err := url.Parse(normalized)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return false
	}
	if strings.EqualFold(parsed.Host, r.Host) {
		return true
	}
	return isLoopbackHost(strings.ToLower(parsed.Host))
}

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

const (
	// accessTokenVersion 是当前唯一支持的令牌版本。
	accessTokenVersion = 1
	// authSecretMinBytes 是非空 CHAT_AUTH_SECRET 的最小长度。
	authSecretMinBytes = 16
	// authClockSkew 容忍客户端与服务器之间 60 秒的时钟偏差。
	authClockSkew = 60 * time.Second
	// maxUsernameRunes 与旧版校验保持一致：用户名最多 30 个字符。
	maxUsernameRunes = 30

	defaultHistoryLimit = 50
	minHistoryLimit     = 1
	maxHistoryLimit     = 100
	historyMaxBytes     = 2 << 20 // 2 MiB
	historyKeepLines    = 500
	historyCacheLines   = 500
)

// historyRecord 是落盘的单条消息。刻意不包含 onlineUsers 这类瞬时状态。
type historyRecord struct {
	ID        string     `json:"id"`
	Type      string     `json:"type"`
	RoomID    string     `json:"roomId"`
	Username  string     `json:"username"`
	Content   string     `json:"content"`
	Timestamp time.Time  `json:"timestamp"`
	UserID    string     `json:"userId"`
	ReplyTo   *Reference `json:"replyTo,omitempty"`
	Mentions  []string   `json:"mentions,omitempty"`
	Reaction  string     `json:"reaction,omitempty"`
}

func newHistoryRecord(message Message) historyRecord {
	return historyRecord{
		ID:        message.ID,
		Type:      message.Type,
		RoomID:    message.RoomID,
		Username:  message.Username,
		Content:   message.Content,
		Timestamp: message.Timestamp,
		UserID:    message.UserID,
		ReplyTo:   message.ReplyTo,
		Mentions:  message.Mentions,
		Reaction:  message.Reaction,
	}
}

// historyCacheEntry 缓存最近解析出的消息行，键为文件大小与修改时间。
type historyCacheEntry struct {
	size     int64
	modified time.Time
	lines    []json.RawMessage
}

// historyStore 负责按房间追加 JSONL 历史并裁剪超大文件。
// 所有文件操作与缓存都由 mu 串行化，确保 -race 下安全。
type historyStore struct {
	dir   string
	mu    sync.Mutex
	sizes map[string]int64
	cache map[string]historyCacheEntry
}

func newHistoryStore(dir string) *historyStore {
	return &historyStore{dir: dir, sizes: make(map[string]int64), cache: make(map[string]historyCacheEntry)}
}

func (s *historyStore) enabled() bool { return s != nil && s.dir != "" }

func (s *historyStore) append(roomID string, message Message) {
	if !s.enabled() || !validRoomID(roomID) {
		return
	}
	line, err := json.Marshal(newHistoryRecord(message))
	if err != nil {
		log.Printf("聊天记录序列化失败: %v", err)
		return
	}
	line = append(line, '\n')

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		log.Printf("聊天记录目录创建失败: %v", err)
		return
	}
	path := filepath.Join(s.dir, roomID+".jsonl")
	size, known := s.sizes[path]
	if !known {
		if info, statErr := os.Stat(path); statErr == nil {
			size = info.Size()
		}
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		log.Printf("聊天记录打开失败: %v", err)
		delete(s.sizes, path)
		return
	}
	written, writeErr := file.Write(line)
	closeErr := file.Close()
	if writeErr == nil {
		writeErr = closeErr
	}
	if writeErr != nil {
		// 写入失败不能让广播失败，只记录日志并让下次重新统计文件大小。
		log.Printf("聊天记录写入失败: %v", writeErr)
		delete(s.sizes, path)
		return
	}
	size += int64(written)
	s.sizes[path] = size
	delete(s.cache, roomID)
	if size > historyMaxBytes {
		s.trimLocked(path)
	}
}

// trimLocked 将文件重写为最后 historyKeepLines 行，调用方必须持有 mu。
func (s *historyStore) trimLocked(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		log.Printf("聊天记录裁剪读取失败: %v", err)
		return
	}
	lines := splitHistoryLines(data)
	if len(lines) <= historyKeepLines {
		s.sizes[path] = int64(len(data))
		return
	}
	kept := lines[len(lines)-historyKeepLines:]
	var buf bytes.Buffer
	for _, line := range kept {
		buf.Write(line)
		buf.WriteByte('\n')
	}
	temp, err := os.CreateTemp(s.dir, ".history-*.tmp")
	if err != nil {
		log.Printf("聊天记录裁剪临时文件创建失败: %v", err)
		return
	}
	tempName := temp.Name()
	if _, err := temp.Write(buf.Bytes()); err != nil {
		temp.Close()
		os.Remove(tempName)
		log.Printf("聊天记录裁剪写入失败: %v", err)
		return
	}
	if err := temp.Chmod(0o600); err != nil {
		log.Printf("聊天记录裁剪设置权限失败: %v", err)
	}
	if err := temp.Close(); err != nil {
		os.Remove(tempName)
		log.Printf("聊天记录裁剪关闭失败: %v", err)
		return
	}
	if err := os.Rename(tempName, path); err != nil {
		os.Remove(tempName)
		log.Printf("聊天记录裁剪替换失败: %v", err)
		return
	}
	s.sizes[path] = int64(buf.Len())
	delete(s.cache, strings.TrimSuffix(filepath.Base(path), ".jsonl"))
}

// recent 返回最近 limit 条消息（从旧到新），limit 已在入口处裁剪。
func (s *historyStore) recent(roomID string, limit int) []json.RawMessage {
	if !s.enabled() || !validRoomID(roomID) || limit < 1 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return tailHistoryLines(s.historyLinesLocked(roomID), limit)
}

// recentAfter 返回游标之后的消息（从旧到新），用于断线重连后的补收。
// 游标按消息 ID 定位：游标不存在（例如已被裁剪）时退回最近 limit 条，
// 客户端按消息 ID 去重后再以最后一条继续翻页。
func (s *historyStore) recentAfter(roomID, afterID string, limit int) []json.RawMessage {
	if !s.enabled() || !validRoomID(roomID) || limit < 1 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	lines := s.historyLinesLocked(roomID)
	if afterID == "" {
		return tailHistoryLines(lines, limit)
	}
	found := -1
	for i := len(lines) - 1; i >= 0; i-- {
		var record struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(lines[i], &record) == nil && record.ID == afterID {
			found = i
			break
		}
	}
	if found < 0 {
		return tailHistoryLines(lines, limit)
	}
	start := found + 1
	if start >= len(lines) {
		return nil
	}
	end := start + limit
	if end > len(lines) {
		end = len(lines)
	}
	out := make([]json.RawMessage, end-start)
	copy(out, lines[start:end])
	return out
}

// historyLinesLocked 读取并缓存房间的历史行，调用方必须持有 mu。
func (s *historyStore) historyLinesLocked(roomID string) []json.RawMessage {
	path := filepath.Join(s.dir, roomID+".jsonl")
	info, err := os.Stat(path)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("聊天记录状态读取失败: %v", err)
		}
		return nil
	}
	if entry, ok := s.cache[roomID]; ok && entry.size == info.Size() && entry.modified.Equal(info.ModTime()) {
		return entry.lines
	}
	data, err := os.ReadFile(path)
	if err != nil {
		log.Printf("聊天记录读取失败: %v", err)
		return nil
	}
	rawLines := splitHistoryLines(data)
	lines := make([]json.RawMessage, 0, len(rawLines))
	for _, line := range rawLines {
		if !json.Valid(line) {
			continue
		}
		lines = append(lines, json.RawMessage(line))
	}
	if len(lines) > historyCacheLines {
		lines = lines[len(lines)-historyCacheLines:]
	}
	s.cache[roomID] = historyCacheEntry{size: info.Size(), modified: info.ModTime(), lines: lines}
	return lines
}

func tailHistoryLines(lines []json.RawMessage, limit int) []json.RawMessage {
	if limit > len(lines) {
		limit = len(lines)
	}
	if limit <= 0 {
		return nil
	}
	out := make([]json.RawMessage, limit)
	copy(out, lines[len(lines)-limit:])
	return out
}

// splitHistoryLines 按行切分并丢弃空行（含文件末尾换行）。
func splitHistoryLines(data []byte) [][]byte {
	parts := bytes.Split(data, []byte{'\n'})
	lines := make([][]byte, 0, len(parts))
	for _, part := range parts {
		part = bytes.TrimRight(part, "\r")
		if len(bytes.TrimSpace(part)) == 0 {
			continue
		}
		lines = append(lines, part)
	}
	return lines
}

// validRoomID 允许固定房间与行程房间；其他一律拒绝。
func validRoomID(roomID string) bool {
	return allowedRooms[roomID] || validTripRoom.MatchString(roomID)
}

func isTripRoom(roomID string) bool {
	return strings.HasPrefix(roomID, "trip-") && validTripRoom.MatchString(roomID)
}

func validAuthSecret(secret string) bool {
	return len([]byte(secret)) >= authSecretMinBytes
}

// accessTokenPayload 是 Node 后端签发的令牌载荷。
type accessTokenPayload struct {
	Version int    `json:"v"`
	Subject string `json:"sub"`
	Name    string `json:"name"`
	Room    string `json:"room"`
	Expiry  int64  `json:"exp"`
}

func signAccessTokenPayload(secret, payloadB64 string) []byte {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payloadB64))
	return mac.Sum(nil)
}

func verifyAccessToken(token, secret string) (accessTokenPayload, error) {
	var payload accessTokenPayload
	if !validAuthSecret(secret) {
		return payload, errUnauthorizedToken
	}
	payloadB64, signatureB64, found := strings.Cut(token, ".")
	if !found || payloadB64 == "" || signatureB64 == "" || strings.Contains(signatureB64, ".") {
		return payload, errUnauthorizedToken
	}
	rawPayload, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return payload, errUnauthorizedToken
	}
	signature, err := base64.RawURLEncoding.DecodeString(signatureB64)
	if err != nil {
		return payload, errUnauthorizedToken
	}
	if !hmac.Equal(signature, signAccessTokenPayload(secret, payloadB64)) {
		return payload, errUnauthorizedToken
	}
	if err := json.Unmarshal(rawPayload, &payload); err != nil {
		return accessTokenPayload{}, errUnauthorizedToken
	}
	if payload.Version != accessTokenVersion {
		return accessTokenPayload{}, errUnauthorizedToken
	}
	if !validMessageID.MatchString(payload.Subject) {
		return accessTokenPayload{}, errUnauthorizedToken
	}
	if !validRoomID(payload.Room) {
		return accessTokenPayload{}, errUnauthorizedToken
	}
	if utf8.RuneCountInString(payload.Name) > maxUsernameRunes {
		return accessTokenPayload{}, errUnauthorizedToken
	}
	if time.Now().Unix() > payload.Expiry+int64(authClockSkew/time.Second) {
		return accessTokenPayload{}, errUnauthorizedToken
	}
	return payload, nil
}

func unauthorized(w http.ResponseWriter) {
	http.Error(w, "未授权", http.StatusUnauthorized)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	raw, err := json.Marshal(body)
	if err != nil {
		http.Error(w, "服务器内部错误", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if _, err := w.Write(raw); err != nil {
		return
	}
}

func clampHistoryLimit(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return defaultHistoryLimit
	}
	limit, err := strconv.Atoi(raw)
	if err != nil {
		return defaultHistoryLimit
	}
	if limit < minHistoryLimit {
		return minHistoryLimit
	}
	if limit > maxHistoryLimit {
		return maxHistoryLimit
	}
	return limit
}

type historyResponse struct {
	RoomID   string            `json:"roomId"`
	Messages []json.RawMessage `json:"messages"`
}

// applyHistoryCORS 允许白名单内的页面直接读取历史接口；未通过来源校验时不写响应头。
// 身份仍由行程房间令牌校验，CORS 只解决浏览器跨源读取。
func applyHistoryCORS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" || !originAllowed(r, hub.allowedOrigins) {
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
}

// serveHistory 返回最近消息或游标之后的消息（从旧到新），供客户端首次加载与断线重连后补收。
func serveHistory(hub *Hub, w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		applyHistoryCORS(hub, w, r)
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	applyHistoryCORS(hub, w, r)
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "仅支持 GET"})
		return
	}
	if !hub.history.enabled() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "聊天记录存储未配置"})
		return
	}
	query := r.URL.Query()
	roomID := query.Get("roomId")
	if hub.authSecret != "" {
		if !validAuthSecret(hub.authSecret) {
			unauthorized(w)
			return
		}
		// 行程房间必须携带与房间匹配的令牌；固定房间保持无令牌模式，
		// 如果主动携带令牌则仍按令牌校验，避免伪造身份。
		if isTripRoom(roomID) || query.Get("token") != "" {
			payload, err := verifyAccessToken(query.Get("token"), hub.authSecret)
			if err != nil || payload.Room != roomID {
				unauthorized(w)
				return
			}
			// 被移出协作空间的账号不能再用旧令牌读取该行程的聊天记录。
			if hub.isRevoked(roomID, payload.Subject) {
				http.Error(w, "已被移出该行程的协作空间", http.StatusForbidden)
				return
			}
		}
	}
	if roomID == "" {
		http.Error(w, "缺少聊天室", http.StatusBadRequest)
		return
	}
	if !validRoomID(roomID) {
		http.Error(w, "未知聊天室", http.StatusBadRequest)
		return
	}
	afterID := strings.TrimSpace(query.Get("afterId"))
	if afterID != "" && !validMessageID.MatchString(afterID) {
		http.Error(w, "补收游标无效", http.StatusBadRequest)
		return
	}
	messages := hub.history.recentAfter(roomID, afterID, clampHistoryLimit(query.Get("limit")))
	if messages == nil {
		messages = []json.RawMessage{}
	}
	writeJSON(w, http.StatusOK, historyResponse{RoomID: roomID, Messages: messages})
}

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

// revokeRequest 由管理端请求，经事件循环关闭指定房间内某个账号的所有连接。
type revokeRequest struct {
	roomID  string
	userID  string
	revoked bool
	result  chan int
}

// 连接、房间在线状态和短期消息去重缓存都仅由事件循环修改。
type Hub struct {
	clients     map[*Client]bool
	broadcast   chan incomingMessage
	register    chan *Client
	unregister  chan *Client
	revoke      chan revokeRequest
	done        chan struct{}
	stopOne     sync.Once
	recent      map[string]Message
	recentOrder []string
	// authSecret 与 history 在启动（newHub）时从环境变量读取，之后只读。
	authSecret  string
	adminSecret string
	history     *historyStore
	// revoked 记录被移出协作空间的连接身份（房间+账号），有效期覆盖令牌剩余寿命，
	// 由 revokedMu 保护，供握手阶段（事件循环之外）读取。
	revoked   map[string]time.Time
	revokedMu sync.Mutex
	// upgrader 与 allowedOrigins 在启动时按 CHAT_ALLOWED_ORIGINS 构造，之后只读。
	upgrader       websocket.Upgrader
	allowedOrigins map[string]bool
}

// revokeHold 比令牌有效期（15 分钟）多留一分钟余量：
// 被移除成员持有的旧令牌在此期间全部失效，过期后记录自动清理。
const revokeHold = 16 * time.Minute

func revokeKey(roomID, userID string) string { return roomID + "\x00" + userID }

// markRevoked 记录一次成员移除，并顺带清理已过期的记录。
func (h *Hub) markRevoked(roomID, userID string) {
	now := time.Now()
	h.revokedMu.Lock()
	defer h.revokedMu.Unlock()
	for key, until := range h.revoked {
		if !until.After(now) {
			delete(h.revoked, key)
		}
	}
	h.revoked[revokeKey(roomID, userID)] = now.Add(revokeHold)
}

// clearRevoked 在账号重新加入协作空间时恢复其聊天权限，避免误伤。
func (h *Hub) clearRevoked(roomID, userID string) {
	h.revokedMu.Lock()
	defer h.revokedMu.Unlock()
	delete(h.revoked, revokeKey(roomID, userID))
}

// isRevoked 判断该房间内的该账号是否仍在撤销有效期内。
func (h *Hub) isRevoked(roomID, userID string) bool {
	key := revokeKey(roomID, userID)
	h.revokedMu.Lock()
	defer h.revokedMu.Unlock()
	until, ok := h.revoked[key]
	if !ok {
		return false
	}
	if !until.After(time.Now()) {
		delete(h.revoked, key)
		return false
	}
	return true
}

func newHub() *Hub {
	origins := parseAllowedOrigins(os.Getenv("CHAT_ALLOWED_ORIGINS"))
	return &Hub{
		clients:        make(map[*Client]bool),
		broadcast:      make(chan incomingMessage),
		register:       make(chan *Client),
		unregister:     make(chan *Client),
		revoke:         make(chan revokeRequest),
		done:           make(chan struct{}),
		recent:         make(map[string]Message),
		authSecret:     os.Getenv("CHAT_AUTH_SECRET"),
		adminSecret:    os.Getenv("CHAT_ADMIN_SECRET"),
		history:        newHistoryStore(os.Getenv("CHAT_HISTORY_DIR")),
		revoked:        make(map[string]time.Time),
		upgrader:       newUpgrader(origins),
		allowedOrigins: origins,
	}
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
			// 握手校验与撤销可能并发：事件循环再确认一次，避免刚被移出的账号挤进房间。
			if h.isRevoked(client.roomID, client.userID) {
				client.close()
				continue
			}
			h.clients[client] = true
			h.broadcastMessage(h.presence(client, "join"))
		case client := <-h.unregister:
			if h.clients[client] {
				delete(h.clients, client)
				client.close()
				h.broadcastMessage(h.presence(client, "leave"))
			}
		case request := <-h.revoke:
			// 先记录撤销身份，再断开现有连接：握手是并发进行的，
			// 若顺序相反，正在重连的旧令牌可能在新连接建立后才被记入。
			if request.revoked {
				h.markRevoked(request.roomID, request.userID)
			} else {
				h.clearRevoked(request.roomID, request.userID)
			}
			revoked := 0
			for client := range h.clients {
				if client.roomID != request.roomID || client.userID != request.userID {
					continue
				}
				delete(h.clients, client)
				client.close()
				h.broadcastMessage(h.presence(client, "leave"))
				revoked++
			}
			if request.result != nil {
				request.result <- revoked
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
			// 仅持久化真正的聊天消息；typing/reaction 已在上面分流，join/leave/pong/error 不走这里。
			if msg.Type == "message" {
				h.history.append(msg.RoomID, msg)
			}
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
	var roomID, username, userID string
	query := r.URL.Query()
	roomID = query.Get("roomId")
	if hub.authSecret != "" {
		if !validAuthSecret(hub.authSecret) {
			log.Printf("CHAT_AUTH_SECRET 长度不足 %d 字节，拒绝连接", authSecretMinBytes)
			unauthorized(w)
			return
		}
		// 行程房间必须使用令牌，身份与房间完全来自签名载荷。
		// 固定房间保持无令牌模式；若客户端携带令牌，则以令牌为准。
		token := query.Get("token")
		if token != "" || isTripRoom(roomID) || roomID == "" {
			payload, err := verifyAccessToken(token, hub.authSecret)
			if err != nil {
				unauthorized(w)
				return
			}
			if isTripRoom(roomID) && payload.Room != roomID {
				unauthorized(w)
				return
			}
			roomID, userID, username = payload.Room, payload.Subject, payload.Name
			if username == "" {
				username = "成员"
			}
		} else {
			if !validRoomID(roomID) {
				http.Error(w, "未知聊天室", http.StatusBadRequest)
				return
			}
			username, userID = query.Get("username"), query.Get("userId")
			if username == "" {
				username = "游客"
			}
			if userID == "" {
				userID = newEventID()
			}
			if utf8.RuneCountInString(username) > maxUsernameRunes || !validMessageID.MatchString(userID) {
				http.Error(w, "用户信息无效", http.StatusBadRequest)
				return
			}
		}
	} else {
		if roomID == "" {
			roomID = "general"
		}
		if !validRoomID(roomID) {
			http.Error(w, "未知聊天室", http.StatusBadRequest)
			return
		}
		// 旧版模式：与历史行为保持一致，查询参数即身份。
		username, userID = query.Get("username"), query.Get("userId")
		if username == "" {
			username = "游客"
		}
		if userID == "" {
			userID = newEventID()
		}
		if utf8.RuneCountInString(username) > maxUsernameRunes || !validMessageID.MatchString(userID) {
			http.Error(w, "用户信息无效", http.StatusBadRequest)
			return
		}
	}
	// 被移出协作空间的账号即使仍持有未过期的令牌，也不能重新连入该行程聊天室。
	if hub.isRevoked(roomID, userID) {
		http.Error(w, "已被移出该行程的协作空间", http.StatusForbidden)
		return
	}
	conn, err := hub.upgrader.Upgrade(w, r, nil)
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

// serveRevoke 是仅供业务后端调用的内部接口：成员被移除后立即断开其同行聊天连接。
// 即使该调用失败，旧令牌也会在签发后的有效期内自然过期，而成员已无法再获取新令牌。
func serveRevoke(hub *Hub, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "仅支持 POST"})
		return
	}
	if !validAuthSecret(hub.adminSecret) {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "聊天撤销接口未配置"})
		return
	}
	provided := r.Header.Get("X-Chat-Admin-Secret")
	if subtle.ConstantTimeCompare([]byte(provided), []byte(hub.adminSecret)) != 1 {
		unauthorized(w)
		return
	}
	var body struct {
		RoomID  string `json:"roomId"`
		UserID  string `json:"userId"`
		Revoked *bool  `json:"revoked"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	if err := decoder.Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "请求体无效"})
		return
	}
	if !isTripRoom(body.RoomID) || !validMessageID.MatchString(body.UserID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "仅支持撤销行程房间内的有效账号"})
		return
	}
	request := revokeRequest{roomID: body.RoomID, userID: body.UserID, revoked: true, result: make(chan int, 1)}
	if body.Revoked != nil {
		request.revoked = *body.Revoked
	}
	select {
	case hub.revoke <- request:
	case <-hub.done:
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "聊天服务正在关闭"})
		return
	case <-time.After(2 * time.Second):
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "聊天服务繁忙，请稍后重试"})
		return
	}
	select {
	case count := <-request.result:
		writeJSON(w, http.StatusOK, map[string]int{"revoked": count})
	case <-hub.done:
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "聊天服务正在关闭"})
	case <-time.After(2 * time.Second):
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "聊天服务繁忙，请稍后重试"})
	}
}

func main() {
	secret := os.Getenv("CHAT_AUTH_SECRET")
	if secret != "" && !validAuthSecret(secret) {
		log.Fatalf("CHAT_AUTH_SECRET 至少需要 %d 字节", authSecretMinBytes)
	}
	if secret == "" {
		log.Println("聊天鉴权未启用（旧版模式：信任查询参数）")
	} else {
		log.Println("聊天鉴权已启用（令牌模式）")
	}
	hub := newHub()
	if hub.history.enabled() {
		log.Printf("聊天记录存储目录: %s", hub.history.dir)
	}
	if len(hub.allowedOrigins) > 0 {
		origins := make([]string, 0, len(hub.allowedOrigins))
		for origin := range hub.allowedOrigins {
			origins = append(origins, origin)
		}
		sort.Strings(origins)
		log.Printf("聊天来源白名单: %s", strings.Join(origins, ", "))
	} else {
		log.Println("聊天来源策略: 同源 + localhost/127.0.0.1（未配置 CHAT_ALLOWED_ORIGINS）")
	}
	go hub.run()
	defer hub.stop()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) { serveWs(hub, w, r) })
	mux.HandleFunc("/history", func(w http.ResponseWriter, r *http.Request) { serveHistory(hub, w, r) })
	mux.HandleFunc("/internal/revoke", func(w http.ResponseWriter, r *http.Request) { serveRevoke(hub, w, r) })
	if validAuthSecret(hub.adminSecret) {
		log.Println("聊天撤销接口已启用（/internal/revoke）")
	} else {
		log.Println("聊天撤销接口未启用（CHAT_ADMIN_SECRET 未配置或少于 16 字节）")
	}
	log.Println("WebSocket 聊天服务器已启动，监听 :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
