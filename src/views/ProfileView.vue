<template>
  <div class="profile-container">
    <p v-if="travel.storageError" role="alert">{{ travel.storageError }}</p>
    <!-- Header Section -->
    <div class="profile-header">
      <div class="header-background"></div>
      <div class="header-content">
        <h1>个人中心</h1>
        <p>管理您的个人信息和订单</p>
      </div>
    </div>

    <!-- Profile Card -->
    <div class="profile-card">
      <!-- Avatar Section -->
      <div class="avatar-section">
        <div class="avatar-container">
          <app-image :src="userProfile.avatar" alt="用户头像" class="user-avatar" kind="avatar" loading="eager" />
          <div class="avatar-overlay">
            <label for="avatar-upload" class="upload-btn">
              <font-awesome-icon class="fas fa-camera"></font-awesome-icon>
              <span>更换头像</span>
            </label>
            <input 
              type="file" 
              id="avatar-upload" 
              accept="image/*" 
              @change="handleAvatarUpload"
              style="display: none;"
            >
          </div>
        </div>
        
        <!-- Nickname Section -->
        <div class="nickname-section">
          <div v-if="!editingNickname" class="nickname-display">
            <h2>{{ userProfile.nickname }}</h2>
            <button @click="startNicknameEdit" class="edit-btn">
              <font-awesome-icon class="fas fa-edit"></font-awesome-icon>
            </button>
          </div>
          <div v-else class="nickname-edit">
            <input 
              v-model="tempNickname" 
              type="text" 
              placeholder="请输入昵称"
              @keyup.enter="saveNickname"
            >
            <button @click="saveNickname" class="save-btn">
              <font-awesome-icon class="fas fa-check"></font-awesome-icon>
            </button>
            <button @click="cancelEditNickname" class="cancel-btn">
              <font-awesome-icon class="fas fa-times"></font-awesome-icon>
            </button>
          </div>
        </div>

        <div class="user-meta">
          <span class="user-id">ID: {{ userProfile.userId }}</span>
          <span class="join-date">注册时间: {{ userProfile.joinDate }}</span>
          <span>手机号: {{ userProfile.phone || '未绑定' }}</span>
        </div>
      </div>

      <!-- Stats Section -->
      <div class="stats-section">
        <div class="stat-item">
          <font-awesome-icon class="fas fa-map-marker-alt"></font-awesome-icon>
          <div class="stat-info">
            <span class="stat-value">{{ totalAttractionOrders }}</span>
            <span class="stat-label">景点订单</span>
          </div>
        </div>
        <div class="stat-item">
          <font-awesome-icon class="fas fa-hotel"></font-awesome-icon>
          <div class="stat-info">
            <span class="stat-value">{{ totalHotelOrders }}</span>
            <span class="stat-label">酒店订单</span>
          </div>
        </div>
        <div class="stat-item">
          <font-awesome-icon class="fas fa-heart"></font-awesome-icon>
          <div class="stat-info">
            <span class="stat-value">{{ favoriteCount }}</span>
            <span class="stat-label">收藏数量</span>
          </div>
        </div>
        <div class="stat-item">
          <font-awesome-icon class="fas fa-ticket-alt"></font-awesome-icon>
          <div class="stat-info">
            <span class="stat-value">{{ totalTravelOrders }}</span>
            <span class="stat-label">票务/行程订单</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Orders Section -->
    <div class="orders-section" id="profile-orders">
      <div class="section-header">
        <h2>我的订单</h2>
        <div class="order-tabs">
          <button 
            :class="['tab-btn', { active: activeTab === 'all' }]"
            @click="switchOrderTab('all')"
          >
            全部订单
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'attractions' }]"
            @click="switchOrderTab('attractions')"
          >
            景点订单
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'hotels' }]"
            @click="switchOrderTab('hotels')"
          >
            酒店订单
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'travel' }]"
            @click="switchOrderTab('travel')"
          >
            票务/行程订单
          </button>
        </div>
      </div>

      <p class="demo-notice">以下为演示订单，不对应真实预订或付款。</p>

      <!-- Empty State -->
      <div v-if="filteredOrders.length === 0" class="empty-state">
        <font-awesome-icon class="fas fa-inbox"></font-awesome-icon>
        <h3>暂无订单</h3>
        <p>您还没有任何订单记录</p>
        <button @click="goToAttractions" class="btn-primary">
          去预订
        </button>
      </div>

      <!-- Orders List -->
      <div v-else class="orders-list">
        <div 
          v-for="order in filteredOrders" 
          :key="order.id" 
          class="order-card"
        >
          <div class="order-header">
            <div class="order-type-badge" :class="order.type">
              <font-awesome-icon :class="orderTypeIcon(order.type)"></font-awesome-icon>
              {{ orderTypeLabel(order.type) }}
            </div>
            <div class="order-status" :class="order.status">
              {{ getStatusText(order.status) }}
            </div>
          </div>

          <div class="order-content">
            <div class="order-image">
              <app-image :src="order.image" :alt="order.name" />
            </div>
            <div class="order-info">
              <h3>{{ order.name }}</h3>
              <div class="order-details">
                <div class="detail-item">
                  <font-awesome-icon class="fas fa-location-dot"></font-awesome-icon>
                  <span>{{ order.location }}</span>
                </div>
                <div class="detail-item">
                  <font-awesome-icon class="fas fa-calendar"></font-awesome-icon>
                  <span>预订日期: {{ order.bookingDate }}</span>
                </div>
                <div v-if="order.type === 'hotel'" class="detail-item">
                  <font-awesome-icon class="fas fa-clock"></font-awesome-icon>
                  <span>{{ order.checkIn }} - {{ order.checkOut }}</span>
                </div>
                <div v-if="order.type === 'hotel'" class="detail-item">
                  <font-awesome-icon class="fas fa-hospital-user"></font-awesome-icon>
                  <span>{{ order.quantity }} 间 · {{ order.nights || 1 }} 晚 · {{ order.guests || order.quantity }} 位住客</span>
                </div>
                <div v-else class="detail-item">
                  <font-awesome-icon class="fas fa-user"></font-awesome-icon>
                  <span>{{ order.quantity }} 人</span>
                </div>
              </div>
            </div>
            <div class="order-actions">
              <div class="order-price">
                <span class="price-label">总价</span>
                <span class="price-value">¥{{ order.totalPrice }}</span>
              </div>
              <div class="action-buttons">
                <button 
                  v-if="order.status === 'pending'" 
                  @click="payOrder(order)" 
                  class="btn-pay"
                >
                  立即支付
                </button>
                <button 
                  v-if="order.status === 'paid' || order.status === 'confirmed'" 
                  @click="viewOrderDetail(order)" 
                  class="btn-detail"
                >
                  查看详情
                </button>
                <button 
                  v-if="order.status === 'paid' || order.status === 'confirmed'" 
                  @click="advanceOrder(order)" 
                  class="btn-advance"
                >
                  {{ order.status === 'paid' ? '确认收货' : '完成订单' }}
                </button>
                <button 
                  v-if="order.status === 'completed'" 
                  @click="reviewOrder(order)" 
                  class="btn-review"
                >
                  评价
                </button>
                <button 
                  v-if="order.status === 'pending'" 
                  @click="cancelOrder(order)" 
                  class="btn-cancel"
                >
                  取消订单
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="filteredOrders.length > 0" class="pagination">
        <button 
          @click="prevPage" 
          :disabled="currentPage === 1"
          class="page-btn"
        >
          <font-awesome-icon class="fas fa-chevron-left"></font-awesome-icon>
          上一页
        </button>
        <span class="page-info">第 {{ currentPage }} 页 / 共 {{ totalPages }} 页</span>
        <button 
          @click="nextPage" 
          :disabled="currentPage === totalPages"
          class="page-btn"
        >
          下一页
          <font-awesome-icon class="fas fa-chevron-right"></font-awesome-icon>
        </button>
      </div>
    </div>

    <!-- 我的酒店收藏 -->
    <div class="orders-section" id="profile-favorites">
      <div class="section-header favorites-header">
        <h2>
          <font-awesome-icon class="fas fa-heart"></font-awesome-icon>
          我的酒店收藏
          <span class="favorites-count" v-if="favoriteHotels.length">{{ favoriteHotels.length }}</span>
        </h2>
        <button v-if="favoriteHotels.length" @click="goToHotels" class="btn-find-hotel">
          <font-awesome-icon class="fas fa-search"></font-awesome-icon>
          去选更多酒店
        </button>
      </div>

      <div v-if="favoriteHotels.length === 0" class="empty-state">
        <font-awesome-icon class="fas fa-heart-broken"></font-awesome-icon>
        <h3>还没有收藏的酒店</h3>
        <p>在酒店页点击心形即可收藏常去的住宿，方便回访比价</p>
        <button @click="goToHotels" class="btn-primary">去酒店页看看</button>
      </div>

      <div v-else class="fav-hotel-list">
        <div v-for="hotel in favoriteHotels" :key="hotel.id" class="fav-hotel-card">
          <app-image class="fav-hotel-image" :src="hotel.image" :alt="hotel.name" />
          <div class="fav-hotel-info">
            <h3>{{ hotel.name }}</h3>
            <div class="fav-hotel-meta">
              <span class="fav-rating">
                <font-awesome-icon class="fas fa-star"></font-awesome-icon>
                {{ hotel.rating }}
              </span>
              <span class="fav-stars">
                <font-awesome-icon v-for="i in 5" :key="i" class="fas fa-star" :class="{ 'filled': i <= hotel.starLevel }"></font-awesome-icon>
              </span>
              <span class="fav-location">
                <font-awesome-icon class="fas fa-map-marker-alt"></font-awesome-icon>
                {{ hotel.location }}
              </span>
            </div>
            <div class="fav-hotel-footer">
              <span class="fav-price">
                ¥{{ hotel.price }}<em>/晚</em>
                <span v-if="hotel.originalPrice" class="fav-orig">¥{{ hotel.originalPrice }}</span>
              </span>
              <div class="fav-actions">
                <button class="btn-book" @click="bookFavorite(hotel)">
                  <font-awesome-icon class="fas fa-calendar-check"></font-awesome-icon>
                  预订
                </button>
                <button class="btn-unfav" @click="toggleFavorite(hotel)" :aria-label="`移除收藏 ${hotel.name}`">
                  <font-awesome-icon class="fas fa-heart"></font-awesome-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Price Alerts Section -->
    <div class="orders-section">
      <div class="section-header alerts-header">
        <h2>
          价格提醒
          <span class="alerts-count" v-if="travel.alerts.length">{{ travel.alerts.length }}</span>
        </h2>
        <button v-if="travel.alerts.length" @click="clearAllAlerts" class="btn-clear-alerts">
          <font-awesome-icon class="fas fa-trash"></font-awesome-icon>
          清空全部
        </button>
      </div>

      <div v-if="travel.alerts.length === 0" class="empty-state">
        <font-awesome-icon class="fas fa-bell-slash"></font-awesome-icon>
        <h3>暂无提醒</h3>
        <p>订阅景点/酒店价格后可在此查看降价的触发提醒</p>
        <button @click="goToAttractions" class="btn-primary">去订阅</button>
      </div>

      <div v-else class="alerts-list">
        <div v-for="alert in travel.alerts" :key="alert.id" class="alert-item">
          <div class="alert-content">
            <p class="alert-message">{{ alert.message }}</p>
            <p class="alert-time">{{ formatDateTime(alert.triggeredAt) }}</p>
          </div>
          <button class="btn-dismiss-alert" @click="dismissAlert(alert)" aria-label="删除此提醒">
            <font-awesome-icon class="fas fa-xmark"></font-awesome-icon>
          </button>
        </div>
      </div>
    </div>

    <!-- Back to Home Button -->
    <div class="top-right-actions">
      <button @click="goHome" class="btn-home">
        <font-awesome-icon class="fas fa-home"></font-awesome-icon>
        返回主页
      </button>
      <div class="settings-dropdown">
        <button @click="toggleSettings" class="btn-settings">
          <font-awesome-icon class="fas fa-cog"></font-awesome-icon>
          设置
        </button>
        <div v-if="showSettings" class="settings-menu">
          <button @click="openNicknameEdit" class="menu-item">
            <font-awesome-icon class="fas fa-user-edit"></font-awesome-icon>
            修改昵称
          </button>
          <button @click="openPhoneBind" class="menu-item">
            <font-awesome-icon class="fas fa-phone"></font-awesome-icon>
            绑定手机号
          </button>
          <button @click="openPasswordChange" class="menu-item">
            <font-awesome-icon class="fas fa-key"></font-awesome-icon>
            修改密码
          </button>
          <button @click="openAbout" class="menu-item">
            <font-awesome-icon class="fas fa-info-circle"></font-awesome-icon>
            关于我们
          </button>
          <button @click="openPrivacy" class="menu-item">
            <font-awesome-icon class="fas fa-shield-alt"></font-awesome-icon>
            隐私政策
          </button>
          <button @click="switchAccount" class="menu-item">退出登录 / 切换账号</button>
         
        </div>
      </div>
    </div>

    <!-- Modals -->
    <!-- Nickname Edit Modal -->
    <div v-if="showNicknameModal" class="modal-overlay" @click="showNicknameModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>修改昵称</h3>
          <button @click="showNicknameModal = false" class="close-modal">
            <font-awesome-icon class="fas fa-times"></font-awesome-icon>
          </button>
        </div>
        <div class="modal-body">
          <input 
            v-model="tempNickname" 
            type="text" 
            placeholder="请输入新昵称"
            class="modal-input"
            @keyup.enter="saveNicknameFromModal"
          >
        </div>
        <div class="modal-footer">
          <button @click="showNicknameModal = false" class="btn-secondary">取消</button>
          <button @click="saveNicknameFromModal" class="btn-primary">保存</button>
        </div>
      </div>
    </div>

    <!-- Phone Bind Modal -->
    <div v-if="showPhoneModal" class="modal-overlay" @click="showPhoneModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>绑定手机号</h3>
          <button @click="showPhoneModal = false" class="close-modal">
            <font-awesome-icon class="fas fa-times"></font-awesome-icon>
          </button>
        </div>
        <div class="modal-body">
          <p>本地演示验证，不会发送真实短信。</p>
          <p v-if="demoCode">本次演示验证码：{{ demoCode }}</p>
          <input 
            v-model="phoneNumber" 
            type="tel" 
            placeholder="请输入手机号"
            class="modal-input"
            maxlength="11"
          >
          <div class="verification-code">
            <input 
              v-model="verificationCode" 
              type="text" 
              placeholder="请输入验证码"
              class="modal-input"
              maxlength="6"
            >
            <button @click="sendVerificationCode" class="btn-code" :disabled="codeSent">
              {{ codeSent ? `${countdown}s后重发` : '发送验证码' }}
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showPhoneModal = false" class="btn-secondary">取消</button>
          <button @click="bindPhone" class="btn-primary">绑定</button>
        </div>
      </div>
    </div>

    <!-- Password Change Modal -->
    <div v-if="showPasswordModal" class="modal-overlay" @click="showPasswordModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>修改密码</h3>
          <button @click="showPasswordModal = false" class="close-modal">
            <font-awesome-icon class="fas fa-times"></font-awesome-icon>
          </button>
        </div>
        <div class="modal-body">
          <input 
            v-if="userProfile.hasPassword"
            v-model="oldPassword" 
            type="password" 
            placeholder="请输入当前密码"
            class="modal-input"
          >
          <input 
            v-model="newPassword" 
            type="password" 
            placeholder="请输入新密码（6-20位）"
            class="modal-input"
          >
          <input 
            v-model="confirmPassword" 
            type="password" 
            placeholder="请再次输入新密码"
            class="modal-input"
            @keyup.enter="changePassword"
          >
        </div>
        <div class="modal-footer">
          <button @click="showPasswordModal = false" class="btn-secondary">取消</button>
          <button @click="changePassword" class="btn-primary">确认修改</button>
        </div>
      </div>
    </div>

    <!-- Order Detail Modal -->
    <div v-if="showOrderDetailModal && selectedOrder" class="modal-overlay" @click="showOrderDetailModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>订单详情</h3>
          <button @click="showOrderDetailModal = false" class="close-modal">
            <font-awesome-icon class="fas fa-times"></font-awesome-icon>
          </button>
        </div>
        <div class="modal-body">
          <div class="order-detail-row">
            <span class="detail-label">订单号</span>
            <span class="detail-value">{{ selectedOrder.id }}</span>
          </div>
          <div class="order-detail-row">
            <span class="detail-label">订单名称</span>
            <span class="detail-value">{{ selectedOrder.name }}</span>
          </div>
          <div class="order-detail-row">
            <span class="detail-label">类型</span>
            <span class="detail-value">{{ selectedOrder.type === 'hotel' ? '酒店' : selectedOrder.type === 'travel' ? '行程' : '景点' }}订单</span>
          </div>
          <div class="order-detail-row">
            <span class="detail-label">预订日期</span>
            <span class="detail-value">{{ selectedOrder.bookingDate }}</span>
          </div>
          <div v-if="selectedOrder.location" class="order-detail-row">
            <span class="detail-label">地点</span>
            <span class="detail-value">{{ selectedOrder.location }}</span>
          </div>
          <div v-if="selectedOrder.checkIn" class="order-detail-row">
            <span class="detail-label">入住</span>
            <span class="detail-value">{{ selectedOrder.checkIn }} - {{ selectedOrder.checkOut }}</span>
          </div>
          <div v-if="selectedOrder.quantity" class="order-detail-row">
            <span class="detail-label">数量</span>
            <span class="detail-value" v-if="selectedOrder.type === 'hotel'">{{ selectedOrder.quantity }} 间 · {{ selectedOrder.nights || 1 }} 晚 · {{ selectedOrder.guests || selectedOrder.quantity }} 位住客</span>
            <span class="detail-value" v-else>{{ selectedOrder.quantity }} 人/份</span>
          </div>
          <div v-if="selectedOrder.type === 'hotel' && selectedOrder.cancelPolicy" class="order-detail-row">
            <span class="detail-label">取消政策</span>
            <span class="detail-value" :class="{ 'policy-flexible': selectedOrder.cancelPolicy === 'flexible', 'policy-strict': selectedOrder.cancelPolicy === 'nonrefundable' }">
              <font-awesome-icon :class="selectedOrder.cancelPolicy === 'flexible' ? 'fas fa-shield-alt' : 'fas fa-lock'"></font-awesome-icon>
              {{ selectedOrder.cancelPolicy === 'flexible' ? '限时免费取消' : '不可退款特惠' }}
            </span>
          </div>
          <div v-if="selectedOrder.unitPrice != null" class="order-detail-row">
            <span class="detail-label">单价</span>
            <span class="detail-value">¥{{ selectedOrder.unitPrice }}</span>
          </div>
          <div class="order-detail-row">
            <span class="detail-label">订单状态</span>
            <span class="detail-value">{{ getStatusText(selectedOrder.status) }}</span>
          </div>
          <div class="order-detail-row">
            <span class="detail-label">总价</span>
            <span class="detail-value detail-price">¥{{ selectedOrder.totalPrice }}</span>
          </div>
          <div v-if="selectedOrder.review" class="order-detail-row review-row">
            <span class="detail-label">我的评价</span>
            <span class="detail-value">
              <span class="review-stars">{{ '★'.repeat(selectedOrder.review.rating) }}<span class="review-empty">{{ '★'.repeat(5 - selectedOrder.review.rating) }}</span></span>
              <span class="review-text">{{ selectedOrder.review.comment }}</span>
              <span class="review-time">{{ formatDateTime(selectedOrder.review.reviewedAt) }}</span>
            </span>
          </div>
          <div class="order-detail-note">本地演示订单，不对应真实预订或付款。</div>
        </div>
        <div class="modal-footer">
          <button @click="showOrderDetailModal = false" class="btn-secondary">关闭</button>
          <button v-if="selectedOrder.status === 'completed' && !selectedOrder.review && isPersistedOrder(selectedOrder)" @click="openReviewModal" class="btn-primary">写评价</button>
        </div>
      </div>
    </div>

    <!-- Order Review Modal -->
    <div v-if="showReviewModal && selectedOrder" class="modal-overlay" @click="closeReviewModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>评价订单</h3>
          <button @click="closeReviewModal" class="close-modal">
            <font-awesome-icon class="fas fa-times"></font-awesome-icon>
          </button>
        </div>
        <div class="modal-body">
          <p class="review-subject">{{ selectedOrder.name }}</p>
          <div class="rating-picker" role="radiogroup" aria-label="评分">
            <button
              v-for="star in 5"
              :key="star"
              type="button"
              class="star-btn"
              :class="{ active: reviewRating >= star }"
              :aria-label="`${star} 星`"
              :aria-checked="reviewRating === star"
              @click="reviewRating = star"
            >{{ reviewRating >= star ? '★' : '☆' }}</button>
          </div>
          <textarea
            v-model="reviewComment"
            class="review-textarea"
            :maxlength="500"
            placeholder="分享您的体验（选填）"
            rows="4"
          ></textarea>
          <p class="review-count">{{ reviewComment.length }}/500</p>
          <p v-if="reviewError" class="error-message" role="alert">{{ reviewError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closeReviewModal" class="btn-secondary">取消</button>
          <button @click="submitReview" class="btn-primary">提交评价</button>
        </div>
      </div>
    </div>

    <!-- About Modal -->
    <div v-if="showAboutModal" class="modal-overlay" @click="showAboutModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>关于我们</h3>
          <button @click="showAboutModal = false" class="close-modal">
            <font-awesome-icon class="fas fa-times"></font-awesome-icon>
          </button>
        </div>
        <div class="modal-body">
          <div class="about-content">
            <h4>智绘旅游</h4>
            <p>版本：1.0.0</p>
            <p>智绘旅游是一款专业的旅游服务平台，致力于为用户提供便捷、智能的旅游规划和预订服务。</p>
            <p>我们提供景点推荐、线路规划、酒店预订、交通购票等全方位的旅游服务。</p>
            <p class="contact">联系我们：service@zhihuilv.com</p>
            <p class="copyright">© 2024 智绘旅游. All rights reserved.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showAboutModal = false" class="btn-primary">关闭</button>
        </div>
      </div>
    </div>

    <!-- Privacy Policy Modal -->
    <div v-if="showPrivacyModal" class="modal-overlay" @click="showPrivacyModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>隐私政策</h3>
          <button @click="showPrivacyModal = false" class="close-modal">
            <font-awesome-icon class="fas fa-times"></font-awesome-icon>
          </button>
        </div>
        <div class="modal-body privacy-body">
          <div class="privacy-content">
            <h4>1. 信息收集</h4>
            <p>我们收集您提供的个人信息，包括但不限于姓名、联系方式、支付信息等，用于提供更好的服务。</p>
            
            <h4>2. 信息使用</h4>
            <p>我们使用收集的信息来处理订单、提供客户服务、改进我们的服务质量。</p>
            
            <h4>3. 信息保护</h4>
            <p>我们采用行业标准的安全措施来保护您的个人信息，防止未经授权的访问、使用或披露。</p>
            
            <h4>4. 信息共享</h4>
            <p>未经您的同意，我们不会向第三方分享您的个人信息，法律要求的情况除外。</p>
            
            <h4>5. Cookie使用</h4>
            <p>我们使用Cookie来改善用户体验，您可以选择禁用Cookie，但这可能影响某些功能的使用。</p>
            
            <h4>6. 政策更新</h4>
            <p>我们可能会不时更新本隐私政策，更新后的政策将在网站上公布。</p>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showPrivacyModal = false" class="btn-primary">我知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useFeedback } from '../composables/useFeedback.js'
import AppImage from '../ui/AppImage.js'
import { FontAwesomeIcon } from '../ui/fontAwesome.js'
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { DEFAULT_AVATAR } from '../services/authService.js'
import { sendVerificationCode as sendDemoCode, validatePhoneNumber } from '../services/smsService.js'
import { useTravelStore } from '../stores/travel.js'
import { hotelCatalog, findHotel } from '../data/hotelCatalog.js'

export default {
  components: { AppImage, FontAwesomeIcon },
  name: 'ProfileView',
  setup() {
    const feedback = useFeedback()
    const router = useRouter()
    const auth = useAuthStore()
    const travel = useTravelStore()
    
    // User Profile Data
    const userProfile = computed(() => ({
      ...auth.user,
      userId: auth.user?.id || '',
      nickname: auth.user?.nickname || '',
      avatar: auth.user?.avatar || DEFAULT_AVATAR,
      joinDate: auth.user?.createdAt?.slice(0, 10) || '—'
    }))

    // Editing State
    const editingNickname = ref(false)
    const tempNickname = ref('')

    // Settings
    const showSettings = ref(false)
    const showNicknameModal = ref(false)
    const showPhoneModal = ref(false)
    const showPasswordModal = ref(false)
    const showAboutModal = ref(false)
    const showPrivacyModal = ref(false)
    const showOrderDetailModal = ref(false)
    const showReviewModal = ref(false)
    const selectedOrder = ref(null)
    const reviewRating = ref(5)
    const reviewComment = ref('')
    const reviewError = ref('')

    // Phone Binding
    const phoneNumber = ref('')
    const verificationCode = ref('')
    const codeSent = ref(false)
    const demoCode = ref('')
    const countdown = ref(60)
    let countdownTimer = null
    let isUnmounted = false

    // Password Change
    const oldPassword = ref('')
    const newPassword = ref('')
    const confirmPassword = ref('')

    // Orders Data
    // seedOrders 为演示展示数据；travel.orders 为用户通过预订实际生成的持久化订单
    const seedOrders = ref([
      // Mock attraction orders
      {
        id: 'A001',
        type: 'attraction',
        name: '故宫博物院',
        location: '北京市东城区',
        image: '/images/web/attr-1.jpg',
        bookingDate: '2024-12-20',
        quantity: 2,
        totalPrice: 120,
        status: 'confirmed'
      },
      {
        id: 'A002',
        type: 'attraction',
        name: '九寨沟',
        location: '四川省阿坝州',
        image: '/images/web/attr-2.jpg',
        bookingDate: '2024-12-25',
        quantity: 3,
        totalPrice: 660,
        status: 'pending'
      },
      // Mock hotel orders
      {
        id: 'H001',
        type: 'hotel',
        name: '北京王府井希尔顿酒店',
        location: '北京市东城区王府井大街',
        image: '/images/web/order-profile-1.jpg',
        bookingDate: '2024-12-18',
        checkIn: '2024-12-20',
        checkOut: '2024-12-22',
        quantity: 2,
        totalPrice: 1360,
        status: 'paid'
      },
      {
        id: 'H002',
        type: 'hotel',
        name: '上海外滩万达瑞华酒店',
        location: '上海市黄浦区中山东一路',
        image: '/images/web/order-profile-2.jpg',
        bookingDate: '2024-12-15',
        checkIn: '2024-12-28',
        checkOut: '2024-12-30',
        quantity: 2,
        totalPrice: 2560,
        status: 'completed'
      }
    ])

    // 汇总订单：持久化预订订单优先，再补上演示种子订单
    const orders = computed(() => [...travel.orders, ...seedOrders.value])

    // 持久化订单是否属于当前账号
    const isPersistedOrder = (order) => travel.orders.some(item => item.id === order.id)

    // 当前需支付的订单数（用于角标提示）
    const pendingOrderCount = computed(() => orders.value.filter(o => o.status === 'pending').length)

    // Tab State
    const activeTab = ref('all')
    
    // Pagination
    const currentPage = ref(1)
    const itemsPerPage = 5

    // Computed Properties
    const totalAttractionOrders = computed(() => 
      orders.value.filter(o => o.type === 'attraction').length
    )

    const totalHotelOrders = computed(() => 
      orders.value.filter(o => o.type === 'hotel').length
    )

    const totalTravelOrders = computed(() => 
      orders.value.filter(o => o.type === 'travel').length
    )

    const favoriteCount = computed(() => travel.favoriteCount)

    const orderTypeFilter = (list) => {
      if (activeTab.value === 'attractions') return list.filter(o => o.type === 'attraction')
      if (activeTab.value === 'hotels') return list.filter(o => o.type === 'hotel')
      if (activeTab.value === 'travel') return list.filter(o => o.type === 'travel')
      return list
    }

    const orderTypeIcon = (type) => {
      if (type === 'attraction') return 'fas fa-map-marker-alt'
      if (type === 'travel') return 'fas fa-ticket-alt'
      return 'fas fa-hotel'
    }

    const orderTypeLabel = (type) => {
      if (type === 'attraction') return '景点订单'
      if (type === 'travel') return '票务/行程订单'
      return '酒店订单'
    }

    const filteredOrders = computed(() => {
      const filtered = orderTypeFilter(orders.value)
      const start = (currentPage.value - 1) * itemsPerPage
      const end = start + itemsPerPage
      return filtered.slice(start, end)
    })

    const totalPages = computed(() => {
      return Math.ceil(orderTypeFilter(orders.value).length / itemsPerPage)
    })

    // Methods
    const handleAvatarUpload = (event) => {
      const file = event.target.files[0]
      if (file) {
        if (file.size > 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
          feedback.error('请上传1MB以内的 PNG、JPEG、WebP 或 GIF 图片')
          return
        }
        
        const reader = new FileReader()
        const uploadingUserId = auth.user?.id
        reader.onload = (e) => {
          if (isUnmounted || auth.user?.id !== uploadingUserId) return
          const result = auth.updateProfile({ avatar: e.target.result })
          if (result.success) feedback.success('头像上传成功！')
          else feedback.error(result.message)
        }
        reader.onerror = () => feedback.error('图片读取失败，请重新选择')
        reader.readAsDataURL(file)
      }
    }

    const saveNickname = () => {
      const result = auth.updateProfile({ nickname: tempNickname.value })
      if (result.success) {
        editingNickname.value = false
        showNicknameModal.value = false
        feedback.success('昵称修改成功！')
      } else feedback.error(result.message)
    }

    const startNicknameEdit = () => {
      tempNickname.value = userProfile.value.nickname
      editingNickname.value = true
    }

    const cancelEditNickname = () => {
      editingNickname.value = false
      tempNickname.value = ''
    }

    const getStatusText = (status) => {
      const statusMap = {
        pending: '待支付',
        paid: '已支付',
        confirmed: '已确认',
        completed: '已完成',
        cancelled: '已取消'
      }
      return statusMap[status] || status
    }

    // 演示支付：仅对持久化（用户预订生成）的订单执行演示支付推进；种子演示订单不接入真实支付
    const payOrder = async (order) => {
      const ownerId = auth.user?.id
      if (!isPersistedOrder(order)) {
        feedback.info('真实支付尚未接入，此演示订单未发生真实付款。')
        return
      }
      const confirmed = await feedback.confirm(`确认使用演示支付 ¥${order.totalPrice || 0} 完成本订单？`, { title: '演示支付', confirmLabel: '确认支付', danger: false })
      if (!confirmed || ownerId !== auth.user?.id) return
      try {
        travel.advanceOrder(order.id)
        feedback.success('演示支付成功，订单已进入「已支付」状态。')
      } catch (error) {
        feedback.error(error.message || '支付失败')
      }
    }

    // 推进订单：已支付 → 已确认 → 已完成（承运/核销演示）
    const advanceOrder = async (order) => {
      const ownerId = auth.user?.id
      // 统一的状态机推进（与 userDataService.NEXT_ORDER_STATUS 一致）
      const nextStatus = { paid: 'confirmed', confirmed: 'completed' }[order.status]
      const nextLabel = order.status === 'paid' ? '确认' : order.status === 'confirmed' ? '完成' : ''
      if (!isPersistedOrder(order)) {
        feedback.info(`订单状态推进未接入演示数据：${order.name}`)
        return
      }
      const confirmed = await feedback.confirm(`确定将该订单标记为「${nextLabel}」？`, { title: '订单状态推进', confirmLabel: `标记${nextLabel}`, danger: false })
      if (!confirmed || ownerId !== auth.user?.id) return
      try {
        travel.advanceOrder(order.id)
        // travel.advanceOrder 会整体替换 store 内订单对象，这里用预计算的下一个状态文案，避免读取旧引用
        feedback.success(nextStatus ? `订单已推进至「${getStatusText(nextStatus)}」。` : '订单状态已更新。')
      } catch (error) {
        feedback.error(error.message || '操作失败')
      }
    }

    const viewOrderDetail = (order) => {
      selectedOrder.value = order
      showOrderDetailModal.value = true
    }

    const openReviewModal = () => {
      if (!selectedOrder.value) return
      reviewRating.value = selectedOrder.value.review?.rating || 5
      reviewComment.value = selectedOrder.value.review?.comment || ''
      reviewError.value = ''
      showReviewModal.value = true
    }

    const reviewOrder = (order) => {
      if (!isPersistedOrder(order)) {
        feedback.info(`该演示订单无评价入口：${order.name}`)
        return
      }
      if (order.review) {
        feedback.info('您已评价过该订单。')
        return
      }
      selectedOrder.value = order
      showOrderDetailModal.value = false
      openReviewModal()
    }

    const closeReviewModal = () => {
      showReviewModal.value = false
      reviewError.value = ''
    }

    const submitReview = () => {
      const order = selectedOrder.value
      if (!order || !isPersistedOrder(order)) {
        feedback.info('仅可对本地订单进行评价。')
        closeReviewModal()
        return
      }
      try {
        travel.submitOrderReview(order.id, { rating: reviewRating.value, comment: reviewComment.value.trim() })
        showReviewModal.value = false
        reviewError.value = ''
        feedback.success('评价已提交，感谢您的反馈！')
      } catch (error) {
        reviewError.value = error.message || '评价提交失败'
      }
    }

    const formatDateTime = (iso) => {
      if (!iso) return ''
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      const pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    const dismissAlert = async (alert) => {
      const ownerId = auth.user?.id
      if (await feedback.confirm('确定要删除这条提醒吗？', { confirmLabel: '删除提醒', danger: false }) && ownerId === auth.user?.id) {
        try { travel.clearAlert(alert.id); feedback.success('提醒已删除') } catch (error) { feedback.error(error.message) }
      }
    }

    const clearAllAlerts = async () => {
      const ownerId = auth.user?.id
      if (await feedback.confirm(`确定要清空全部 ${travel.alerts.length} 条提醒吗？`, { confirmLabel: '清空提醒', danger: true }) && ownerId === auth.user?.id) {
        try { travel.clearAlerts(); feedback.success('已清空全部提醒') } catch (error) { feedback.error(error.message) }
      }
    }

    const cancelOrder = async (order) => {
      const ownerId = auth.user?.id
      if (!isPersistedOrder(order)) {
        if (await feedback.confirm('确定要取消此演示订单吗？', { title: '取消演示订单', confirmLabel: '取消订单', danger: true }) && ownerId === auth.user?.id) {
          order.status = 'cancelled'
          feedback.success('本页演示订单已取消，未向真实订单系统提交。')
        }
        return
      }
      if (await feedback.confirm('确定要取消此订单吗？取消后不可恢复。', { title: '取消订单', confirmLabel: '取消订单', danger: true }) && ownerId === auth.user?.id) {
        try {
          travel.cancelOrder(order.id)
          feedback.success('订单已取消。')
        } catch (error) {
          feedback.error(error.message || '取消失败')
        }
      }
    }

    const prevPage = () => {
      if (currentPage.value > 1) {
        currentPage.value--
      }
    }

    const nextPage = () => {
      if (currentPage.value < totalPages.value) {
        currentPage.value++
      }
    }

    // 切换订单 tab 时重置页码，避免切到更少的类别后 currentPage 越界导致误显“暂无订单”
    const switchOrderTab = (tab) => {
      activeTab.value = tab
      currentPage.value = 1
    }

    const goHome = () => {
      router.push('/')
    }

    const goToAttractions = () => {
      router.push('/attractions')
    }

    // ===== 我的酒店收藏 =====
    const favoriteHotels = computed(() =>
      (travel.hotelFavorites || []).map(findHotel).filter(Boolean)
    )
    const goToHotels = () => {
      router.push('/hotels')
    }
    // 从收藏直接预订：跳转到酒店页并自动为该酒店打开预订弹窗
    const bookFavorite = (hotel) => {
      router.push({ path: '/hotels', query: { book: hotel.id } })
    }
    // 从收藏移除
    const toggleFavorite = (hotel) => {
      try {
        travel.toggleFavorite('hotels', hotel.id)
        feedback.info(favoriteHotels.value.some(h => String(h.id) === String(hotel.id)) ? '已重新收藏' : `已移除收藏「${hotel.name}」`)
      } catch (error) { feedback.error(error.message) }
    }

    // Toggle Settings Menu
    const toggleSettings = () => {
      showSettings.value = !showSettings.value
    }

    // Open Modals
    const openNicknameEdit = () => {
      tempNickname.value = userProfile.value.nickname
      showNicknameModal.value = true
      showSettings.value = false
    }

    const openPhoneBind = () => {
      phoneNumber.value = auth.user?.phone || ''
      showPhoneModal.value = true
      showSettings.value = false
    }

    const openPasswordChange = () => {
      oldPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
      showPasswordModal.value = true
      showSettings.value = false
    }

    const openAbout = () => {
      showAboutModal.value = true
      showSettings.value = false
    }

    const openPrivacy = () => {
      showPrivacyModal.value = true
      showSettings.value = false
    }

    const switchAccount = async () => {
      const ownerId = auth.user?.id
      showSettings.value = false
      
      if (await feedback.confirm('确定要退出当前账号并切换吗？', { title: '切换账号', confirmLabel: '退出当前账号' }) && ownerId === auth.user?.id) {
        auth.logout()
        router.replace('/login')
      }
    }

    // Save Nickname from Modal
    const saveNicknameFromModal = saveNickname

    // Send Verification Code
    const sendVerificationCode = async () => {
      if (!auth.user || codeSent.value) return
      if (!validatePhoneNumber(phoneNumber.value)) {
        feedback.error('请输入正确的手机号')
        return
      }
      
      const requestingUserId = auth.user.id
      try {
        const result = await sendDemoCode(phoneNumber.value, requestingUserId)
        if (isUnmounted || auth.user?.id !== requestingUserId) return
        demoCode.value = result.code
        codeSent.value = true
        countdown.value = 60
        clearInterval(countdownTimer)
        countdownTimer = setInterval(() => {
          countdown.value--
          if (countdown.value <= 0) {
            clearInterval(countdownTimer)
            codeSent.value = false
          }
        }, 1000)
      } catch (error) {
        feedback.error(error.message)
      }
    }

    // Bind Phone
    const bindPhone = () => {
      const result = auth.bindPhone(phoneNumber.value, verificationCode.value)
      if (!result.success) { feedback.error(result.message); return }
      showPhoneModal.value = false
      clearInterval(countdownTimer)
      codeSent.value = false
      demoCode.value = ''
      phoneNumber.value = ''
      verificationCode.value = ''
      feedback.success('手机号绑定成功！')
    }

    // Change Password
    const changePassword = () => {
      if (newPassword.value !== confirmPassword.value) {
        feedback.error('两次输入的密码不一致')
        return
      }
      
      const result = auth.changePassword(oldPassword.value, newPassword.value)
      if (!result.success) { feedback.error(result.message); return }
      
      // Clear form
      oldPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
      showPasswordModal.value = false
      
      feedback.success(result.message)
      router.replace('/login')
    }

    // Load saved data on mount
    const closeSettingsOutside = (e) => {
        const settingsDropdown = document.querySelector('.settings-dropdown')
        if (settingsDropdown && !settingsDropdown.contains(e.target)) {
          showSettings.value = false
        }
    }
    onMounted(() => document.addEventListener('click', closeSettingsOutside))
    onUnmounted(() => {
      isUnmounted = true
      document.removeEventListener('click', closeSettingsOutside)
      clearInterval(countdownTimer)
    })

    // 支持从酒店预订成功「去查看订单」等深链：?otype=<all|hotels|attractions|travel> 预选订单页签并滚动到订单区
    // 注：测试环境可能无路由注入，做兼容守卫，避免访问 undefined.currentRoute
    watch(() => (router && router.currentRoute ? router.currentRoute.value.query : {}), async (query) => {
      if (!router) return
      const otype = (query && (query.otype || (query.tab === 'orders' ? 'hotels' : null)))
      if (otype && ['all', 'hotels', 'attractions', 'travel'].includes(otype)) {
        activeTab.value = otype === 'hotels' ? 'hotels' : otype
        await nextTick()
        document.getElementById('profile-orders')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, { immediate: true })

    return {
      travel,
      userProfile,
      editingNickname,
      tempNickname,
      orders,
      pendingOrderCount,
      advanceOrder,
      isPersistedOrder,
      activeTab,
      currentPage,
      totalAttractionOrders,
      totalHotelOrders,
      totalTravelOrders,
      favoriteCount,
      favoriteHotels,
      goToHotels,
      bookFavorite,
      toggleFavorite,
      filteredOrders,
      totalPages,
      orderTypeIcon,
      orderTypeLabel,
      switchOrderTab,
      handleAvatarUpload,
      saveNickname,
      startNicknameEdit,
      cancelEditNickname,
      getStatusText,
      payOrder,
      viewOrderDetail,
      reviewOrder,
      cancelOrder,
      prevPage,
      nextPage,
      goHome,
      goToAttractions,
      showSettings,
      toggleSettings,
      openNicknameEdit,
      openPhoneBind,
      openPasswordChange,
      openAbout,
      openPrivacy,
      switchAccount,
      showNicknameModal,
      showPhoneModal,
      showPasswordModal,
      showAboutModal,
      showPrivacyModal,
      showOrderDetailModal,
      showReviewModal,
      selectedOrder,
      reviewRating,
      reviewComment,
      reviewError,
      viewOrderDetail,
      reviewOrder,
      openReviewModal,
      closeReviewModal,
      submitReview,
      formatDateTime,
      dismissAlert,
      clearAllAlerts,
      saveNicknameFromModal,
      phoneNumber,
      verificationCode,
      codeSent,
      demoCode,
      countdown,
      sendVerificationCode,
      bindPhone,
      oldPassword,
      newPassword,
      confirmPassword,
      changePassword
    }
  }
}
</script>

<style scoped>
.profile-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.profile-header {
  position: relative;
  margin-bottom: 20px;
  text-align: left;
}

.header-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 60px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%);
  border-radius: 15px;
  z-index: 0;
}

.header-content {
  position: relative;
  z-index: 1;
  padding: 15px 20px;
  color: white;
}

.header-content h1 {
  font-size: 1.3rem;
  margin-bottom: 4px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.header-content p {
  font-size: 0.75rem;
  opacity: 0.9;
}

/* Profile Card */
.profile-card {
  background: white;
  border-radius: 20px;
  padding: 40px;
  margin-bottom: 30px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.avatar-section {
  text-align: center;
  margin-bottom: 30px;
}

.avatar-container {
  position: relative;
  display: inline-block;
  margin-bottom: 20px;
}

.user-avatar {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  object-fit: cover;
  border: 5px solid #667eea;
  transition: all 0.3s ease;
}

.avatar-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
  cursor: pointer;
}

.avatar-container:hover .avatar-overlay {
  opacity: 1;
}

.upload-btn {
  color: white;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.upload-btn .svg-inline--fa {
  font-size: 24px;
}

.nickname-section {
  margin-bottom: 15px;
}

.nickname-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.nickname-display h2 {
  margin: 0;
  color: #333;
  font-size: 1.8rem;
}

.edit-btn {
  background: transparent;
  border: none;
  color: #667eea;
  cursor: pointer;
  font-size: 1.2rem;
  transition: color 0.3s ease;
}

.edit-btn:hover {
  color: #764ba2;
}

.nickname-edit {
  display: flex;
  gap: 10px;
  justify-content: center;
  align-items: center;
}

.nickname-edit input {
  padding: 8px 15px;
  border: 2px solid #667eea;
  border-radius: 10px;
  font-size: 1rem;
  min-width: 200px;
}

.save-btn, .cancel-btn {
  padding: 8px 15px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.save-btn {
  background: #667eea;
  color: white;
}

.save-btn:hover {
  background: #764ba2;
}

.cancel-btn {
  background: #e0e0e0;
  color: #666;
}

.cancel-btn:hover {
  background: #d0d0d0;
}

.user-meta {
  display: flex;
  justify-content: center;
  gap: 20px;
  color: #666;
  font-size: 0.9rem;
}

/* Stats Section */
.stats-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 30px;
  padding-top: 30px;
  border-top: 2px solid #f0f0f0;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 15px;
  color: white;
}

.stat-item .svg-inline--fa {
  font-size: 2.5rem;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
}

.stat-label {
  font-size: 0.9rem;
  opacity: 0.9;
}

/* Orders Section */
.orders-section {
  background: white;
  border-radius: 20px;
  padding: 30px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  margin-bottom: 30px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  flex-wrap: wrap;
  gap: 20px;
}

.section-header h2 {
  color: #333;
  font-size: 1.8rem;
  margin: 0;
}

.order-tabs {
  display: flex;
  gap: 10px;
}

.tab-btn {
  padding: 10px 20px;
  border: 2px solid #667eea;
  background: transparent;
  color: #667eea;
  border-radius: 25px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 500;
}

.tab-btn.active,
.tab-btn:hover {
  background: #667eea;
  color: white;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-state .svg-inline--fa {
  font-size: 4rem;
  margin-bottom: 20px;
  color: #ddd;
}

.empty-state h3 {
  color: #666;
  margin-bottom: 10px;
}

.empty-state p {
  margin-bottom: 20px;
}

.btn-primary {
  padding: 12px 30px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  transition: transform 0.3s ease;
}

.btn-primary:hover {
  transform: translateY(-2px);
}

/* Orders List */
.orders-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.order-card {
  border: 2px solid #f0f0f0;
  border-radius: 15px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.order-card:hover {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background: #f8f9fa;
  border-bottom: 2px solid #f0f0f0;
}

.order-type-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  border-radius: 20px;
  font-weight: 500;
  font-size: 0.9rem;
}

.order-type-badge.attraction {
  background: #e3f2fd;
  color: #1976d2;
}

.order-type-badge.hotel {
  background: #fce4ec;
  color: #c2185b;
}

.order-status {
  padding: 6px 15px;
  border-radius: 15px;
  font-weight: 500;
  font-size: 0.85rem;
}

.order-status.pending {
  background: #fff3e0;
  color: #f57c00;
}

.order-status.paid {
  background: #e8f5e9;
  color: #388e3c;
}

.order-status.confirmed {
  background: #e1f5fe;
  color: #0288d1;
}

.order-status.completed {
  background: #f3e5f5;
  color: #7b1fa2;
}

.order-status.cancelled {
  background: #ffebee;
  color: #d32f2f;
}

.order-content {
  display: grid;
  grid-template-columns: 150px 1fr auto;
  gap: 20px;
  padding: 20px;
  align-items: center;
}

.order-image img {
  width: 150px;
  height: 100px;
  object-fit: cover;
  border-radius: 10px;
}

.order-info h3 {
  color: #333;
  margin-bottom: 10px;
  font-size: 1.2rem;
}

.order-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #666;
  font-size: 0.9rem;
}

.detail-item .svg-inline--fa {
  color: #667eea;
  width: 16px;
}

.order-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 15px;
}

.order-price {
  text-align: right;
}

.price-label {
  display: block;
  color: #666;
  font-size: 0.85rem;
  margin-bottom: 5px;
}

.price-value {
  display: block;
  color: #667eea;
  font-size: 1.5rem;
  font-weight: bold;
}

.action-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.action-buttons button {
  padding: 8px 20px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.btn-pay {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-pay:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

.btn-detail,
.btn-review,
.btn-advance {
  background: #e3f2fd;
  color: #1976d2;
}

.btn-detail:hover,
.btn-review:hover,
.btn-advance:hover {
  background: #bbdefb;
}

.btn-cancel {
  background: #ffebee;
  color: #d32f2f;
}

.btn-cancel:hover {
  background: #ffcdd2;
}

/* Pagination */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 2px solid #f0f0f0;
}

.page-btn {
  padding: 10px 20px;
  background: white;
  border: 2px solid #667eea;
  color: #667eea;
  border-radius: 25px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
}

.page-btn:hover:not(:disabled) {
  background: #667eea;
  color: white;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  color: #666;
  font-weight: 500;
}

/* Top Right Actions - 置于全局顶栏下方，避免与顶栏用户区重叠 */
.top-right-actions {
  position: fixed !important;
  top: 74px !important;
  right: 20px !important;
  display: flex;
  gap: 10px;
  z-index: 9999;
}

.btn-home,
.btn-settings {
  padding: 12px 20px;
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.btn-home:hover,
.btn-settings:hover {
  background: #667eea;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

/* Settings Dropdown */
.settings-dropdown {
  position: relative;
}

.settings-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 10px;
  background: white;
  border-radius: 15px;
  box-shadow: 0 5px 25px rgba(0, 0, 0, 0.15);
  min-width: 200px;
  overflow: hidden;
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

.menu-item {
  width: 100%;
  padding: 12px 20px;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #333;
  font-size: 0.95rem;
  transition: all 0.2s ease;
  border-bottom: 1px solid #f0f0f0;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background: #f8f9fa;
  color: #667eea;
}

.menu-item.switch-account {
  color: #d32f2f;
}

.menu-item.switch-account:hover {
  background: #ffebee;
  color: #c62828;
}

.menu-item .svg-inline--fa {
  width: 20px;
  text-align: center;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-content {
  background: white;
  border-radius: 20px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  animation: scaleUp 0.3s ease;
}

@keyframes scaleUp {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 25px;
  border-bottom: 2px solid #f0f0f0;
}

.modal-header h3 {
  margin: 0;
  color: #333;
  font-size: 1.3rem;
}

.close-modal {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  color: #999;
  cursor: pointer;
  transition: color 0.3s ease;
}

.close-modal:hover {
  color: #333;
}

.modal-body {
  padding: 25px;
}

.modal-input {
  width: 100%;
  padding: 12px 15px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 1rem;
  margin-bottom: 15px;
  transition: border-color 0.3s ease;
}

.modal-input:focus {
  outline: none;
  border-color: #667eea;
}

.verification-code {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.verification-code .modal-input {
  flex: 1;
}

.btn-code {
  padding: 12px 20px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.3s ease;
}

.btn-code:hover:not(:disabled) {
  background: #764ba2;
}

.btn-code:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px 25px;
  border-top: 2px solid #f0f0f0;
}

.btn-secondary,
.modal-footer .btn-primary {
  padding: 10px 25px;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.btn-secondary {
  background: #e0e0e0;
  color: #666;
}

.btn-secondary:hover {
  background: #d0d0d0;
}

.modal-footer .btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.modal-footer .btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

/* Order Detail / Review Styles */
.order-detail-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}

.order-detail-row .detail-label {
  color: #999;
  flex-shrink: 0;
}

.order-detail-row .detail-value {
  color: #333;
  text-align: right;
  word-break: break-word;
}

.order-detail-row .detail-price {
  color: #667eea;
  font-weight: bold;
  font-size: 1.2rem;
}

.order-detail-row .policy-flexible {
  color: #2e9b5a;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.order-detail-row .policy-strict {
  color: #d32f2f;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.order-detail-row.review-row .detail-value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.review-stars {
  color: #f5a623;
  letter-spacing: 2px;
}

.review-stars .review-empty {
  color: #e0e0e0;
}

.review-text {
  color: #555;
  max-width: 300px;
  word-break: break-word;
}

.review-time {
  color: #bbb;
  font-size: 0.8rem;
}

.order-detail-note {
  margin-top: 16px;
  color: #999;
  font-size: 0.85rem;
  text-align: center;
}

.review-subject {
  color: #333;
  font-weight: 500;
  margin-bottom: 16px;
  text-align: center;
}

.rating-picker {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 18px;
}

.star-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 1.8rem;
  color: #d0d0d0;
  padding: 0;
  transition: color 0.2s ease, transform 0.2s ease;
}

.star-btn.active {
  color: #f5a623;
}

.star-btn:hover {
  transform: scale(1.15);
}

.review-textarea {
  width: 100%;
  padding: 12px 15px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 1rem;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

.review-textarea:focus {
  outline: none;
  border-color: #667eea;
}

.review-count {
  color: #bbb;
  font-size: 0.8rem;
  text-align: right;
  margin-top: 6px;
}

.error-message {
  color: #d32f2f;
  font-size: 0.9rem;
  margin-top: 8px;
}

/* Price Alerts Section */
.alerts-header {
  align-items: center;
}

.alerts-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: #f57c00;
  color: white;
  font-size: 0.8rem;
  vertical-align: middle;
  margin-left: 6px;
}

.btn-clear-alerts {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #ffebee;
  color: #d32f2f;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.btn-clear-alerts:hover {
  background: #ffcdd2;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.alert-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  background: #fff8e1;
  border: 1px solid #ffe0b2;
  border-radius: 10px;
}

.alert-content {
  flex: 1;
  overflow: hidden;
}

.alert-message {
  color: #555;
  line-height: 1.5;
  word-break: break-word;
}

.alert-time {
  color: #bbb;
  font-size: 0.8rem;
  margin-top: 6px;
}

.btn-dismiss-alert {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.btn-dismiss-alert:hover {
  background: #ffcdd2;
  color: #d32f2f;
}

/* About Content */
.about-content {
  text-align: center;
}

.about-content h4 {
  color: #667eea;
  font-size: 1.5rem;
  margin-bottom: 10px;
}

.about-content p {
  color: #666;
  line-height: 1.8;
  margin-bottom: 10px;
}

.about-content .contact {
  color: #667eea;
  font-weight: 500;
}

.about-content .copyright {
  color: #999;
  font-size: 0.9rem;
  margin-top: 20px;
}

/* Privacy Content */
.privacy-body {
  max-height: 400px;
  overflow-y: auto;
}

.privacy-content h4 {
  color: #667eea;
  margin-top: 15px;
  margin-bottom: 8px;
}

.privacy-content p {
  color: #666;
  line-height: 1.6;
  margin-bottom: 10px;
}

/* ===== 我的酒店收藏 ===== */
.favorites-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.favorites-header h2 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.favorites-header h2 .fa-heart {
  color: #ff6b6b;
}

.favorites-count {
  background: #ff6b6b;
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.btn-find-hotel {
  margin-left: auto;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 25px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.btn-find-hotel:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
}

.fav-hotel-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.fav-hotel-card {
  display: flex;
  background: white;
  border: 1px solid #eef0f6;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
}

.fav-hotel-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.12);
}

.fav-hotel-image {
  width: 130px;
  height: 130px;
  object-fit: cover;
  flex-shrink: 0;
}

.fav-hotel-info {
  padding: 14px 15px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.fav-hotel-info h3 {
  margin: 0 0 8px 0;
  font-size: 1.05rem;
  color: #2b2d42;
  line-height: 1.35;
}

.fav-hotel-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.fav-rating {
  color: #f5a623;
  font-weight: 700;
  font-size: 0.9rem;
}

.fav-stars .fa-star {
  color: #e4e7ef;
  font-size: 0.8rem;
}

.fav-stars .fa-star.filled {
  color: #f5a623;
}

.fav-location {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #999;
  font-size: 0.82rem;
}

.fav-hotel-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.fav-price {
  font-size: 1.35rem;
  font-weight: 800;
  color: #667eea;
}

.fav-price em {
  font-style: normal;
  font-size: 0.8rem;
  font-weight: 400;
  color: #999;
}

.fav-orig {
  font-size: 0.8rem;
  color: #bbb;
  text-decoration: line-through;
  margin-left: 4px;
  font-weight: 400;
}

.fav-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-book {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  transition: all 0.3s ease;
}

.btn-book:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.btn-unfav {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1.5px solid #ffd0d3;
  background: #fff4f5;
  color: #ff6b6b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.btn-unfav:hover {
  background: #ff6b6b;
  color: white;
  border-color: #ff6b6b;
}

/* Responsive Design */
@media (max-width: 768px) {
  .order-content {
    grid-template-columns: 1fr;
  }

  .order-image img {
    width: 100%;
    height: 200px;
  }

  .order-actions {
    align-items: stretch;
  }

  .action-buttons {
    flex-direction: column;
  }

  .action-buttons button {
    width: 100%;
  }

  .fav-hotel-list {
    grid-template-columns: 1fr;
  }

  .fav-hotel-card {
    flex-direction: column;
  }

  .fav-hotel-image {
    width: 100%;
    height: 180px;
  }

  .stats-section {
    grid-template-columns: 1fr;
  }
}
</style>
