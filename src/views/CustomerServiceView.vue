<template>
  <div class="customer-service-page">
    <!-- 页面标题 -->
    <PageHeader icon="headset" title="智能客服中心" subtitle="专业旅行顾问7×24小时为您服务">
      <div class="status-badge">
        <span class="online-dot"></span>
        <span>客服在线，平均响应时间 <strong>30秒</strong></span>
      </div>
    </PageHeader>

    <!-- 服务保障横幅 -->
    <div class="service-streak">
      <div class="streak-item">
        <font-awesome-icon class="fas fa-headset streak-icon"></font-awesome-icon>
        <div class="streak-body">
          <b>7×24 小时</b>
          <span>全天候在线服务</span>
        </div>
      </div>
      <div class="streak-divider"></div>
      <div class="streak-item">
        <font-awesome-icon class="fas fa-clock streak-icon"></font-awesome-icon>
        <div class="streak-body">
          <b>30 秒</b>
          <span>平均响应速度</span>
        </div>
      </div>
      <div class="streak-divider"></div>
      <div class="streak-item">
        <font-awesome-icon class="fas fa-shield-halved streak-icon"></font-awesome-icon>
        <div class="streak-body">
          <b>100% 安心</b>
          <span>售后全程保障</span>
        </div>
      </div>
    </div>

    <!-- 离线/待回复提醒横幅 -->
    <transition name="fade">
      <div class="notice-banner" v-if="pendingReplies.length > 0" role="status">
        <font-awesome-icon class="fas fa-bell"></font-awesome-icon>
        <span>您有 <b>{{ pendingReplies.length }}</b> 条人工客服留言待回复</span>
        <button class="notice-close" @click="pendingReplies = []" aria-label="关闭提醒">
          <font-awesome-icon class="fas fa-xmark"></font-awesome-icon>
        </button>
      </div>
    </transition>

    <!-- 主内容区 -->
    <main class="service-container">
      <!-- 左侧功能区 -->
      <aside class="service-sidebar">
        <div class="service-categories">
          <h3>
            <font-awesome-icon class="fas fa-layer-group"></font-awesome-icon>
            服务分类
          </h3>
          <ul>
            <li :class="{ active: activeCategory === 'booking' }" @click="activeCategory = 'booking'">
              <span class="cat-icon"><font-awesome-icon class="fas fa-ticket-alt"></font-awesome-icon></span>
              <span class="cat-name">订单相关</span>
              <span class="cat-badge">3</span>
            </li>
            <li :class="{ active: activeCategory === 'attraction' }" @click="activeCategory = 'attraction'">
              <span class="cat-icon"><font-awesome-icon class="fas fa-map-marker-alt"></font-awesome-icon></span>
              <span class="cat-name">景点咨询</span>
              <span class="cat-badge">5</span>
            </li>
            <li :class="{ active: activeCategory === 'hotel' }" @click="activeCategory = 'hotel'">
              <span class="cat-icon"><font-awesome-icon class="fas fa-hotel"></font-awesome-icon></span>
              <span class="cat-name">酒店问题</span>
              <span class="cat-badge">2</span>
            </li>
            <li :class="{ active: activeCategory === 'payment' }" @click="activeCategory = 'payment'">
              <span class="cat-icon"><font-awesome-icon class="fas fa-credit-card"></font-awesome-icon></span>
              <span class="cat-name">支付相关</span>
              <span class="cat-badge">1</span>
            </li>
            <li :class="{ active: activeCategory === 'refund' }" @click="activeCategory = 'refund'">
              <span class="cat-icon"><font-awesome-icon class="fas fa-undo"></font-awesome-icon></span>
              <span class="cat-name">退款售后</span>
              <span class="cat-badge">4</span>
            </li>
          </ul>
        </div>

        <!-- 历史会话 -->
        <div class="history-sessions">
          <h3>
            <font-awesome-icon class="fas fa-clock-rotate-left"></font-awesome-icon>
            历史会话
            <button class="h-add" title="新建会话" @click="newSession"><font-awesome-icon class="fas fa-plus"></font-awesome-icon></button>
          </h3>
          <div class="hs-list">
            <div
              v-for="session in sessions"
              :key="session.id"
              class="hs-item"
              :class="{ active: session.id === activeSessionId }"
              @click="switchSession(session.id)"
            >
              <div class="hs-body">
                <span class="hs-title">{{ session.title }}</span>
                <span class="hs-meta">{{ session.updatedAtDisplay }}</span>
                <span class="hs-summary" v-if="session.agent === 'human'">👨‍💼 人工 · {{ getSessionSummary(session) }}</span>
                <span class="hs-summary" v-else>🤖 AI · {{ getSessionSummary(session) }}</span>
              </div>
              <div class="hs-tools">
                <button class="hs-tool" title="重命名" @click.stop="renameSession(session.id)"><font-awesome-icon class="fas fa-pen-to-square"></font-awesome-icon></button>
                <button class="hs-tool" title="删除" @click.stop="removeSession(session.id)"><font-awesome-icon class="fas fa-trash"></font-awesome-icon></button>
              </div>
            </div>
            <p v-if="sessions.length === 0" class="hs-empty">暂无历史会话</p>
          </div>
        </div>

        <div class="quick-actions">
          <h3>
            <font-awesome-icon class="fas fa-bolt"></font-awesome-icon>
            快捷功能
          </h3>
          <button class="action-btn" @click="showOrderList = true">
            <span class="action-icon-box"><font-awesome-icon class="fas fa-list-alt"></font-awesome-icon></span>
            <span class="action-text">我的订单</span>
            <span class="action-arrow"><font-awesome-icon class="fas fa-chevron-right"></font-awesome-icon></span>
          </button>
          <button class="action-btn" @click="showContactOptions = true">
            <span class="action-icon-box"><font-awesome-icon class="fas fa-phone"></font-awesome-icon></span>
            <span class="action-text">其他联系方式</span>
            <span class="action-arrow"><font-awesome-icon class="fas fa-chevron-right"></font-awesome-icon></span>
          </button>
          <button class="action-btn" @click="exportChat">
            <span class="action-icon-box"><font-awesome-icon class="fas fa-download"></font-awesome-icon></span>
            <span class="action-text">导出对话</span>
            <span class="action-arrow"><font-awesome-icon class="fas fa-chevron-right"></font-awesome-icon></span>
          </button>
        </div>

        <div class="service-hours-card">
          <div class="hours-head">
            <font-awesome-icon class="fas fa-clock"></font-awesome-icon>
            <span>服务时间</span>
          </div>
          <p class="hours-line"><b>人工客服</b> 07:00 - 24:00</p>
          <p class="hours-line"><b>智能客服</b> 全天候在线</p>
          <div class="hours-progress">
            <span class="hours-progress-bar"></span>
          </div>
          <p class="hours-note">当前时段人工客服<b>{{ humanOnline ? '在线' : '离线' }}</b></p>
          <label class="hours-toggle">
            <input type="checkbox" v-model="humanOnline" />
            <span class="toggle-track"></span>
            <span class="toggle-label">模拟人工{{ humanOnline ? '在线' : '离线' }}</span>
          </label>
        </div>
      </aside>

      <!-- 中间聊天区 -->
      <section class="chat-section">
        <div class="chat-header">
          <div class="agent-info">
            <div class="agent-avatar" :class="{ 'is-ai': currentAgent === 'ai' }">
              <app-image :src="currentAgent === 'human' ? '/default-avatar.svg' : '/images/ai-avatar.svg'" alt="客服头像" kind="avatar" />
              <span class="presence-dot" :class="{ ai: currentAgent === 'ai', offline: currentAgent === 'human' && !humanOnline }"></span>
              <span v-if="currentAgent === 'ai'" class="ai-badge"><font-awesome-icon class="fas fa-robot"></font-awesome-icon></span>
            </div>
            <div class="agent-details">
              <div class="agent-name-row">
                <h3>旅行顾问-小杜</h3>
                <span class="agent-role-tag" :class="{ ai: currentAgent === 'ai' }">
                  {{ currentAgent === 'human' ? '人工' : 'AI' }}
                </span>
                <span v-if="currentAgent === 'human' && !humanOnline" class="agent-offline-tag">离线</span>
              </div>
              <p>{{ agentStatusText }}</p>
              <span class="agent-online"><span class="online-mini-dot" :class="{ off: currentAgent === 'human' && !humanOnline }"></span>{{ agentPresenceText }}</span>
            </div>
          </div>
          <div class="chat-actions">
            <!-- 客服类型切换胶囊 -->
            <div class="agent-switch" role="tablist" aria-label="切换客服类型">
              <button
                class="switch-opt"
                :class="{ active: currentAgent === 'human' }"
                @click="currentAgent !== 'human' && toggleAgentType()"
              >
                <font-awesome-icon class="fas fa-user"></font-awesome-icon> 人工
              </button>
              <button
                class="switch-opt"
                :class="{ active: currentAgent === 'ai' }"
                @click="currentAgent !== 'ai' && toggleAgentType()"
              >
                <font-awesome-icon class="fas fa-robot"></font-awesome-icon> AI
              </button>
            </div>
            <button class="action-icon" title="刷新对话" @click="resetConversation">
              <font-awesome-icon class="fas fa-sync-alt"></font-awesome-icon>
            </button>
            <button class="action-icon" title="导出对话" @click="exportChat">
              <font-awesome-icon class="fas fa-download"></font-awesome-icon>
            </button>
            <div class="model-selector" v-if="currentAgent === 'ai'">
              <select v-model="aiModel" @change="onModelChange" class="model-select" :disabled="isTyping">
                <option value="open-source-llm">Qwen3-Max (默认)</option>
                <option value="qwen3-max">Qwen3-Max</option>
                <option value="qwen-turbo">Qwen-Turbo</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 排队等待横幅 -->
        <transition name="fade">
          <div class="queue-banner" v-if="queue.waiting" role="status">
            <span class="queue-spinner"><font-awesome-icon class="fas fa-spinner" spin></font-awesome-icon></span>
            <div>
              <b>正在为您转接人工客服</b>
              <span>您前面有 {{ queue.position }} 位排队，预计等待约 {{ queue.waitSec }} 秒</span>
            </div>
            <button class="queue-cancel" @click="cancelQueue">取消排队</button>
          </div>
        </transition>

        <div class="chat-messages" ref="chatContainer">
          <!-- 欢迎横幅 -->
          <div v-if="messages.length === 0" class="welcome-hero">
            <div class="welcome-glow"></div>
            <div class="welcome-bot">
              <span class="welcome-emoji">👋</span>
            </div>
            <h2 class="welcome-title">您好，我是小杜</h2>
            <p class="welcome-sub">{{ currentAgent === 'human' ? '您的专属旅行顾问，很高兴为您服务！' : '您的智能旅行助手，随时为您解答！' }}</p>
            <div class="welcome-quick-replies">
              <button @click="sendMessage('查询我的订单')">
                <span class="wr-icon"><font-awesome-icon class="fas fa-search"></font-awesome-icon></span> 查询我的订单
              </button>
              <button @click="sendMessage('修改酒店预订日期')">
                <span class="wr-icon"><font-awesome-icon class="fas fa-edit"></font-awesome-icon></span> 修改酒店预订
              </button>
              <button @click="sendMessage('景点门票如何退款')">
                <span class="wr-icon"><font-awesome-icon class="fas fa-money-bill-wave"></font-awesome-icon></span> 门票退款问题
              </button>
              <button @click="sendMessage('如何开具发票')">
                <span class="wr-icon"><font-awesome-icon class="fas fa-file-invoice"></font-awesome-icon></span> 开具发票
              </button>
            </div>
          </div>

          <!-- 统一消息渲染 -->
          <template v-for="(message, index) in messages" :key="index">
            <!-- 用户消息 -->
            <div v-if="message.type === 'user'" class="message user">
              <div class="msg-hover-actions">
                <button class="msg-act" title="复制" @click.prevent="copyText(message.text)"><font-awesome-icon class="fas fa-copy"></font-awesome-icon></button>
                <button v-if="index === messages.length - 1 && !isTyping" class="msg-act" title="重新发送" @click.prevent="resendLastUser(message)"><font-awesome-icon class="fas fa-rotate-left"></font-awesome-icon></button>
              </div>
              <div class="message-content">
                <template v-if="message.image">
                  <img :src="message.image" class="user-image" alt="用户上传图片" />
                </template>
                <template v-if="message.text">{{ message.text }}</template>
              </div>
              <div class="message-time-row"><span class="message-time">{{ message.time }}</span></div>
            </div>

            <!-- 客服回复 -->
            <div v-else-if="message.type === 'bot'" class="message bot" :class="{ 'streaming': message.streaming, 'error': message.error }" :role="message.error ? 'alert' : undefined">
              <div class="bot-avatar">
                <app-image :src="currentAgent === 'human' ? '/default-avatar.svg' : '/images/ai-avatar.svg'" alt="客服头像" kind="avatar" />
                <span v-if="currentAgent === 'ai'" class="ai-badge"><font-awesome-icon class="fas fa-robot"></font-awesome-icon></span>
              </div>
              <!-- 流式输出时添加特殊样式 -->
              <div class="message-content">
                <p :class="{ 'streaming-text': message.streaming }">
                  {{ message.text }}
                  <span v-if="message.streaming" class="typing-cursor">|</span>
                </p>
                <button v-if="message.error && message.retryable && currentAgent === 'ai' && message.model === aiModel" class="retry-reply" :disabled="isTyping" @click="retryMessage(message)">重试</button>

                <!-- 结构化信息标签 -->
                <div v-if="message.categories && message.categories.length > 0" class="structured-tags">
                  <span v-for="category in message.categories" :key="category" class="tag" :class="`category-${category}`">
                    {{ getCategoryDisplayName(category) }}
                  </span>
                </div>

                <!-- 订单卡片 -->
                <div v-if="message.orderRefs && message.orderRefs.length > 0" class="order-cards">
                  <div class="order-card" v-for="order in message.orderRefs" :key="order.id">
                    <div class="oc-status" :class="order.statusClass">{{ order.status }}</div>
                    <div class="oc-info">
                      <b>{{ order.title }}</b>
                      <span>{{ order.date }} · ¥{{ order.amount }}</span>
                    </div>
                    <button class="oc-action" @click="focusOrder(order)">查看</button>
                  </div>
                </div>

                <!-- 意图行动按钮 -->
                <div v-if="message.actions && message.actions.length > 0" class="intent-actions">
                  <button v-for="action in message.actions" :key="action.label" class="intent-btn" @click="handleIntent(action)">
                    <font-awesome-icon class="fas" :class="action.icon"></font-awesome-icon> {{ action.label }}
                  </button>
                </div>

                <!-- 操作选项 -->
                <div v-if="message.options" class="reply-options">
                  <a v-for="(option, i) in message.options" :key="i" @click.stop="handleReplyOption(option)" class="option-link">
                    <font-awesome-icon v-if="option.value === 'resolved'" class="fas fa-check-circle"></font-awesome-icon>
                    <font-awesome-icon v-else-if="option.value === 'more_help'" class="fas fa-question-circle"></font-awesome-icon>
                    <font-awesome-icon v-else-if="option.value === 'switch_to_ai'" class="fas fa-robot"></font-awesome-icon>
                    <font-awesome-icon v-else-if="option.value === 'switch_to_human'" class="fas fa-user-friends"></font-awesome-icon>
                    {{ option.label }}
                  </a>
                </div>

                <!-- 满意度评分 -->
                <div v-if="message.showRating" class="rating-panel">
                  <span class="rating-label">本次服务是否满意？</span>
                  <div class="rating-stars">
                    <button
                      v-for="star in 5"
                      :key="star"
                      class="star-btn"
                      :class="{ active: star <= (message.rating || 0) }"
                      @click="setRating(message, star)"
                      :aria-label="`${star} 星`"
                    >
                      <font-awesome-icon class="fas fa-star"></font-awesome-icon>
                    </button>
                  </div>
                  <span v-if="message.rating" class="rating-thanks">感谢您的评价！⭐</span>
                </div>

                <!-- 客服消息反馈按钮 -->
                <div v-if="!message.error && !message.showRating" class="msg-feedback">
                  <button class="fb-btn" :class="{ on: message.helpful === 'up' }" title="有帮助" @click="helpful(message, 'up')">
                    <font-awesome-icon class="fas fa-thumbs-up"></font-awesome-icon>
                  </button>
                  <button class="fb-btn" :class="{ on: message.helpful === 'down' }" title="没帮助" @click="helpful(message, 'down')">
                    <font-awesome-icon class="fas fa-thumbs-down"></font-awesome-icon>
                  </button>
                  <button class="fb-btn" title="复制" @click="copyText(message.text)"><font-awesome-icon class="fas fa-copy"></font-awesome-icon></button>
                </div>
              </div>
              <div class="message-time-row"><span class="message-time">{{ message.time }}</span></div>
            </div>
          </template>

          <!-- 正在输入提示 -->
          <div class="typing-indicator" v-if="isTyping">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
            <span>{{ currentAgent === 'human' ? '小杜正在输入...' : 'AI 正在思考...' }}</span>
          </div>

          <!-- 到达底部占位 -->
          <div ref="chatEnd"></div>
        </div>

        <!-- 快捷话题 + 常用语 -->
        <div class="quick-topics" v-if="messages.length > 0">
          <span class="qt-label">快捷：</span>
          <button v-for="topic in quickTopics" :key="topic" class="qt-chip" @click="sendMessage(topic)" :disabled="isTyping">
            {{ topic }}
          </button>
          <button class="qt-chip qp-toggle" @click="showQuickPhrases = !showQuickPhrases" :class="{ on: showQuickPhrases }">
            <font-awesome-icon class="fas fa-comments"></font-awesome-icon> 常用语
          </button>
        </div>

        <!-- 常用语与表情面板 -->
        <transition name="fade">
          <div class="quick-phrases" v-if="showQuickPhrases">
            <div class="qp-group">
              <span class="qp-label">常用语</span>
              <button v-for="phrase in quickPhrases" :key="phrase" class="qp-chip" @click="sendMessage(phrase)" :disabled="isTyping">{{ phrase }}</button>
            </div>
            <div class="qp-group">
              <span class="qp-label">表情</span>
              <button v-for="emoji in emojis" :key="emoji" class="qp-emoji" @click="appendEmoji(emoji)" :disabled="isTyping">{{ emoji }}</button>
            </div>
          </div>
        </transition>

        <div class="chat-input-area">
          <div class="input-row">
            <label class="attach-btn" title="发送图片/附件">
              <input type="file" accept="image/*" ref="fileInput" class="file-input" @change="onFileChange" />
              <font-awesome-icon class="fas fa-image"></font-awesome-icon>
            </label>
            <div class="input-container">
              <input
                type="text"
                v-model="messageInput"
                :placeholder="inputPlaceholder"
                maxlength="4000"
                @keydown.enter="!$event.isComposing && sendMessage()"
                @keydown.up="editLastMessage"
              >
              <button v-if="isTyping" class="stop-reply" @click="stopReply">
                <font-awesome-icon class="fas fa-stop"></font-awesome-icon> 停止
              </button>
              <button class="send-btn" title="发送消息" :disabled="isTyping || !messageInput.trim()" @click="sendMessage()">
                <font-awesome-icon class="fas fa-paper-plane"></font-awesome-icon>
              </button>
            </div>
          </div>
          <div class="input-footer">
            <span class="input-hint"><font-awesome-icon class="fas fa-lock"></font-awesome-icon> 消息已加密传输 · ↑ 可编辑上一条</span>
            <span class="char-count">{{ [...messageInput].length }}/2000</span>
          </div>
          <p v-if="inputError" role="alert" class="input-error">{{ inputError }}</p>
        </div>
      </section>

      <!-- 右侧帮助区 -->
      <aside class="help-sidebar">
        <div class="faq-section">
          <h3>
            <font-awesome-icon class="fas fa-circle-question"></font-awesome-icon>
            热门问题
          </h3>
          <div class="faq-search">
            <font-awesome-icon class="fas fa-magnifying-glass"></font-awesome-icon>
            <input v-model="faqSearch" type="text" placeholder="搜索常见问题..." />
          </div>
          <div class="faq-list">
            <transition-group name="faq">
              <div class="faq-item" v-for="(faq, index) in filteredFaqs" :key="faq.question">
                <button class="faq-question" @click="toggleFaq(index)">
                  <span class="faq-q">{{ faq.question }}</span>
                  <font-awesome-icon class="fas fa-chevron-down" :class="{ rotated: faq.open }"></font-awesome-icon>
                </button>
                <div class="faq-answer" v-if="faq.open">
                  {{ faq.answer }}
                  <div v-if="faq.buttons" class="faq-buttons">
                    <button v-for="btn in faq.buttons" :key="btn.label" @click="sendMessage(btn.message)">
                      <font-awesome-icon v-if="btn.label.includes('修改')" class="fas fa-edit"></font-awesome-icon>
                      <font-awesome-icon v-else-if="btn.label.includes('取消')" class="fas fa-times-circle"></font-awesome-icon>
                      <font-awesome-icon v-else-if="btn.label.includes('退款')" class="fas fa-undo-alt"></font-awesome-icon>
                      <font-awesome-icon v-else class="fas fa-info-circle"></font-awesome-icon>
                      {{ btn.label }}
                    </button>
                  </div>
                </div>
              </div>
            </transition-group>
            <p v-if="filteredFaqs.length === 0" class="faq-empty">未找到相关问题，请直接咨询客服</p>
          </div>
        </div>

        <div class="service-channels">
          <h3>
            <font-awesome-icon class="fas fa-headset"></font-awesome-icon>
            其他服务渠道
          </h3>
          <div class="channel-item">
            <span class="channel-icon"><font-awesome-icon class="fas fa-phone-alt"></font-awesome-icon></span>
            <div>
              <h4>电话客服</h4>
              <p>400-123-4567</p>
              <small>7:00-24:00</small>
            </div>
          </div>
          <div class="channel-item">
            <span class="channel-icon"><font-awesome-icon class="fas fa-envelope"></font-awesome-icon></span>
            <div>
              <h4>邮箱反馈</h4>
              <p>support@zhiyou.com</p>
              <small>24小时内回复</small>
            </div>
          </div>
          <div class="channel-item">
            <span class="channel-icon"><font-awesome-icon class="fas fa-comments"></font-awesome-icon></span>
            <div>
              <h4>微信客服</h4>
              <p class="channel-note">即将上线</p>
              <div class="qrcode-unavailable" role="status">
                <font-awesome-icon class="fas fa-spinner" aria-hidden="true"></font-awesome-icon>
                <span>微信客服正在准备中，敬请期待；如有需求，欢迎使用上方电话、邮箱或智能客服。</span>
              </div>
            </div>
          </div>
        </div>

        <div class="satisfaction-cta">
          <font-awesome-icon class="fas fa-star"></font-awesome-icon>
          <div>
            <b>服务不错？</b>
            <span>给小杜打个好评吧</span>
          </div>
          <button @click="openFeedbackModal"><font-awesome-icon class="fas fa-heart"></font-awesome-icon></button>
        </div>
      </aside>
    </main>

    <!-- 订单列表弹窗 -->
    <div class="modal" v-if="showOrderList">
      <div class="modal-content">
        <div class="modal-header">
          <h2><font-awesome-icon class="fas fa-list-alt"></font-awesome-icon> 我的最近订单</h2>
          <button class="close-btn" @click="showOrderList = false" aria-label="关闭">
            <font-awesome-icon class="fas fa-times"></font-awesome-icon>
          </button>
        </div>
        <div class="order-list">
          <div class="order-item" v-for="order in recentOrders" :key="order.id">
            <div class="order-status" :class="order.statusClass">{{ order.status }}</div>
            <div class="order-info">
              <h4>{{ order.title }}</h4>
              <p><font-awesome-icon class="fas fa-tag"></font-awesome-icon> 订单号: {{ order.orderNo }}</p>
              <p><font-awesome-icon class="fas fa-calendar"></font-awesome-icon> 日期: {{ order.date }}</p>
              <p><font-awesome-icon class="fas fa-money-bill-wave"></font-awesome-icon> 金额: <strong>¥{{ order.amount }}</strong></p>
            </div>
            <button class="order-action" @click="sendOrderToChat(order)">
              <font-awesome-icon class="fas fa-paper-plane"></font-awesome-icon> 发送给客服
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 其他联系方式弹窗 -->
    <div class="modal" v-if="showContactOptions">
      <div class="modal-content">
        <div class="modal-header">
          <h2><font-awesome-icon class="fas fa-share-nodes"></font-awesome-icon> 其他联系方式</h2>
          <button class="close-btn" @click="showContactOptions = false" aria-label="关闭">
            <font-awesome-icon class="fas fa-times"></font-awesome-icon>
          </button>
        </div>
        <div class="contact-options-list">
          <div class="contact-option-item">
            <span class="contact-icon"><font-awesome-icon class="fas fa-phone-alt"></font-awesome-icon></span>
            <div class="contact-option-body">
              <h4>电话客服</h4>
              <p>400-123-4567</p>
              <small>7:00-24:00</small>
            </div>
            <font-awesome-icon class="fas fa-chevron-right contact-arrow"></font-awesome-icon>
          </div>
          <div class="contact-option-item">
            <span class="contact-icon"><font-awesome-icon class="fas fa-envelope"></font-awesome-icon></span>
            <div class="contact-option-body">
              <h4>邮箱反馈</h4>
              <p>support@zhiyou.com</p>
              <small>24小时内回复</small>
            </div>
            <font-awesome-icon class="fas fa-chevron-right contact-arrow"></font-awesome-icon>
          </div>
          <div class="contact-option-item">
            <span class="contact-icon"><font-awesome-icon class="fas fa-comments"></font-awesome-icon></span>
            <div class="contact-option-body">
              <h4>微信客服</h4>
              <p>微信客服正在准备中，敬请期待</p>
              <small>如有需求可先使用电话或邮箱</small>
            </div>
            <font-awesome-icon class="fas fa-chevron-right contact-arrow"></font-awesome-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- 满意度反馈弹窗 -->
    <div class="modal" v-if="showFeedbackModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2><font-awesome-icon class="fas fa-star"></font-awesome-icon> 满意度反馈</h2>
          <button class="close-btn" @click="showFeedbackModal = false" aria-label="关闭">
            <font-awesome-icon class="fas fa-times"></font-awesome-icon>
          </button>
        </div>
        <div class="feedback-body">
          <p class="feedback-title">您对本次客服服务满意吗？</p>
          <div class="feedback-stars">
            <button
              v-for="star in 5"
              :key="star"
              class="star-btn big"
              :class="{ active: star <= (feedbackRating || 0) }"
              @click="feedbackRating = star"
              :aria-label="`${star} 星`"
            >
              <font-awesome-icon class="fas fa-star"></font-awesome-icon>
            </button>
          </div>
          <div class="feedback-tags" v-if="feedbackRating">
            <button
              v-for="tag in feedbackTags"
              :key="tag"
              class="feedback-tag"
              :class="{ active: feedbackTag === tag }"
              @click="feedbackTag = tag"
            >{{ tag }}</button>
          </div>
          <button class="feedback-submit" :disabled="!feedbackRating" @click="submitFeedback">
            <font-awesome-icon class="fas fa-paper-plane"></font-awesome-icon> 提交评价
          </button>
        </div>
      </div>
    </div>

    <!-- 遮罩层 -->
    <div class="overlay" v-if="showOrderList || showContactOptions || showFeedbackModal" @click="closeModals"></div>
  </div>
</template>

<script>
import AppImage from '../ui/AppImage.js'
import { FontAwesomeIcon } from '../ui/fontAwesome.js'
import PageHeader from '../components/PageHeader.vue'
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { aiService } from '../services/aiService.js';
import { apiErrorMessage, isRequestCancelled } from '../services/apiClient.js';
import { getCurrentUser } from '../services/authService.js';
import { readUserData } from '../services/userDataService.js';
import { createId } from '../utils/id.js';

const SESSIONS_KEY = 'cs:sessions:v1';

// localStorage 安全封装：测试/极端环境下缺少 storage 也不抛错。
const safeStore = {
  get(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null } catch { return null }
  },
  set(key, value) {
    try {
      if (globalThis.localStorage && typeof globalThis.localStorage.setItem === 'function') {
        globalThis.localStorage.setItem(key, value)
      }
    } catch { /* 忽略存储失败 */ }
  },
  remove(key) {
    try { globalThis.localStorage?.removeItem(key) } catch { /* 忽略 */ }
  }
};

const STATUS_TEXT = {
  order: { text: '请告知您需要处理的订单，或直接在下方选择并发送给我。', actions: [{ label: '查看我的订单', value: 'list_orders', icon: 'fa-list-alt' }] },
  hotel: { text: '酒店相关问题可以为您提供帮助：修改入住日期、升级房型、添加服务、延迟退房等。请问需要哪种？', actions: [{ label: '查看酒店订单', value: 'list_orders', icon: 'fa-hotel' }] },
  refund: { text: '退款通常 3-7 个工作日到账，具体取决于支付方式。可在“我的订单”查看进度，需要我帮您查询退款状态吗？', actions: [{ label: '查看退款进度', value: 'list_orders', icon: 'fa-undo' }] },
  invoice: { text: '您可在订单完成后，在“我的订单”中点击“申请发票”，填写信息后我们会尽快为您开具电子发票。', actions: [{ label: '去开发票', value: 'list_orders', icon: 'fa-file-invoice' }] }
};

export default {
  components: { AppImage, FontAwesomeIcon, PageHeader },
  name: 'CustomerServicePage',
  setup() {
    // 状态管理
    const activeCategory = ref('booking');
    const messageInput = ref('');
    const messages = ref([]);
    const isTyping = ref(false);
    const inputError = ref('');
    let sessionVersion = 0;
    let disposed = false;
    let activeRequest = null;
    const pendingTimers = new Set();
    const chatEnd = ref(null);
    const schedule = (callback, delay) => {
      const version = sessionVersion;
      const timer = setTimeout(() => {
        pendingTimers.delete(timer);
        if (!disposed && version === sessionVersion) callback();
      }, delay);
      pendingTimers.add(timer);
    };
    const invalidateConversation = () => {
      sessionVersion++;
      activeRequest?.controller.abort();
      activeRequest = null;
      for (const timer of pendingTimers) clearTimeout(timer);
      pendingTimers.clear();
      isTyping.value = false;
      inputError.value = '';
    };
    onBeforeUnmount(() => { disposed = true; invalidateConversation(); cancelQueue(); persistSessions(); });
    const showOrderList = ref(false);
    const showContactOptions = ref(false);
    const showFeedbackModal = ref(false);
    const chatContainer = ref(null);
    const currentAgent = ref('human');
    const aiModel = ref('open-source-llm');
    const humanOnline = ref(true);
    const pendingReplies = ref([]);

    // 排队模拟
    const queue = reactive({ waiting: false, position: 0, waitSec: 0 });
    let queueTimer = null;

    // 常用语 / 表情
    const quickPhrases = [
      '我需要开发票', '我要改签订单', '查询退款进度', '升级酒店房型',
      '联系人工客服', '我的订单有问题', '如何退订保险', '查询景点开放时间'
    ];
    const emojis = ['😀', '😊', '🙏', '👍', '😅', '😢', '🥰', '🤔', '😮', '❤️'];
    const showQuickPhrases = ref(false);

    // ============ 历史会话（localStorage 持久化） ============
    const sessions = ref([]);
    const activeSessionId = ref(null);
    const formatShortTime = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      if (sameDay) return `${hh}:${mm}`;
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };
    function loadSessions() {
      const raw = safeStore.get(SESSIONS_KEY);
      let list = [];
      if (raw) { try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) list = parsed; } catch { list = [] } }
      list = list.map(s => ({ ...s, messages: Array.isArray(s.messages) ? s.messages : [] }));
      sessions.value = list;
      return list;
    }
    function saveSessionsLocal() {
      safeStore.set(SESSIONS_KEY, JSON.stringify(sessions.value.map(s => ({ ...s, updatedAtDisplay: undefined }))));
    }
    function persistSessions() {
      const current = sessions.value.find(s => s.id === activeSessionId.value);
      if (current) {
        current.messages = messages.value;
        current.updatedAt = new Date().toISOString();
        current.agent = currentAgent.value;
        current.summary = buildSummary();
        current.updatedAtDisplay = formatShortTime(current.updatedAt);
      }
      saveSessionsLocal();
    }
    function buildSummary() {
      const userMsgs = messages.value.filter(m => m.type === 'user');
      if (userMsgs.length === 0) return '新会话';
      return (userMsgs[0].text || '图片').slice(0, 20);
    }
    function getSessionSummary(session) {
      return session.summary || (session.messages.find(m => m.type === 'user')?.text || '新会话').slice(0, 20);
    }
    function newSession() {
      persistSessions();
      invalidateConversation();
      messages.value = [];
      messageInput.value = '';
      const id = createId();
      const now = new Date().toISOString();
      const session = { id, title: '新会话', agent: currentAgent.value, updatedAt: now, updatedAtDisplay: formatShortTime(now), summary: '', messages: [] };
      sessions.value.unshift(session);
      activeSessionId.value = id;
      saveSessionsLocal();
      schedule(addWelcome, 100);
    }
    function switchSession(id) {
      if (id === activeSessionId.value) return;
      persistSessions();
      invalidateConversation();
      const target = sessions.value.find(s => s.id === id);
      if (!target) return;
      activeSessionId.value = id;
      currentAgent.value = target.agent || 'human';
      aiModel.value = target.aiModel || aiModel.value;
      messages.value = Array.isArray(target.messages) ? target.messages.map(m => ({ ...m })) : [];
      if (messages.value.length === 0) schedule(addWelcome, 100);
      messageInput.value = '';
      scrollToBottom();
    }
    function renameSession(id) {
      persistSessions();
      const session = sessions.value.find(s => s.id === id);
      if (!session) return;
      const title = globalThis.prompt?.('请输入会话名称', session.title || '')
      if (title != null && title.trim()) { session.title = title.trim(); saveSessionsLocal(); }
    }
    function removeSession(id) {
      const index = sessions.value.findIndex(s => s.id === id);
      if (index === -1) return;
      sessions.value.splice(index, 1);
      if (id === activeSessionId.value) {
        invalidateConversation();
        const next = sessions.value[0] || null;
        if (next) {
          activeSessionId.value = next.id;
          messages.value = Array.isArray(next.messages) ? next.messages.map(m => ({ ...m })) : [];
          if (messages.value.length === 0) schedule(addWelcome, 100);
        } else {
          activeSessionId.value = null;
          messages.value = [];
          schedule(addWelcome, 100);
        }
      }
      saveSessionsLocal();
    }

    // 常用问题数据
    const faqs = reactive([
      { question: '如何修改或取消酒店预订？', answer: '您可以在"我的订单"中找到对应订单，点击"修改"或"取消"按钮操作。若距离入住时间小于24小时，建议直接联系客服处理。', open: false,
        buttons: [{ label: '去修改订单', message: '我需要修改酒店预订' }, { label: '申请取消订单', message: '我要取消酒店预订' }] },
      { question: '景点门票可以退款吗？', answer: '大部分景点门票支持提前24小时退款，部分特价票和演出票可能不支持退款。您可以在订单详情页查看具体退款政策。', open: false,
        buttons: [{ label: '查看退款政策', message: '查询景点门票退款政策' }] },
      { question: '如何开具发票？', answer: '您可以在订单完成后，在"我的订单"中找到对应订单，点击"申请发票"，填写相关信息后我们会尽快为您开具电子发票。', open: false },
      { question: '订单支付失败怎么办？', answer: '请检查您的支付方式是否有足够余额或额度，网络是否正常。若多次失败，您可以尝试更换支付方式或联系支付平台客服。', open: false },
      { question: '旅游保险如何购买？', answer: '在预订酒店或门票时，您可以选择添加旅游保险服务。若已完成预订，可在"我的订单"中找到对应产品，点击"追加服务"购买保险。', open: false }
    ]);
    const faqSearch = ref('');
    const filteredFaqs = computed(() => {
      const q = faqSearch.value.trim().toLowerCase();
      if (!q) return faqs;
      return faqs.filter(faq => (faq.question + faq.answer).toLowerCase().includes(q));
    });
    const quickTopics = ['查询订单', '修改酒店', '退款政策', '开发票', '联系人工'];

    // ============ 真实订单接入 ============
    const isLoggedIn = computed(() => Boolean(getCurrentUser()));
    const REAL_ORDERS_FALLBACK = [
      { id: 'mock-1', title: '三亚亚龙湾万豪度假酒店', orderNo: 'ZY20250716001', date: '2025-08-10 至 2025-08-15', amount: 3280, status: '已确认', statusClass: 'confirmed' },
      { id: 'mock-2', title: '上海迪士尼乐园门票', orderNo: 'ZY20250714056', date: '2025-08-12', amount: 760, status: '已付款', statusClass: 'paid' },
      { id: 'mock-3', title: '广州长隆野生动物世界', orderNo: 'ZY20250710023', date: '2025-07-20', amount: 520, status: '已完成', statusClass: 'completed' }
    ];
    const recentOrders = computed(() => {
      const user = getCurrentUser();
      if (!user) return REAL_ORDERS_FALLBACK;
      let data;
      try { data = readUserData(user.id) } catch { return REAL_ORDERS_FALLBACK }
      const orders = Array.isArray(data.orders) ? data.orders : [];
      if (orders.length === 0) return REAL_ORDERS_FALLBACK;
      const statusMap = {
        pending: ['待付款', 'pending'],
        paid: ['已付款', 'paid'],
        confirmed: ['已确认', 'confirmed'],
        completed: ['已完成', 'completed'],
        cancelled: ['已取消', 'cancelled']
      };
      return orders.slice(0, 6).map(o => {
        const [status, statusClass] = statusMap[o.status] || [o.status, 'paid'];
        return {
          id: o.id,
          title: o.name,
          orderNo: o.id,
          date: o.bookingDate,
          amount: o.totalPrice,
          status,
          statusClass
        };
      });
    });

    // 满意度反馈
    const feedbackRating = ref(0);
    const feedbackTag = ref('');
    const feedbackTags = ['响应及时', '解答专业', '服务耐心', '处理高效', '态度友好'];

    const addWelcome = () => {
      if (messages.value.length) return;
      messages.value.push({ type: 'bot', agent: currentAgent.value, text: currentAgent.value === 'human'
        ? (humanOnline.value ? '您好！我是您的专属旅行顾问小杜，很高兴为您服务！请问有什么可以帮到您？' : '您好，我是人工客服小杜！现在是非服务时段，您可以留言，我们会尽快回复。')
        : '您好！我是智能AI客服(' + getModelDisplayName() + ')，很高兴为您服务！请问有什么可以帮到您？', time: formatTime(new Date()) });
      scrollToBottom();
    };
    const resetConversation = () => {
      invalidateConversation();
      messages.value = [];
      messageInput.value = '';
      schedule(addWelcome, 500);
    };
    const toggleAgentType = () => {
      currentAgent.value = currentAgent.value === 'human' ? 'ai' : 'human';
      if (currentAgent.value === 'human') startQueue();
      resetConversation();
    };

    const stopReply = () => {
      if (!isTyping.value) return;
      invalidateConversation();
      messages.value.push({ type: 'bot', agent: currentAgent.value, text: '已停止等待，可重新发送。', time: formatTime(new Date()) });
      scrollToBottom();
    };

    // 人工客服队列
    function startQueue() {
      cancelQueue();
      queue.waiting = true;
      queue.position = 1 + Math.floor(Math.random() * 2);
      queue.waitSec = 8 + Math.floor(Math.random() * 12);
      queueTimer = setTimeout(() => { queue.waiting = false; }, 4000);
    }
    function cancelQueue() {
      if (queueTimer) { clearTimeout(queueTimer); queueTimer = null; }
      queue.waiting = false;
    }

    const getModelDisplayName = () => {
      const modelNames = { 'open-source-llm': 'Qwen3-Max', 'qwen3-max': 'Qwen3-Max', 'qwen-turbo': 'Qwen-Turbo', 'llama3-8b-instruct': 'Llama3-8B' };
      return modelNames[aiModel.value] || aiModel.value;
    };
    const onModelChange = () => {
      if (currentAgent.value !== 'ai') return;
      const wasWaiting = isTyping.value;
      invalidateConversation();
      messages.value.push({ type: 'bot', agent: 'ai', text: '已切换至 ' + getModelDisplayName() + ' 模型。' + (wasWaiting ? '上次等待已停止，请重新发送问题。' : '请问有什么可以帮到您？'), time: formatTime(new Date()) });
      scrollToBottom();
    };
    const getCategoryDisplayName = (category) => {
      const categoryNames = { 'order': '订单相关', 'refund': '退款售后', 'hotel': '酒店服务', 'flight': '机票服务', 'service': '客服支持', 'info': '信息咨询' };
      return categoryNames[category] || category;
    };

    // 意图检测：为回复附加行动按钮与订单引用
    function detectIntent(text) {
      const t = text.toLowerCase();
      if (t.includes('订单') || t.includes('订单号') || t.includes('查订单')) return 'order';
      if (t.includes('酒店') || t.includes('房型') || t.includes('入住')) return 'hotel';
      if (t.includes('退款') || t.includes('退订') || t.includes('退票')) return 'refund';
      if (t.includes('发票')) return 'invoice';
      return null;
    }

    const generateBotReply = async (userMessage) => {
      const version = sessionVersion;
      const model = aiModel.value;
      isTyping.value = true;
      if (currentAgent.value === 'human') {
        schedule(() => {
          if (!humanOnline.value) {
            // 离线留言
            messages.value.push({ type: 'bot', agent: 'human', text: '已收到您的留言，我们会在客服上线后尽快回复您。', time: formatTime(new Date()), isOfflineReply: true });
            pendingReplies.value.push(userMessage);
            isTyping.value = false;
            scrollToBottom();
            return;
          }
          const intent = detectIntent(userMessage);
          const fallback = '感谢您的咨询！针对您的问题，我已记录并会尽快为您处理。如果您需要进一步帮助，可以提供更多细节或选择左侧的服务分类。';
          const config = intent ? STATUS_TEXT[intent] : null;
          const text = intent ? config.text : fallback;
          messages.value.push({
            type: 'bot', text, agent: 'human', time: formatTime(new Date()),
            orderRefs: (intent === 'order' || intent === 'hotel' || intent === 'refund') ? recentOrders.value : [],
            actions: config ? config.actions : [],
            options: [{ label: '解决了我的问题', value: 'resolved' }, { label: '需要更多帮助', value: 'more_help' }, { label: '切换到AI客服', value: 'switch_to_ai' }]
          });
          isTyping.value = false;
          scrollToBottom();
        }, 1200);
        return;
      }
      const request = { controller: new AbortController(), model, version };
      activeRequest = request;
      const current = () => !disposed && version === sessionVersion && activeRequest === request;
      try {
        const result = await aiService.sendMessage(userMessage, { model, signal: request.controller.signal });
        if (!current()) return;
        const intent = detectIntent(userMessage);
        messages.value.push({
          type: 'bot', text: result.text, agent: 'ai', model, time: formatTime(new Date()),
          categories: result.structuredInfo.categories, keyPoints: result.structuredInfo.keyPoints,
          orderRefs: (intent === 'order' || intent === 'hotel' || intent === 'refund') ? recentOrders.value : [],
          actions: intent ? (STATUS_TEXT[intent] ? STATUS_TEXT[intent].actions : []) : [],
          options: [{ label: '解决了我的问题', value: 'resolved' }, { label: '需要更多帮助', value: 'more_help' }, { label: '切换到人工客服', value: 'switch_to_human' }]
        });
      } catch (error) {
        if (!current() || isRequestCancelled(error)) return;
        messages.value.push({ type: 'bot', text: apiErrorMessage(error), error: true, retryable: error.retryable === true, retryText: userMessage, agent: 'ai', model, time: formatTime(new Date()) });
      } finally {
        if (current()) { activeRequest = null; isTyping.value = false; scrollToBottom(); }
      }
    };
    const retryMessage = message => {
      if (isTyping.value || !message.retryable || currentAgent.value !== 'ai' || message.model !== aiModel.value) return;
      message.retryable = false;
      generateBotReply(message.retryText || message.text);
    };

    const pushUserMessage = (options) => {
      messages.value = [...messages.value, { type: 'user', time: formatTime(new Date()), ...options }];
      scrollToBottom();
    };

    const sendMessage = (text = null) => {
      if (isTyping.value) return;
      const messageText = (typeof text === 'string' ? text : messageInput.value).trim();
      if (!messageText) return;
      if ([...messageText].length > 2000) { inputError.value = '消息最多2000个字符'; return; }
      inputError.value = '';
      pushUserMessage({ text: messageText });
      messageInput.value = '';
      generateBotReply(messageText);
    };

    // 重新发送上一条用户消息
    const resendLastUser = (message) => {
      if (isTyping.value || !message?.text) return;
      generateBotReply(message.text);
    };

    // ↑ 编辑上一条用户消息
    const editLastMessage = (event) => {
      if (event.isComposing || !event.key || event.key.toLowerCase() !== 'arrowup') return;
      if (isTyping.value) return;
      const lastUser = [...messages.value].reverse().find(m => m.type === 'user' && m.text);
      if (!lastUser) return;
      event.preventDefault();
      messageInput.value = lastUser.text;
      schedule(() => {}, 0);
    };

    const sendOrderToChat = (order) => {
      if (isTyping.value) return;
      pushUserMessage({ text: `请帮我处理订单 ${order.orderNo} (${order.title})` });
      showOrderList.value = false;
      generateBotReply(`请帮我处理订单 ${order.orderNo}`);
    };
    const focusOrder = (order) => { showOrderList.value = true; };

    // 意图行动按钮处理
    const handleIntent = (action) => {
      if (action.value === 'list_orders') { showOrderList.value = true; return; }
    };

    // 客服消息反馈
    const helpful = (message, value) => {
      if (message.helpful) return;
      message.helpful = value;
    };

    // 常用语 / 表情
    const appendEmoji = (emoji) => {
      messageInput.value += emoji;
    };

    // 图片上传
    const fileInput = ref(null);
    const onFileChange = (event) => {
      const file = event.target.files && event.target.files[0];
      if (event.target) event.target.value = '';
      if (!file) return;
      if (!/^image\/(png|jpeg|webp|gif)/.test(file.type)) { inputError.value = '仅支持 PNG、JPEG、WebP、GIF 图片'; return; }
      if (file.size > 1500000) { inputError.value = '图片需小于 1.5MB'; return; }
      const reader = new FileReader();
      reader.onload = () => {
        if (disposed) return;
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) return;
        pushUserMessage({ text: '', image: dataUrl });
        messageInput.value = '';
        generateBotReply('（用户上传了一张图片，请查看后给出帮助）');
      };
      reader.readAsDataURL(file);
    };

    const toggleFaq = (index) => {
      const faq = filteredFaqs.value[index];
      if (faq) faq.open = !faq.open;
    };

    const handleReplyOption = (option) => {
      if (option.value === 'switch_to_ai' && currentAgent.value !== 'ai') {
        toggleAgentType();
      } else if (option.value === 'switch_to_human' && currentAgent.value !== 'human') {
        toggleAgentType();
      } else if (option.value === 'resolved') {
        messages.value = [...messages.value, {
          type: 'bot', text: '很高兴能帮到您！如果您还有其他问题，请随时提问。', time: formatTime(new Date()),
          showRating: true, rating: 0
        }];
        scrollToBottom();
      } else if (option.value === 'more_help') {
        messages.value = [...messages.value, {
          type: 'bot', text: '请详细描述您的问题，我会尽力为您提供更具体的帮助。', time: formatTime(new Date())
        }];
        scrollToBottom();
      }
    };

    const setRating = (message, star) => {
      message.rating = star;
      if (star >= 4) {
        schedule(() => {
          if (disposed) return;
          messages.value = [...messages.value, {
            type: 'bot', text: '感谢您的好评！您的满意是我们最大的动力，期待下次为您服务！🎉', time: formatTime(new Date()), agent: currentAgent.value
          }];
          scrollToBottom();
        }, 800);
      }
    };

    const openFeedbackModal = () => {
      feedbackRating.value = 0;
      feedbackTag.value = '';
      showFeedbackModal.value = true;
    };
    const submitFeedback = () => {
      if (!feedbackRating.value) return;
      showFeedbackModal.value = false;
      messages.value = [...messages.value, {
        type: 'bot', text: `感谢您的评价（${feedbackRating.value}分${feedbackTag.value ? ' · ' + feedbackTag.value : ''}）！我们会继续努力为您提供更好的服务。`, time: formatTime(new Date()), agent: currentAgent.value
      }];
      scrollToBottom();
      feedbackRating.value = 0;
      feedbackTag.value = '';
    };

    // 复制文本
    const copyText = (text) => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text || '').catch(() => {});
      }
    };

    // 导出对话
    const exportChat = () => {
      const lines = [];
      const agentName = currentAgent.value === 'human' ? '小杜(人工)' : `小杜(AI)`;
      lines.push('智绘旅游 · 客服对话记录');
      lines.push('时间：' + new Date().toLocaleString('zh-CN'));
      lines.push('客服：' + agentName);
      lines.push('----------------------------');
      for (const m of messages.value) {
        const who = m.type === 'user' ? '我' : agentName;
        const content = m.type === 'user' && m.image ? '[图片]' : (m.text || '');
        lines.push(`[${m.time}] ${who}: ${content}`);
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `客服对话_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const closeModals = () => {
      showOrderList.value = false;
      showContactOptions.value = false;
      showFeedbackModal.value = false;
    };

    const scrollToBottom = () => {
      nextTick(() => {
        if (!disposed) {
          if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
          if (chatEnd.value) chatEnd.value.scrollIntoView?.({ block: 'end' });
        }
      });
    };
    const formatTime = (date) => {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    // 计算显示文案
    const agentStatusText = computed(() => {
      if (currentAgent.value === 'ai') return '俺不孬嘞，有问题速度call我';
      return humanOnline.value ? '已为一亿位用户提供服务' : '当前为非服务时段，可留言';
    });
    const agentPresenceText = computed(() => {
      if (currentAgent.value === 'ai') return '智能在线';
      return humanOnline.value ? '为您服务中' : '离线 · 可留言';
    });
    const inputPlaceholder = computed(() => {
      if (currentAgent.value === 'human' && !humanOnline.value) return '客服离线中，可留言，上线后回复...';
      return '请输入您的问题，按回车发送...';
    });

    // 离开前持久化
    onMounted(() => {
      const loaded = loadSessions();
      if (loaded.length === 0) {
        const now = new Date().toISOString();
        const session = { id: createId(), title: '新会话', agent: 'human', updatedAt: now, updatedAtDisplay: formatShortTime(now), summary: '', messages: [] };
        sessions.value = [session];
        safeStore.set(SESSIONS_KEY, JSON.stringify([session]));
      }
      activeSessionId.value = sessions.value[0]?.id || null;
      schedule(addWelcome, 500);
    });
    watch([isTyping, () => messages.value.length, currentAgent], () => {
      persistSessions();
    });

    return {
      inputError, resetConversation, stopReply, retryMessage,
      activeCategory, messageInput, messages, isTyping,
      showOrderList, showContactOptions, showFeedbackModal,
      chatContainer, chatEnd, currentAgent, aiModel,
      faqs, filteredFaqs, faqSearch, quickTopics,
      recentOrders, pendingReplies, humanOnline, queue,
      showQuickPhrases, quickPhrases, emojis,
      sessions, activeSessionId,
      feedbackRating, feedbackTag, feedbackTags,
      agentStatusText, agentPresenceText, inputPlaceholder,
      sendMessage, sendOrderToChat, toggleFaq, closeModals,
      toggleAgentType, handleReplyOption, onModelChange,
      getModelDisplayName, getCategoryDisplayName,
      setRating, copyText, openFeedbackModal, submitFeedback,
      helpful, resendLastUser, editLastMessage, handleIntent, focusOrder,
      appendEmoji, fileInput, onFileChange, exportChat,
      newSession, switchSession, renameSession, removeSession, getSessionSummary,
      cancelQueue
    };
  }
};
</script>

<style scoped>
.retry-reply,
.stop-reply {
  padding: 8px 14px;
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  background: #fff;
  color: #4361ee;
  white-space: nowrap;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.25s ease;
}
.retry-reply:hover,
.stop-reply:hover { background: #eef1ff; }
.send-btn:disabled,
.retry-reply:disabled,
.stop-reply:disabled { opacity: 0.5; cursor: not-allowed; }

.customer-service-page {
  max-width: 1460px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: linear-gradient(160deg, #f5f7fb 0%, #eef1fb 40%, #ffffff 100%);
  min-height: 100vh;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(10px);
  padding: 8px 20px;
  border-radius: 24px;
  font-size: 14px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}
.status-badge:hover { background: rgba(255, 255, 255, 0.35); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
.online-dot { width: 12px; height: 12px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
@keyframes pulse {
  0% { opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  50% { opacity: 0.8; box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
  100% { opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

/* 服务保障横幅 */
.service-streak {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 16px 24px;
  margin-bottom: 18px;
  box-shadow: 0 4px 18px rgba(102, 126, 234, 0.08);
  flex-wrap: wrap;
}
.streak-item { display: flex; align-items: center; gap: 12px; }
.streak-icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: linear-gradient(135deg, #eef1ff 0%, #e0e6ff 100%);
  color: #5b6ee1; display: flex; align-items: center; justify-content: center; font-size: 18px;
}
.streak-body { display: flex; flex-direction: column; }
.streak-body b { font-size: 15px; color: #1e293b; font-weight: 600; }
.streak-body span { font-size: 12px; color: #94a3b8; }
.streak-divider { width: 1px; height: 32px; background: #eef1f5; }
@media (max-width: 640px) { .streak-divider { display: none; } .service-streak { gap: 14px; } }

/* 离线提醒横幅 */
.notice-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border: 1px solid #fcd34d;
  border-radius: 14px;
  padding: 12px 18px;
  margin-bottom: 16px;
  color: #78350f;
  font-size: 14px;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.15);
}
.notice-banner b { font-weight: 700; }
.notice-close {
  margin-left: auto;
  border: none;
  background: rgba(255,255,255,0.6);
  width: 28px; height: 28px;
  border-radius: 8px;
  cursor: pointer;
  color: #92400e;
  font-size: 13px;
  transition: all 0.2s ease;
}
.notice-close:hover { background: #fff; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.service-container { display: flex; gap: 20px; height: calc(100vh - 210px); min-height: 520px; }

/* 左侧边栏 */
.service-sidebar {
  width: 230px; background: white; border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden; flex-shrink: 0; border: 1px solid rgba(0, 0, 0, 0.05);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  display: flex; flex-direction: column;
}
.service-sidebar:hover { box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08); }
.service-categories h3, .quick-actions h3, .faq-section h3, .service-channels h3, .history-sessions h3 {
  padding: 13px 16px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  font-size: 14px; font-weight: 600; color: #1e293b;
  border-bottom: 2px solid #eef1f5; letter-spacing: 0.3px;
  display: flex; align-items: center; gap: 8px;
}
.service-categories h3 .svg-inline--fa, .quick-actions h3 .svg-inline--fa, .faq-section h3 .svg-inline--fa, .service-channels h3 .svg-inline--fa, .history-sessions h3 .svg-inline--fa { color: #667eea; font-size: 13px; }
.service-categories ul { list-style: none; padding: 8px 0; margin: 0; }
.service-categories li {
  padding: 11px 16px; display: flex; align-items: center; gap: 10px; cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-left: 4px solid transparent; position: relative; margin: 2px 0; font-size: 14px;
}
.service-categories li::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s ease; border-radius: 0 4px 4px 0;
}
.service-categories li:hover { background: linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%); transform: translateX(4px); padding-left: 26px; }
.service-categories li:hover::before { width: 4px; }
.service-categories li.active {
  background: linear-gradient(90deg, #eff6ff 0%, #dbeafe 100%);
  color: #1e40af; border-left-color: #667eea; font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(102, 126, 234, 0.1);
}
.service-categories li.active::before { width: 4px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.cat-icon {
  width: 26px; height: 26px; border-radius: 8px; background: #f1f5f9;
  display: flex; align-items: center; justify-content: center; color: #64748b;
  flex-shrink: 0; transition: all 0.3s ease; font-size: 13px;
}
.service-categories li.active .cat-icon { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
.cat-name { flex: 1; }
.cat-badge { font-size: 11px; background: #eef1ff; color: #5b6ee1; border-radius: 10px; padding: 1px 8px; font-weight: 600; }
.service-categories li.active .cat-badge { background: rgba(102, 126, 234, 0.15); }

/* 历史会话 */
.history-sessions { border-top: 2px solid #eef1f5; display: flex; flex-direction: column; max-height: 240px; }
.history-sessions h3 { flex-shrink: 0; }
.h-add {
  margin-left: auto; width: 24px; height: 24px; border: none; border-radius: 7px;
  background: linear-gradient(135deg, #667eea, #764ba2); color: white; cursor: pointer;
  font-size: 11px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;
}
.h-add:hover { transform: scale(1.1); }
.hs-list { overflow-y: auto; flex: 1; }
.hs-list::-webkit-scrollbar { width: 5px; }
.hs-list::-webkit-scrollbar-thumb { background: #dbe0ff; border-radius: 3px; }
.hs-item {
  display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; cursor: pointer;
  border-left: 3px solid transparent; transition: all 0.2s ease;
}
.hs-item:hover { background: #f8fafc; }
.hs-item.active { background: linear-gradient(90deg, #eff6ff, #dbeafe); border-left-color: #667eea; }
.hs-body { flex: 1; min-width: 0; }
.hs-title { display: block; font-size: 13px; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hs-meta { display: block; font-size: 10px; color: #94a3b8; margin: 2px 0; }
.hs-summary { display: block; font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.hs-tools { display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s ease; }
.hs-item:hover .hs-tools { opacity: 1; }
.hs-tool {
  width: 22px; height: 22px; border: none; background: #fff; border-radius: 6px;
  color: #94a3b8; cursor: pointer; font-size: 10px; display: flex; align-items: center; justify-content: center;
}
.hs-tool:hover { color: #667eea; }
.hs-empty { padding: 16px; text-align: center; color: #94a3b8; font-size: 12px; }

.quick-actions { border-top: 2px solid #eef1f5; padding-top: 8px; }
.action-btn {
  display: flex; align-items: center; gap: 10px; width: calc(100% - 16px);
  margin: 4px 8px; padding: 10px 12px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid #eef1f5; border-radius: 12px; cursor: pointer; text-align: left;
  font-size: 13px; font-weight: 500; color: #475569;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.action-icon-box {
  width: 30px; height: 30px; border-radius: 9px;
  background: linear-gradient(135deg, #eef1ff 0%, #e1e6ff 100%); color: #5b6ee1;
  display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;
}
.action-text { flex: 1; }
.action-arrow { color: #cbd5e1; font-size: 11px; transition: transform 0.3s ease, color 0.3s ease; }
.action-btn:hover {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  transform: translateY(-2px); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15); border-color: #cbd5e1;
}
.action-btn:hover .action-arrow { transform: translateX(3px); color: #667eea; }
.action-btn:active { transform: translateY(0); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }

/* 服务时间卡片 */
.service-hours-card { margin: 10px 12px 16px; padding: 14px; border-radius: 14px; background: linear-gradient(135deg, #eef1ff 0%, #f6f7ff 100%); border: 1px solid #e3e7ff; flex-shrink: 0; }
.hours-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #3a4ab8; margin-bottom: 10px; }
.hours-line { font-size: 12px; color: #64748b; margin: 4px 0; display: flex; justify-content: space-between; }
.hours-line b { color: #1e293b; font-weight: 600; }
.hours-progress { height: 6px; background: #e0e4ff; border-radius: 6px; margin: 10px 0 8px; overflow: hidden; position: relative; }
.hours-progress-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 70%; border-radius: 6px; background: linear-gradient(90deg, #34d399, #10b981); }
.hours-note { font-size: 11px; color: #10b981; margin: 0 0 8px; font-weight: 500; }
.hours-toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
.hours-toggle input { display: none; }
.toggle-track { width: 34px; height: 19px; background: #cbd5e1; border-radius: 20px; position: relative; transition: background 0.3s ease; flex-shrink: 0; }
.toggle-track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; background: white; border-radius: 50%; transition: transform 0.3s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.hours-toggle input:checked + .toggle-track { background: #10b981; }
.hours-toggle input:checked + .toggle-track::after { transform: translateX(15px); }
.toggle-label { font-size: 11px; color: #64748b; }

/* 聊天区域 */
.chat-section {
  flex: 1; background: white; border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
  display: flex; flex-direction: column; overflow: hidden; min-height: 0;
  border: 1px solid rgba(0, 0, 0, 0.05);
}
.chat-header {
  padding: 18px 24px; display: flex; justify-content: space-between; align-items: center;
  border-bottom: 2px solid #f1f5f9; background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  flex-wrap: wrap; gap: 12px;
}
.agent-info { display: flex; align-items: center; gap: 14px; }
.agent-avatar { position: relative; }
.agent-avatar img {
  width: 54px; height: 54px; border-radius: 50%; object-fit: cover; border: 3px solid #eef1f5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); transition: all 0.3s ease;
}
.agent-avatar:hover img { transform: scale(1.05); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3); border-color: #667eea; }
.presence-dot {
  position: absolute; bottom: 2px; right: 2px; width: 14px; height: 14px; border-radius: 50%;
  background: #10b981; border: 3px solid white; box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.4);
}
.presence-dot.ai { background: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.4); }
.presence-dot.offline { background: #94a3b8; box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.4); }
.agent-name-row { display: flex; align-items: center; gap: 8px; }
.agent-details h3 { font-size: 17px; font-weight: 600; color: #1e293b; margin: 0; }
.agent-role-tag {
  font-size: 11px; color: #10b981; background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.25); padding: 1px 8px; border-radius: 8px; font-weight: 600;
}
.agent-role-tag.ai { color: #6366f1; background: rgba(99, 102, 241, 0.12); border-color: rgba(99, 102, 241, 0.25); }
.agent-offline-tag { font-size: 11px; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 1px 8px; border-radius: 8px; font-weight: 600; }
.agent-details p { font-size: 13px; color: #64748b; font-weight: 400; margin: 3px 0; }
.agent-online { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #10b981; font-weight: 500; }
.online-mini-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; animation: pulse 2s infinite; }
.online-mini-dot.off { background: #94a3b8; animation: none; }
.chat-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.agent-switch { display: flex; background: #f1f5f9; border-radius: 20px; padding: 4px; gap: 2px; border: 1px solid #eef1f5; }
.switch-opt { border: none; background: transparent; color: #64748b; font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 16px; cursor: pointer; display: flex; align-items: center; gap: 5px; transition: all 0.3s ease; }
.switch-opt.active { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35); }
.switch-opt:not(.active):hover { color: #4361ee; }
.action-icon {
  width: 38px; height: 38px; border-radius: 12px; border: none;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); color: #64748b;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.action-icon:hover { background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); color: #475569; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
.action-icon:active { transform: translateY(0); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }

/* 排队横幅 */
.queue-banner {
  display: flex; align-items: center; gap: 14px;
  background: linear-gradient(135deg, #eef1ff, #e4e8ff);
  border-bottom: 1px solid #dbe0ff; padding: 12px 24px; font-size: 13px;
}
.queue-spinner { color: #667eea; font-size: 20px; }
.queue-banner b { display: block; color: #1e293b; }
.queue-banner div span { display: block; color: #5b6ee1; font-size: 12px; margin-top: 2px; }
.queue-cancel {
  margin-left: auto; border: 1px solid #c7d2fe; background: white; color: #4361ee;
  border-radius: 16px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: all 0.2s ease;
}
.queue-cancel:hover { background: #eef1ff; }

.chat-messages {
  flex: 1; padding: 24px; overflow-y: auto;
  background:
    radial-gradient(circle at 20% 20%, rgba(102, 126, 234, 0.04) 0%, transparent 40%),
    radial-gradient(circle at 80% 60%, rgba(118, 75, 162, 0.04) 0%, transparent 40%),
    linear-gradient(to bottom, #f8fafc 0%, #ffffff 50%, #f8fafc 100%);
  display: flex; flex-direction: column; gap: 16px; position: relative; scroll-behavior: smooth;
}
.chat-messages::-webkit-scrollbar { width: 8px; }
.chat-messages::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
.chat-messages::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
.chat-messages::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
.message { max-width: 75%; display: flex; animation: messageSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1); }
@keyframes messageSlideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.message.user { margin-left: auto; flex-direction: row; align-items: flex-end; gap: 10px; }
.message.user .message-content { order: 1; }
.message.bot { flex-direction: row; align-items: flex-start; gap: 12px; }
.msg-hover-actions { order: 2; display: flex; align-items: center; opacity: 0; transition: opacity 0.25s ease; gap: 4px; }
.message.user:hover .msg-hover-actions { opacity: 1; }
.msg-act {
  width: 26px; height: 26px; border: 1px solid #eef1f5; background: #fff; border-radius: 7px;
  color: #94a3b8; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s ease;
}
.msg-act:hover { color: #667eea; border-color: #667eea; transform: translateY(-2px); }
.bot-avatar { position: relative; flex-shrink: 0; }
.bot-avatar img { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid #eef1f5; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1); }
.ai-badge {
  position: absolute; bottom: -2px; right: -2px; width: 20px; height: 20px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: 11px; border: 2px solid white;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3); animation: badgePulse 2s infinite;
}
@keyframes badgePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.message-content { padding: 14px 18px; border-radius: 20px; position: relative; word-break: break-word; line-height: 1.6; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.07); transition: all 0.3s ease; }
.message-content:hover { box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1); }
.user .message-content { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-top-right-radius: 6px; box-shadow: 0 4px 14px rgba(102, 126, 234, 0.32); max-width: 100%; }
.bot .message-content { background: white; border: 1px solid #eef1f5; border-top-left-radius: 6px; color: #1e293b; }
.message-content > p { margin: 0; }
.user-image { max-width: 220px; max-height: 220px; border-radius: 10px; display: block; }
.message-time-row { display: flex; justify-content: flex-end; min-width: 44px; align-self: flex-end; }
.message.user .message-time-row { order: 0; justify-content: flex-start; }
.message.bot .message-time-row { justify-content: flex-start; }
.message-time { font-size: 11px; color: #94a3b8; padding: 0 4px; white-space: nowrap; }

/* 欢迎横幅 */
.welcome-hero { position: relative; align-self: stretch; text-align: center; padding: 40px 20px 24px; border-radius: 20px; background: linear-gradient(160deg, #f5f7ff 0%, #eef1ff 60%, #f8f5ff 100%); border: 1px solid #e8eaff; overflow: hidden; max-width: 100%; }
.welcome-glow { position: absolute; top: -60px; right: -60px; width: 220px; height: 220px; border-radius: 50%; background: radial-gradient(circle, rgba(102, 126, 234, 0.18) 0%, transparent 70%); }
.welcome-bot { position: relative; width: 72px; height: 72px; margin: 0 auto 14px; border-radius: 50%; overflow: hidden; background: linear-gradient(135deg, #f1f3ff 0%, #e4e8ff 100%); border: 3px solid #d6ddff; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(102, 126, 234, 0.18); animation: welcomeFloat 3s ease-in-out infinite; }
.welcome-emoji { font-size: 34px; }
@keyframes welcomeFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
.welcome-title { position: relative; font-size: 22px; font-weight: 700; margin: 0 0 6px; color: #1e293b; background: linear-gradient(135deg, #4361ee, #764ba2); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.welcome-sub { position: relative; font-size: 14px; color: #64748b; margin: 0 0 20px; }
.welcome-quick-replies { position: relative; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.welcome-quick-replies button { padding: 9px 16px; background: white; border: 1px solid #dbe0ff; border-radius: 22px; color: #4361ee; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 2px 6px rgba(102, 126, 234, 0.1); display: inline-flex; align-items: center; gap: 8px; }
.wr-icon { width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, #eef1ff 0%, #e1e6ff 100%); display: flex; align-items: center; justify-content: center; font-size: 11px; }
.welcome-quick-replies button:hover { background: linear-gradient(135deg, #eef1ff 0%, #e1e6ff 100%); border-color: #667eea; transform: translateY(-3px); box-shadow: 0 6px 16px rgba(102, 126, 234, 0.22); }
.welcome-quick-replies button:active { transform: translateY(0); }

/* 订单卡片 */
.order-cards { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.order-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #eef1f5; border-radius: 12px; background: #fafbff; transition: all 0.2s ease; }
.order-card:hover { border-color: #c7d2fe; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.12); }
.oc-status { padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; flex-shrink: 0; background: #dbeafe; color: #0369a1; }
.oc-status.confirmed { background: #dcfce7; color: #166534; }
.oc-status.paid { background: #dbeafe; color: #0369a1; }
.oc-status.completed { background: #ccfbf1; color: #065f46; }
.oc-status.cancelled { background: #fee2e2; color: #b91c1c; }
.oc-status.pending { background: #fef3c7; color: #92400e; }
.oc-info { flex: 1; min-width: 0; }
.oc-info b { display: block; font-size: 13px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.oc-info span { font-size: 12px; color: #64748b; }
.oc-action { border: 1px solid #c7d2fe; background: white; color: #4361ee; border-radius: 8px; padding: 5px 12px; font-size: 12px; cursor: pointer; flex-shrink: 0; transition: all 0.2s ease; }
.oc-action:hover { background: #eef1ff; }

/* 意图行动按钮 */
.intent-actions { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.intent-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid #dbe0ff; border-radius: 18px; background: white; color: #667eea; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); }
.intent-btn .svg-inline--fa { font-size: 12px; }
.intent-btn:hover { background: linear-gradient(135deg, #eef1ff 0%, #e1e6ff 100%); border-color: #667eea; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2); }

/* 客服消息反馈 */
.msg-feedback { display: flex; gap: 6px; margin-top: 10px; }
.fb-btn { width: 28px; height: 28px; border: 1px solid #eef1f5; background: white; border-radius: 8px; color: #94a3b8; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; }
.fb-btn:hover { color: #667eea; border-color: #c7d2fe; }
.fb-btn.on { color: #667eea; background: #eef1ff; border-color: #667eea; }

/* 回复选项 */
.reply-options { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.reply-options a { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; color: #667eea; text-decoration: none; border: 1px solid #dbe0ff; border-radius: 18px; font-size: 13px; font-weight: 500; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: white; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); cursor: pointer; }
.reply-options a .svg-inline--fa { font-size: 12px; }
.reply-options a:hover { background: linear-gradient(135deg, #eef1ff 0%, #e1e6ff 100%); border-color: #667eea; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2); }

/* 满意度评分面板 */
.rating-panel { margin-top: 12px; padding: 12px 14px; border-radius: 12px; background: #f8faff; border: 1px dashed #dbe0ff; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.rating-label { font-size: 13px; color: #64748b; font-weight: 500; }
.rating-stars { display: flex; gap: 6px; }
.star-btn { background: none; border: none; cursor: pointer; color: #d1d5db; font-size: 22px; transition: all 0.25s ease; padding: 2px; line-height: 1; }
.star-btn:hover { transform: scale(1.2); color: #f59e0b; }
.star-btn.active { color: #f59e0b; transform: scale(1.05); animation: starPop 0.3s ease; }
@keyframes starPop { 0% { transform: scale(0.6); } 60% { transform: scale(1.25); } 100% { transform: scale(1.05); } }
.rating-thanks { font-size: 12px; color: #f59e0b; font-weight: 600; }

/* 正在输入 */
.typing-indicator { display: flex; align-items: center; gap: 10px; align-self: flex-start; padding: 12px 18px; background: white; border: 1px solid #eef1f5; border-radius: 18px 18px 18px 6px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); }
.dot { width: 8px; height: 8px; background: #9ca3af; border-radius: 50%; animation: typing 1.4s infinite both; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }
.typing-indicator span { font-size: 12px; color: #64748b; }

/* 流式输出 */
.message.streaming .message-content { background: linear-gradient(135deg, #f4f5ff 0%, #eef0ff 100%); border-color: var(--primary-2); box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.14); }
.streaming-text { position: relative; }
.typing-cursor { display: inline-block; width: 2px; height: 16px; background-color: var(--primary); margin-left: 2px; animation: cursor-blink 1s infinite; vertical-align: text-bottom; }
@keyframes cursor-blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
.message.error .message-content { background-color: rgba(255, 235, 235, 0.7); border-color: #ffcccc; }
.structured-tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
.structured-tags .tag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; color: white; }
.tag.category-order { background-color: #4CAF50; }
.tag.category-refund { background-color: #FF9800; }
.tag.category-hotel { background-color: #2196F3; }
.tag.category-flight { background-color: #9C27B0; }
.tag.category-service { background-color: #F44336; }
.tag.category-info { background-color: #607D8B; }

/* 快捷话题与常用语 */
.quick-topics { display: flex; align-items: center; gap: 8px; padding: 10px 24px 0; flex-wrap: wrap; }
.qt-label { font-size: 12px; color: #94a3b8; flex-shrink: 0; }
.qt-chip { padding: 6px 14px; background: #fff; border: 1px solid #eef1f5; border-radius: 18px; color: #64748b; font-size: 12px; cursor: pointer; transition: all 0.3s ease; }
.qt-chip:hover:not(:disabled) { border-color: #667eea; color: #4361ee; background: #f5f6ff; transform: translateY(-2px); box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15); }
.qt-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.qp-toggle { display: inline-flex; align-items: center; gap: 5px; }
.qp-toggle.on { background: #eef1ff; border-color: #667eea; color: #4361ee; }
.quick-phrases { padding: 12px 24px 4px; border-top: 1px dashed #eef1f5; display: flex; flex-direction: column; gap: 8px; }
.qp-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.qp-label { font-size: 12px; color: #94a3b8; flex-shrink: 0; width: 44px; }
.qp-chip { padding: 5px 12px; background: #fff; border: 1px solid #eef1f5; border-radius: 16px; color: #475569; font-size: 12px; cursor: pointer; transition: all 0.2s ease; }
.qp-chip:hover:not(:disabled) { border-color: #667eea; color: #4361ee; }
.qp-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.qp-emoji { width: 34px; height: 34px; background: #fff; border: 1px solid #eef1f5; border-radius: 8px; cursor: pointer; font-size: 18px; transition: all 0.2s ease; }
.qp-emoji:hover:not(:disabled) { transform: scale(1.15); border-color: #667eea; }
.qp-emoji:disabled { opacity: 0.5; cursor: not-allowed; }

/* 输入区域 */
.chat-input-area { padding: 12px 24px 18px; border-top: 2px solid #f1f5f9; display: flex; flex-direction: column; gap: 8px; background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); }
.input-row { display: flex; gap: 12px; align-items: center; }
.attach-btn { width: 44px; height: 48px; border: 1px dashed #cbd5e1; border-radius: 24px; background: #fff; color: #94a3b8; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; transition: all 0.3s ease; flex-shrink: 0; }
.attach-btn:hover { border-color: #667eea; color: #667eea; background: #f5f6ff; }
.file-input { display: none; }
.input-container { display: flex; gap: 10px; align-items: center; flex: 1; }
.input-container input { flex: 1; padding: 16px 22px; border: 2px solid #eef1f5; border-radius: 28px; font-size: 15px; outline: none; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: white; color: #1e293b; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); }
.input-container input:focus { border-color: #667eea; box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1), 0 2px 8px rgba(102, 126, 234, 0.15); }
.input-container input::placeholder { color: #94a3b8; }
.send-btn { width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3); font-size: 18px; flex-shrink: 0; }
.send-btn:hover:not(:disabled) { background: linear-gradient(135deg, #764ba2 0%, #667eea 100%); transform: translateY(-2px) scale(1.05); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4); }
.send-btn:active:not(:disabled) { transform: translateY(0) scale(1); }
.stop-reply { background: linear-gradient(135deg, #fee2e2, #fecaca); color: #b91c1c; border-color: #fecaca; flex-shrink: 0; display: flex; align-items: center; gap: 5px; }
.stop-reply:hover { background: linear-gradient(135deg, #fecaca, #fca5a5); color: #991b1b; }
.input-footer { display: flex; justify-content: space-between; align-items: center; padding: 0 6px; }
.input-hint { font-size: 12px; color: #94a3b8; display: flex; align-items: center; gap: 5px; }
.char-count { font-size: 12px; color: #94a3b8; }
.input-error { color: #dc2626; font-size: 13px; margin: 0; }

/* 右侧帮助区 */
.help-sidebar { width: 260px; background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05); display: flex; flex-direction: column; flex-shrink: 0; height: 100%; min-height: 0; border: 1px solid rgba(0, 0, 0, 0.05); transition: transform 0.3s ease, box-shadow 0.3s ease; }
.help-sidebar:hover { box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08); }
.faq-section { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.faq-list { flex: 1; overflow-y: auto; }
.faq-search { display: flex; align-items: center; gap: 8px; margin: 10px 12px; padding: 8px 12px; background: #f1f5f9; border-radius: 10px; border: 1px solid transparent; transition: all 0.25s ease; }
.faq-search:focus-within { background: white; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.12); }
.faq-search .svg-inline--fa { color: #94a3b8; font-size: 13px; flex-shrink: 0; }
.faq-search input { border: none; outline: none; background: transparent; width: 100%; font-size: 13px; color: #1e293b; }
.faq-search input::placeholder { color: #94a3b8; }
.faq-item { border-bottom: 1px solid #f1f3f6; }
.faq-question { width: 100%; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 8px; background: none; border: none; cursor: pointer; text-align: left; font-size: 13px; font-weight: 500; color: #1e293b; transition: background 0.2s ease; }
.faq-q { flex: 1; }
.faq-question:hover { background: #f9fafb; color: #4361ee; }
.faq-question .svg-inline--fa { transition: transform 0.3s; color: #94a3b8; flex-shrink: 0; }
.faq-question .rotated { transform: rotate(180deg); }
.faq-answer { padding: 0 16px 12px; color: #6b7280; font-size: 12px; line-height: 1.6; animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.faq-buttons { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.faq-buttons button { padding: 4px 12px; background: #eff6ff; color: var(--primary); border: 1px solid #dbeafe; border-radius: 14px; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.3s ease; }
.faq-buttons button:hover { background: #dbeafe; transform: translateY(-1px); box-shadow: 0 2px 6px rgba(59, 130, 246, 0.2); }
.faq-buttons button .svg-inline--fa { font-size: 11px; }
.faq-empty { padding: 24px 16px; text-align: center; color: #94a3b8; font-size: 13px; }
.faq-move, .faq-enter-active, .faq-leave-active { transition: all 0.3s ease; }
.faq-enter-from, .faq-leave-to { opacity: 0; transform: translateY(-8px); }
.service-channels { border-top: 2px solid #f1f3f6; padding-top: 8px; flex-shrink: 0; overflow: hidden; }
.channel-item { padding: 12px 16px; display: flex; gap: 12px; border-bottom: 1px solid #f8fafc; transition: background 0.2s ease; align-items: flex-start; }
.channel-item:hover { background: #f9fafb; }
.channel-icon { width: 34px; height: 34px; border-radius: 10px; background: linear-gradient(135deg, #eef1ff 0%, #e1e6ff 100%); color: #5b6ee1; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; margin-top: 1px; }
.channel-item h4 { font-size: 13px; font-weight: 500; margin: 0 0 3px; color: #1e293b; }
.channel-item p { color: #111827; font-size: 12px; margin: 0 0 2px; }
.channel-item small { color: #6b7280; font-size: 11px; }
.channel-note { color: #374151; }
.qrcode-unavailable { margin-top: 8px; padding: 10px 12px; border-radius: 8px; background: #f1f5f9; color: #64748b; font-size: 12px; line-height: 1.6; display: flex; align-items: flex-start; gap: 8px; }
.qrcode-unavailable .svg-inline--fa { margin-top: 3px; flex-shrink: 0; }
.satisfaction-cta { margin: 12px; padding: 14px; border-radius: 14px; background: linear-gradient(135deg, #fef9e7 0%, #fdf3d0 100%); border: 1px solid #f5e6b8; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.satisfaction-cta .fa-star { color: #f59e0b; font-size: 20px; }
.satisfaction-cta b { display: block; font-size: 13px; color: #78350f; margin-bottom: 2px; }
.satisfaction-cta span { font-size: 11px; color: #b45309; }
.satisfaction-cta button { margin-left: auto; width: 38px; height: 38px; border: none; border-radius: 50%; background: linear-gradient(135deg, #ff7a7a 0%, #f43f5e 100%); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(244, 63, 94, 0.3); transition: all 0.3s ease; flex-shrink: 0; }
.satisfaction-cta button:hover { transform: scale(1.12) rotate(10deg); box-shadow: 0 6px 16px rgba(244, 63, 94, 0.4); }

/* 弹窗 */
.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000; background: white; border-radius: 20px; width: 90%; max-width: 540px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 8px 16px rgba(0, 0, 0, 0.2); animation: modalSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid rgba(0, 0, 0, 0.05); overflow: hidden; }
@keyframes modalSlideIn { from { opacity: 0; transform: translate(-50%, -48%); scale: 0.95; } to { opacity: 1; transform: translate(-50%, -50%); scale: 1; } }
.modal-content { max-height: 80vh; display: flex; flex-direction: column; }
.modal-header { padding: 22px 28px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); }
.modal-header h2 { font-size: 19px; font-weight: 700; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 10px; }
.modal-header h2 .svg-inline--fa { color: #667eea; }
.close-btn { background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); border: 1px solid #e2e8f0; border-radius: 10px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer; color: #64748b; transition: all 0.3s ease; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
.close-btn:hover { background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); color: #dc2626; transform: rotate(90deg); box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2); }
.order-list { max-height: 500px; overflow-y: auto; padding: 8px 0; }
.order-list::-webkit-scrollbar, .contact-options-list::-webkit-scrollbar { width: 6px; }
.order-list::-webkit-scrollbar-track, .contact-options-list::-webkit-scrollbar-track { background: #f1f5f9; }
.order-list::-webkit-scrollbar-thumb, .contact-options-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
.order-item { padding: 18px 24px; border-bottom: 1px solid #f8fafc; display: flex; justify-content: space-between; align-items: center; gap: 14px; transition: all 0.3s ease; margin: 4px 8px; border-radius: 12px; }
.order-item:hover { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); transform: translateX(4px); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); }
.contact-options-list { max-height: 420px; overflow-y: auto; padding: 8px 0; }
.contact-option-item { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-bottom: 1px solid #f8fafc; transition: background 0.2s ease; cursor: pointer; }
.contact-option-item:hover { background: #f9fafb; }
.contact-option-body { flex: 1; }
.contact-icon { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #eef1ff 0%, #e1e6ff 100%); color: #4f63d8; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0; }
.contact-option-body h4 { margin: 0 0 4px; font-size: 15px; color: #1f2937; }
.contact-option-body p { margin: 0 0 4px; font-size: 14px; color: #374151; }
.contact-option-body small { color: #6b7280; font-size: 12px; }
.contact-arrow { color: #cbd5e1; font-size: 13px; transition: transform 0.3s ease, color 0.3s ease; flex-shrink: 0; }
.contact-option-item:hover .contact-arrow { color: #667eea; transform: translateX(3px); }
.order-status { padding: 6px 14px; border-radius: 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06); flex-shrink: 0; }
.order-status.confirmed { background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); color: #166534; }
.order-status.paid { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); color: #0369a1; }
.order-status.completed { background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%); color: #065f46; }
.order-status.cancelled { background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); color: #b91c1c; }
.order-status.pending { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); color: #92400e; }
.order-info { flex: 1; margin: 0 16px; }
.order-info h4 { font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 6px; }
.order-info p { font-size: 13px; color: #64748b; line-height: 1.6; margin: 3px 0; }
.order-info p .svg-inline--fa { font-size: 11px; margin-right: 4px; color: #94a3b8; }
.order-action { padding: 10px 18px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 10px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3); display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0; }
.order-action .svg-inline--fa { font-size: 12px; }
.order-action:hover { background: linear-gradient(135deg, #764ba2 0%, #667eea 100%); transform: translateY(-2px); box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4); }
.order-action:active { transform: translateY(0); }

/* 满意度反馈弹窗 */
.feedback-body { padding: 28px; text-align: center; }
.feedback-title { font-size: 16px; color: #1e293b; font-weight: 600; margin: 0 0 20px; }
.feedback-stars { display: flex; justify-content: center; gap: 10px; margin-bottom: 20px; }
.star-btn.big { font-size: 34px; }
.feedback-tags { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 24px; }
.feedback-tag { padding: 7px 16px; border: 1px solid #eef1f5; border-radius: 18px; background: #fff; color: #64748b; font-size: 13px; cursor: pointer; transition: all 0.25s ease; }
.feedback-tag.active { background: linear-gradient(135deg, #eef1ff, #e1e6ff); border-color: #667eea; color: #4361ee; font-weight: 600; }
.feedback-tag:hover { border-color: #667eea; color: #4361ee; }
.feedback-submit { padding: 12px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 28px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 14px rgba(102, 126, 234, 0.35); display: inline-flex; align-items: center; gap: 8px; }
.feedback-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.45); }
.feedback-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(17, 24, 39, 0.55); backdrop-filter: blur(4px); z-index: 999; animation: fadeIn 0.3s ease; }

/* 模型选择器 */
.model-selector { position: relative; margin-right: 4px; }
.model-select { padding: 8px 34px 8px 14px; border: 2px solid #eef1f5; border-radius: 10px; background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); font-size: 12px; font-weight: 500; color: #475569; cursor: pointer; outline: none; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 9L1 4h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; }
.model-select:hover:not(:disabled) { border-color: #cbd5e1; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08); }
.model-select:focus { border-color: #667eea; box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1), 0 2px 8px rgba(102, 126, 234, 0.15); }
.model-select:disabled { opacity: 0.6; cursor: not-allowed; }

/* 响应式 */
@media (max-width: 1240px) { .help-sidebar { display: none; } }
@media (max-width: 1024px) and (min-width: 769px) { .service-sidebar { width: 200px; } .service-sidebar .service-categories h3 { font-size: 13px; padding: 11px 12px; } }
@media (max-width: 768px) {
  .service-container { flex-direction: column; height: auto; }
  .service-sidebar { width: 100%; margin-bottom: 15px; height: auto; }
  .message { max-width: 92%; }
  .chat-actions { width: 100%; justify-content: flex-end; }
  .model-selector { margin: 5px 0 0; flex: 1 0 130px; }
  .chat-header { flex-direction: column; align-items: flex-start; }
  .agent-switch { order: -1; }
}
</style>
