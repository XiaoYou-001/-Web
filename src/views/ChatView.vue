<template>
  <div class="chat-container" :class="[themeClass, fontClass]">
    <!-- ============ Room Selection Screen ============ -->
    <div v-if="!currentRoom" class="room-selection">
      <header class="lobby-heading">
        <div><h1>驴友广场</h1><span>{{ chatRooms.length }} 个话题房间</span></div>
        <router-link to="/">返回首页 ↗</router-link>
      </header>

      <!-- 房间卡片 -->
      <div class="room-grid">
        <div
          v-for="room in chatRooms"
          :key="room.id"
          class="room-card"
          :class="`accent-${room.accent}`"
          tabindex="0"
          role="button"
          @click="joinRoom(room)"
          @keyup.enter="joinRoom(room)"
          @keydown.space.prevent
          @keyup.space.prevent="joinRoom(room)"
        >
          <div class="card-cover">
            <img :src="room.cover" :alt="room.name" loading="lazy" />
            <div class="cover-shade"></div>
            <div class="card-icon">{{ room.icon }}</div>
            <span class="card-online">
              <span class="live-dot" :class="{ muted: room.online == null }"></span>{{ room.online == null ? '人数待更新' : room.online + ' 在线' }}
            </span>
            <span v-if="storedCount(room.id) > 0" class="card-archive">
              📁 {{ storedCount(room.id) }} 条记录
            </span>
          </div>
          <div class="card-body">
            <h3>{{ room.name }}</h3>
            <p class="card-desc">{{ room.description }}</p>
            <div class="card-tags">
              <span v-for="tag in room.tags" :key="tag" class="card-tag">{{ tag }}</span>
            </div>
            <div class="card-footer">
              <span class="enter-hint">
                进入房间
                <font-awesome-icon :icon="['fas', 'arrow-right']" />
              </span>
            </div>
          </div>
        </div>
      </div>

      <form v-if="userId" class="trip-room-entry" @submit.prevent="enterTripRoomFromInput">
        <label for="trip-room-input">同行旅行聊天室</label>
        <div class="trip-room-row">
          <input id="trip-room-input" v-model="tripEntry" placeholder="输入 trip-… 或旅行 ID" autocomplete="off" />
          <button type="submit">进入</button>
        </div>
        <p>只有该旅行协作空间的成员能进入；聊天令牌由服务端按成员权限签发，只读访客无法进入。</p>
      </form>
      <p v-if="chatError" role="alert" class="trip-entry-error">{{ chatError }}</p>

      <p class="rs-foot">💡 进入房间后即可开始聊天，历史记录将保存在本地浏览器中</p>
    </div>

    <!-- ============ Chat Room Screen ============ -->
    <div v-else class="chat-room">
      <!-- 聊天头部 -->
      <div class="chat-header">
        <div class="header-left">
          <button class="icon-btn-circle" @click="leaveRoom" title="返回房间列表" aria-label="返回房间列表">
            <font-awesome-icon :icon="['fas', 'arrow-left']" />
          </button>
          <div class="header-room">
            <h2>{{ currentRoom.icon }} {{ currentRoom.name }}</h2>
            <div class="header-live">
              <span class="live-dot" :class="{ muted: !connected }"></span>
              <span>{{ connected ? `${onlineUsers} 人在线` : connectionText || '连接中…' }}</span>
              <button v-if="!connected" class="mini-reconnect" @click="manualReconnect">重连</button>
            </div>
          </div>
        </div>
        <div class="header-actions">
          <button ref="searchToggle" class="icon-btn-circle" :aria-expanded="showSearch" :class="{ on: showSearch }" @click="toggleSearch" title="搜索聊天记录" aria-label="搜索">
            <font-awesome-icon :icon="['fas', 'magnifying-glass']" />
          </button>
          <button ref="favoritesToggle" class="icon-btn-circle" :aria-expanded="showFavorites" :class="{ on: showFavorites }" @click="showFavorites = !showFavorites" title="我的收藏" aria-label="收藏">
            <font-awesome-icon :icon="['fas', 'heart']" />
            <span v-if="favorites.size" class="ico-badge">{{ favorites.size }}</span>
          </button>
          <button ref="settingsToggle" class="icon-btn-circle" :aria-expanded="settingsOpen" :class="{ on: settingsOpen }" @click="settingsOpen = !settingsOpen" title="设置" aria-label="设置">
            <font-awesome-icon :icon="['fas', 'gear']" />
          </button>
          <button class="btn-clear-history" @click="clearHistory" title="清除聊天记录" aria-label="清除聊天记录">
            <font-awesome-icon :icon="['fas', 'trash-can']" />
            <span>清除</span>
          </button>
          <button class="btn-back" @click="goBack" aria-label="返回首页">
            <font-awesome-icon :icon="['fas', 'house']" />
            <span>首页</span>
          </button>
        </div>
      </div>

      <!-- 搜索 / 收藏 / 设置 面板 -->
      <div v-if="showSearch" class="search-bar" @keydown.esc.prevent.stop="showSearch = false; $refs.searchToggle?.focus()">
        <div class="search-inner">
          <font-awesome-icon :icon="['fas', 'magnifying-glass']" class="search-ico" />
          <input
            ref="searchInput"
            v-model="searchQuery"
            placeholder="搜索本房间的历史消息…"
            class="search-input"
          />
          <span v-if="searchQuery.trim()" class="search-total">{{ searchResults.length }} 条结果</span>
          <button v-if="searchResults.length" class="search-nav" @click="searchFocused = (searchFocused + 1) % searchResults.length">↓ 定位</button>
          <button class="search-close" @click="toggleSearch" aria-label="关闭搜索">✕</button>
        </div>
      </div>

      <div v-if="showFavorites" class="favorites-panel" @keydown.esc.prevent.stop="showFavorites = false; $refs.favoritesToggle?.focus()">
        <div class="panel-head">❤️ 我的收藏 <small>{{ favoriteList.length }} 条</small></div>
        <div v-if="favoriteList.length" class="favorites-list">
          <div v-for="m in favoriteList" :key="favKey(m)" class="fav-item">
            <span class="fav-avatar" :style="{ backgroundColor: avatarColor(m.userId) }">{{ avatarLetter(m.username) }}</span>
            <div class="fav-body">
              <span class="fav-meta">{{ m.username }} · {{ formatFullTime(m.timestamp) }}</span>
              <span class="fav-text">{{ m.content }}</span>
            </div>
          </div>
        </div>
        <div v-else class="panel-empty">还没有收藏，把重要消息加入收藏吧</div>
      </div>

      <div v-if="settingsOpen" class="settings-panel" @keydown.esc.prevent.stop="settingsOpen = false; $refs.settingsToggle?.focus()">
        <div class="panel-head">⚙️ 聊天设置</div>
        <div class="setting-row">
          <span class="setting-label">新消息提示音</span>
          <label class="switch">
            <input type="checkbox" aria-label="新消息提示音" v-model="settings.sound" @change="saveSettings" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <span class="setting-label">后台系统通知</span>
          <label class="switch">
            <input type="checkbox" aria-label="后台系统通知" v-model="settings.notify" @change="saveSettings" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <span class="setting-label">界面主题</span>
          <div class="seg">
            <button :class="{ active: settings.theme === 'light' }" @click="setTheme('light')">浅色</button>
            <button :class="{ active: settings.theme === 'dark' }" @click="setTheme('dark')">深色</button>
            <button :class="{ active: settings.theme === 'comfort' }" @click="setTheme('comfort')">护眼</button>
          </div>
        </div>
        <div class="setting-row">
          <span class="setting-label">字号</span>
          <div class="seg">
            <button :class="{ active: settings.fontSize === 'sm' }" @click="setFontSize('sm')">小</button>
            <button :class="{ active: settings.fontSize === 'md' }" @click="setFontSize('md')">中</button>
            <button :class="{ active: settings.fontSize === 'lg' }" @click="setFontSize('lg')">大</button>
          </div>
        </div>
        <div class="setting-row">
          <span class="setting-label">常用语（可自定义）</span>
          <div class="greeting-edit">
            <div class="greeting-chips">
              <span v-for="(g, i) in greetings" :key="i" class="greeting-chip">
                {{ g }}
                <button class="chip-del" @click="removeGreeting(g)" title="删除">✕</button>
              </span>
            </div>
            <div class="greeting-add">
              <input v-model="greetingInput" @keyup.enter="addGreeting" placeholder="新增一条常用语…" maxlength="60" />
              <button @click="addGreeting">添加</button>
              <button class="reset-btn" @click="resetGreetings" title="恢复默认">重置</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 连接提示 -->
      <div v-if="!connected" class="connection-banner">
        <span class="conn-icon"><font-awesome-icon :icon="['fas', 'tower-broadcast']" /></span>
        <span>{{ connectionText }}</span>
        <button @click="manualReconnect" class="btn-reconnect">手动重连</button>
      </div>
      <p v-if="chatError" role="alert" class="chat-error">
        <font-awesome-icon :icon="['fas', 'circle-exclamation']" />
        {{ chatError }}
      </p>
      <p v-if="replayNotice" role="status" class="chat-replay-note">{{ replayNotice }}</p>

      <!-- 消息区 -->
      <div class="chat-main">
        <div v-if="historyLoaded && messages.length > 0" class="history-indicator">
          📜 已加载 {{ loadedHistoryCount }} 条历史消息
        </div>

        <div class="messages-container" ref="messagesContainer">
          <!-- 日期分隔线 -->
          <template v-for="({ m: msg, i: idx }, di) in displayMessages" :key="`${msg.userId}:${msg.id}`">
            <div v-if="isDayBoundary(displayMessages.map(x => x.m), di)" class="day-divider">
              <span>{{ formatDay(msg.timestamp) }}</span>
            </div>

            <div
              :data-msg-index="idx"
              :class="['message-item', getMessageClass(msg), { 'search-hit': searchMatchSet.has(idx) }]"
              :tabindex="isSystem(msg) ? undefined : 0"
              @mouseenter="actionMsg = msg"
              @mouseleave="!$event.currentTarget.contains($event.currentTarget.ownerDocument.activeElement) && clearAction()"
              @focusin="actionMsg = msg"
              @focusout="!$event.currentTarget.contains($event.relatedTarget) && clearAction()"
              @click="actionMsg = msg"
              @keydown.enter.self.prevent="actionMsg = msg"
              @keydown.esc.prevent.stop="$event.currentTarget.focus(); clearAction()"
            >
              <span v-if="isSystem(msg)" class="system-pill">
                <font-awesome-icon :icon="['fas', msg.type === 'join' ? 'right-to-bracket' : 'right-from-bracket']" />
                {{ msg.content }}
              </span>

              <template v-else>
                <!-- 他人消息：带头像 -->
                <div v-if="msg.userId !== userId" class="avatar-bubble" :style="{ backgroundColor: avatarColor(msg.userId) }">
                  {{ avatarLetter(msg.username) }}
                </div>

                <div class="bubble-wrap" :class="{ mine: msg.userId === userId }">
                  <div class="message-info">
                    <span class="username">{{ msg.username }}</span>
                    <span class="timestamp">{{ formatFullTime(msg.timestamp) }}</span>
                  </div>
                  <!-- B10 引用回复卡片 -->
                  <div v-if="msg.replyTo" class="reply-card">
                    <span class="reply-arrow">↩</span>
                    <div class="reply-body">
                      <span class="reply-author">{{ msg.replyTo.username }}</span>
                      <span class="reply-text">{{ msg.replyTo.content }}</span>
                    </div>
                  </div>
                  <div class="message-content" v-html="renderContent(msg.content)"></div>
                  <div v-if="msg.type === 'message' && msg.userId === userId" class="message-delivery">
                    <span v-if="msg.status === 'pending'">
                      <span class="status-dot pending"></span>等待送达确认…
                    </span>
                    <template v-else-if="msg.status === 'unconfirmed'">
                      <span class="status-dot failed"></span>未确认送达
                      <button @click="retryMessage(msg)" :disabled="!connected" class="retry-btn">重发</button>
                    </template>
                    <span v-else class="status-dot sent"></span>
                  </div>
                  <!-- B10 表情回应 -->
                  <div v-if="reactionGroup(msg).length" class="reaction-row">
                    <button
                      v-for="r in reactionGroup(msg)"
                      :key="r.emoji"
                      class="reaction-chip"
                      :class="{ mine: hasMyReaction(msg, r.emoji) }"
                      :title="r.users.join('、')"
                      @click.stop="toggleReaction(msg, r.emoji)"
                    >
                      {{ r.emoji }} <span class="reaction-count">{{ r.count }}</span>
                    </button>
                  </div>
                  <button type="button" class="msg-favorite" :class="{ on: isFavorite(msg) }" :aria-pressed="isFavorite(msg)" :aria-label="isFavorite(msg) ? '取消收藏消息' : '收藏消息'" @click.stop="toggleFavorite(msg)" title="收藏/取消收藏">♥</button>
                </div>

                <!-- 我的消息：头像在右侧 -->
                <div v-if="msg.userId === userId" class="avatar-bubble mine" :style="{ backgroundColor: avatarColor(msg.userId) }">
                  {{ avatarLetter(msg.username) }}
                </div>

                <!-- 悬停操作条 -->
                <div v-if="actionMsg === msg" class="msg-actions" :class="{ 'actions-mine': msg.userId === userId }">
                  <button class="msg-act" @click.stop="copyMessage(msg)" title="复制">复制</button>
                  <button class="msg-act" @click.stop="setReplying(msg)" title="回复">回复</button>
                  <span class="react-label">回应</span>
                  <button v-for="e in ['👍','❤️','😂','✨']" :key="e" class="msg-act react" @click.stop="toggleReaction(msg, e)">{{ e }}</button>
                  <button class="msg-act fav" @click.stop="toggleFavorite(msg)">
                    {{ isFavorite(msg) ? '取消收藏' : '收藏' }}
                  </button>
                  <button v-if="msg.userId === userId" class="msg-act del" @click.stop="removeMessage(msg)" title="删除（仅本地）">删除</button>
                </div>
              </template>
            </div>
          </template>

          <!-- 欢迎回来新消息提示 (A1) -->
          <div v-if="unreadHint > 0" class="unread-hint">
            ✨ 距上次离开，新增 {{ unreadHint }} 条消息
          </div>

          <div v-if="!displayMessages.length" class="empty-room">
            <div class="empty-emoji">{{ currentRoom.icon }}</div>
            <p>这里还没有消息，来打个招呼吧 👋</p>
            <p class="empty-sub">发送你的第一条消息，开启这段旅程的对话</p>
          </div>
        </div>

        <!-- 输入区 -->
        <div class="input-container">
          <!-- A3 快捷问候条 -->
          <div class="greeting-strip">
            <span class="strip-label">
              <font-awesome-icon :icon="['fas', 'face-smile']" />
            </span>
            <div class="strip-chips">
              <button v-for="g in greetings.slice(0, 4)" :key="g" class="strip-chip" @click="useQuickReply(g)">{{ g }}</button>
              <button v-if="greetings.length" class="strip-more" @click="settingsOpen = true" title="管理常用语">…</button>
            </div>
          </div>
          <!-- B10 正在回复提示 -->
          <div v-if="replyingTo" class="replying-banner">
            <span class="replying-arrow">↩</span>
            <span class="replying-text">回复 {{ replyingTo.username }}：{{ replyingTo.content.slice(0, 40) }}</span>
            <button class="replying-cancel" @click="clearReply" title="取消回复">✕</button>
          </div>
          <!-- B9 正在输入提示 -->
          <div v-if="typingText" class="typing-indicator">
            <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>
            {{ typingText }}
          </div>
          <transition name="emoji-panel">
            <div v-show="showEmoji" class="emoji-panel" @keydown.esc.prevent.stop="closeEmoji(); $refs.emojiToggle?.focus()">
              <div class="emoji-panel-head">
                表情
                <button class="emoji-close" @click="closeEmoji" aria-label="关闭表情">✕</button>
              </div>
              <div class="emoji-grid">
                <button v-for="e in emojiList" :key="e" class="emoji-item" @click="insertEmoji(e)">{{ e }}</button>
              </div>
              <div class="quick-replies">
                <button v-for="q in greetings" :key="q" class="quick-reply" @click="useQuickReply(q)">{{ q }}</button>
              </div>
            </div>
          </transition>

          <div class="input-bar">
            <button ref="emojiToggle" :aria-expanded="showEmoji" class="emoji-toggle" @click="toggleEmoji" :class="{ active: showEmoji }" title="表情" aria-label="表情">
              <font-awesome-icon :icon="['fas', 'face-smile']" />
            </button>
            <input
              v-model="newMessage"
              @keydown.enter="handleMessageEnter"
              @input="onTypingInput"
              placeholder="输入消息，按 Enter 发送…"
              maxlength="2000"
              class="message-input"
              :disabled="!connected"
              ref="messageInput"
            />
            <div class="send-wrap">
              <span v-if="newMessage.length" class="char-count">{{ newMessage.length }}/2000</span>
              <button @click="sendMessage" :disabled="!connected || !newMessage.trim()" class="btn-send">
                <font-awesome-icon :icon="['fas', 'paper-plane']" />
                <span>发送</span>
              </button>
            </div>
          </div>
          <div class="input-hint">
            <span>Enter 发送 · 最多 2000 字</span>
            <span class="hint-conn" :class="{ ok: connected }">
              <span class="live-dot" :class="{ muted: !connected }"></span>
              {{ connected ? '已连接' : '未连接' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import chatViewModel from './chatViewModel.js'
import { FontAwesomeIcon } from '../ui/fontAwesome.js'
export default {
  name: 'ChatView',
  components: { FontAwesomeIcon },
  ...chatViewModel
}
</script>

<style scoped>
/* ================================================================
   驴友 Chat · 美化版
   延续全局品牌色（primary / gradient）+ 轻盈玻璃质感
   ================================================================ */
.chat-container {
  --chat-sheet: #ffffff;
  --chat-text: #2b2d42;
  --chat-muted: #5a657b;
  --chat-bubble-other: #ffffff;
  --chat-border: #e4e7ef;
  --chat-input-bg: #fafbfd;
  min-height: 100vh;
  width: 100%;
  background:
    radial-gradient(1200px 500px at 85% -10%, rgba(102, 126, 234, 0.18), transparent 60%),
    radial-gradient(900px 400px at -10% 30%, rgba(118, 75, 162, 0.14), transparent 55%),
    linear-gradient(180deg, #f5f7fb 0%, #eef1f8 100%);
  color: var(--chat-text);
}

/* ===================== 房间选择 ===================== */
.room-selection {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px 60px;
}

.lobby-heading, .lobby-heading div { display:flex; align-items:baseline; flex-wrap:wrap; gap:10px; }
.lobby-heading { justify-content:space-between; margin-bottom:16px; }
.lobby-heading h1 { margin:0; font-size:clamp(24px,3vw,34px); }
.lobby-heading span, .lobby-heading a { color:var(--text-muted); font-size:13px; }
/* 房间卡片网格 */
.room-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 22px;
}
.room-card {
  background: #fff;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 6px 24px rgba(40, 45, 80, 0.08);
  cursor: pointer;
  outline: none;
  transition: transform 0.28s ease, box-shadow 0.28s ease;
  display: flex;
  flex-direction: column;
}
.room-card:hover,
.room-card:focus-visible {
  transform: translateY(-6px);
  box-shadow: 0 18px 40px rgba(60, 70, 160, 0.18);
}
.card-cover {
  position: relative;
  height: 128px;
  overflow: hidden;
}
.card-cover img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s ease; }
.room-card:hover .card-cover img { transform: scale(1.08); }
.cover-shade { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 20%, rgba(20, 22, 45, 0.72)); }
.card-icon {
  position: absolute;
  left: 16px;
  top: 16px;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  font-size: 26px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
}
.card-online {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  padding: 4px 10px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: #38e07a; box-shadow: 0 0 0 3px rgba(56, 224, 122, 0.28); }
.live-dot.muted { background: #b0b8c8; box-shadow: none; }

.card-body { padding: 18px 18px 16px; display: flex; flex-direction: column; flex: 1; }
.card-body h3 { margin: 0; font-size: 19px; font-weight: 700; }
.card-desc { margin: 6px 0 12px; font-size: 13.5px; color: var(--text-secondary); line-height: 1.6; }
.card-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.card-tag {
  font-size: 11.5px;
  padding: 3px 10px;
  border-radius: 999px;
  color: #5a5f8a;
  background: #f1f3fb;
}
.card-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
}
.enter-hint {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.enter-hint .svg-inline--fa { transition: transform 0.25s ease; }
.room-card:hover .enter-hint .svg-inline--fa { transform: translateX(3px); }

/* 房间主题强调色 */
.accent-teal .card-icon { background: linear-gradient(135deg, #2dd4bf, #14b8a6); }
.accent-teal .card-body h3 { color: #0f9d8a; }
.accent-warm .card-icon { background: linear-gradient(135deg, #ffb36b, #ff8a5c); }
.accent-warm .card-body h3 { color: #a34315; }
.accent-violet .card-icon { background: linear-gradient(135deg, #a78bfa, #8b5cf6); }
.accent-violet .card-body h3 { color: #7c3aed; }
.accent-green .card-icon { background: linear-gradient(135deg, #4ade80, #22c55e); }
.accent-green .card-body h3 { color: #16a34a; }
.accent-coral .card-icon { background: linear-gradient(135deg, #fb7185, #f43f5e); }
.accent-coral .card-body h3 { color: #e11d48; }
.accent-indigo .card-icon { background: linear-gradient(135deg, #818cf8, #6366f1); }
.accent-indigo .card-body h3 { color: #4f46e5; }

.rs-foot { text-align: center; margin-top: 28px; font-size: 13px; color: var(--text-muted); }
.trip-room-entry {
  max-width: 760px;
  margin: 28px auto 0;
  padding: 18px 20px;
  border: 1px solid var(--line, #d8e3ee);
  border-radius: 14px;
  background: var(--surface, #fff);
}
.trip-room-entry label { display: block; margin-bottom: 8px; font-weight: 600; color: var(--text, #243449); }
.trip-room-row { display: flex; flex-wrap: wrap; gap: 10px; }
.trip-room-row input { flex: 1; min-width: 200px; padding: 10px 12px; border: 1px solid var(--line, #c9d5e1); border-radius: 9px; font: inherit; }
.trip-room-row button { padding: 10px 20px; border: 0; border-radius: 9px; background: #31587a; color: #fff; cursor: pointer; font: inherit; }
.trip-room-entry p { margin: 8px 0 0; font-size: 13px; line-height: 1.6; color: var(--text-muted); }
.trip-entry-error { max-width: 760px; margin: 12px auto 0; padding: 10px 14px; border-radius: 9px; background: #fff5f5; color: #8a1c1c; font-size: 14px; }

/* ===================== 聊天房间 ===================== */
.chat-room {
  width: 100%;
  max-width: 1440px;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 12px 24px;
  height: calc(100vh - 72px);
  height: calc(100dvh - 72px);
  min-height: 560px;
  display: flex;
  flex-direction: column;
}

.chat-header {
  background: var(--chat-sheet);
  padding: 14px 20px;
  border-radius: 18px 18px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 6px 24px rgba(40, 45, 80, 0.08);
  z-index: 3;
}
.header-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
.header-room { min-width: 0; }
.icon-btn-circle {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: #f7f8fc;
  color: var(--text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.2s;
}
.icon-btn-circle:hover { background: #eef1ff; color: var(--primary); border-color: var(--primary-2); }
.header-room h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--chat-text); }
.header-live {
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-muted);
}
.mini-reconnect {
  font-size: 11.5px;
  border: none;
  background: #884700;
  color: #fff;
  padding: 2px 9px;
  border-radius: 999px;
  cursor: pointer;
}
.header-actions { display: flex; align-items: center; gap: 10px; }
.btn-clear-history, .btn-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-clear-history { background: #fdecec; color: #a62e31; }
.btn-clear-history:hover { background: #fbd6d6; }
.btn-back { background: var(--gradient-primary); color: #fff; box-shadow: 0 4px 12px rgba(102,126,234,0.3); }
.btn-back:hover { filter: brightness(1.07); }

/* 连接横幅 & 错误 */
.connection-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: #fff8e1;
  color: #785300;
  font-size: 13.5px;
  border-top: 1px solid #eecd7a;
}
.conn-icon { opacity: 0.85; }
.btn-reconnect { margin-left: auto; padding: 5px 14px; border: none; border-radius: 8px; background: #ffc107; color: #333; font-weight: 700; cursor: pointer; }
.chat-error {
  margin: 0;
  padding: 9px 20px;
  background: #fdecea;
  color: #c0392b;
  font-size: 13px;
  border-left: 4px solid #c0392b;
}
.chat-replay-note {
  margin: 0;
  padding: 8px 20px;
  background: #e8f6ee;
  color: #1d7a46;
  font-size: 13px;
  border-left: 4px solid #2e9e62;
}

/* 消息区 */
.chat-main {
  flex: 1;
  min-height: 0;
  background: var(--chat-sheet);
  border-radius: 0 0 18px 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 34px rgba(40, 45, 80, 0.1);
}
.history-indicator {
  padding: 7px 16px;
  text-align: center;
  font-size: 12.5px;
  color: #1976d2;
  background: #e8f2fe;
  border-bottom: 1px solid #d4e5fb;
  animation: slideDown 0.3s ease;
}
@keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 22px;
  background-color: var(--chat-sheet);
  background-image: radial-gradient(600px 200px at 10% 0%, rgba(102,126,234,0.05), transparent 60%);
}

.day-divider { display: flex; align-items: center; margin: 18px 0 12px; gap: 12px; }
.day-divider::before, .day-divider::after { content: ''; flex: 1; height: 1px; background: #e3e6f0; }
.day-divider span { font-size: 12px; color: var(--chat-muted); background: color-mix(in srgb, var(--chat-sheet) 70%, #eef0f8); padding: 3px 14px; border-radius: 999px; }

.message-item {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 16px;
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* 系统消息 */
.message-item.system-message { justify-content: center; }
.system-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: #e8eefb;
  color: #4a5f96;
  font-size: 12.5px;
  padding: 6px 16px;
  border-radius: 999px;
  max-width: 80%;
  box-shadow: 0 1px 2px rgba(40,45,80,0.06);
}

/* 头像 */
.avatar-bubble {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.14);
}
.avatar-bubble.mine { border-radius: 12px; }

.bubble-wrap {
  max-width: 72%;
  padding: 10px 14px;
  border-radius: 4px 16px 16px 16px;
  background: var(--chat-bubble-other);
  color: var(--chat-text);
  box-shadow: 0 2px 8px rgba(40, 45, 80, 0.08);
}
.bubble-wrap.mine {
  background: var(--gradient-primary);
  color: #fff;
  border-radius: 16px 4px 16px 16px;
  margin-left: auto;
}
.message-info { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; font-size: 12px; }
.bubble-wrap:not(.mine) .username { color: #4a5f96; font-weight: 700; }
.bubble-wrap.mine .username { color: rgba(255,255,255,0.85); }
.timestamp { color: var(--chat-muted); font-size: 11px; margin-left: auto; }
.bubble-wrap.mine .timestamp { color: rgba(255,255,255,0.7); }
.message-content { word-wrap: break-word; line-height: 1.55; font-size: 14.5px; color: inherit; }

.message-delivery { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12px; }
.bubble-wrap:not(.mine) .message-delivery, .message-delivery .retry-btn { color: #666; }
.bubble-wrap.mine .message-delivery { color: rgba(255,255,255,0.85); }
.status-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.status-dot.pending { background: #fdb02c; }
.status-dot.failed { background: #f05252; }
.status-dot.sent { background: #38e07a; }
.retry-btn { border: none; background: #fff; border-radius: 6px; padding: 2px 8px; font-size: 12px; cursor: pointer; }

.empty-room { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 70px 20px; color: var(--text-muted); }
.empty-emoji { font-size: 46px; margin-bottom: 12px; }
.empty-room p { margin: 2px 0; font-size: 15px; color: #5a5f8a; }
.empty-room .empty-sub { font-size: 13px; color: var(--text-muted); }

/* 输入区 */
.input-container { flex-shrink: 0; border-top: 1px solid var(--chat-border); background: var(--chat-sheet); padding: 12px 16px 12px; position: relative; }
.input-bar { display: flex; align-items: flex-end; gap: 10px; }
.emoji-toggle {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #f7f8fc;
  color: #6b7aa8;
  font-size: 18px;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}
.emoji-toggle:hover, .emoji-toggle.active { background: #eef1ff; color: var(--primary); border-color: var(--primary-2); }
.message-input {
  flex: 1;
  min-height: 42px;
  padding: 10px 16px;
  border: 1px solid var(--chat-border);
  border-radius: 14px;
  font-size: 14.5px;
  outline: none;
  color: var(--chat-text);
  transition: border-color 0.25s, box-shadow 0.25s;
  background: var(--chat-input-bg);
}
.message-input::placeholder { color: var(--chat-muted); }
.message-input:focus { border-color: var(--primary-2); box-shadow: 0 0 0 3px rgba(102,126,234,0.15); background: var(--chat-sheet); }
.message-input:disabled { background: #f2f3f7; cursor: not-allowed; }
.send-wrap { display: flex; align-items: center; gap: 10px; }
.char-count { font-size: 12px; color: var(--chat-muted); font-variant-numeric: tabular-nums; }
.btn-send {
  height: 42px;
  padding: 0 20px;
  border: none;
  border-radius: 14px;
  background: var(--gradient-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(102,126,234,0.32);
  transition: all 0.2s;
}
.btn-send:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.06); }
.btn-send:disabled { filter: grayscale(0.4); opacity: 0.55; cursor: not-allowed; box-shadow: none; }

.input-hint { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding: 0 4px; font-size: 12px; color: var(--chat-muted); }
.hint-conn { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.hint-conn.ok { color: #167238; }
.theme-dark .hint-conn.ok { color: #7de49c; }
.hint-conn:not(.ok) { color: #c0392b; }

/* 表情面板 */
.emoji-panel {
  max-height: 260px;
  overflow-y: auto;
  background: #fafbfd;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 12px;
  margin-bottom: 10px;
  box-shadow: 0 -6px 30px rgba(40,45,80,0.1);
}
.emoji-panel-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; color: #5a5f8a; margin-bottom: 8px; }
.emoji-close { border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 14px; }
.emoji-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 6px; }
.emoji-item { font-size: 20px; padding: 4px; background: transparent; border: none; border-radius: 8px; cursor: pointer; transition: background 0.15s; }
.emoji-item:hover { background: #eef1ff; }
.quick-replies { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); }
.quick-reply { font-size: 12.5px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); background: #fff; color: #5a5f8a; cursor: pointer; transition: all 0.2s; }
.quick-reply:hover { border-color: var(--primary-2); color: var(--primary); background: #f4f6ff; }

/* 表情面板过渡 */
.emoji-panel-enter-active, .emoji-panel-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.emoji-panel-enter-from, .emoji-panel-leave-to { opacity: 0; transform: translateY(8px); }

/* 滚动条 */
.messages-container::-webkit-scrollbar { width: 7px; }
.messages-container::-webkit-scrollbar-track { background: transparent; }
.messages-container::-webkit-scrollbar-thumb { background: #c6cbe0; border-radius: 4px; }
.messages-container::-webkit-scrollbar-thumb:hover { background: #a9b0cd; }
.emoji-panel::-webkit-scrollbar { width: 6px; }
.emoji-panel::-webkit-scrollbar-thumb { background: #c6cbe0; border-radius: 4px; }

/* ============ 新增：主题 / 字号 ============ */
.theme-dark .chat-container,
.chat-container.theme-dark {
  --chat-sheet: #1f2432;
  --chat-text: #e8eaf2;
  --chat-muted: #9aa2b8;
  --chat-bubble-other: #2a3145;
  --chat-border: rgba(255,255,255,0.08);
  --chat-input-bg: #272e42;
  background:
    radial-gradient(1200px 500px at 85% -10%, rgba(102,126,234,0.14), transparent 60%),
    linear-gradient(180deg, #171a24 0%, #1d2231 100%);
}
.theme-comfort .chat-container,
.chat-container.theme-comfort {
  --chat-sheet: #fbfdf8;
  --chat-text: #373d2e;
  --chat-muted: #7c846e;
  --chat-bubble-other: #fff;
  --chat-border: #e0e8d8;
  --chat-input-bg: #f5f8f0;
  background:
    radial-gradient(1200px 500px at 85% -10%, rgba(120,150,110,0.12), transparent 60%),
    linear-gradient(180deg, #eef4ea 0%, #e6eee0 100%);
}
.fs-sm .bubble-wrap .message-content { font-size: 13px; }
.fs-lg .bubble-wrap .message-content { font-size: 16.5px; }

/* ============ A1 卡片归档 / 返回提示 ============ */
.card-archive {
  position: absolute;
  right: 12px;
  top: 12px;
  font-size: 11.5px;
  font-weight: 600;
  color: #fff;
  background: rgba(0,0,0,0.4);
  padding: 3px 9px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}
.unread-hint {
  text-align: center;
  margin: 14px auto;
  padding: 7px 18px;
  width: fit-content;
  max-width: 90%;
  background: linear-gradient(135deg, #fdf3d8, #fbe8c6);
  color: #785300;
  border: 1px solid #f0d7a0;
  border-radius: 999px;
  font-size: 13px;
  animation: slideDown 0.3s ease;
}

/* ============ A4 搜索 ============ */
.search-bar { background: var(--chat-sheet); border-top: 1px solid var(--chat-border); padding: 10px 20px; }
.search-inner { display: flex; align-items: center; gap: 10px; max-width: 760px; margin: 0 auto; }
.search-ico { color: var(--text-muted); }
.search-input {
  flex: 1; padding: 8px 12px; border: 1px solid var(--chat-border); border-radius: 10px;
  font-size: 14px; outline: none; color: var(--chat-text); background: var(--chat-input-bg); transition: all 0.2s;
}
.search-input:focus { border-color: var(--primary-2); box-shadow: 0 0 0 3px rgba(102,126,234,0.15); background: var(--chat-sheet); }
.search-total { font-size: 12.5px; color: var(--primary); font-weight: 600; white-space: nowrap; }
.search-nav { padding: 6px 12px; border: none; border-radius: 8px; background: var(--primary); color: #fff; font-size: 13px; cursor: pointer; }
.search-close { border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 15px; }
.message-item.search-hit { border-radius: 12px; outline: 2px solid rgba(255, 200, 60, 0.65); outline-offset: 3px; }

/* ============ A5 操作条 & 收藏 ============ */
.message-item { position: relative; }
.msg-actions {
  flex-wrap: wrap;
  max-width: calc(100% - 16px);
  position: absolute;
  top: -12px;
  right: 8px;
  display: flex;
  gap: 4px;
  background: var(--chat-sheet);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 3px 4px;
  box-shadow: 0 6px 18px rgba(40,45,80,0.18);
  z-index: 5;
  animation: fadeIn 0.15s ease;
}
.msg-actions.actions-mine { left: 8px; right: auto; }
.msg-act { border: none; background: transparent; color: #5a5f8a; font-size: 12px; padding: 5px 9px; border-radius: 7px; cursor: pointer; white-space: nowrap; }
.msg-act:hover { background: #eef1ff; color: var(--primary); }
.msg-act.fav { color: #e2555a; }
.msg-act.del { color: #c0392b; }
.msg-favorite {
  position: absolute;
  right: -6px;
  top: -6px;
  width: 22px; height: 22px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: #fff;
  border: 1px solid var(--border);
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  padding: 0;
  transition: all 0.2s;
}
.bubble-wrap:hover .msg-favorite, .msg-favorite.on, .msg-favorite:focus-visible { opacity: 1; }
.msg-favorite.on { color: #e2555a; border-color: #f2b8ba; background: #fff2f2; }
.message-content :deep(.msg-link) { color: #2e7dff; text-decoration: underline; word-break: break-all; }
.message-content :deep(.msg-mention) { color: #7c3aed; background: rgba(124,58,237,0.08); border-radius: 4px; padding: 0 3px; }

/* ============ A5 收藏面板 / A8-A6 设置面板 ============ */
.favorites-panel, .settings-panel {
  background: var(--chat-sheet);
  color: var(--chat-text);
  border-top: 1px solid var(--chat-border);
  padding: 14px 20px;
  max-height: 300px;
  overflow-y: auto;
}
.panel-head { font-size: 14px; font-weight: 700; color: var(--chat-text); margin-bottom: 10px; }
.panel-head small { font-weight: 400; color: var(--chat-muted); font-size: 12px; }
.panel-empty { color: var(--chat-muted); font-size: 13px; padding: 16px 0; text-align: center; }
.favorites-list { display: flex; flex-direction: column; gap: 8px; }
.fav-item { display: flex; gap: 10px; align-items: flex-start; background: color-mix(in srgb, var(--chat-sheet) 82%, #f8f9ff); border-radius: 12px; padding: 10px 12px; }
.fav-avatar { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 13px; flex-shrink: 0; }
.fav-body { display: flex; flex-direction: column; min-width: 0; }
.fav-meta { font-size: 11.5px; color: var(--chat-muted); }
.fav-text { font-size: 13.5px; color: var(--chat-text); word-break: break-word; }

.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px dashed var(--border); }
.setting-row:last-child { border-bottom: none; }
.setting-label { font-size: 13.5px; color: var(--chat-text); }
.switch { position: relative; width: 44px; height: 24px; flex-shrink: 0; }
.switch input { opacity: 0; width: 0; height: 0; }
.switch input:focus-visible + .slider { outline: 2px solid var(--primary); outline-offset: 3px; }
.slider { position: absolute; inset: 0; background: #ccd1e0; border-radius: 999px; transition: 0.25s; cursor: pointer; }
.slider::before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: 0.25s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.switch input:checked + .slider { background: var(--gradient-primary); }
.switch input:checked + .slider::before { transform: translateX(20px); }
.seg { display: flex; gap: 4px; }
.seg button { padding: 5px 13px; border: 1px solid var(--border); background: #fff; color: var(--text-secondary); border-radius: 8px; font-size: 12.5px; cursor: pointer; }
.seg button.active { background: var(--primary); border-color: var(--primary); color: #fff; }

.greeting-edit { display: flex; flex-direction: column; gap: 8px; }
.greeting-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.greeting-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 4px 8px; background: color-mix(in srgb, var(--chat-sheet) 80%, #f0f2fc); color: var(--chat-text); border-radius: 999px; }
.chip-del { border: none; background: transparent; color: #b0b6c9; cursor: pointer; font-size: 11px; }
.greeting-add { display: flex; gap: 6px; }
.greeting-add input { flex: 1; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; outline: none; }
.greeting-add button { padding: 6px 12px; border: none; border-radius: 8px; background: var(--primary); color: #fff; font-size: 13px; cursor: pointer; }
.greeting-add .reset-btn { background: #eef1ff; color: var(--primary); }

/* ============ A3 快捷问候条 ============ */
.greeting-strip { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.strip-label { color: var(--text-muted); }
.strip-chips { display: flex; gap: 6px; flex-wrap: wrap; overflow: hidden; }
.strip-chip {
  font-size: 12px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--chat-border);
  background: var(--chat-sheet); color: var(--chat-text); cursor: pointer; white-space: nowrap; transition: all 0.2s;
}
.strip-chip:hover { border-color: var(--primary-2); color: var(--primary); background: #f4f6ff; }
.strip-more { border: none; background: #eef1ff; color: var(--primary); width: 28px; height: 26px; border-radius: 50%; cursor: pointer; }

/* ============ 选中图标圈 (搜索/收藏/设置) ============ */
.icon-btn-circle { position: relative; }
.icon-btn-circle.on { background: #eef1ff; color: var(--primary); border-color: var(--primary-2); }
.ico-badge {
  position: absolute; top: -4px; right: -4px; min-width: 16px; height: 16px; padding: 0 3px;
  background: #e2555a; color: #fff; border-radius: 999px; font-size: 10px; display: grid; place-items: center;
}

/* ============ B9 正在输入 ============ */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--chat-muted);
  padding: 2px 6px 8px;
}
.typing-dots span {
  display: inline-block;
  width: 4px; height: 4px;
  margin: 0 1px;
  border-radius: 50%;
  background: var(--primary-2);
  animation: typing-blink 1.2s infinite;
}
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing-blink { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }

/* ============ B10 回复 ============ */
.reply-card {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  background: color-mix(in srgb, var(--chat-sheet) 72%, #eceef7);
  border-left: 3px solid var(--primary-2);
  border-radius: 8px;
  padding: 6px 10px;
  margin-bottom: 6px;
  font-size: 12.5px;
}
.bubble-wrap.mine .reply-card { background: rgba(255,255,255,0.16); border-left-color: rgba(255,255,255,0.6); }
.reply-arrow { color: var(--chat-muted); flex-shrink: 0; }
.reply-body { display: flex; flex-direction: column; min-width: 0; }
.reply-author { font-weight: 700; color: var(--primary-2); font-size: 11.5px; }
.bubble-wrap.mine .reply-author { color: rgba(255,255,255,0.9); }
.reply-text { color: var(--chat-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
.bubble-wrap.mine .reply-text { color: rgba(255,255,255,0.75); }

.replying-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #eef1ff;
  color: var(--primary);
  border-radius: 10px;
  padding: 7px 12px;
  margin-bottom: 8px;
  font-size: 13px;
}
.replying-arrow { font-size: 14px; }
.replying-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.replying-cancel { border: none; background: transparent; color: var(--chat-muted); cursor: pointer; font-size: 13px; }

/* ============ B10 表情回应 ============ */
.reaction-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
.reaction-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--chat-border);
  background: var(--chat-sheet);
  color: var(--chat-text);
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s;
}
.reaction-chip.mine { border-color: var(--primary-2); background: #eef1ff; }
.reaction-count { font-size: 11px; color: var(--chat-muted); font-weight: 600; }
.react-label { font-size: 11.5px; color: var(--chat-muted); padding: 5px 2px; }
.msg-act.react { font-size: 14px; padding: 2px 6px; }

/* 响应式 */
@media (max-width: 720px) {

  .room-grid { grid-template-columns: 1fr 1fr; }
  .bubble-wrap { max-width: 86%; }
  .btn-back span, .btn-clear-history span { display: none; }
  .chat-room { height: calc(100vh - 72px); height: calc(100dvh - 72px); padding: 8px; }
  .chat-header { flex-direction: column; align-items: stretch; gap: 12px; }
  .header-room { flex: 1; }
  .header-room h2 { overflow-wrap: anywhere; }
  .header-live { flex-wrap: wrap; }
  .header-live .live-dot, .mini-reconnect { flex-shrink: 0; }
  .header-live > span:not(.live-dot) { overflow-wrap: anywhere; }
  .mini-reconnect { white-space: nowrap; }
  .header-actions { justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .header-actions .btn-back, .header-actions .btn-clear-history { min-height: 40px; flex-shrink: 0; }
  .emoji-grid { grid-template-columns: repeat(8, 1fr); }
  .card-cover { height: 108px; }
}
@media (max-width: 520px) {
  .room-grid { grid-template-columns: 1fr; gap:10px; }
  .room-card { display:grid; grid-template-columns:32% minmax(0,1fr); text-align:left; }
  .card-cover { height:100%; min-height:112px; }
  .card-body { padding:12px; }
  .card-footer { margin-top:6px; }
  .card-online { left:6px; right:auto; bottom:6px; }
  .card-archive { top:4px; right:4px; }
  .card-icon { display:none; }
  .send-wrap .char-count { display: none; }
  .chat-header { padding: 12px 14px; }
}
</style>
