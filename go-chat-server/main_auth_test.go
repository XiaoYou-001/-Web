package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// testTokenSecret 是一个满足 16 字节下限的测试密钥。
const testTokenSecret = "go-test-secret-0123456789"

// makeTestToken 按 Node 后端的约定签发令牌，独立于被测代码实现，避免"实现与测试同错"。
func makeTestToken(t *testing.T, secret string, payload accessTokenPayload) string {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	payloadB64 := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payloadB64))
	return payloadB64 + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func testAccessPayload() accessTokenPayload {
	return accessTokenPayload{Version: 1, Subject: "account-1", Name: "真实用户", Room: "general", Expiry: time.Now().Add(time.Hour).Unix()}
}

func testWsURL(serverURL, path string) string {
	return "ws" + strings.TrimPrefix(serverURL, "http") + path
}

// testChatServer 挂载 /ws 与 /history，等价于 main 中的路由。
func testChatServer(t *testing.T, hub *Hub) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) { serveWs(hub, w, r) })
	mux.HandleFunc("/history", func(w http.ResponseWriter, r *http.Request) { serveHistory(hub, w, r) })
	mux.HandleFunc("/internal/revoke", func(w http.ResponseWriter, r *http.Request) { serveRevoke(hub, w, r) })
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func startTestChatServer(t *testing.T) (*Hub, *httptest.Server) {
	t.Helper()
	hub := startTestHub(t)
	return hub, testChatServer(t, hub)
}

func dialTokenClient(t *testing.T, serverURL, token string) *websocket.Conn {
	t.Helper()
	conn, resp, err := websocket.DefaultDialer.Dial(testWsURL(serverURL, "/ws?token="+url.QueryEscape(token)), nil)
	if err != nil {
		if resp != nil {
			resp.Body.Close()
		}
		t.Fatalf("dial with token failed: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

// dialRejectedToken 断言握手被拒绝并返回状态码与响应体。
func dialRejectedToken(t *testing.T, serverURL, token string) (int, string) {
	t.Helper()
	conn, resp, err := websocket.DefaultDialer.Dial(testWsURL(serverURL, "/ws?token="+url.QueryEscape(token)), nil)
	if conn != nil {
		conn.Close()
	}
	if err == nil {
		t.Fatal("handshake unexpectedly succeeded")
	}
	if resp == nil {
		t.Fatalf("missing handshake response: %v", err)
	}
	defer resp.Body.Close()
	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		t.Fatalf("read handshake body: %v", readErr)
	}
	return resp.StatusCode, string(body)
}

type historyPayload struct {
	RoomID   string    `json:"roomId"`
	Messages []Message `json:"messages"`
}

func fetchHistory(t *testing.T, serverURL, query string) (int, historyPayload, string) {
	t.Helper()
	response, err := http.Get(serverURL + "/history?" + query)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	var payload historyPayload
	if response.StatusCode == http.StatusOK {
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("history body %q: %v", raw, err)
		}
	}
	return response.StatusCode, payload, string(raw)
}

// waitForHistoryMessages 轮询等待持久化落盘；广播与落盘并非同一原子步骤。
func waitForHistoryMessages(t *testing.T, serverURL, roomID string, want int) historyPayload {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		status, payload, body := fetchHistory(t, serverURL, "roomId="+url.QueryEscape(roomID)+"&limit=100")
		if status == http.StatusOK && len(payload.Messages) >= want {
			return payload
		}
		if time.Now().After(deadline) {
			t.Fatalf("history for %q never reached %d messages (status %d, body %q)", roomID, want, status, body)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestAccessTokenEstablishesIdentityAndRoom(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", testTokenSecret)
	t.Setenv("CHAT_HISTORY_DIR", "")
	_, server := startTestChatServer(t)

	token := makeTestToken(t, testTokenSecret, testAccessPayload())
	// 查询参数刻意与令牌冲突：身份与房间必须以令牌为准。
	conn, resp, err := websocket.DefaultDialer.Dial(
		testWsURL(server.URL, "/ws?token="+url.QueryEscape(token)+"&userId=forged&username=伪造用户&roomId=food"), nil)
	if err != nil {
		if resp != nil {
			resp.Body.Close()
		}
		t.Fatalf("dial with valid token: %v", err)
	}
	defer conn.Close()

	join := readSocketMessage(t, conn, "join")
	if join.RoomID != "general" || join.UserID != "account-1" || join.Username != "真实用户" {
		t.Fatalf("join identity not taken from token: %+v", join)
	}
	if err := conn.WriteJSON(Message{ID: "token-msg-1", Type: "message", Content: "来自令牌"}); err != nil {
		t.Fatal(err)
	}
	message := readSocketMessage(t, conn, "message")
	if message.RoomID != "general" || message.UserID != "account-1" || message.Username != "真实用户" {
		t.Fatalf("message identity not taken from token: %+v", message)
	}
	if message.Content != "来自令牌" {
		t.Fatalf("content = %q", message.Content)
	}
}

func TestAccessTokenEmptyNameFallsBack(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", testTokenSecret)
	t.Setenv("CHAT_HISTORY_DIR", "")
	_, server := startTestChatServer(t)

	payload := testAccessPayload()
	payload.Name = ""
	conn := dialTokenClient(t, server.URL, makeTestToken(t, testTokenSecret, payload))
	if join := readSocketMessage(t, conn, "join"); join.Username != "成员" {
		t.Fatalf("username = %q, want 成员", join.Username)
	}
}

func TestAccessTokenRejections(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", testTokenSecret)
	t.Setenv("CHAT_HISTORY_DIR", "")
	_, server := startTestChatServer(t)

	withPayload := func(mutate func(*accessTokenPayload)) string {
		payload := testAccessPayload()
		mutate(&payload)
		return makeTestToken(t, testTokenSecret, payload)
	}
	cases := []struct {
		name  string
		token string
	}{
		{"bad-signature", makeTestToken(t, "another-secret-000000", testAccessPayload())},
		{"expired", withPayload(func(p *accessTokenPayload) { p.Expiry = time.Now().Add(-2 * time.Minute).Unix() })},
		{"wrong-version", withPayload(func(p *accessTokenPayload) { p.Version = 2 })},
		{"invalid-subject", withPayload(func(p *accessTokenPayload) { p.Subject = "bad subject!" })},
		{"unknown-room", withPayload(func(p *accessTokenPayload) { p.Room = "unknown-room" })},
		{"invalid-trip-room", withPayload(func(p *accessTokenPayload) { p.Room = "trip-" })},
		{"too-long-trip-room", withPayload(func(p *accessTokenPayload) { p.Room = "trip-" + strings.Repeat("a", 65) })},
		{"empty-token", ""},
		{"garbage-token", "garbage.payload.sig"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			status, body := dialRejectedToken(t, server.URL, testCase.token)
			if status != http.StatusUnauthorized {
				t.Fatalf("status = %d, body = %q", status, body)
			}
			if !strings.Contains(body, "未授权") {
				t.Fatalf("body = %q", body)
			}
		})
	}
}

func TestAccessTokenAllowsClockSkew(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", testTokenSecret)
	t.Setenv("CHAT_HISTORY_DIR", "")
	_, server := startTestChatServer(t)

	payload := testAccessPayload()
	payload.Subject = "account-skew"
	payload.Expiry = time.Now().Add(-30 * time.Second).Unix()
	conn := dialTokenClient(t, server.URL, makeTestToken(t, testTokenSecret, payload))
	if join := readSocketMessage(t, conn, "join"); join.UserID != "account-skew" {
		t.Fatalf("skewed token rejected: %+v", join)
	}
}

func TestAccessTokenTripRoom(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", testTokenSecret)
	t.Setenv("CHAT_HISTORY_DIR", "")
	_, server := startTestChatServer(t)

	payload := testAccessPayload()
	payload.Room = "trip-abc_123-XYZ"
	conn := dialTokenClient(t, server.URL, makeTestToken(t, testTokenSecret, payload))
	if join := readSocketMessage(t, conn, "join"); join.RoomID != "trip-abc_123-XYZ" {
		t.Fatalf("trip room = %q", join.RoomID)
	}
}

// TestNodeIssuedTokenVerifies 固定 Node 后端 signChatToken 的真实输出，防止两端
// 在 JSON 编码、base64url 去填充或 HMAC 输入上出现不兼容。令牌 expiresAt 为 2100 年。
func TestNodeIssuedTokenVerifies(t *testing.T) {
	const secret = "0123456789abcdef"
	const token = "eyJ2IjoxLCJzdWIiOiIxMTExMTExMS0yMjIyLTMzMzMtNDQ0NC01NTU1NTU1NTU1NTUiLCJuYW1lIjoi5ZCM6KGM5rWL6K-VIiwicm9vbSI6InRyaXAtY29udHJhY3QiLCJleHAiOjQxMDI0NDQ4MDB9.x7kSpKxmB6-eOVaU3mgGslIUHRQ5SKw-cG4QZ6OpY4g"
	payload, err := verifyAccessToken(token, secret)
	if err != nil {
		t.Fatalf("Node 令牌未通过 Go 校验: %v", err)
	}
	if payload.Version != 1 || payload.Subject != "11111111-2222-3333-4444-555555555555" ||
		payload.Name != "同行测试" || payload.Room != "trip-contract" || payload.Expiry != 4102444800 {
		t.Fatalf("Node 令牌载荷不匹配: %+v", payload)
	}
}

func TestShortAuthSecretFailsClosed(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", "tooshort")
	t.Setenv("CHAT_HISTORY_DIR", t.TempDir())
	_, server := startTestChatServer(t)

	payload := testAccessPayload()
	token := makeTestToken(t, "tooshort", payload)
	if status, body := dialRejectedToken(t, server.URL, token); status != http.StatusUnauthorized {
		t.Fatalf("ws status = %d, body = %q", status, body)
	}
	if status, _, body := fetchHistory(t, server.URL, "roomId=general&token="+url.QueryEscape(token)); status != http.StatusUnauthorized {
		t.Fatalf("history status = %d, body = %q", status, body)
	}
}

func TestFixedRoomsRemainTokenlessWhenAuthEnabled(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", testTokenSecret)
	t.Setenv("CHAT_HISTORY_DIR", "")
	_, server := startTestChatServer(t)

	// 综合房间不要求令牌；否则配置聊天鉴权后现有房间会全部不可用。
	conn, resp, err := websocket.DefaultDialer.Dial(
		testWsURL(server.URL, "/ws?roomId=general&userId=fixed-user&username=综合用户"), nil)
	if err != nil {
		if resp != nil {
			resp.Body.Close()
		}
		t.Fatalf("tokenless fixed room dial: %v", err)
	}
	defer conn.Close()
	if join := readSocketMessage(t, conn, "join"); join.RoomID != "general" || join.UserID != "fixed-user" {
		t.Fatalf("fixed room join: %+v", join)
	}
	// 主动携带错误令牌仍然拒绝，避免半令牌模式被绕过。
	if status, _ := dialRejectedToken(t, server.URL, "garbage.token"); status != http.StatusUnauthorized {
		t.Fatalf("garbage token status = %d", status)
	}
}

func postRevoke(t *testing.T, serverURL, secret, roomID, userID string) (int, map[string]int) {
	t.Helper()
	body, err := json.Marshal(map[string]string{"roomId": roomID, "userId": userID})
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(http.MethodPost, serverURL+"/internal/revoke", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	if secret != "" {
		request.Header.Set("X-Chat-Admin-Secret", secret)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]int
	if response.StatusCode == http.StatusOK {
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("revoke body %q: %v", raw, err)
		}
	}
	return response.StatusCode, payload
}

func TestAdminRevokeClosesOnlyTargetMember(t *testing.T) {
	const adminSecret = "go-admin-secret-0123456789"
	t.Setenv("CHAT_AUTH_SECRET", testTokenSecret)
	t.Setenv("CHAT_ADMIN_SECRET", adminSecret)
	t.Setenv("CHAT_HISTORY_DIR", "")
	_, server := startTestChatServer(t)

	roomID := "trip-revoke-1"
	payload := testAccessPayload()
	payload.Room = roomID
	removed := dialTokenClient(t, server.URL, makeTestToken(t, testTokenSecret, payload))
	readSocketMessage(t, removed, "join")

	otherPayload := testAccessPayload()
	otherPayload.Subject = "account-2"
	otherPayload.Room = roomID
	other := dialTokenClient(t, server.URL, makeTestToken(t, testTokenSecret, otherPayload))
	readSocketMessage(t, other, "join")
	readSocketMessage(t, removed, "join")

	status, result := postRevoke(t, server.URL, adminSecret, roomID, "account-1")
	if status != http.StatusOK || result["revoked"] != 1 {
		t.Fatalf("revoke status = %d, result = %v", status, result)
	}
	removed.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, _, err := removed.ReadMessage(); err == nil {
		t.Fatal("revoked member socket is still open")
	}
	// 其他成员会收到被移除者的离开事件，但连接保持可用。
	if leave := readSocketMessage(t, other, "leave"); leave.UserID != "account-1" {
		t.Fatalf("unexpected leave event: %+v", leave)
	}
	if err := other.WriteJSON(Message{Type: "ping"}); err != nil {
		t.Fatal(err)
	}
	readSocketMessage(t, other, "pong")
}

// postRevokeState 发送带 revoked 标记的撤销请求，用于验证撤销与恢复。
func postRevokeState(t *testing.T, serverURL, secret, roomID, userID string, revoked bool) int {
	t.Helper()
	body, err := json.Marshal(map[string]any{"roomId": roomID, "userId": userID, "revoked": revoked})
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(http.MethodPost, serverURL+"/internal/revoke", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Chat-Admin-Secret", secret)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	return response.StatusCode
}

// TestRevokedMemberCannotReconnectWithCachedToken 覆盖真实缺口：
// 移除成员后其旧令牌仍在有效期内，撤销必须让重连与历史读取都失败，直到重新加入。
func TestRevokedMemberCannotReconnectWithCachedToken(t *testing.T) {
	const adminSecret = "go-admin-secret-0123456789"
	t.Setenv("CHAT_AUTH_SECRET", testTokenSecret)
	t.Setenv("CHAT_ADMIN_SECRET", adminSecret)
	t.Setenv("CHAT_HISTORY_DIR", t.TempDir())
	_, server := startTestChatServer(t)

	roomID := "trip-revoke-reconnect"
	payload := testAccessPayload()
	payload.Room = roomID
	token := makeTestToken(t, testTokenSecret, payload)
	conn := dialTokenClient(t, server.URL, token)
	readSocketMessage(t, conn, "join")

	if status, result := postRevoke(t, server.URL, adminSecret, roomID, payload.Subject); status != http.StatusOK || result["revoked"] != 1 {
		t.Fatalf("revoke status = %d, result = %v", status, result)
	}
	if status, _ := dialRejectedToken(t, server.URL, token); status != http.StatusForbidden {
		t.Fatalf("revoked member reconnect status = %d, want %d", status, http.StatusForbidden)
	}
	if status, _, _ := fetchHistory(t, server.URL, "roomId="+url.QueryEscape(roomID)+"&token="+url.QueryEscape(token)); status != http.StatusForbidden {
		t.Fatalf("revoked member history status = %d, want %d", status, http.StatusForbidden)
	}

	// 撤销只针对该账号；同房间其他成员仍可连入。
	other := testAccessPayload()
	other.Subject = "account-2"
	other.Room = roomID
	reconnected := dialTokenClient(t, server.URL, makeTestToken(t, testTokenSecret, other))
	if join := readSocketMessage(t, reconnected, "join"); join.UserID != "account-2" {
		t.Fatalf("other member join: %+v", join)
	}

	// 重新加入协作空间后恢复聊天权限（邀请码重新加入时后端会清除撤销记录）。
	if status := postRevokeState(t, server.URL, adminSecret, roomID, payload.Subject, false); status != http.StatusOK {
		t.Fatalf("clear revoke status = %d", status)
	}
	restored := dialTokenClient(t, server.URL, token)
	if join := readSocketMessage(t, restored, "join"); join.UserID != payload.Subject {
		t.Fatalf("rejoined member join: %+v", join)
	}
}

// dialWithOrigin 在握手时附带 Origin；被拒绝时返回响应状态码。
func dialWithOrigin(t *testing.T, serverURL, path, origin string) (*websocket.Conn, int) {
	t.Helper()
	header := http.Header{}
	if origin != "" {
		header.Set("Origin", origin)
	}
	conn, resp, err := websocket.DefaultDialer.Dial(testWsURL(serverURL, path), header)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
			resp.Body.Close()
		}
		return nil, status
	}
	t.Cleanup(func() { conn.Close() })
	return conn, 0
}

func TestChatOriginPolicyAllowsLocalhostAndRejectsCrossSite(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", "")
	t.Setenv("CHAT_HISTORY_DIR", "")
	t.Setenv("CHAT_ALLOWED_ORIGINS", "")
	_, server := startTestChatServer(t)

	// 开发地址（Vite）默认允许，便于本地验收。
	if conn, status := dialWithOrigin(t, server.URL, "/ws?roomId=general&userId=origin-local&username=本机", "http://127.0.0.1:5173"); conn == nil {
		t.Fatalf("localhost origin rejected, status = %d", status)
	}
	// 同源始终允许。
	if conn, status := dialWithOrigin(t, server.URL, "/ws?roomId=general&userId=origin-same&username=同源", server.URL); conn == nil {
		t.Fatalf("same-origin rejected, status = %d", status)
	}
	// 跨站页面即使能携带有效令牌也不允许握手，避免被任意网站嵌入。
	if conn, status := dialWithOrigin(t, server.URL, "/ws?roomId=general&userId=origin-evil&username=外部", "https://evil.example"); conn != nil {
		t.Fatal("cross-site origin should be rejected")
	} else if status != http.StatusForbidden {
		t.Fatalf("cross-site status = %d, want %d", status, http.StatusForbidden)
	}
	// 无 Origin 的非浏览器客户端仍可用（令牌/房间校验照常生效）。
	if conn, status := dialWithOrigin(t, server.URL, "/ws?roomId=general&userId=origin-none&username=脚本", ""); conn == nil {
		t.Fatalf("originless client rejected, status = %d", status)
	}
}

func TestChatOriginAllowlistOverridesDefaults(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", "")
	t.Setenv("CHAT_HISTORY_DIR", "")
	t.Setenv("CHAT_ALLOWED_ORIGINS", "https://travel.example.com, https://m.example.com/")
	_, server := startTestChatServer(t)

	for index, origin := range []string{"https://travel.example.com", "https://m.example.com"} {
		path := fmt.Sprintf("/ws?roomId=general&userId=origin-%d&username=白名单", index)
		if conn, status := dialWithOrigin(t, server.URL, path, origin); conn == nil {
			t.Fatalf("allowlisted origin %s rejected, status = %d", origin, status)
		}
	}
	// 配置白名单后不再默认放行本机地址，生产环境可只保留正式域名。
	if conn, status := dialWithOrigin(t, server.URL, "/ws?roomId=general&userId=origin-local&username=本机", "http://127.0.0.1:5173"); conn != nil {
		t.Fatal("allowlist should not include localhost implicitly")
	} else if status != http.StatusForbidden {
		t.Fatalf("non-allowlisted status = %d, want %d", status, http.StatusForbidden)
	}
}

func TestAdminRevokeGuards(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", testTokenSecret)
	t.Setenv("CHAT_HISTORY_DIR", "")
	t.Setenv("CHAT_ADMIN_SECRET", "go-admin-secret-0123456789")
	_, server := startTestChatServer(t)

	if status, _ := postRevoke(t, server.URL, "wrong-secret-0123456789", "trip-x", "account-1"); status != http.StatusUnauthorized {
		t.Fatalf("wrong secret status = %d", status)
	}
	if status, _ := postRevoke(t, server.URL, "go-admin-secret-0123456789", "general", "account-1"); status != http.StatusBadRequest {
		t.Fatalf("fixed room revoke status = %d", status)
	}
	if status, _ := postRevoke(t, server.URL, "go-admin-secret-0123456789", "trip-x", "bad subject!"); status != http.StatusBadRequest {
		t.Fatalf("invalid user status = %d", status)
	}
}

func TestAdminRevokeDisabledWithoutSecret(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", testTokenSecret)
	t.Setenv("CHAT_ADMIN_SECRET", "")
	t.Setenv("CHAT_HISTORY_DIR", "")
	_, server := startTestChatServer(t)

	if status, _ := postRevoke(t, server.URL, "anything-0123456789", "trip-x", "account-1"); status != http.StatusServiceUnavailable {
		t.Fatalf("disabled revoke status = %d", status)
	}
}

func TestLegacyModeStillWorksWithoutToken(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", "")
	t.Setenv("CHAT_HISTORY_DIR", "")
	_, server := startTestChatServer(t)

	// 行程房间在旧版模式下同样允许。
	conn := dialTestClient(t, server.URL, "legacy-user", "trip-legacy_1")
	if join := readSocketMessage(t, conn, "join"); join.RoomID != "trip-legacy_1" || join.UserID != "legacy-user" {
		t.Fatalf("legacy trip room join: %+v", join)
	}

	// 旧版模式忽略 token 参数，查询参数仍是身份来源。
	second, resp, err := websocket.DefaultDialer.Dial(testWsURL(server.URL, "/ws?token=garbage&roomId=food&userId=legacy-2&username=旧用户"), nil)
	if err != nil {
		if resp != nil {
			resp.Body.Close()
		}
		t.Fatalf("legacy dial with token param: %v", err)
	}
	defer second.Close()
	if join := readSocketMessage(t, second, "join"); join.RoomID != "food" || join.UserID != "legacy-2" || join.Username != "旧用户" {
		t.Fatalf("legacy identity: %+v", join)
	}

	// 未配置鉴权时未知房间仍是 400，与旧行为一致。
	response, err := http.Get(server.URL + "/ws?roomId=unknown")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown room status = %d", response.StatusCode)
	}
}

func TestHistoryPersistsMessagesAcrossConnections(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("CHAT_AUTH_SECRET", "")
	t.Setenv("CHAT_HISTORY_DIR", dir)
	_, server := startTestChatServer(t)

	first := dialTestClient(t, server.URL, "user-a", "general")
	readSocketMessage(t, first, "join")
	second := dialTestClient(t, server.URL, "user-b", "general")
	readSocketMessage(t, second, "join")
	readSocketMessage(t, first, "join")

	if err := first.WriteJSON(Message{ID: "hist-msg-1", Type: "message", Content: "持久化内容", Mentions: []string{"user-b"}}); err != nil {
		t.Fatal(err)
	}
	sent := readSocketMessage(t, first, "message")
	readSocketMessage(t, second, "message")

	payload := waitForHistoryMessages(t, server.URL, "general", 1)
	if payload.RoomID != "general" {
		t.Fatalf("roomId = %q", payload.RoomID)
	}
	if len(payload.Messages) != 1 {
		t.Fatalf("messages = %d, want 1", len(payload.Messages))
	}
	message := payload.Messages[0]
	if message.ID != "hist-msg-1" || message.Content != "持久化内容" || message.Type != "message" {
		t.Fatalf("history message: %+v", message)
	}
	if message.RoomID != "general" || message.UserID != "user-a" || message.Username != sent.Username {
		t.Fatalf("history identity: %+v", message)
	}
	if message.Timestamp.IsZero() {
		t.Fatal("history timestamp missing")
	}
	if len(message.Mentions) != 1 || message.Mentions[0] != "user-b" {
		t.Fatalf("mentions = %v", message.Mentions)
	}

	// 文件必须是一行一条 JSON，且 join 事件不落盘。
	raw, err := os.ReadFile(filepath.Join(dir, "general.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	lines := splitHistoryLines(raw)
	if len(lines) != 1 {
		t.Fatalf("jsonl lines = %d, want 1: %q", len(lines), raw)
	}
	var record historyRecord
	if err := json.Unmarshal(lines[0], &record); err != nil {
		t.Fatalf("jsonl line is not JSON: %v", err)
	}
	if record.ID != "hist-msg-1" || record.RoomID != "general" || record.UserID != "user-a" {
		t.Fatalf("jsonl record: %+v", record)
	}
	if _, err := os.Stat(filepath.Join(dir, "food.jsonl")); !os.IsNotExist(err) {
		t.Fatalf("unexpected history for untouched room: %v", err)
	}
}

func TestHistoryRequiresTokenMatchingRoom(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("CHAT_AUTH_SECRET", testTokenSecret)
	t.Setenv("CHAT_HISTORY_DIR", dir)
	_, server := startTestChatServer(t)

	generalToken := makeTestToken(t, testTokenSecret, testAccessPayload())
	tripPayload := testAccessPayload()
	tripPayload.Room = "trip-history-1"
	tripToken := makeTestToken(t, testTokenSecret, tripPayload)

	// 令牌房间与查询房间不一致 -> 401。
	if status, _, body := fetchHistory(t, server.URL, "roomId=trip-history-1&token="+url.QueryEscape(generalToken)); status != http.StatusUnauthorized {
		t.Fatalf("mismatched room status = %d, body = %q", status, body)
	}
	// 行程房间缺少令牌 -> 401。
	if status, _, body := fetchHistory(t, server.URL, "roomId=trip-history-1"); status != http.StatusUnauthorized {
		t.Fatalf("missing token status = %d, body = %q", status, body)
	}
	// 签名错误 -> 401。
	if status, _, body := fetchHistory(t, server.URL, "roomId=trip-history-1&token="+url.QueryEscape(makeTestToken(t, "another-secret-000000", tripPayload))); status != http.StatusUnauthorized {
		t.Fatalf("bad signature status = %d, body = %q", status, body)
	}
	// 令牌与房间匹配 -> 200。
	status, payload, body := fetchHistory(t, server.URL, "roomId=trip-history-1&token="+url.QueryEscape(tripToken))
	if status != http.StatusOK {
		t.Fatalf("matching token status = %d, body = %q", status, body)
	}
	if payload.RoomID != "trip-history-1" || len(payload.Messages) != 0 {
		t.Fatalf("history payload: %+v", payload)
	}
}

func TestHistoryUnavailableWithoutStorage(t *testing.T) {
	t.Setenv("CHAT_AUTH_SECRET", "")
	t.Setenv("CHAT_HISTORY_DIR", "")
	_, server := startTestChatServer(t)

	status, _, body := fetchHistory(t, server.URL, "roomId=general&limit=10")
	if status != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, body = %q", status, body)
	}
	var decoded map[string]string
	if err := json.Unmarshal([]byte(body), &decoded); err != nil {
		t.Fatalf("body %q: %v", body, err)
	}
	if decoded["error"] != "聊天记录存储未配置" {
		t.Fatalf("error = %q", decoded["error"])
	}
}

func TestHistoryLimitClamping(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("CHAT_AUTH_SECRET", "")
	t.Setenv("CHAT_HISTORY_DIR", dir)
	hub, server := startTestChatServer(t)

	writer := registerTestClient(t, hub, "writer", "general", 32)
	receiveHubMessage(t, writer, "join")
	for i := 1; i <= 6; i++ {
		sendToHub(t, hub, writer, fmt.Sprintf("limit-msg-%d", i), fmt.Sprintf("内容 %d", i))
		receiveHubMessage(t, writer, "message")
	}
	waitForHistoryMessages(t, server.URL, "general", 6)

	status, payload, body := fetchHistory(t, server.URL, "roomId=general&limit=2")
	if status != http.StatusOK || len(payload.Messages) != 2 {
		t.Fatalf("limit=2 status = %d, messages = %d, body = %q", status, len(payload.Messages), body)
	}
	// 从旧到新，取最后两条。
	if payload.Messages[0].ID != "limit-msg-5" || payload.Messages[1].ID != "limit-msg-6" {
		t.Fatalf("limit=2 ids = %q, %q", payload.Messages[0].ID, payload.Messages[1].ID)
	}

	_, payload, _ = fetchHistory(t, server.URL, "roomId=general&limit=0")
	if len(payload.Messages) != 1 || payload.Messages[0].ID != "limit-msg-6" {
		t.Fatalf("limit=0 not clamped to 1: %+v", payload.Messages)
	}
	_, payload, _ = fetchHistory(t, server.URL, "roomId=general&limit=-3")
	if len(payload.Messages) != 1 {
		t.Fatalf("limit=-3 messages = %d", len(payload.Messages))
	}
	_, payload, _ = fetchHistory(t, server.URL, "roomId=general&limit=1000")
	if len(payload.Messages) != 6 {
		t.Fatalf("limit=1000 messages = %d", len(payload.Messages))
	}
	_, payload, _ = fetchHistory(t, server.URL, "roomId=general&limit=abc")
	if len(payload.Messages) != 6 {
		t.Fatalf("limit=abc messages = %d", len(payload.Messages))
	}
}

func TestHistoryAfterIDReturnsOnlyNewerMessages(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("CHAT_AUTH_SECRET", "")
	t.Setenv("CHAT_HISTORY_DIR", dir)
	hub, server := startTestChatServer(t)

	writer := registerTestClient(t, hub, "writer", "general", 32)
	receiveHubMessage(t, writer, "join")
	for i := 1; i <= 5; i++ {
		sendToHub(t, hub, writer, fmt.Sprintf("after-msg-%d", i), fmt.Sprintf("内容 %d", i))
		receiveHubMessage(t, writer, "message")
	}
	waitForHistoryMessages(t, server.URL, "general", 5)

	status, payload, body := fetchHistory(t, server.URL, "roomId=general&afterId=after-msg-2&limit=100")
	if status != http.StatusOK {
		t.Fatalf("after cursor status = %d, body = %q", status, body)
	}
	if len(payload.Messages) != 3 || payload.Messages[0].ID != "after-msg-3" || payload.Messages[2].ID != "after-msg-5" {
		t.Fatalf("after cursor messages: %+v", payload.Messages)
	}

	// 游标 + limit 只返回游标之后的最早一页，供客户端继续翻页。
	_, payload, _ = fetchHistory(t, server.URL, "roomId=general&afterId=after-msg-3&limit=1")
	if len(payload.Messages) != 1 || payload.Messages[0].ID != "after-msg-4" {
		t.Fatalf("after cursor paging: %+v", payload.Messages)
	}

	// 游标就是最后一条时返回空列表，而不是重复最后一条。
	_, payload, _ = fetchHistory(t, server.URL, "roomId=general&afterId=after-msg-5")
	if len(payload.Messages) != 0 {
		t.Fatalf("cursor at tail returned: %+v", payload.Messages)
	}

	// 未知游标（例如已被裁剪）退回最近一页，客户端按消息 ID 去重。
	_, payload, _ = fetchHistory(t, server.URL, "roomId=general&afterId=trimmed-msg&limit=2")
	if len(payload.Messages) != 2 || payload.Messages[0].ID != "after-msg-4" || payload.Messages[1].ID != "after-msg-5" {
		t.Fatalf("unknown cursor fallback: %+v", payload.Messages)
	}

	if status, _, _ := fetchHistory(t, server.URL, "roomId=general&afterId=bad%20cursor"); status != http.StatusBadRequest {
		t.Fatalf("invalid cursor status = %d", status)
	}
}

func TestHistoryCORSAllowsOnlyKnownOrigins(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("CHAT_AUTH_SECRET", "")
	t.Setenv("CHAT_HISTORY_DIR", dir)
	_, server := startTestChatServer(t)

	request := func(origin string) *http.Response {
		req, err := http.NewRequest(http.MethodGet, server.URL+"/history?roomId=general", nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Origin", origin)
		response, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return response
	}

	allowed := request("http://127.0.0.1:5173")
	allowed.Body.Close()
	if got := allowed.Header.Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:5173" {
		t.Fatalf("allowed origin header = %q", got)
	}

	rejected := request("https://evil.example")
	rejected.Body.Close()
	if got := rejected.Header.Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("rejected origin header = %q", got)
	}
}

func buildHistoryFixture(t *testing.T, count, padding int) []byte {
	t.Helper()
	var buf bytes.Buffer
	for i := 1; i <= count; i++ {
		line, err := json.Marshal(historyRecord{
			ID:        fmt.Sprintf("line-%03d", i),
			Type:      "message",
			RoomID:    "general",
			Username:  "用户",
			UserID:    "writer",
			Content:   strings.Repeat("x", padding),
			Timestamp: time.Unix(int64(1_700_000_000+i), 0).UTC(),
		})
		if err != nil {
			t.Fatal(err)
		}
		buf.Write(line)
		buf.WriteByte('\n')
	}
	return buf.Bytes()
}

func TestHistoryFileTrimmedToBoundedLines(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("CHAT_HISTORY_DIR", dir)
	store := newHistoryStore(dir)
	path := filepath.Join(dir, "general.jsonl")
	if err := os.WriteFile(path, buildHistoryFixture(t, 600, 4096), 0o600); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() <= historyMaxBytes {
		t.Fatalf("fixture size = %d, want > %d", info.Size(), historyMaxBytes)
	}

	store.append("general", Message{
		ID: "newest", Type: "message", RoomID: "general", UserID: "writer", Username: "用户",
		Content: "最新消息", Timestamp: time.Now(),
	})

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	lines := splitHistoryLines(raw)
	if len(lines) != historyKeepLines {
		t.Fatalf("lines after trim = %d, want %d", len(lines), historyKeepLines)
	}
	var first, last historyRecord
	if err := json.Unmarshal(lines[0], &first); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(lines[len(lines)-1], &last); err != nil {
		t.Fatal(err)
	}
	// 601 行留最后 500 行：line-102 ... line-600 ... newest。
	if first.ID != "line-102" || last.ID != "newest" {
		t.Fatalf("trim kept first %q last %q", first.ID, last.ID)
	}

	// 裁剪后仍可被读取，且缓存不返回旧数据。
	recent := store.recent("general", 1)
	if len(recent) != 1 {
		t.Fatalf("recent = %d", len(recent))
	}
	var newest historyRecord
	if err := json.Unmarshal(recent[0], &newest); err != nil {
		t.Fatal(err)
	}
	if newest.ID != "newest" {
		t.Fatalf("recent id = %q", newest.ID)
	}
}
