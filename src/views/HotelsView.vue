<template>
  <div class="hotel-booking">
    <p v-if="travel.storageError" role="alert">{{ travel.storageError }}</p>
    <!-- 顶部背景和搜索栏 -->
    <div class="hero-section">
      <app-image class="hero-background" src="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200" fallback="/images/home-backdrop.svg" alt="" loading="eager" fetchpriority="high" width="1200" height="400" />
      <div class="hero-overlay">
        <h1 class="hero-title">发现完美住宿体验</h1>
        <p class="hero-subtitle">从豪华度假村到精品酒店，找到您的理想下榻之处</p>
      </div>
    </div>

    <!-- 智能搜索栏 -->
    <div class="smart-search-container">
      <div class="search-card">
        <div class="search-tabs">
          <button 
            v-for="tab in searchTabs" 
            :key="tab" 
            :class="['tab-btn', { active: activeTab === tab }]"
            @click="activeTab = tab"
          >
            {{ tab }}
          </button>
        </div>

        <div class="search-content">
          <!-- 目的地搜索 -->
          <div v-if="activeTab === '目的地'" class="search-group">
            <div class="search-input with-icon">
              <font-awesome-icon class="fas fa-map-marker-alt"></font-awesome-icon>
              <input 
                type="text" 
                v-model="searchParam.location" 
                placeholder="城市、景点或酒店名称"
                @focus="showLocationSuggestions = true"
              >
              <div v-if="showLocationSuggestions" class="suggestions-dropdown">
                <div 
                  v-for="suggestion in locationSuggestions" 
                  :key="suggestion"
                  class="suggestion-item"
                  @click="selectLocation(suggestion)"
                >
                  <font-awesome-icon class="fas fa-map-marker-alt"></font-awesome-icon>
                  {{ suggestion }}
                </div>
              </div>
            </div>
          </div>

          <!-- 日期选择 -->
          <div v-if="activeTab === '日期'" class="search-group">
            <div class="date-picker-group">
              <div class="search-input with-icon">
                <font-awesome-icon class="fas fa-calendar-check"></font-awesome-icon>
                <input 
                  type="date" 
                  v-model="searchParam.checkIn" 
                  placeholder="入住日期"
                >
              </div>
              <div class="date-separator">-</div>
              <div class="search-input with-icon">
                <font-awesome-icon class="fas fa-calendar-times"></font-awesome-icon>
                <input 
                  type="date" 
                  v-model="searchParam.checkOut" 
                  placeholder="离店日期"
                >
              </div>
            </div>
          </div>

          <!-- 价格筛选 -->
          <div v-if="activeTab === '价格'" class="search-group">
            <div class="price-range">
              <div class="price-inputs">
                <input 
                  type="number" 
                  v-model="searchParam.priceMin" 
                  placeholder="最低价"
                  class="price-input"
                >
                <span class="price-separator">至</span>
                <input 
                  type="number" 
                  v-model="searchParam.priceMax" 
                  placeholder="最高价"
                  class="price-input"
                >
              </div>
              <div class="price-slider">
                <input 
                  type="range" 
                  v-model="searchParam.priceMax" 
                  :min="0" 
                  :max="2000" 
                  class="slider"
                >
                <div class="slider-labels">
                  <span>0</span>
                  <span>2000</span>
                </div>
              </div>
            </div>
          </div>

          <button class="search-btn" @click="searchHotels">
            <font-awesome-icon class="fas fa-search"></font-awesome-icon>
            搜索酒店
          </button>
        </div>

        <!-- 高级筛选 -->
        <div class="advanced-filters">
          <button 
            class="filter-toggle" 
            @click="showAdvancedFilters = !showAdvancedFilters"
          >
            <font-awesome-icon class="fas fa-filter"></font-awesome-icon>
            高级筛选
            <font-awesome-icon :class="['fas', showAdvancedFilters ? 'fa-chevron-up' : 'fa-chevron-down']"></font-awesome-icon>
          </button>

          <div v-if="showAdvancedFilters" class="filter-content">
            <div class="filter-section">
              <h4>酒店星级</h4>
              <div class="star-rating-filter">
                <label 
                  v-for="star in [5,4,3,2,1]" 
                  :key="star"
                  :class="['star-option', { active: searchParam.starLevel === star.toString() }]"
                  @click="searchParam.starLevel = searchParam.starLevel === star.toString() ? '' : star.toString()"
                >
                  <font-awesome-icon class="fas fa-star"></font-awesome-icon>
                  {{ star }}星
                </label>
              </div>
            </div>

            <div class="filter-section">
              <h4>设施服务</h4>
              <div class="facility-grid">
                <label 
                  v-for="facility in facilityList" 
                  :key="facility"
                  :class="['facility-option', { active: searchParam.facilities.includes(facility) }]"
                  @click="toggleFacility(facility)"
                >
                  <font-awesome-icon :class="facilityIcons[facility]"></font-awesome-icon>
                  {{ facility }}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 酒店列表 -->
    <div class="hotel-list-container">
      <div class="list-header">
        <h2>推荐酒店</h2>
        <div class="header-actions">
          <button class="btn-deals" @click="showDealsModal = true">
            <font-awesome-icon class="fas fa-tag"></font-awesome-icon>
            价格优惠
            <span v-if="hotelDeals.length > 0" class="deals-count">{{ hotelDeals.length }}</span>
          </button>
          <div class="sort-options">
            <select v-model="sortBy" @change="sortHotels">
              <option value="recommended">推荐排序</option>
              <option value="price-asc">价格从低到高</option>
              <option value="price-desc">价格从高到低</option>
              <option value="rating-desc">评分从高到低</option>
            </select>
          </div>
        </div>
      </div>

      <div v-if="hotelList.length === 0" class="empty-state">
        <font-awesome-icon class="fas fa-hotel"></font-awesome-icon>
        <h3>暂无符合条件的酒店</h3>
        <p>尝试调整搜索条件或筛选条件</p>
      </div>

      <div class="hotel-grid">
        <div 
          class="hotel-card" 
          v-for="hotel in paginatedHotels"
          :key="hotel.id"
          @mouseenter="hotel.hover = true"
          @mouseleave="hotel.hover = false"
        >
          <div class="card-image">
            <app-image :src="hotel.images[0]" :alt="hotel.name"  />
            <div class="image-overlay" :class="{ show: hotel.hover }">
              <button class="quick-view-btn" @click="showHotelDetails(hotel)">
                <font-awesome-icon class="fas fa-eye"></font-awesome-icon>
                快速预览
              </button>
            </div>
            <div class="card-badges">
              <span class="badge rating-badge">
                <font-awesome-icon class="fas fa-star"></font-awesome-icon>
                {{ hotel.rating }}
              </span>
              <span v-if="hotel.discount" class="badge discount-badge">
                -{{ hotel.discount }}%
              </span>
            </div>
          </div>

          <div class="card-content">
            <div class="card-header">
              <h3 class="hotel-name">{{ hotel.name }}</h3>
              <button 
                class="favorite-btn" 
                :class="{ active: isFavorite(hotel) }" 
                @click="toggleFavorite(hotel)"
              >
                <font-awesome-icon class="fas fa-heart"></font-awesome-icon>
              </button>
            </div>

            <div class="hotel-meta">
              <span class="star-rating">
                <font-awesome-icon
                  v-for="i in 5" 
                  :key="i" 
                  :class="['fas', i <= hotel.starLevel ? 'fa-star' : 'fa-star-o']"
                ></font-awesome-icon>
              </span>
              <span class="location">
                <font-awesome-icon class="fas fa-map-marker-alt"></font-awesome-icon>
                {{ hotel.location }}
              </span>
            </div>

            <p class="hotel-desc">{{ hotel.desc }}</p>

            <div class="facility-tags">
              <span 
                v-for="facility in hotel.facilities.slice(0, 3)" 
                :key="facility"
                class="facility-tag"
              >
                <font-awesome-icon :class="facilityIcons[facility]"></font-awesome-icon>
                {{ facility }}
              </span>
              <span v-if="hotel.facilities.length > 3" class="more-facilities">
                +{{ hotel.facilities.length - 3 }}更多
              </span>
            </div>

            <div class="card-footer">
              <div class="price-info">
                <div class="current-price">
                  ¥{{ hotel.price }}
                  <span class="price-unit">/晚</span>
                </div>
                <div v-if="hotel.originalPrice" class="original-price">
                  ¥{{ hotel.originalPrice }}
                </div>
              </div>
              <div class="footer-actions">
                <button 
                  class="price-alert-btn" 
                  @click.stop="subscribeHotelPrice(hotel)"
                  :class="{ subscribed: isHotelPriceSubscribed(hotel.id) }"
                  :title="isHotelPriceSubscribed(hotel.id) ? '已订阅' : '订阅价格提醒'"
                >
                  <font-awesome-icon class="fas fa-bell"></font-awesome-icon>
                </button>
                <button class="book-now-btn" @click="bookHotel(hotel)">
                  立即预订
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页控件 -->
      <div v-if="hotelList.length > 0" class="pagination">
        <button 
          :disabled="currentPage === 1" 
          @click="currentPage--"
          class="page-btn"
        >
          <font-awesome-icon class="fas fa-chevron-left"></font-awesome-icon>
        </button>
        
        <button 
          v-for="page in visiblePages" 
          :key="page"
          :class="['page-btn', { active: currentPage === page }]"
          @click="currentPage = page"
        >
          {{ page }}
        </button>

        <button 
          :disabled="currentPage === totalPages" 
          @click="currentPage++"
          class="page-btn"
        >
          <font-awesome-icon class="fas fa-chevron-right"></font-awesome-icon>
        </button>
      </div>
    </div>

    <!-- 酒店详情模态框 -->
    <div v-if="isModalOpen && selectedHotel" class="modal-overlay" @click="closeModal">
      <div class="hotel-modal" @click.stop>
        <button class="close-modal" @click="closeModal">
          <font-awesome-icon class="fas fa-times"></font-awesome-icon>
        </button>
        
        <div class="modal-content">
          <div class="modal-header">
            <app-image :src="selectedHotel.images[0]" :alt="selectedHotel.name" class="modal-image" />
            <div class="modal-header-content">
              <h2>{{ selectedHotel.name }}</h2>
              <div class="modal-meta">
                <div class="star-rating">
                  <font-awesome-icon v-for="star in 5" :key="star"
                     class="fas fa-star" 
                     :class="{ 'filled': star <= selectedHotel.starLevel }"></font-awesome-icon>
                </div>
                <span class="rating-score">{{ selectedHotel.rating }}</span>
                <span class="reviews-count">({{ selectedHotel.reviews || 0 }} 条评价)</span>
              </div>
              <div class="modal-location">
                <font-awesome-icon class="fas fa-map-marker-alt"></font-awesome-icon>
                {{ selectedHotel.location }}
              </div>
            </div>
          </div>
          
          <div class="modal-body">
            <div class="modal-section">
              <h3>酒店描述</h3>
              <p>{{ selectedHotel.desc }}</p>
            </div>
            
            <div class="modal-section">
              <h3>设施服务</h3>
              <div class="facilities-grid">
                <div v-for="facility in selectedHotel.facilities" :key="facility" class="facility-item">
                  <font-awesome-icon class="fas fa-check"></font-awesome-icon>
                  {{ facility }}
                </div>
              </div>
            </div>
            
            <div class="modal-section">
              <h3>价格信息</h3>
              <div class="price-details">
                <div class="current-price">
                  ¥{{ selectedHotel.price }} <span class="price-unit">/晚</span>
                </div>
                <div v-if="selectedHotel.originalPrice" class="original-price">
                  原价: ¥{{ selectedHotel.originalPrice }}
                </div>
                <div v-if="selectedHotel.discount" class="discount-badge">
                  立省 {{ selectedHotel.discount }}%
                </div>
              </div>
            </div>
          </div>
          
          <div class="modal-footer">
            <button class="book-now-btn" @click="bookHotel(selectedHotel)">
              <font-awesome-icon class="fas fa-calendar-check"></font-awesome-icon>
              立即预订
            </button>
            <button class="favorite-btn" :class="{ active: isFavorite(selectedHotel) }"
                    @click="toggleFavorite(selectedHotel)">
              <font-awesome-icon class="fas fa-heart"></font-awesome-icon>
              {{ isFavorite(selectedHotel) ? '已收藏' : '收藏' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 特色推荐区域 -->
    <div class="featured-section">
      <div class="section-header">
        <h2>特色推荐</h2>
        <p>发现这些备受好评的住宿选择</p>
      </div>
      
      <div class="featured-grid">
        <div class="featured-card" v-for="featured in featuredHotels" :key="featured.id">
          <app-image :src="featured.image" :alt="featured.title"  />
          <div class="featured-content">
            <h3>{{ featured.title }}</h3>
            <p>{{ featured.description }}</p>
            <button class="explore-btn">探索更多</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 用户评价组件 -->
    <div class="reviews-section">
      <div class="section-header">
        <h2>用户评价</h2>
        <p>听听其他旅客怎么说</p>
      </div>

      <div class="reviews-carousel">
        <div 
          class="review-card" 
          v-for="review in featuredReviews" 
          :key="review.id"
        >
          <div class="review-header">
            <app-image :src="review.user.avatar" class="reviewer-avatar" alt="用户头像" kind="avatar" />
            <div class="reviewer-info">
              <h4>{{ review.user.name }}</h4>
              <span class="review-date">{{ review.createTime }}</span>
            </div>
          </div>
          
          <div class="rating-stars">
            <font-awesome-icon
              v-for="i in 5" 
              :key="i" 
              :class="['fas', i <= review.rating ? 'fa-star' : 'fa-star-o']"
            ></font-awesome-icon>
          </div>
          
          <p class="review-text">"{{ review.text }}"</p>
          
          <div class="review-hotel">
            <font-awesome-icon class="fas fa-hotel"></font-awesome-icon>
            {{ review.hotel }}
          </div>
        </div>
      </div>

      <div class="add-review-section">
        <h3>分享您的体验</h3>
        <form @submit.prevent="addReview" class="review-form">
          <div class="form-group">
            <label>您的评分</label>
            <div class="rating-input">
              <font-awesome-icon
                v-for="i in 5" 
                :key="i" 
                :class="['fas', i <= newReview.rating ? 'fa-star' : 'fa-star-o']"
                @click="newReview.rating = i"
              ></font-awesome-icon>
            </div>
          </div>
          
          <div class="form-group">
            <label>评价内容</label>
            <textarea 
              v-model="newReview.text" 
              placeholder="分享您的住宿体验..."
              rows="4"
            ></textarea>
          </div>
          
          <button type="submit" class="submit-review-btn">
            提交评价
          </button>
        </form>
      </div>
    </div>

    <!-- 酒店价格优惠模态框 -->
    <div v-if="showDealsModal" class="modal-overlay" @click="showDealsModal = false">
      <div class="deals-modal" @click.stop>
        <button class="close-modal" @click="showDealsModal = false">
          <font-awesome-icon class="fas fa-times"></font-awesome-icon>
        </button>
        
        <h2>酒店优惠信息</h2>
        
        <div class="deals-content">
          <div v-if="hotelDeals.length === 0" class="empty-state">
            <font-awesome-icon class="fas fa-tag"></font-awesome-icon>
            <p>暂无酒店优惠</p>
          </div>
          <div v-else class="deals-grid">
            <div v-for="deal in hotelDeals" :key="deal.id" class="deal-card">
              <app-image :src="deal.image" :alt="deal.title"  />
              <div class="deal-info">
                <h3>{{ deal.title }}</h3>
                <p class="deal-location">
                  <font-awesome-icon class="fas fa-map-marker-alt"></font-awesome-icon>
                  {{ deal.location }}
                </p>
                <p class="deal-desc">{{ deal.description }}</p>
                <div class="deal-price">
                  <span class="current-price">¥{{ deal.currentPrice }}</span>
                  <span class="original-price">¥{{ deal.originalPrice }}</span>
                  <span class="discount">-{{ deal.discount }}%</span>
                </div>
                <p class="deal-valid">
                  <font-awesome-icon class="fas fa-clock"></font-awesome-icon>
                  有效期至: {{ deal.validUntil }}
                </p>
              </div>
            </div>
          </div>
          
          <div v-if="hotelPriceSubscriptions.length > 0" class="subscriptions-section">
            <h3>我的价格订阅</h3>
            <div class="subscriptions-list">
              <div v-for="sub in hotelPriceSubscriptions" :key="sub.id" class="subscription-item">
                <div>
                  <h4>{{ sub.itemName }}</h4>
                  <p>目标价格: ¥{{ sub.targetPrice }}</p>
                </div>
                <button class="btn-cancel" @click="unsubscribeHotelPrice(sub.id)">
                  <font-awesome-icon class="fas fa-trash"></font-awesome-icon>
                  取消订阅
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部行动号召 -->
    <div class="cta-section">
      <div class="cta-content">
        <h2>准备好开始您的旅程了吗？</h2>
        <p>立即预订，享受独家优惠和优质服务</p>
        <button class="cta-btn" @click="scrollToSearch">
          开始搜索
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { useFeedback } from '../composables/useFeedback.js'
import AppImage from '../ui/AppImage.js'
import { FontAwesomeIcon } from '../ui/fontAwesome.js'
import { ref, computed, onMounted } from 'vue';
import alertsService from '../services/alertsService'
import { addCalendarDays, localDateString } from '../utils/date.js'
import { storeToRefs } from 'pinia'
import { useTravelStore } from '../stores/travel.js'

export default {
  components: { AppImage, FontAwesomeIcon },
  setup() {
    const feedback = useFeedback()
    const travel = useTravelStore()
    const { hotelFavorites: favoriteHotels } = storeToRefs(travel)
    // 模拟酒店数据
    const mockHotelData = [
      {
        id: 1,
        name: "北京王府井希尔顿酒店",
        location: "北京市东城区王府井大街",
        image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800",
        images: ["https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800"],
        starLevel: 5,
        rating: 4.8,
        price: 680,
        originalPrice: 880,
        discount: 23,
        facilities: ["免费wifi", "停车场", "健身房", "游泳池", "餐厅"],
        description: "位于王府井核心地段，步行可达天安门广场，豪华舒适的商务酒店。",
        desc: "位于王府井核心地段，步行可达天安门广场，豪华舒适的商务酒店。",
        reviews: 1256
      },
      {
        id: 2,
        name: "上海外滩万达瑞华酒店",
        location: "上海市黄浦区中山东一路",
        image: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800",
        images: ["https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800"],
        starLevel: 5,
        rating: 4.9,
        price: 1280,
        originalPrice: 1580,
        discount: 19,
        facilities: ["免费wifi", "停车场", "健身房", "游泳池", "SPA", "餐厅", "酒吧"],
        description: "坐落于外滩黄金地段，尽享浦江两岸美景，奢华典雅的五星级酒店。",
        desc: "坐落于外滩黄金地段，尽享浦江两岸美景，奢华典雅的五星级酒店。",
        reviews: 2134
      },
      {
        id: 3,
        name: "杭州西湖国宾馆",
        location: "浙江省杭州市西湖区",
        image: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800",
        images: ["https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800"],
        starLevel: 5,
        rating: 4.7,
        price: 980,
        originalPrice: 1280,
        discount: 23,
        facilities: ["免费wifi", "停车场", "餐厅", "会议室"],
        description: "坐落于西湖湖畔，环境优美，中式园林设计，彰显江南韵味。",
        desc: "坐落于西湖湖畔，环境优美，中式园林设计，彰显江南韵味。",
        reviews: 987
      },
      {
        id: 4,
        name: "深圳前海华侨城JW万豪酒店",
        location: "广东省深圳市南山区",
        image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800",
        images: ["https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800"],
        starLevel: 5,
        rating: 4.6,
        price: 880,
        originalPrice: 1180,
        discount: 25,
        facilities: ["免费wifi", "停车场", "健身房", "游泳池", "商务中心"],
        description: "毗邻前海自贸区，现代化设施完善，商务出行首选。",
        desc: "毗邻前海自贸区，现代化设施完善，商务出行首选。",
        reviews: 1543
      },
      {
        id: 5,
        name: "成都宽窄巷子酒店",
        location: "四川省成都市青羊区",
        image: "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800",
        images: ["https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800"],
        starLevel: 4,
        rating: 4.5,
        price: 480,
        originalPrice: 680,
        discount: 29,
        facilities: ["免费wifi", "停车场", "餐厅"],
        description: "位于宽窄巷子旁，地理位置优越，体验成都慢生活。",
        desc: "位于宽窄巷子旁，地理位置优越，体验成都慢生活。",
        reviews: 765
      },
      {
        id: 6,
        name: "三亚亚龙湾希尔顿度假酒店",
        location: "海南省三亚市吉阳区",
        image: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800",
        images: ["https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800"],
        starLevel: 5,
        rating: 4.8,
        price: 1580,
        originalPrice: 2080,
        discount: 24,
        facilities: ["免费wifi", "停车场", "健身房", "游泳池", "SPA", "餐厅", "酒吧"],
        description: "坐拥亚龙湾私家海滩，热带风情浓郁，度假天堂。",
        desc: "坐拥亚龙湾私家海滩，热带风情浓郁，度假天堂。",
        reviews: 1876
      },
      {
        id: 7,
        name: "西安大雁塔假日酒店",
        location: "陕西省西安市雁塔区",
        image: "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800",
        images: ["https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800"],
        starLevel: 4,
        rating: 4.4,
        price: 420,
        originalPrice: 580,
        discount: 28,
        facilities: ["免费wifi", "停车场", "健身房", "餐厅"],
        description: "毗邻大雁塔景区，交通便利，性价比之选。",
        desc: "毗邻大雁塔景区，交通便利，性价比之选。",
        reviews: 654
      },
      {
        id: 8,
        name: "重庆解放碑洪崖洞酒店",
        location: "重庆市渝中区",
        image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
        images: ["https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800"],
        starLevel: 4,
        rating: 4.6,
        price: 520,
        originalPrice: 720,
        discount: 28,
        facilities: ["免费wifi", "停车场", "餐厅"],
        description: "地处解放碑商圈，步行至洪崖洞，尽享山城夜景。",
        desc: "地处解放碑商圈，步行至洪崖洞，尽享山城夜景。",
        reviews: 892
      }
    ]

    const mockReviewData = [
      {
        id: 1,
        user: { name: "张先生", avatar: '/default-avatar.svg' },
        hotel: "北京王府井希尔顿酒店",
        rating: 5,
        text: "酒店位置极佳，服务一流，房间干净整洁，下次还会入住！",
        date: "2024-01-10"
      },
      {
        id: 2,
        user: { name: "李女士", avatar: '/default-avatar.svg' },
        hotel: "上海外滩万达瑞华酒店",
        rating: 5,
        text: "外滩夜景美不胜收，酒店设施豪华，早餐丰富，强烈推荐！",
        date: "2024-01-08"
      },
      {
        id: 3,
        user: { name: "王先生", avatar: '/default-avatar.svg' },
        hotel: "杭州西湖国宾馆",
        rating: 4,
        text: "西湖景色优美，酒店环境雅致，但价格稍高。",
        date: "2024-01-05"
      }
    ]

    const featuredHotelsData = [
      {
        id: 1,
        title: "商务出差",
        description: "精选商务酒店，配套设施完善",
        image: "https://img95.699pic.com/photo/50162/8402.jpg_wh300.jpg"
      },
      {
        id: 2,
        title: "度假休闲",
        description: "海滨度假村，享受悠闲时光",
        image: "https://img95.699pic.com/photo/50110/5849.jpg_wh300.jpg"
      },
      {
        id: 3,
        title: "亲子出游",
        description: "家庭套房，儿童设施齐全",
        image: "https://img95.699pic.com/photo/50133/5227.jpg_wh300.jpg"
      }
    ]

    // 搜索参数
    const searchParam = ref({
      location: "",
      checkIn: "",
      checkOut: "",
      priceMin: "",
      priceMax: "",
      starLevel: "",
      facilities: []
    });

    // 搜索标签
    const searchTabs = ref(["目的地", "日期", "价格"]);
    const activeTab = ref("目的地");
    
    // 显示位置建议
    const showLocationSuggestions = ref(false);
    const locationSuggestions = ref(["北京", "上海", "广州", "深圳", "杭州", "三亚", "成都", "重庆"]);
    
    // 高级筛选
    const showAdvancedFilters = ref(false);
    
    // 酒店列表
    const hotelList = ref([...mockHotelData]);
    
    // 收藏的酒店
    
    // 排序选项
    const sortBy = ref("recommended");
    
    // 分页
    const currentPage = ref(1);
    const itemsPerPage = 8;
    
    // 评价相关
    const reviewList = ref(mockReviewData);
    const newReview = ref({ text: "", rating: 3 });
    
    // 模态框
    const selectedHotel = ref(null);
    const isModalOpen = ref(false);
    
    // 设施列表和图标映射
    const facilityList = ref(["免费wifi", "停车场", "健身房", "游泳池", "SPA", "会议室", "餐厅", "酒吧", "商务中心"]);
    
    const facilityIcons = {
      "免费wifi": "fas fa-wifi",
      "停车场": "fas fa-parking",
      "健身房": "fas fa-dumbbell",
      "游泳池": "fas fa-swimming-pool",
      "SPA": "fas fa-spa",
      "会议室": "fas fa-users",
      "餐厅": "fas fa-utensils",
      "酒吧": "fas fa-glass-martini-alt",
      "商务中心": "fas fa-briefcase"
    };
    
    // 特色推荐
    const featuredHotels = ref(featuredHotelsData);
    
    // 精选评价
    const featuredReviews = computed(() => reviewList.value.slice(0, 3));
    
    // 总页数
    const totalPages = computed(() => Math.ceil(hotelList.value.length / itemsPerPage));

    // 筛选结果先排序，再截取当前页，搜索后保留用户选择的排序方式。
    const sortedHotels = computed(() => {
      const hotels = [...hotelList.value];
      switch (sortBy.value) {
        case 'price-asc': return hotels.sort((a, b) => a.price - b.price);
        case 'price-desc': return hotels.sort((a, b) => b.price - a.price);
        default: return hotels.sort((a, b) => b.rating - a.rating);
      }
    });
    const paginatedHotels = computed(() => {
      const start = (currentPage.value - 1) * itemsPerPage;
      return sortedHotels.value.slice(start, start + itemsPerPage);
    });
    
    // 可见页码
    const visiblePages = computed(() => {
      const pages = [];
      const start = Math.max(1, currentPage.value - 2);
      const end = Math.min(totalPages.value, start + 4);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      return pages;
    });
    
    // 选择位置
    const selectLocation = (location) => {
      searchParam.value.location = location;
      showLocationSuggestions.value = false;
    };
    
    // 切换设施
    const toggleFacility = (facility) => {
      const index = searchParam.value.facilities.indexOf(facility);
      if (index === -1) {
        searchParam.value.facilities.push(facility);
      } else {
        searchParam.value.facilities.splice(index, 1);
      }
    };
    
    // 搜索酒店
    const searchHotels = () => {
      let filteredHotels = [...mockHotelData];

      // 位置筛选
      if (searchParam.value.location) {
        filteredHotels = filteredHotels.filter(hotel => 
          hotel.location.includes(searchParam.value.location) ||
          hotel.name.includes(searchParam.value.location)
        );
      }

      // 价格筛选
      if (searchParam.value.priceMin || searchParam.value.priceMax) {
        const min = parseInt(searchParam.value.priceMin) || 0;
        const max = parseInt(searchParam.value.priceMax) || Infinity;
        filteredHotels = filteredHotels.filter(hotel => hotel.price >= min && hotel.price <= max);
      }

      // 星级筛选
      if (searchParam.value.starLevel) {
        filteredHotels = filteredHotels.filter(hotel => hotel.starLevel == searchParam.value.starLevel);
      }

      // 设施筛选
      if (searchParam.value.facilities.length > 0) {
        filteredHotels = filteredHotels.filter(hotel => {
          return searchParam.value.facilities.every(facility => hotel.facilities.includes(facility));
        });
      }

      hotelList.value = filteredHotels;
      currentPage.value = 1;
    };
    
    // 排序酒店
    const sortHotels = () => {
      currentPage.value = 1;
    };
    
    // 显示酒店详情
    const showHotelDetails = (hotel) => {
      selectedHotel.value = hotel;
      isModalOpen.value = true;
    };
    


    // 关闭模态框
    const closeModal = () => {
      selectedHotel.value = null;
      isModalOpen.value = false;
    };
    
    // 预订酒店
    const bookHotel = (hotel) => {
      console.log("预订酒店:", hotel);
      // 实际可添加预订逻辑，如调用支付接口等
      feedback.info('酒店预订尚未接入，当前不会创建订单或扣款。');
    };
    
    // 检查是否收藏
    const isFavorite = (hotel) => {
      return favoriteHotels.value.includes(String(typeof hotel === 'object' ? hotel.id : hotel));
    };
    
    // 切换收藏状态
    const toggleFavorite = (hotel) => {
      try { travel.toggleFavorite('hotels', typeof hotel === 'object' ? hotel.id : hotel) } catch (error) { feedback.error(error.message) }
    };
    
    // 添加评价
    const addReview = () => {
      if (!newReview.value.text.trim()) {
        feedback.error("请填写评价内容");
        return;
      }
      
      const newReviewObj = {
        id: Date.now(),
        user: { 
          name: "匿名用户", 
          avatar: "/default-avatar.svg"
        },
        text: newReview.value.text,
        rating: newReview.value.rating,
        createTime: new Date().toLocaleDateString(),
        hotel: "当前酒店"
      };
      
      reviewList.value.unshift(newReviewObj);
      newReview.value.text = "";
      newReview.value.rating = 3;
      
      feedback.success("评价已添加到本页演示，刷新后不保留。");
    };
    
    // 滚动到搜索区域
    const scrollToSearch = () => {
      const searchElement = document.querySelector('.smart-search-container');
      if (searchElement) {
        searchElement.scrollIntoView({ behavior: 'smooth' });
      }
    };
    
    // 初始化日期
    onMounted(() => {
      const today = localDateString();
      searchParam.value.checkIn = today;
      searchParam.value.checkOut = addCalendarDays(today, 1);
    });
    
    // 新增：价格监控功能
    const showDealsModal = ref(false)
    const hotelPriceSubscriptions = computed(() => travel.subscriptions.filter(sub => sub.type === 'hotel'))
    const hotelDeals = computed(() => alertsService.filterDeals({ type: 'hotel' }))
    
    // 订阅酒店价格
    const subscribeHotelPrice = (hotel) => {
      try {
      travel.subscribe({
        itemId: hotel.id,
        itemName: hotel.name,
        type: 'hotel',
        targetPrice: Math.round(hotel.price * 85) / 100,
        currentPrice: hotel.price,
        location: hotel.location
      })
      
      feedback.success(`已保存 ${hotel.name} 的价格提醒订阅（本地演示）`)
      } catch (error) { feedback.error(error.message) }
    }
    
    // 检查是否已订阅
    const isHotelPriceSubscribed = (hotelId) => {
      return hotelPriceSubscriptions.value.some(sub => String(sub.itemId) === String(hotelId) && sub.active)
    }
    
    // 取消订阅
    const unsubscribeHotelPrice = async (subscriptionId) => {
      const ownerId = travel.ownerId
      if (await feedback.confirm('确定要取消此价格提醒吗？', { confirmLabel: '取消订阅' }) && ownerId === travel.ownerId) {
        try { travel.unsubscribe(subscriptionId); feedback.success('已取消订阅') } catch (error) { feedback.error(error.message) }
      }
    }
    
    return {
      travel,
      searchParam,
      searchTabs,
      activeTab,
      showLocationSuggestions,
      locationSuggestions,
      showAdvancedFilters,
      hotelList,
      paginatedHotels,
      favoriteHotels,
      sortBy,
      currentPage,
      reviewList,
      newReview,
      selectedHotel,
      isModalOpen,
      facilityList,
      facilityIcons,
      featuredHotels,
      featuredReviews,
      totalPages,
      visiblePages,
      selectLocation,
      toggleFacility,
      searchHotels,
      sortHotels,
      showHotelDetails,
      closeModal,
      bookHotel,
      isFavorite,
      toggleFavorite,
      addReview,
      scrollToSearch,
      showDealsModal,
      hotelPriceSubscriptions,
      hotelDeals,
      subscribeHotelPrice,
      isHotelPriceSubscribed,
      unsubscribeHotelPrice,
    };
  }
};
</script>

<style scoped>
/* 基础样式重置 */
.hotel-booking {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* 英雄区域 */
.hero-section {
  position: relative;
  isolation: isolate;
  height: 400px;
  background: #243857 url('/images/home-backdrop.svg') center/cover;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  text-align: center;
}

.hero-background {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.6);
  z-index: -1;
}

.hero-overlay {
  max-width: 800px;
  padding: 0 20px;
}

.hero-title {
  font-size: 3.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.hero-subtitle {
  font-size: 1.5rem;
  opacity: 0.9;
  margin-bottom: 2rem;
}

/* 智能搜索容器 */
.smart-search-container {
  max-width: 1200px;
  margin: -80px auto 0;
  padding: 0 20px;
  position: relative;
  z-index: 10;
}

.search-card {
  background: white;
  border-radius: 20px;
  padding: 30px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
}

/* 搜索标签 */
.search-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  border-bottom: 2px solid #f1f3f4;
}

.tab-btn {
  padding: 12px 24px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  color: #666;
  border-radius: 8px 8px 0 0;
  transition: all 0.3s ease;
}

.tab-btn.active {
  color: #007bff;
  background: #f8f9fa;
  border-bottom: 3px solid #007bff;
}

.tab-btn:hover {
  color: #007bff;
  background: #f8f9fa;
}

/* 搜索内容 */
.search-content {
  display: flex;
  gap: 20px;
  align-items: end;
  margin-bottom: 30px;
}

.search-group {
  flex: 1;
}

.search-input {
  position: relative;
}

.search-input.with-icon {
  position: relative;
}

.search-input.with-icon .svg-inline--fa {
  position: absolute;
  left: 15px;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
}

.search-input input {
  width: 100%;
  padding: 15px 15px 15px 45px;
  border: 2px solid #e9ecef;
  border-radius: 12px;
  font-size: 16px;
  transition: all 0.3s ease;
}

.search-input input:focus {
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  outline: none;
}

/* 日期选择器组 */
.date-picker-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.date-separator {
  color: #666;
  font-weight: 600;
}

/* 价格范围 */
.price-range {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.price-inputs {
  display: flex;
  align-items: center;
  gap: 10px;
}

.price-input {
  flex: 1;
  padding: 12px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  text-align: center;
}

.price-separator {
  color: #666;
  font-weight: 600;
}

.price-slider {
  padding: 0 10px;
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #ddd;
  outline: none;
  transition: all 0.3s ease;
}

.slider:hover {
  background: #ccc;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  color: #666;
  font-size: 12px;
}

/* 搜索按钮 */
.search-btn {
  padding: 15px 30px;
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 123, 255, 0.3);
}

/* 高级筛选 */
.advanced-filters {
  border-top: 2px solid #f1f3f4;
  padding-top: 20px;
}

.filter-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  color: #007bff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.filter-content {
  margin-top: 20px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 12px;
}

.filter-section {
  margin-bottom: 20px;
}

.filter-section h4 {
  margin-bottom: 12px;
  color: #333;
  font-weight: 600;
}

.star-rating-filter {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.star-option {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 16px;
  border: 2px solid #e9ecef;
  border-radius: 25px;
  cursor: pointer;
  transition: all 0.3s ease;
  background: white;
}

.star-option.active {
  border-color: #007bff;
  background: #007bff;
  color: white;
}

.star-option:hover {
  border-color: #007bff;
}

.facility-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.facility-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 15px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  background: white;
}

.facility-option.active {
  border-color: #28a745;
  background: #28a745;
  color: white;
}

.facility-option:hover {
  border-color: #28a745;
}

/* 酒店列表容器 */
.hotel-list-container {
  max-width: 1200px;
  margin: 60px auto;
  padding: 0 20px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.list-header h2 {
  font-size: 2.5rem;
  color: white;
  font-weight: 700;
}

.sort-options select {
  padding: 12px 20px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  background: white;
  font-size: 14px;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: white;
}

.empty-state .svg-inline--fa {
  font-size: 4rem;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-state h3 {
  font-size: 1.8rem;
  margin-bottom: 10px;
}

.empty-state p {
  font-size: 1.1rem;
  opacity: 0.8;
}

/* 酒店网格 */
.hotel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 30px;
  margin-bottom: 40px;
}

.hotel-card {
  background: white;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
}

.hotel-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

.card-image {
  position: relative;
  height: 250px;
  overflow: hidden;
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.hotel-card:hover .card-image img {
  transform: scale(1.05);
}

.image-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.image-overlay.show {
  opacity: 1;
}

.quick-view-btn {
  padding: 12px 24px;
  background: white;
  color: #333;
  border: none;
  border-radius: 25px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
}

.quick-view-btn:hover {
  background: #007bff;
  color: white;
}

.card-badges {
  position: absolute;
  top: 15px;
  right: 15px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.badge {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.rating-badge {
  background: #ffc107;
}

.discount-badge {
  background: #dc3545;
}

.card-content {
  padding: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 15px;
}

.hotel-name {
  font-size: 1.4rem;
  font-weight: 700;
  color: #333;
  margin: 0;
  line-height: 1.3;
}

.favorite-btn {
  background: none;
  border: none;
  color: #ccc;
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 5px;
}

.favorite-btn.active {
  color: #ff6b6b;
}

.favorite-btn:hover {
  transform: scale(1.2);
}

.hotel-meta {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 12px;
}

.star-rating {
  color: #ffc107;
}

.location {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #666;
  font-size: 14px;
}

.hotel-desc {
  color: #666;
  line-height: 1.6;
  margin-bottom: 15px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.facility-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.facility-tag {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: #f8f9fa;
  border-radius: 15px;
  font-size: 12px;
  color: #666;
}

.more-facilities {
  padding: 6px 12px;
  background: #e9ecef;
  border-radius: 15px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.price-info {
  text-align: left;
}

.current-price {
  font-size: 1.8rem;
  font-weight: 700;
  color: #28a745;
}

.price-unit {
  font-size: 1rem;
  color: #666;
  font-weight: 400;
}

.original-price {
  font-size: 1rem;
  color: #999;
  text-decoration: line-through;
}

.book-now-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #28a745, #20c997);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.book-now-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(40, 167, 69, 0.3);
}

/* 分页 */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 40px;
}

.page-btn {
  padding: 10px 16px;
  border: 2px solid #e9ecef;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 500;
}

.page-btn:hover:not(:disabled) {
  border-color: #007bff;
  color: #007bff;
}

.page-btn.active {
  background: #007bff;
  border-color: #007bff;
  color: white;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.hotel-modal {
  background: white;
  border-radius: 20px;
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  position: relative;
}

.close-modal {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.1);
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: all 0.3s ease;
}

.close-modal:hover {
  background: rgba(0, 0, 0, 0.2);
}

/* 特色推荐区域 */
.featured-section {
  background: white;
  padding: 80px 0;
  margin: 80px 0;
}

.section-header {
  text-align: center;
  margin-bottom: 50px;
}

.section-header h2 {
  font-size: 2.5rem;
  color: #333;
  margin-bottom: 15px;
}

.section-header p {
  font-size: 1.2rem;
  color: #666;
}

.featured-grid {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 30px;
}

.featured-card {
  background: #f8f9fa;
  border-radius: 15px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.featured-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
}

.featured-card img {
  width: 100%;
  height: 200px;
  object-fit: cover;
}

.featured-content {
  padding: 20px;
  text-align: center;
}

.featured-content h3 {
  font-size: 1.4rem;
  color: #333;
  margin-bottom: 10px;
}

.featured-content p {
  color: #666;
  margin-bottom: 15px;
}

.explore-btn {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.explore-btn:hover {
  background: #0056b3;
}

/* 评价区域 */
.reviews-section {
  background: #f8f9fa;
  padding: 80px 0;
}

.reviews-carousel {
  max-width: 1200px;
  margin: 0 auto 50px;
  padding: 0 20px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 30px;
}

.review-card {
  background: white;
  padding: 30px;
  border-radius: 15px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.review-header {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 15px;
}

.reviewer-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
}

.reviewer-info h4 {
  margin: 0 0 5px 0;
  color: #333;
}

.review-date {
  color: #999;
  font-size: 14px;
}

.rating-stars {
  color: #ffc107;
  margin-bottom: 15px;
}

.review-text {
  color: #666;
  line-height: 1.6;
  margin-bottom: 15px;
  font-style: italic;
}

.review-hotel {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #007bff;
  font-weight: 500;
}

.add-review-section {
  max-width: 600px;
  margin: 0 auto;
  padding: 0 20px;
}

.add-review-section h3 {
  text-align: center;
  margin-bottom: 30px;
  color: #333;
}

.review-form {
  background: white;
  padding: 30px;
  border-radius: 15px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 500;
}

.rating-input {
  display: flex;
  gap: 10px;
}

.rating-input .svg-inline--fa {
  font-size: 1.5rem;
  color: #ccc;
  cursor: pointer;
  transition: all 0.3s ease;
}

.rating-input .svg-inline--fa:hover {
  color: #ffc107;
}

.rating-input .svg-inline--fa.fa-star {
  color: #ffc107;
}

.review-form textarea {
  width: 100%;
  padding: 15px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  resize: vertical;
  font-family: inherit;
}

.review-form textarea:focus {
  border-color: #007bff;
  outline: none;
}

.submit-review-btn {
  width: 100%;
  padding: 15px;
  background: linear-gradient(135deg, #28a745, #20c997);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.submit-review-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(40, 167, 69, 0.3);
}

/* CTA区域 */
.cta-section {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
  padding: 80px 20px;
}

.cta-content h2 {
  font-size: 2.5rem;
  margin-bottom: 20px;
}

.cta-content p {
  font-size: 1.2rem;
  margin-bottom: 30px;
  opacity: 0.9;
}

.cta-btn {
  padding: 15px 40px;
  background: white;
  color: #007bff;
  border: none;
  border-radius: 25px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.cta-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 30px rgba(255, 255, 255, 0.2);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .hero-title {
    font-size: 2.5rem;
  }
  
  .hero-subtitle {
    font-size: 1.2rem;
  }
  
  .search-content {
    flex-direction: column;
  }
  
  .hotel-grid {
    grid-template-columns: 1fr;
  }
  
  .list-header {
    flex-direction: column;
    gap: 15px;
    text-align: center;
  }
  
  .card-footer {
    flex-direction: column;
    gap: 15px;
  }
  
  .price-inputs {
    flex-direction: column;
  }
  
  .date-picker-group {
    flex-direction: column;
  }
  
  .date-separator {
    display: none;
  }
}

/* 动画效果 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hotel-card {
  animation: fadeInUp 0.6s ease-out;
}

.review-card {
  animation: fadeInUp 0.6s ease-out;
}

.featured-card {
  animation: fadeInUp 0.6s ease-out;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 焦点样式 */
button:focus,
input:focus,
select:focus,
textarea:focus {
  outline: 2px solid #007bff;
  outline-offset: 2px;
}

/* 加载动画 */
.loading {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 工具提示 */
.tooltip {
  position: relative;
  display: inline-block;
}

.tooltip .tooltiptext {
  visibility: hidden;
  background-color: #333;
  color: white;
  text-align: center;
  border-radius: 6px;
  padding: 5px 10px;
  position: absolute;
  z-index: 1;
  bottom: 125%;
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  transition: opacity 0.3s;
  font-size: 12px;
  white-space: nowrap;
}

.tooltip:hover .tooltiptext {
  visibility: visible;
  opacity: 1;
}

/* 价格优惠样式 */
.header-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}

.btn-deals {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
  font-weight: 600;
}

.btn-deals:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
}

.deals-count {
  background: white;
  color: #f5576c;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
}

.footer-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.price-alert-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid #e0e0e0;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.price-alert-btn:hover {
  border-color: #f5576c;
  background: #fff5f7;
}

.price-alert-btn.subscribed {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  border-color: #f5576c;
}

.deals-modal {
  background: white;
  border-radius: 20px;
  max-width: 900px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  padding: 30px;
}

.deals-modal h2 {
  margin-bottom: 25px;
  color: #2b2d42;
}

.deals-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.deal-card {
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s;
}

.deal-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}

.deal-card img {
  width: 100%;
  height: 180px;
  object-fit: cover;
}

.deal-info {
  padding: 15px;
}

.deal-info h3 {
  margin: 0 0 10px 0;
  color: #2b2d42;
}

.deal-location, .deal-desc, .deal-valid {
  color: #666;
  font-size: 14px;
  margin: 5px 0;
  display: flex;
  align-items: center;
  gap: 5px;
}

.deal-price {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 15px 0;
}

.deal-price .current-price {
  font-size: 24px;
  font-weight: bold;
  color: #f5576c;
}

.deal-price .original-price {
  text-decoration: line-through;
  color: #999;
}

.deal-price .discount {
  background: #f5576c;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.subscriptions-section {
  margin-top: 30px;
  padding-top: 30px;
  border-top: 2px solid #f0f0f0;
}

.subscriptions-section h3 {
  margin-bottom: 15px;
  color: #2b2d42;
}

.subscriptions-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.subscription-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #f8f9fa;
}

.subscription-item h4 {
  margin: 0 0 5px 0;
  color: #2b2d42;
}

.subscription-item p {
  margin: 3px 0;
  color: #666;
  font-size: 14px;
}

.btn-cancel {
  background: #dc3545;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.3s;
}

.btn-cancel:hover {
  background: #c82333;
  transform: translateY(-2px);
}
</style>
