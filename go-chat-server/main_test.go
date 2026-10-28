package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func startTestHub(t *testing.T) *Hub {
	t.Helper()
	hub := newHub()
	go hub.run()
	t.Cleanup(hub.stop)
	return hub
}

func receiveHubMessage(t *testing.T, client *Client, kind string) Message {
	t.Helper()
	select {
	case raw := <-client.send:
		var message Message
		if err := json.Unmarshal(raw, &message); err != nil {
			t.Fatal(err)
		}
		if message.Type != kind {
			t.Fatalf("type = %q, want %q", message.Type, kind)
		}
		return message
	case <-time.After(2 * time.Second):
		t.Fatal("hub stopped responding")
		return Message{}
	}
}

func registerTestClient(t *testing.T, hub *Hub, userID, roomID string, buffer int) *Client {
	t.Helper()
	client := &Client{hub: hub, userID: userID, username: userID, roomID: roomID, send: make(chan []byte, buffer), done: make(chan struct{})}
	select {
	case hub.register <- client:
	case <-time.After(2 * time.Second):
		t.Fatal("register blocked")
	}
	return client
}

func sendToHub(t *testing.T, hub *Hub, client *Client, id, content string) {
	t.Helper()
	select {
	case hub.broadcast <- incomingMessage{client: client, message: Message{ID: id, Type: "message", Content: content}}:
	case <-time.After(2 * time.Second):
		t.Fatal("broadcast blocked")
	}
}

func unregisterTestClient(t *testing.T, hub *Hub, client *Client) {
	t.Helper()
	select {
	case hub.unregister <- client:
	case <-time.After(2 * time.Second):
		t.Fatal("unregister blocked")
	}
}

func TestHubRoomIsolationAndStableLifecycle(t *testing.T) {
	hub := startTestHub(t)
	first := registerTestClient(t, hub, "first", "general", 8)
	receiveHubMessage(t, first, "join")
	other := registerTestClient(t, hub, "other", "food", 8)
	receiveHubMessage(t, other, "join")
	second := registerTestClient(t, hub, "second", "general", 8)
	if got := receiveHubMessage(t, first, "join").OnlineUsers; got != 2 {
		t.Fatalf("online = %d", got)
	}
	receiveHubMessage(t, second, "join")
	sendToHub(t, hub, first, "message-1", "only general")
	for _, client := range []*Client{first, second} {
		message := receiveHubMessage(t, client, "message")
		if message.RoomID != "general" || message.UserID != "first" {
			t.Fatalf("wrong room/author: %+v", message)
		}
	}
	unregisterTestClient(t, hub, second)
	if got := receiveHubMessage(t, first, "leave").OnlineUsers; got != 1 {
		t.Fatalf("online after leave = %d", got)
	}
	// 用下一次事件接收作屏障，确保之前的广播和离开处理已完成。
	unregisterTestClient(t, hub, &Client{})
	select {
	case message := <-other.send:
		t.Fatalf("foreign room received %s", message)
	default:
	}
	third := registerTestClient(t, hub, "third", "general", 8)
	receiveHubMessage(t, first, "join")
	receiveHubMessage(t, third, "join")
}

func TestOnlineCountUsesUniqueUsersWithinRoom(t *testing.T) {
	hub := startTestHub(t)
	first := registerTestClient(t, hub, "same-user", "general", 8)
	receiveHubMessage(t, first, "join")
	second := registerTestClient(t, hub, "same-user", "general", 8)
	if got := receiveHubMessage(t, first, "join").OnlineUsers; got != 1 {
		t.Fatalf("duplicate tabs counted as %d users", got)
	}
	receiveHubMessage(t, second, "join")
	third := registerTestClient(t, hub, "another-user", "general", 8)
	receiveHubMessage(t, first, "join")
	receiveHubMessage(t, second, "join")
	if got := receiveHubMessage(t, third, "join").OnlineUsers; got != 2 {
		t.Fatalf("online = %d", got)
	}
	unregisterTestClient(t, hub, first)
	if got := receiveHubMessage(t, second, "leave").OnlineUsers; got != 2 {
		t.Fatalf("online = %d", got)
	}
	receiveHubMessage(t, third, "leave")
	unregisterTestClient(t, hub, second)
	if got := receiveHubMessage(t, third, "leave").OnlineUsers; got != 1 {
		t.Fatalf("online = %d", got)
	}
}

func TestDuplicateMessageOnlyAcknowledgesSender(t *testing.T) {
	hub := startTestHub(t)
	first := registerTestClient(t, hub, "first", "general", 8)
	receiveHubMessage(t, first, "join")
	second := registerTestClient(t, hub, "second", "general", 8)
	receiveHubMessage(t, first, "join")
	receiveHubMessage(t, second, "join")
	sendToHub(t, hub, first, "same-id", "original")
	original := receiveHubMessage(t, first, "message")
	receiveHubMessage(t, second, "message")
	sendToHub(t, hub, first, "same-id", "changed retry")
	retry := receiveHubMessage(t, first, "message")
	if retry.Content != "original" || !retry.Timestamp.Equal(original.Timestamp) {
		t.Fatalf("retry changed message: %+v", retry)
	}
	unregisterTestClient(t, hub, &Client{})
	select {
	case raw := <-second.send:
		t.Fatalf("duplicate delivered to peer: %s", raw)
	default:
	}
	sendToHub(t, hub, first, "different-id", "original")
	receiveHubMessage(t, first, "message")
	receiveHubMessage(t, second, "message")
}

func TestSlowClientClosesWithoutBlockingOtherClients(t *testing.T) {
	hub := startTestHub(t)
	slow := registerTestClient(t, hub, "slow", "general", 1)
	fast := registerTestClient(t, hub, "fast", "general", 8)
	receiveHubMessage(t, fast, "join")
	select {
	case <-slow.done:
	case <-time.After(2 * time.Second):
		t.Fatal("slow client was not closed")
	}
	sendToHub(t, hub, fast, "still-live", "hello")
	receiveHubMessage(t, fast, "message")
}

func readSocketMessage(t *testing.T, conn *websocket.Conn, kind string) Message {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var message Message
	if err := conn.ReadJSON(&message); err != nil {
		t.Fatal(err)
	}
	if message.Type != kind {
		t.Fatalf("type = %q, want %q", message.Type, kind)
	}
	return message
}

func dialTestClient(t *testing.T, serverURL, userID, roomID string) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(serverURL, "http")+"/ws?userId="+userID+"&roomId="+roomID, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func TestWebSocketRoomAndIdentityCannotBeOverriddenByPayload(t *testing.T) {
	hub := startTestHub(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { serveWs(hub, w, r) }))
	defer server.Close()
	first := dialTestClient(t, server.URL, "first", "general")
	readSocketMessage(t, first, "join")
	other := dialTestClient(t, server.URL, "other", "food")
	readSocketMessage(t, other, "join")
	if err := first.WriteJSON(Message{ID: "test-id", Type: "message", RoomID: "food", UserID: "forged", Content: "general only"}); err != nil {
		t.Fatal(err)
	}
	message := readSocketMessage(t, first, "message")
	if message.RoomID != "general" || message.UserID != "first" {
		t.Fatalf("payload overrode connection: %+v", message)
	}
	if err := other.WriteJSON(Message{ID: "food-marker", Type: "message", Content: "food only"}); err != nil {
		t.Fatal(err)
	}
	if got := readSocketMessage(t, other, "message").Content; got != "food only" {
		t.Fatalf("foreign room message: %q", got)
	}
	if err := first.WriteJSON(Message{Type: "ping"}); err != nil {
		t.Fatal(err)
	}
	if got := readSocketMessage(t, first, "pong").RoomID; got != "general" {
		t.Fatalf("pong room = %q", got)
	}
}

func TestWebSocketRejectsInvalidRoomAndMessages(t *testing.T) {
	hub := startTestHub(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { serveWs(hub, w, r) }))
	defer server.Close()
	response, err := http.Get(server.URL + "/ws?roomId=unknown")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown room status = %d", response.StatusCode)
	}
	client := dialTestClient(t, server.URL, "first", "general")
	readSocketMessage(t, client, "join")
	for _, content := range []string{"  ", strings.Repeat("字", 2001)} {
		if err := client.WriteJSON(Message{ID: "invalid", Type: "message", Content: content}); err != nil {
			t.Fatal(err)
		}
		if got := readSocketMessage(t, client, "error").ID; got != "invalid" {
			t.Fatalf("error receipt id = %q", got)
		}
	}
}

func sendEventToHub(t *testing.T, hub *Hub, client *Client, message Message) {
	t.Helper()
	select {
	case hub.broadcast <- incomingMessage{client: client, message: message}:
	case <-time.After(2 * time.Second):
		t.Fatal("broadcast blocked")
	}
}

func TestTypingIndicatorBroadcastsToRoomAndThrottles(t *testing.T) {
	hub := startTestHub(t)
	first := registerTestClient(t, hub, "first", "general", 8)
	receiveHubMessage(t, first, "join")
	second := registerTestClient(t, hub, "second", "general", 8)
	receiveHubMessage(t, first, "join")
	receiveHubMessage(t, second, "join")

	// 直接触发 sendTyping（节流逻辑所在），经事件循环广播。
	hub.sendTyping(first)
	for _, client := range []*Client{first, second} {
		event := receiveHubMessage(t, client, "typing")
		if event.RoomID != "general" || event.UserID != "first" {
			t.Fatalf("typing wrong room/author: %+v", event)
		}
	}

	// 紧接着再触发同一位用户的 typing，应被节流忽略，不再广播。
	hub.sendTyping(first)
	select {
	case raw := <-first.send:
		t.Fatalf("throttled typing was broadcast to sender: %s", raw)
	default:
	}
	select {
	case raw := <-second.send:
		t.Fatalf("throttled typing was broadcast to peer: %s", raw)
	default:
	}
}

func TestReactionBroadcastsToRoomAndIgnoresInvalid(t *testing.T) {
	hub := startTestHub(t)
	first := registerTestClient(t, hub, "first", "general", 8)
	receiveHubMessage(t, first, "join")
	second := registerTestClient(t, hub, "second", "general", 8)
	receiveHubMessage(t, first, "join")
	receiveHubMessage(t, second, "join")

	sendEventToHub(t, hub, first, Message{Type: "reaction", Content: "👍", Reaction: "target-msg"})
	for _, client := range []*Client{first, second} {
		event := receiveHubMessage(t, client, "reaction")
		if event.Content != "👍" || event.Reaction != "target-msg" || event.UserID != "first" {
			t.Fatalf("reaction wrong: %+v", event)
		}
	}

	// 空内容的回应不应广播。
	sendEventToHub(t, hub, first, Message{Type: "reaction", Content: "  "})
	select {
	case raw := <-first.send:
		t.Fatalf("invalid reaction broadcast: %s", raw)
	default:
	}
}

func TestMessageReplyPassthrough(t *testing.T) {
	hub := startTestHub(t)
	first := registerTestClient(t, hub, "first", "general", 8)
	receiveHubMessage(t, first, "join")
	second := registerTestClient(t, hub, "second", "general", 8)
	receiveHubMessage(t, first, "join")
	receiveHubMessage(t, second, "join")

	ref := Reference{ID: "orig-1", Username: "second", Content: "原消息"}
	sendEventToHub(t, hub, first, Message{ID: "reply-1", Type: "message", Content: "回复", ReplyTo: &ref})
	for _, client := range []*Client{first, second} {
		message := receiveHubMessage(t, client, "message")
		if message.ReplyTo == nil || message.ReplyTo.ID != "orig-1" || message.ReplyTo.Content != "原消息" {
			t.Fatalf("replyTo not preserved: %+v", message.ReplyTo)
		}
	}
}
