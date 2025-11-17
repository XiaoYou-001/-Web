<template>
  <div class="customer-service-page">
    <!-- 页面标题 -->
    <header class="service-header">
      <div class="header-content">
        <h1><i class="fas fa-headset"></i> 智能客服中心</h1>
        <p>专业旅行顾问7×24小时为您服务</p>
        <div class="status-badge">
          <span class="online-dot"></span>
          <span>客服在线，平均响应时间 <strong>30秒</strong></span>
        </div>
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="service-container">
      <!-- 左侧功能区 -->
      <aside class="service-sidebar">
        <div class="service-categories">
          <h3>服务分类</h3>
          <ul>
            <li :class="{ active: activeCategory === 'booking' }" @click="activeCategory = 'booking'">
              <i class="fas fa-ticket-alt"></i> 订单相关
            </li>
            <li :class="{ active: activeCategory === 'attraction' }" @click="activeCategory = 'attraction'">
              <i class="fas fa-map-marker-alt"></i> 景点咨询
            </li>
            <li :class="{ active: activeCategory === 'hotel' }" @click="activeCategory = 'hotel'">
              <i class="fas fa-hotel"></i> 酒店问题
            </li>
            <li :class="{ active: activeCategory === 'payment' }" @click="activeCategory = 'payment'">
              <i class="fas fa-credit-card"></i> 支付相关
            </li>
            <li :class="{ active: activeCategory === 'refund' }" @click="activeCategory = 'refund'">
              <i class="fas fa-undo"></i> 退款售后
            </li>
          </ul>
        </div>

        <div class="quick-actions">
          <h3>快捷功能</h3>
          <button class="action-btn" @click="showOrderList = true">
            <i class="fas fa-list-alt"></i> 我的订单
          </button>
          <button class="action-btn" @click="showContactOptions = true">
            <i class="fas fa-phone"></i> 其他联系方式
          </button>
        </div>
      </aside>

      <!-- 中间聊天区 -->
      <section class="chat-section">
        <div class="chat-header">
          <div class="agent-info">
          <div class="agent-avatar">
            <img :src="currentAgent.value === 'human' ? 'https://pic1.zhimg.com/v2-3def048cbe146beb72c9ff2b84a5a714_r.jpg' : 'https://pic.rmb.bdstatic.com/bjh/250828/dump/501aa47f84d2d08ccfb44fe2fe5b7eed.png?x-bce-process=image/watermark,bucket_baidu-rmb-video-cover-1,image_YmpoL25ld3MvNjUzZjZkMjRlMDJiNjdjZWU1NzEzODg0MDNhYTQ0YzQucG5n,type_RlpMYW5UaW5nSGVpU01HQg==,w_18,text_QOmHjOe7tOaWr-ekvg==,size_18,x_14,y_14,interval_2,color_FFFFFF,effect_softoutline,shc_000000,blr_2,align_1'" alt="客服头像">
          </div>
          <div class="agent-details">
            <h3>{{ currentAgent.value === 'human' ? '旅行顾问-小杜' : '旅行顾问-小杜' }}</h3>
            <p>{{ currentAgent.value === 'human' ? '已为一亿位用户提供服务' : '俺不孬嘞，有问题速度call我' }}</p>
          </div>
        </div>
          <div class="chat-actions">
            <button class="action-icon" title="查看历史">
              <i class="fas fa-history"></i>
            </button>
            <button class="action-icon" title="刷新对话">
              <i class="fas fa-sync-alt"></i>
            </button>
            <button class="action-icon agent-toggle-btn" title="切换客服类型" @click="toggleAgentType">
              <i class="fas fa-exchange-alt"></i>
            </button>
            <div class="model-selector">
              <select v-model="aiModel" @change="onModelChange" class="model-select">
                <option value="open-source-llm">Qwen3-Max (默认)</option>
                <option value="qwen3-max">Qwen3-Max</option>
                <option value="qwen-turbo">Qwen-Turbo</option>
              </select>
            </div>
            <button class="action-icon" title="举报">
              <i class="fas fa-flag"></i>
            </button>
          </div>
        </div>

        <div class="chat-messages" ref="chatContainer">
          <!-- 系统欢迎消息 -->
          <div v-if="messages.length === 0" class="message system">
            <div class="message-content">
              <p>您好！我是您的专属旅行顾问小杜，很高兴为您服务！请问有什么可以帮到您？</p>
              <div class="quick-replies">
                <button @click="sendMessage('查询我的订单')">
                  <i class="fas fa-search"></i> 查询我的订单
                </button>
                <button @click="sendMessage('修改酒店预订日期')">
                  <i class="fas fa-edit"></i> 修改酒店预订
                </button>
                <button @click="sendMessage('景点门票如何退款')">
                  <i class="fas fa-money-bill-wave"></i> 门票退款问题
                </button>
              </div>
            </div>
            <div class="message-time">9:30</div>
          </div>

          <!-- 统一消息渲染 -->
          <template v-for="(message, index) in messages" :key="index">
            <!-- 用户消息 -->
            <div v-if="message.type === 'user'" class="message user">
              <div class="message-content">{{ message.text }}</div>
              <div class="message-time">{{ message.time }}</div>
            </div>

            <!-- 客服回复 -->
            <div v-else-if="message.type === 'bot'" class="message bot" :class="{ 'streaming': message.isStreaming, 'error': message.isError }">
              <div class="bot-avatar">
                <img :src="currentAgent.value === 'human' ? 'https://pic1.zhimg.com/v2-3def048cbe146beb72c9ff2b84a5a714_r.jpg' : 'https://pic.rmb.bdstatic.com/bjh/250828/dump/501aa47f84d2d08ccfb44fe2fe5b7eed.png?x-bce-process=image/watermark,bucket_baidu-rmb-video-cover-1,image_YmpoL25ld3MvNjUzZjZkMjRlMDJiNjdjZWU1NzEzODg0MDNhYTQ0YzQucG5n,type_RlpMYW5UaW5nSGVpU01HQg==,w_18,text_QOmHjOe7tOaWr-ekvg==,size_18,x_14,y_14,interval_2,color_FFFFFF,effect_softoutline,shc_000000,blr_2,align_1'" alt="客服头像">
                <span v-if="currentAgent.value === 'ai'" class="ai-badge"><i class="fas fa-robot"></i></span>
              </div>
              <!-- 流式输出时添加特殊样式 -->
              <div class="message-content">
                <p :class="{ 'streaming-text': message.streaming }">
                  {{ message.text }}
                  <span v-if="message.streaming" class="typing-cursor">|</span>
                </p>
                
                <!-- 结构化信息标签 -->
                <div v-if="message.categories && message.categories.length > 0" class="structured-tags">
                  <span v-for="category in message.categories" :key="category" class="tag" :class="`category-${category}`">
                    {{ getCategoryDisplayName(category) }}
                  </span>
                </div>
                
                <!-- 操作选项 -->
                <div v-if="message.options" class="reply-options">
                  <a v-for="(option, i) in message.options" :key="i" @click.stop="handleReplyOption(option)" class="option-link">
                    <i v-if="option.value === 'resolved'" class="fas fa-check-circle"></i>
                    <i v-else-if="option.value === 'more_help'" class="fas fa-question-circle"></i>
                    <i v-else-if="option.value === 'switch_to_ai'" class="fas fa-robot"></i>
                    <i v-else-if="option.value === 'switch_to_human'" class="fas fa-user-friends"></i>
                    {{ option.label }}
                  </a>
                </div>
              </div>
              <div class="message-time">{{ message.time }}</div>
            </div>
          </template>

          <!-- 正在输入提示 -->
          <div class="typing-indicator" v-if="isTyping">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
            <span>小杜正在输入...</span>
          </div>
        </div>

        <div class="chat-input-area">
          <div class="input-tools">
            <button class="tool-btn" title="发送图片"><i class="fas fa-image"></i></button>
            <button class="tool-btn" title="发送订单截图"><i class="fas fa-file-image"></i></button>
            <button class="tool-btn" title="发送位置"><i class="fas fa-map-marker-alt"></i></button>
          </div>
          <div class="input-container">
            <input 
              type="text" 
              v-model="messageInput" 
              placeholder="请输入您的问题..."
              @keydown.enter="sendMessage()"
            >
            <button class="send-btn" @click="sendMessage">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </section>

      <!-- 右侧帮助区 -->
      <aside class="help-sidebar">
        <div class="faq-section">
          <h3>热门问题</h3>
          <div class="faq-item" v-for="(faq, index) in faqs" :key="index">
            <button class="faq-question" @click="toggleFaq(index)">
              <span>{{ faq.question }}</span>
              <i class="fas fa-chevron-down" :class="{ rotated: faq.open }"></i>
            </button>
            <div class="faq-answer" v-if="faq.open">
              {{ faq.answer }}
              <div v-if="faq.buttons" class="faq-buttons">
                <button v-for="btn in faq.buttons" :key="btn.label" @click="sendMessage(btn.message)">
                  <i v-if="btn.label.includes('修改')" class="fas fa-edit"></i>
                  <i v-else-if="btn.label.includes('取消')" class="fas fa-times-circle"></i>
                  <i v-else-if="btn.label.includes('退款')" class="fas fa-undo-alt"></i>
                  <i v-else class="fas fa-info-circle"></i>
                  {{ btn.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="service-channels">
          <h3>其他服务渠道</h3>
          <div class="channel-item">
            <i class="fas fa-phone-alt"></i>
            <div>
              <h4>电话客服</h4>
              <p>400-123-4567</p>
              <small>7:00-24:00</small>
            </div>
          </div>
          <div class="channel-item">
            <i class="fas fa-envelope"></i>
            <div>
              <h4>邮箱反馈</h4>
              <p>support@zhiyou.com</p>
              <small>24小时内回复</small>
            </div>
          </div>
          <div class="channel-item">
            <i class="fas fa-weixin"></i>
            <div>
              <h4>微信客服</h4>
              <p>扫码添加客服微信</p>
              <div class="qrcode">
                <img src="https://picsum.photos/id/237/100" alt="微信客服二维码">
              </div>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <!-- 订单列表弹窗 -->
    <div class="modal" v-if="showOrderList">
      <div class="modal-content">
        <div class="modal-header">
          <h2>我的最近订单</h2>
          <button class="close-btn" @click="showOrderList = false">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="order-list">
          <div class="order-item" v-for="order in recentOrders" :key="order.id">
            <div class="order-status" :class="order.statusClass">{{ order.status }}</div>
            <div class="order-info">
              <h4>{{ order.title }}</h4>
              <p>订单号: {{ order.orderNo }}</p>
              <p>日期: {{ order.date }}</p>
              <p>金额: <strong>¥{{ order.amount }}</strong></p>
            </div>
            <button class="order-action" @click="sendOrderToChat(order)">
              <i class="fas fa-paper-plane"></i> 发送给客服
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 遮罩层 -->
    <div class="overlay" v-if="showOrderList || showContactOptions" @click="closeModals"></div>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from 'vue';

export default {
  name: 'CustomerServicePage',
  setup() {
    // 状态管理
    const activeCategory = ref('booking');
    const messageInput = ref('');
    const messages = ref([]); // 统一的消息数组，包含所有用户和机器人的消息
    const isTyping = ref(false);
    const showOrderList = ref(false);
    const showContactOptions = ref(false);
    const chatContainer = ref(null);
    const currentAgent = ref('human'); // 'human' 或 'ai'
    const aiModel = ref('open-source-llm'); // 默认开源AI模型

    // 常见问题数据
    const faqs = reactive([
      {
        question: '如何修改或取消酒店预订？',
        answer: '您可以在"我的订单"中找到对应订单，点击"修改"或"取消"按钮操作。若距离入住时间小于24小时，建议直接联系客服处理。',
        open: false,
        buttons: [
          { label: '去修改订单', message: '我需要修改酒店预订' },
          { label: '申请取消订单', message: '我要取消酒店预订' }
        ]
      },
      {
        question: '景点门票可以退款吗？',
        answer: '大部分景点门票支持提前24小时退款，部分特价票和演出票可能不支持退款。您可以在订单详情页查看具体退款政策。',
        open: false,
        buttons: [{ label: '查看退款政策', message: '查询景点门票退款政策' }]
      },
      {
        question: '如何开具发票？',
        answer: '您可以在订单完成后，在"我的订单"中找到对应订单，点击"申请发票"，填写相关信息后我们会尽快为您开具电子发票。',
        open: false
      },
      {
        question: '订单支付失败怎么办？',
        answer: '请检查您的支付方式是否有足够余额或额度，网络是否正常。若多次失败，您可以尝试更换支付方式或联系支付平台客服。',
        open: false
      },
      {
        question: '旅游保险如何购买？',
        answer: '在预订酒店或门票时，您可以选择添加旅游保险服务。若已完成预订，可在"我的订单"中找到对应产品，点击"追加服务"购买保险。',
        open: false
      }
    ]);

    // 最近订单数据
    const recentOrders = [
      {
        id: 1,
        title: '三亚亚龙湾万豪度假酒店',
        orderNo: 'ZY20250716001',
        date: '2025-08-10 至 2025-08-15',
        amount: 3280,
        status: '已确认',
        statusClass: 'confirmed'
      },
      {
        id: 2,
        title: '上海迪士尼乐园门票',
        orderNo: 'ZY20250714056',
        date: '2025-08-12',
        amount: 760,
        status: '已付款',
        statusClass: 'paid'
      },
      {
        id: 3,
        title: '广州长隆野生动物世界',
        orderNo: 'ZY20250710023',
        date: '2025-07-20',
        amount: 520,
        status: '已完成',
        statusClass: 'completed'
      }
    ];

    // 切换客服类型
    const toggleAgentType = () => {
      currentAgent.value = currentAgent.value === 'human' ? 'ai' : 'human';
      // 清空聊天记录并发送欢迎消息
      messages.value = [];
      
      // 发送欢迎消息
      setTimeout(() => {
        messages.value = [...messages.value, {
          type: 'bot',
          text: currentAgent.value === 'human' 
            ? '您好！我是您的专属旅行顾问小杜，很高兴为您服务！请问有什么可以帮到您？' 
            : `您好！我是智能AI客服(${getModelDisplayName()})，很高兴为您服务！请问有什么可以帮到您？`,
          time: formatTime(new Date())
        }];
        scrollToBottom();
      }, 500);
    };

    // 获取模型显示名称
    const getModelDisplayName = () => {
      const modelNames = {
        'open-source-llm': 'Qwen3-Max',
        'qwen3-max': 'Qwen3-Max',
        'qwen-turbo': 'Qwen-Turbo',
        'llama3-8b-instruct': 'Llama3-8B'
      };
      return modelNames[aiModel.value] || aiModel.value;
    };

    // 切换AI模型时的处理函数
    const onModelChange = () => {
      if (currentAgent.value === 'ai') {
        // 如果当前是AI客服，发送一条消息告知用户模型已切换
        messages.value = [...messages.value, {
          type: 'bot',
          text: `已切换至 ${getModelDisplayName()} 模型，请问有什么可以帮到您？`,
          time: formatTime(new Date())
        }];
        scrollToBottom();
      }
    };

    // 获取分类显示名称
    const getCategoryDisplayName = (category) => {
      const categoryNames = {
        'order': '订单相关',
        'refund': '退款售后',
        'hotel': '酒店服务',
        'flight': '机票服务',
        'service': '客服支持',
        'info': '信息咨询'
      };
      return categoryNames[category] || category;
    };

    // 调用本地Node.js后端服务 - 支持结构化输出
    const callOpenSourceAIModel = async (message, onChunk, onComplete) => {
      try {
        // 本地后端API配置
        const API_CONFIG = {
          // 本地Node.js后端端点
          endpoint: 'http://localhost:3001/api/ai/chat',
          // 请求超时设置
          timeout: 30000
        };

        // 构建请求体 - 支持结构化输出
        const requestBody = {
          message: message,
          model: aiModel.value,
          systemPrompt: '你是一个专业的旅行客服AI助手，需要帮助用户解决旅行相关的问题。',
          stream: false, // 禁用流式输出
          structured: true // 启用结构化输出
        };

        console.log('发送请求到本地后端:', {
          endpoint: API_CONFIG.endpoint,
          model: aiModel.value,
          structured: true
        });

        // 发送请求到本地Node.js后端
        const response = await fetch(API_CONFIG.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
            // 不需要在前端暴露API密钥，由后端处理
          },
          body: JSON.stringify(requestBody),
          // 设置请求超时
          signal: AbortSignal.timeout(API_CONFIG.timeout)
        });

        // 检查响应状态
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`后端请求失败: ${response.status} ${response.statusText} - ${errorData.error || ''}`);
        }

        // 直接获取完整响应
        const data = await response.json();
        console.log('本地后端响应数据:', data);

        // 从后端返回的数据中提取AI回复内容
        let aiReply = '';
        let structuredInfo = null;
        
        if (data.error) {
          // 如果后端返回了错误信息，直接使用
          aiReply = data.error;
        } else if (data.choices && data.choices.length > 0) {
          // 正常情况下提取回复内容
          aiReply = data.choices[0].message?.content || 
                    data.choices[0].text || 
                    '抱歉，我无法理解您的问题。';
          // 获取结构化信息
          structuredInfo = data.structuredInfo || null;
        } else {
          throw new Error('AI响应格式不符合预期');
        }

        if (onComplete) {
          onComplete(aiReply, structuredInfo);
        }

        return aiReply;
      } catch (error) {
        console.error('调用本地后端失败:', error);
        
        // 根据错误类型返回友好提示
        let errorMessage = '抱歉，AI服务暂时不可用，请稍后再试。';
        if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
          errorMessage = '抱歉，AI服务响应超时，请稍后再试。';
        } else if (error.message.includes('401')) {
          errorMessage = 'AI服务认证失败，请联系管理员。';
        } else if (error.message.includes('429')) {
          errorMessage = '当前请求过多，请稍后再试。';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('网络')) {
          errorMessage = '后端服务未启动，请联系管理员。';
        }

        if (onComplete) {
          onComplete(errorMessage, null, true);
        }
        
        return errorMessage;
      }
    };

    // 生成机器人回复 - 支持结构化输出
    const generateBotReply = (userMessage) => {
      // 针对人工客服和AI客服的不同逻辑
      if (currentAgent.value === 'human') {
        // 人工客服回复模拟
        setTimeout(() => {
          // 创建人工客服回复消息
          let replyContent = '';
          if (userMessage.includes('订单')) {
            replyContent = '我已帮您查询到最近的订单信息，请告诉我您需要处理哪个订单，或直接在左侧"我的订单"中选择并发送给我。';
          } else if (userMessage.includes('酒店')) {
            replyContent = '酒店相关问题可以为您提供以下帮助：修改入住日期、升级房型、添加特殊需求、延迟退房等。请问您需要哪种帮助？';
          } else if (userMessage.includes('退款')) {
            replyContent = '退款处理通常需要3-7个工作日到账，具体到账时间取决于支付方式。您可以在"我的订单"中查看退款进度。需要我帮您查询具体订单的退款状态吗？';
          } else {
            replyContent = '感谢您的咨询！针对您的问题，我已记录并会尽快为您处理。如果您需要进一步帮助，可以提供更多细节或选择左侧的服务分类。';
          }
          
          const replyMessage = {
            type: 'bot',
            text: replyContent,
            time: formatTime(new Date()),
            agent: 'human',
            options: [
              { label: '解决了我的问题', value: 'resolved' },
              { label: '需要更多帮助', value: 'more_help' },
              { label: '切换到AI客服', value: 'switch_to_ai' }
            ]
          };
          
          // 添加到消息列表
          messages.value = [...messages.value, replyMessage];
          scrollToBottom();
          isTyping.value = false;
        }, 1500); // 模拟人工回复的延迟
      } else {
        // AI客服回复逻辑 - 支持结构化输出
        isTyping.value = true;
        
        // 调用AI模型获取回复，传入回调函数处理完整响应和结构化信息
        callOpenSourceAIModel(userMessage, 
          null, // 不再使用onChunk回调
          // onComplete回调 - 处理完整响应和结构化信息
          (fullText, structuredInfo, isError = false) => {
            // 创建最终的回复消息
            const replyMessage = {
              type: 'bot',
              text: fullText,
              time: formatTime(new Date()),
              agent: 'ai',
              model: aiModel.value,
              streaming: false, // 不再是流式输出
              error: isError,
              categories: structuredInfo?.categories || [], // 存储结构化分类信息
              keyPoints: structuredInfo?.keyPoints || [], // 存储结构化关键点信息
              options: [
                { label: '解决了我的问题', value: 'resolved' },
                { label: '需要更多帮助', value: 'more_help' },
                { label: '切换到人工客服', value: 'switch_to_human' }
              ]
            };
            
            // 添加到消息列表
            messages.value = [...messages.value, replyMessage];
            
            isTyping.value = false;
            scrollToBottom();
          }
        );
      }
    };

    // 发送消息
    const sendMessage = (text = null) => {
      const messageText = text || messageInput.value.trim();
      if (!messageText || isTyping.value) {
        return;
      }

      // 创建并添加用户消息到统一的消息数组
      const newUserMessage = {
        type: 'user',
        text: messageText,
        time: formatTime(new Date())
      };
      
      console.log('添加用户消息:', newUserMessage);
      messages.value = [...messages.value, newUserMessage];

      // 清空输入框
      messageInput.value = '';

      // 滚动到底部
      scrollToBottom();

      // 根据当前客服类型生成回复
      generateBotReply(messageText);
    };

    // 发送订单给客服
    const sendOrderToChat = (order) => {
      sendMessage(`请帮我处理订单 ${order.orderNo} (${order.title})`);
      showOrderList.value = false;
    };

    // 切换FAQ展开状态
    const toggleFaq = (index) => {
      faqs[index].open = !faqs[index].open;
    };

    // 处理回复选项点击
    const handleReplyOption = (option) => {
      if (option.value === 'switch_to_ai') {
        toggleAgentType();
      } else if (option.value === 'switch_to_human') {
        toggleAgentType();
      } else if (option.value === 'resolved') {
        messages.value = [...messages.value, {
          type: 'bot',
          text: '很高兴能帮到您！如果您还有其他问题，请随时提问。',
          time: formatTime(new Date())
        }];
        scrollToBottom();
      } else if (option.value === 'more_help') {
        messages.value = [...messages.value, {
          type: 'bot',
          text: '请详细描述您的问题，我会尽力为您提供更具体的帮助。',
          time: formatTime(new Date())
        }];
        scrollToBottom();
      }
    };

    // 关闭所有弹窗
    const closeModals = () => {
      showOrderList.value = false;
      showContactOptions.value = false;
    };

    // 滚动到聊天底部
    const scrollToBottom = () => {
      setTimeout(() => {
        if (chatContainer.value) {
          chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
        }
      }, 50);
    };

    // 格式化时间
    const formatTime = (date) => {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    // 页面加载完成
    onMounted(() => {
      // 初始加载时发送欢迎消息
      setTimeout(() => {
        messages.value = [...messages.value, {
          type: 'bot',
          text: currentAgent.value === 'human' 
            ? '您好！我是您的专属旅行顾问小杜，很高兴为您服务！请问有什么可以帮到您？' 
            : '您好！我是智能AI客服，很高兴为您服务！请问有什么可以帮到您？',
          time: formatTime(new Date())
        }];
        scrollToBottom();
      }, 500);
    });

    return {
      activeCategory,
      messageInput,
      messages,
      isTyping,
      showOrderList,
      showContactOptions,
      chatContainer,
      currentAgent,
      aiModel,
      faqs,
      recentOrders,
      sendMessage,
      sendOrderToChat,
      toggleFaq,
      closeModals,
      toggleAgentType,
      handleReplyOption,
      onModelChange,
      getModelDisplayName,
      getCategoryDisplayName
    };
  }
};
</script>

<style scoped>
/* 全局样式 */
.customer-service-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: linear-gradient(to bottom, #f8fafc 0%, #ffffff 100%);
  min-height: 100vh;
}

/* 头部样式 */
.service-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  color: white;
  padding: 23px 27px;
  border-radius: 16px;
  margin-bottom: 20px;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.25), 0 4px 8px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;
  height: 80px;
}

.service-header::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
  animation: shimmer 8s infinite;
}

@keyframes shimmer {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  50% { transform: translate(-10%, -10%) rotate(180deg); }
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
  position: relative;
  bottom: 40px;
}

.service-header h1 {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 24px;
  margin-bottom: 8px;
  font-weight: 700;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.service-header h1 i {
  font-size: 28px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.service-header p {
  opacity: 0.95;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 400;
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

.status-badge:hover {
  background: rgba(255, 255, 255, 0.35);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.online-dot {
  width: 12px;
  height: 12px;
  background: #10b981;
  border-radius: 50%;
  animation: pulse 2s infinite;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
}

@keyframes pulse {
  0% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  50% {
    opacity: 0.8;
    box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
  }
  100% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

/* 主内容区布局 */
.service-container {
  display: flex;
  gap: 20px;
  height: calc(100vh - 80px); /* 铺满整个页面高度，仅减去必要的头部间距 */
}

/* 左侧边栏 */
.service-sidebar {
  width: 200px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.service-sidebar:hover {
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08);
}

.service-categories h3, .quick-actions h3, .faq-section h3, .service-channels h3 {
  padding: 14px 16px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  border-bottom: 2px solid #e2e8f0;
  letter-spacing: 0.3px;
}

.service-categories ul {
  list-style: none;
  padding: 8px 0;
}

.service-categories li {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-left: 4px solid transparent;
  position: relative;
  margin: 2px 0;
  font-size: 14px;
}

.service-categories li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s ease;
  border-radius: 0 4px 4px 0;
}

.service-categories li:hover {
  background: linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%);
  transform: translateX(4px);
  padding-left: 26px;
}

.service-categories li:hover::before {
  width: 4px;
}

.service-categories li.active {
  background: linear-gradient(90deg, #eff6ff 0%, #dbeafe 100%);
  color: #1e40af;
  border-left-color: #667eea;
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(102, 126, 234, 0.1);
}

.service-categories li.active::before {
  width: 4px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.service-categories li i {
  width: 22px;
  text-align: center;
  font-size: 18px;
  color: #64748b;
  transition: all 0.3s ease;
}

.service-categories li.active i {
  color: #667eea;
  transform: scale(1.1);
}

.quick-actions {
  border-top: 2px solid #e2e8f0;
  padding-top: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: calc(100% - 16px);
  margin: 4px 8px;
  padding: 12px 14px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.action-btn:hover {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  border-color: #cbd5e1;
}

.action-btn:active {
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.action-btn i {
  color: #667eea;
  font-size: 18px;
  transition: transform 0.3s ease;
}

.action-btn:hover i {
  transform: scale(1.15) rotate(5deg);
}

/* 聊天区域 */
.chat-section {
  flex: 1;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.chat-header {
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #f1f5f9;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
}

.agent-info {
  display: flex;
  align-items: center;
  gap: 14px;
}

.agent-avatar {
  position: relative;
}

.agent-avatar img {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.agent-avatar:hover img {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  border-color: #667eea;
}

.agent-details h3 {
  font-size: 17px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
}

.agent-details p {
  font-size: 13px;
  color: #64748b;
  font-weight: 400;
}

.chat-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.action-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.action-icon:hover {
  background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
  color: #475569;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.action-icon:active {
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* 切换客服类型按钮特定样式 */
.agent-toggle-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.agent-toggle-btn:hover {
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  color: white;
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
}

/* 聊天消息区域 */
.chat-messages {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  background: linear-gradient(to bottom, #f8fafc 0%, #ffffff 50%, #f8fafc 100%);
  display: flex;
  flex-direction: column;
  gap: 18px;
  position: relative;
}

/* 自定义滚动条 */
.chat-messages::-webkit-scrollbar {
  width: 8px;
}

.chat-messages::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
  transition: background 0.3s;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.message {
  max-width: 75%;
  display: flex;
  animation: messageSlideIn 0.3s ease-out;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.system {
  align-self: center;
  max-width: 80%;
}

.message.user {
  margin-left: auto;
  flex-direction: column;
  align-items: flex-end;
}

.message.bot {
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
}

.bot-avatar {
  position: relative;
  flex-shrink: 0;
}

.bot-avatar img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #e2e8f0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.ai-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
  animation: badgePulse 2s infinite;
}

@keyframes badgePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.message-content {
  padding: 14px 18px;
  border-radius: 20px;
  position: relative;
  word-break: break-word;
  line-height: 1.6;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.message-content:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.system .message-content {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  color: #1e40af;
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
}

.user .message-content {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-top-right-radius: 6px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.bot .message-content {
  background: white;
  border: 1px solid #e2e8f0;
  border-top-left-radius: 6px;
  color: #1e293b;
}

.message-time {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 6px;
  padding: 0 4px;
  font-weight: 400;
}

/* 快捷回复 */
.quick-replies {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.quick-replies button {
  padding: 8px 16px;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 20px;
  color: #667eea;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.quick-replies button i {
  font-size: 12px;
}

.quick-replies button:hover {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-color: #667eea;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
}

.quick-replies button:active {
  transform: translateY(0);
}

/* 回复选项 */
.reply-options {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.reply-options a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  color: #667eea;
  text-decoration: none;
  border: 1px solid #cbd5e1;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.reply-options a i {
  font-size: 12px;
}

.reply-options a:hover {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-color: #667eea;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
}

/* 正在输入 */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 8px 16px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
}

.dot {
  width: 8px;
  height: 8px;
  background: #9ca3af;
  border-radius: 50%;
  animation: typing 1.4s infinite both;
}

.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-5px); }
}

/* 流式输出样式 */
.message.streaming .message-content {
  background-color: rgba(240, 248, 255, 0.7);
}

.streaming-text {
  position: relative;
}

.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 16px;
  background-color: #007BFF;
  margin-left: 2px;
  animation: cursor-blink 1s infinite;
  vertical-align: text-bottom;
}

@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 错误状态样式 */
.message.error .message-content {
  background-color: rgba(255, 235, 235, 0.7);
  border-color: #ffcccc;
}

/* 结构化信息标签样式 */
.structured-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 8px 0;
}

.structured-tags .tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  color: white;
}

/* 不同类型的结构化信息标签颜色 */
.tag.category-order {
  background-color: #4CAF50;
}

.tag.category-refund {
  background-color: #FF9800;
}

.tag.category-hotel {
  background-color: #2196F3;
}

.tag.category-flight {
  background-color: #9C27B0;
}

.tag.category-service {
  background-color: #F44336;
}

.tag.category-info {
  background-color: #607D8B;
}

/* 输入区域 */
.chat-input-area {
  padding: 20px 24px;
  border-top: 2px solid #f1f5f9;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
}

.input-tools {
  display: flex;
  gap: 12px;
  padding-left: 4px;
}

.tool-btn {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  border: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 18px;
  cursor: pointer;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tool-btn:hover {
  background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
  color: #667eea;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
}

.tool-btn:active {
  transform: translateY(0);
}

.input-container {
  display: flex;
  gap: 12px;
  align-items: center;
}

.input-container input {
  flex: 1;
  padding: 16px 22px;
  border: 2px solid #e2e8f0;
  border-radius: 28px;
  font-size: 15px;
  outline: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: white;
  color: #1e293b;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.input-container input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1), 0 2px 8px rgba(102, 126, 234, 0.15);
}

.input-container input::placeholder {
  color: #94a3b8;
}

.send-btn {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  font-size: 18px;
}

.send-btn:hover {
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.send-btn:active {
  transform: translateY(0) scale(1);
}

/* 右侧帮助区 */
.help-sidebar {
  width: 240px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.help-sidebar:hover {
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08);
}

.faq-section {
  flex: 0 1 auto;
  overflow-y: auto;
  max-height: 60vh;
  min-height: 200px;
}

.faq-item {
  border-bottom: 1px solid #e5e7eb;
}

.faq-question {
  width: 100%;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
}

.faq-question:hover {
  background: #f9fafb;
}

.faq-question i {
  transition: transform 0.3s;
}

.faq-question .rotated {
  transform: rotate(180deg);
}

.faq-answer {
  padding: 0 16px 12px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.6;
}

.faq-buttons {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.faq-buttons button {
  padding: 4px 12px;
  background: #eff6ff;
  color: #3b82f6;
  border: 1px solid #dbeafe;
  border-radius: 14px;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.3s ease;
}

.faq-buttons button:hover {
  background: #dbeafe;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.2);
}

.faq-buttons button i {
  font-size: 11px;
}

.service-channels {
  border-top: 2px solid #e2e8f0;
  margin-top: 60px;
  padding-top: 20px;
  flex-shrink: 0;
  overflow-y: auto;
  max-height: 35vh;
  min-height: 200px;
}

/* 其他服务渠道滚动条样式 */
.service-channels::-webkit-scrollbar {
  width: 6px;
}

.service-channels::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 3px;
}

.service-channels::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
  transition: background 0.3s;
}

.service-channels::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.channel-item {
  padding: 12px 16px;
  display: flex;
  gap: 12px;
  border-bottom: 1px solid #f3f4f6;
}

.channel-item:last-child {
  border-bottom: none;
}

.channel-item i {
  font-size: 20px;
  color: #3b82f6;
  width: 20px;
  flex-shrink: 0;
}

.channel-item h4 {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 3px;
}

.channel-item p {
  color: #111827;
  font-size: 12px;
  margin-bottom: 2px;
}

.channel-item small {
  color: #6b7280;
  font-size: 11px;
}

.qrcode {
  margin-top: 8px;
}

.qrcode img {
  width: 80px;
  height: 80px;
  object-fit: cover;
}

/* 弹窗样式 */
.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  background: white;
  border-radius: 20px;
  width: 90%;
  max-width: 520px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 8px 16px rgba(0, 0, 0, 0.2);
  animation: modalSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translate(-50%, -48%);
    scale: 0.95;
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%);
    scale: 1;
  }
}

.modal-content {
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 24px 28px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #f1f5f9;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
}

.modal-header h2 {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.close-btn {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
  color: #64748b;
  transition: all 0.3s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.close-btn:hover {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  color: #dc2626;
  transform: rotate(90deg);
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
}

.order-list {
  max-height: 500px;
  overflow-y: auto;
  padding: 8px 0;
}

.order-list::-webkit-scrollbar {
  width: 6px;
}

.order-list::-webkit-scrollbar-track {
  background: #f1f5f9;
}

.order-list::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.order-item {
  padding: 20px 28px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.3s ease;
  margin: 4px 0;
  border-radius: 12px;
  margin-left: 8px;
  margin-right: 8px;
}

.order-item:hover {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.order-status {
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.order-status.confirmed {
  background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
  color: #166534;
}

.order-status.paid {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  color: #0369a1;
}

.order-status.completed {
  background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%);
  color: #065f46;
}

.order-info {
  flex: 1;
  margin: 0 20px;
}

.order-info h4 {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 6px;
}

.order-info p {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  margin: 4px 0;
}

.order-action {
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.order-action i {
  font-size: 13px;
}

.order-action:hover {
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
}

.order-action:active {
  transform: translateY(0);
}

.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 999;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 模型选择器样式 */
.model-selector {
  position: relative;
  margin-right: 8px;
}

.model-select {
  padding: 8px 14px;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  outline: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 32px;
}

.model-select:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.model-select:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1), 0 2px 8px rgba(102, 126, 234, 0.15);
}

/* 响应式调整 */
@media (max-width: 1200px) {
  .help-sidebar {
    display: none;
  }
}

@media (max-width: 768px) {
    .service-container {
      flex-direction: column;
    }
    
    .service-sidebar {
      width: 100%;
      margin-bottom: 15px;
    }
    
    .message {
      max-width: 95%;
    }
    
    .chat-actions {
      flex-wrap: wrap;
    }
    
    .model-selector {
      margin: 5px 10px 5px 0;
      flex: 1 0 100px;
    }
  }
</style>