<template>
  <div class="attractions-container">
    <p v-if="travel.storageError" role="alert">{{ travel.storageError }}</p>
    <!-- 搜索和筛选区域 -->
    <div class="search-section">
      <div class="search-bar">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="搜索景点名称或地点..."
          @keyup.enter="searchAttractions"
        >
        <button @click="searchAttractions">
          <font-awesome-icon :icon="['fas', 'magnifying-glass']" />
        </button>
      </div>
      
      <div class="filters">
        <div class="filter-group">
          <label>地区：</label>
          <select v-model="selectedRegion">
            <option value="">全部</option>
            <option v-for="region in regions" :key="region" :value="region">{{ region }}</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label>类型：</label>
          <select v-model="selectedType">
            <option value="">全部</option>
            <option v-for="type in attractionTypes" :key="type" :value="type">{{ type }}</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label>价格：</label>
          <select v-model="priceRange">
            <option value="">全部</option>
            <option value="free">免费</option>
            <option value="0-100">100元以下</option>
            <option value="100-200">100-200元</option>
            <option value="200-300">200-300元</option>
            <option value="300+">300元以上</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label>排序：</label>
          <select v-model="sortOption">
            <option value="default">默认</option>
            <option value="rating-desc">评分最高</option>
            <option value="price-asc">价格最低</option>
            <option value="price-desc">价格最高</option>
            <option value="review-desc">评价最多</option>
          </select>
        </div>
        
        <div class="view-and-actions">
          <button 
            @click="viewMode = 'grid'" 
            :class="{ active: viewMode === 'grid' }"
            class="view-btn"
            title="网格视图"
          >
            <font-awesome-icon :icon="['fas', 'th']" />
            <span>网格</span>
          </button>
          <button 
            @click="viewMode = 'list'" 
            :class="{ active: viewMode === 'list' }"
            class="view-btn"
            title="列表视图"
          >
            <font-awesome-icon :icon="['fas', 'list']" />
            <span>列表</span>
          </button>
          <button 
            @click="viewMode = 'map'" 
            :class="{ active: viewMode === 'map' }"
            class="view-btn"
            title="地图视图"
          >
            <font-awesome-icon :icon="['fas', 'map']" />
            <span>地图</span>
          </button>
          <button 
            @click="showCompareModal = true" 
            class="btn-compare"
            :disabled="compareList.length < 2"
          >
            <font-awesome-icon :icon="['fas', 'balance-scale']" />
            <span>比较 ({{ compareList.length }})</span>
          </button>
          <button 
            @click="showRecommendations = !showRecommendations" 
            class="btn-recommend"
          >
            <font-awesome-icon :icon="['fas', 'lightbulb']" />
            <span>推荐</span>
          </button>
          <button 
            @click="showDealsModal = true" 
            class="btn-deals"
          >
            <font-awesome-icon :icon="['fas', 'circle-dollar-to-slot']" />
            <span>价格提醒</span>
            <span v-if="dealAlerts.length > 0" class="alert-badge">{{ dealAlerts.length }}</span>
          </button>
        </div>
      </div>
    </div>
    
    <!-- 空状态 -->
    <div v-if="filteredAttractions.length === 0" class="empty-state">
      <font-awesome-icon :icon="['fas', 'search']" />
      <h3>暂无匹配景点</h3>
      <p>请尝试调整搜索条件或筛选器</p>
      <button @click="clearFilters" class="btn-clear-filters">清除筛选</button>
    </div>
    
    <!-- 景点展示区域 -->
    <div v-else-if="viewMode === 'map'" class="map-container" :aria-busy="mapLoading">
      <p class="map-notice">区域示意位置，非景点精确坐标；展示全部筛选结果。</p>
      <div ref="mapContainer" class="map-content" aria-label="景点示意地图"></div>
      <div v-if="mapLoading || mapError" class="map-status" :role="mapError ? 'alert' : 'status'">
        <template v-if="mapLoading">
          <font-awesome-icon :icon="['fas', 'spinner']" class="spinning" />
          <p>正在加载地图...</p>
        </template>
        <template v-else>
          <h3>地图暂不可用</h3>
          <p>{{ mapError }}</p>
          <div class="map-actions">
            <button class="btn-clear-filters" @click="retryMap">重试加载</button>
            <button class="btn-clear-filters" @click="viewMode = 'list'">切换列表</button>
          </div>
        </template>
      </div>
    </div>
    
    <div v-else-if="viewMode === 'list'" class="attractions-list">
      <div 
        v-for="attraction in filteredAttractions" 
        :key="attraction.id" 
        class="attraction-list-item"
        @click="showAttractionDetail(attraction)"
      >
        <div class="list-image">
          <app-image :src="attraction.image" :alt="attraction.name" />
          <div class="rating-badge">
            <font-awesome-icon :icon="['fas', 'star']" />
            <span>{{ attraction.rating }}</span>
          </div>
          <div v-if="attraction.isHot" class="hot-badge">热门</div>
        </div>
        
        <div class="list-content">
          <h3>{{ attraction.name }}</h3>
          <div class="location">
            <font-awesome-icon :icon="['fas', 'location-dot']" />
            <span>{{ attraction.location }}</span>
          </div>
          
          <div class="tags">
            <span v-for="(tag, index) in attraction.tags" :key="index" class="tag">{{ tag }}</span>
          </div>
          
          <div class="description-preview">
            {{ attraction.description.substring(0, 100) }}...
          </div>
          
          <div class="price-section">
            <span class="price">¥{{ attraction.price }}</span>
            <span class="original-price" v-if="attraction.originalPrice">¥{{ attraction.originalPrice }}</span>
            <span class="discount" v-if="attraction.discount">{{ attraction.discount }}折</span>
          </div>
        </div>
        
        <div class="list-actions">
          <button class="btn-favorite" @click.stop="toggleFavorite(attraction.id)">
            <font-awesome-icon
              :icon="['fas', isFavorite(attraction.id) ? 'heart' : 'heart-circle-plus']" 
              :class="{ 'favorited': isFavorite(attraction.id) }" 
            />
          </button>
          <button class="btn-book" @click.stop="bookAttraction(attraction.id)">
            预订
          </button>
        </div>
      </div>
    </div>
    
    <div v-else class="attractions-grid">
      <div 
        v-for="attraction in filteredAttractions" 
        :key="attraction.id" 
        class="attraction-card"
        @click="showAttractionDetail(attraction)"
      >
        <div class="card-image">
          <app-image :src="attraction.image" :alt="attraction.name" />
          <div class="rating-badge">
            <font-awesome-icon :icon="['fas', 'star']" />
            <span>{{ attraction.rating }}</span>
          </div>
          <div v-if="attraction.isHot" class="hot-badge">热门</div>
        </div>
        
        <div class="card-content">
          <h3>{{ attraction.name }}</h3>
          <div class="location">
            <font-awesome-icon :icon="['fas', 'location-dot']" />
            <span>{{ attraction.location }}</span>
          </div>
          
          <div class="tags">
            <span v-for="(tag, index) in attraction.tags" :key="index" class="tag">{{ tag }}</span>
          </div>
          
          <div class="price-section">
            <span class="price">¥{{ attraction.price }}</span>
            <span class="original-price" v-if="attraction.originalPrice">¥{{ attraction.originalPrice }}</span>
            <span class="discount" v-if="attraction.discount">{{ attraction.discount }}折</span>
          </div>
          
          <div class="card-actions">
            <button 
              @click.stop="toggleCompare(attraction.id)" 
              class="btn-compare-small"
              :class="{ active: compareList.includes(attraction.id) }"
            >
              <font-awesome-icon :icon="['fas', 'balance-scale']" />
              {{ compareList.includes(attraction.id) ? '已选择' : '比较' }}
            </button>
            <button 
              @click.stop="subscribePriceAlert(attraction)" 
              class="btn-alert-small"
              :class="{ active: isPriceSubscribed(attraction.id) }"
            >
              <font-awesome-icon :icon="['fas', 'bell']" />
              {{ isPriceSubscribed(attraction.id) ? '已订阅' : '价格提醒' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 推荐区域 -->
    <div v-if="showRecommendations" class="recommendations-section">
      <h3>为您推荐</h3>
      <div class="recommendations-grid">
        <div 
          v-for="attraction in recommendations" 
          :key="attraction.id" 
          class="recommendation-card"
          @click="showAttractionDetail(attraction)"
        >
          <app-image :src="attraction.image" :alt="attraction.name" />
          <div class="recommendation-content">
            <h4>{{ attraction.name }}</h4>
            <p>{{ attraction.reason }}</p>
            <div class="recommendation-rating">
              <font-awesome-icon :icon="['fas', 'star']" />
              <span>{{ attraction.rating }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 分页控制 -->
    <div v-if="viewMode !== 'map' && totalPages > 1" class="pagination">
      <button 
        @click="prevPage" 
        :disabled="currentPage === 1"
      >
        上一页
      </button>
      <span>第 {{ currentPage }} 页 / 共 {{ totalPages }} 页</span>
      <button 
        @click="nextPage" 
        :disabled="currentPage === totalPages"
      >
        下一页
      </button>
    </div>
    
    <!-- 景点详情弹窗 -->
    <div v-if="selectedAttraction" class="modal-overlay" @click.self="closeModal" role="dialog" aria-modal="true" :aria-label="selectedAttraction ? selectedAttraction.name : '景点详情'">
      <div class="attraction-modal">
        <button class="close-btn" @click="closeModal">
          <font-awesome-icon :icon="['fas', 'xmark']" />
        </button>
        
        <div class="modal-content">
          <div class="modal-gallery">
            <app-image :src="selectedImage" :alt="selectedAttraction.name" />
            <div class="gallery-thumbnails">
              <app-image
                v-for="(img, index) in selectedAttraction.gallery" 
                :src="img" 
                :key="index"
                :alt="`${selectedAttraction.name}图片${index + 1}`"
                @click="selectedImage = img"
                       />
            </div>
          </div>
          
          <div class="modal-details">
            <h2>{{ selectedAttraction.name }}</h2>
            <div class="meta-info">
              <div class="rating">
                <font-awesome-icon :icon="['fas', 'star']" />
                <span>{{ selectedAttraction.rating }} ({{ selectedAttraction.reviewCount }}条评价)</span>
              </div>
              <div class="location">
                <font-awesome-icon :icon="['fas', 'location-dot']" />
                <span>{{ selectedAttraction.location }}</span>
              </div>
              <div class="opening-hours">
                <font-awesome-icon :icon="['fas', 'clock']" />
                <span>{{ selectedAttraction.openingHours }}</span>
              </div>
            </div>
            
            <div class="price-section">
              <span class="current-price">¥{{ selectedAttraction.price }}</span>
              <span class="original-price" v-if="selectedAttraction.originalPrice">¥{{ selectedAttraction.originalPrice }}</span>
              <span class="discount" v-if="selectedAttraction.discount">{{ selectedAttraction.discount }}折</span>
            </div>
            
            <div class="description">
              <h3>景点介绍</h3>
              <p>{{ selectedAttraction.description }}</p>
            </div>
            
            <div class="highlights">
              <h3>特色亮点</h3>
              <ul>
                <li v-for="(highlight, index) in selectedAttraction.highlights" :key="index">
                  <font-awesome-icon :icon="['fas', 'check']" />
                  {{ highlight }}
                </li>
              </ul>
            </div>
            
            <div class="reviews-section">
              <h3>用户评价</h3>
              <div class="reviews-summary">
                <div class="rating-overview">
                  <span class="rating-number">{{ selectedAttraction.rating }}</span>
                  <div class="rating-stars">
                    <font-awesome-icon
                      v-for="i in 5" 
                      :key="i" 
                      :icon="['fas', i <= Math.floor(selectedAttraction.rating) ? 'star' : 'star-half-stroke']"
                      class="star"
                    />
                  </div>
                  <span class="review-count">{{ selectedAttraction.reviewCount }}条评价</span>
                </div>
              </div>
              
              <div class="reviews-list">
                <div v-for="review in selectedAttraction.reviews" :key="review.id" class="review-item">
                  <div class="review-header">
                    <div class="reviewer-info">
                      <app-image :src="review.avatar" :alt="review.name" class="reviewer-avatar" kind="avatar" />
                      <div>
                        <div class="reviewer-name">{{ review.name }}</div>
                        <div class="review-date">{{ review.date }}</div>
                      </div>
                    </div>
                    <div class="review-rating">
                      <font-awesome-icon
                        v-for="i in 5" 
                        :key="i" 
                        :icon="['fas', i <= review.rating ? 'star' : 'star-half-stroke']"
                        class="star"
                      />
                    </div>
                  </div>
                  <div class="review-content">{{ review.content }}</div>
                  <div v-if="review.images" class="review-images">
                    <app-image
                      v-for="(img, index) in review.images" 
                      :key="index" 
                      :src="img" 
                      :alt="`评价图片${index + 1}`"
                      class="review-image"
                     />
                  </div>
                </div>
              </div>
            </div>
            
            <div class="actions">
              <button class="btn-favorite" @click="toggleFavorite(selectedAttraction.id)">
                <font-awesome-icon
                  :icon="['fas', isFavorite(selectedAttraction.id) ? 'heart' : 'heart-circle-plus']" 
                  :class="{ 'favorited': isFavorite(selectedAttraction.id) }" 
                />
                {{ isFavorite(selectedAttraction.id) ? '已收藏' : '收藏' }}
              </button>
              <button class="btn-share" @click="shareAttraction(selectedAttraction)">
                <font-awesome-icon :icon="['fas', 'share']" />
                分享
              </button>
              <button class="btn-book" @click="bookAttraction(selectedAttraction.id)">
                立即预订
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 比较模态框 -->
    <div v-if="showCompareModal" class="modal-overlay" @click.self="showCompareModal = false" role="dialog" aria-modal="true" aria-label="景点比较">
      <div class="compare-modal">
        <div class="compare-header">
          <h2>景点比较</h2>
          <button class="close-btn" @click="showCompareModal = false">
            <font-awesome-icon :icon="['fas', 'xmark']" />
          </button>
        </div>
        
        <div class="compare-content">
          <div class="compare-table">
            <div class="compare-row header">
              <div class="compare-cell">项目</div>
              <div 
                v-for="attraction in compareAttractions" 
                :key="attraction.id" 
                class="compare-cell attraction-header"
              >
                <app-image :src="attraction.image" :alt="attraction.name" />
                <h3>{{ attraction.name }}</h3>
                <button @click="removeFromCompare(attraction.id)" class="btn-remove">
                  <font-awesome-icon :icon="['fas', 'xmark']" />
                </button>
              </div>
            </div>
            
            <div class="compare-row">
              <div class="compare-cell">价格</div>
              <div v-for="attraction in compareAttractions" :key="attraction.id" class="compare-cell">
                <span class="price">¥{{ attraction.price }}</span>
                <span v-if="attraction.originalPrice" class="original-price">¥{{ attraction.originalPrice }}</span>
              </div>
            </div>
            
            <div class="compare-row">
              <div class="compare-cell">评分</div>
              <div v-for="attraction in compareAttractions" :key="attraction.id" class="compare-cell">
                <div class="rating">
                  <font-awesome-icon :icon="['fas', 'star']" />
                  <span>{{ attraction.rating }}</span>
                  <span class="review-count">({{ attraction.reviewCount }}条评价)</span>
                </div>
              </div>
            </div>
            
            <div class="compare-row">
              <div class="compare-cell">类型</div>
              <div v-for="attraction in compareAttractions" :key="attraction.id" class="compare-cell">
                {{ attraction.type }}
              </div>
            </div>
            
            <div class="compare-row">
              <div class="compare-cell">地区</div>
              <div v-for="attraction in compareAttractions" :key="attraction.id" class="compare-cell">
                {{ attraction.region }}
              </div>
            </div>
            
            <div class="compare-row">
              <div class="compare-cell">特色标签</div>
              <div v-for="attraction in compareAttractions" :key="attraction.id" class="compare-cell">
                <div class="tags">
                  <span v-for="tag in attraction.tags" :key="tag" class="tag">{{ tag }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 价格优惠模态框 -->
    <div v-if="showDealsModal" class="modal-overlay" @click.self="showDealsModal = false" role="dialog" aria-modal="true" aria-label="价格优惠与提醒">
      <div class="deals-modal">
        <div class="deals-header">
          <h2>价格优惠与提醒</h2>
          <button class="close-btn" @click="showDealsModal = false">
            <font-awesome-icon :icon="['fas', 'xmark']" />
          </button>
        </div>
        
        <div class="deals-tabs">
          <button 
            :class="['tab-btn', { active: activeDealsTab === 'hot' }]"
            @click="activeDealsTab = 'hot'"
          >
            <font-awesome-icon :icon="['fas', 'fire']" />
            热门优惠
          </button>
          <button 
            :class="['tab-btn', { active: activeDealsTab === 'subscriptions' }]"
            @click="activeDealsTab = 'subscriptions'"
          >
            <font-awesome-icon :icon="['fas', 'bell']" />
            我的订阅 ({{ priceSubscriptions.length }})
          </button>
        </div>

        <div class="deals-content">
          <div v-if="activeDealsTab === 'hot'" class="hot-deals">
            <div v-if="hotDeals.length === 0" class="empty-state">
              <font-awesome-icon :icon="['fas', 'tag']" />
              <p>暂无优惠信息</p>
            </div>
            <div v-else class="deals-grid">
              <div v-for="deal in hotDeals" :key="deal.id" class="deal-card">
                <app-image :src="deal.image" :alt="deal.title"  />
                <div class="deal-content">
                  <h3>{{ deal.title }}</h3>
                  <p class="deal-location">
                    <font-awesome-icon :icon="['fas', 'location-dot']" />
                    {{ deal.location }}
                  </p>
                  <p class="deal-desc">{{ deal.description }}</p>
                  <div class="deal-price">
                    <span class="current-price">¥{{ deal.currentPrice }}</span>
                    <span class="original-price">¥{{ deal.originalPrice }}</span>
                    <span class="discount-badge">-{{ deal.discount }}%</span>
                  </div>
                  <div class="deal-valid">
                    <font-awesome-icon :icon="['fas', 'clock']" />
                    有效期至: {{ deal.validUntil }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="activeDealsTab === 'subscriptions'" class="subscriptions">
            <div v-if="priceSubscriptions.length === 0" class="empty-state">
              <font-awesome-icon :icon="['fas', 'bell-slash']" />
              <p>您还没有订阅任何价格提醒</p>
              <button class="btn btn-primary" @click="showDealsModal = false">去订阅</button>
            </div>
            <div v-else class="subscriptions-list">
              <div class="subscriptions-toolbar">
                <span class="subscriptions-total">共 {{ priceSubscriptions.length }} 个订阅</span>
                <button class="btn-check-now" :disabled="checkingPrices" @click="checkNowPrices">
                  {{ checkingPrices ? '检查中…' : '立即检查' }}
                </button>
              </div>
              <div class="subscription-item" v-for="sub in priceSubscriptions" :key="sub.id">
                <div class="subscription-info">
                  <h4>{{ sub.itemName }}</h4>
                  <p>目标价格: ¥{{ sub.targetPrice }}</p>
                  <p>当前价格: ¥{{ sub.currentPrice || '-' }}</p>
                  <p class="sub-date">订阅时间: {{ sub.createdAt }}</p>
                  <p v-if="countAlertsFor(sub)" class="alert-hint">已触发 {{ countAlertsFor(sub) }} 次提醒</p>
                </div>
                <button class="btn btn-danger btn-sm" @click="unsubscribePriceAlert(sub.id)">
                  <font-awesome-icon :icon="['fas', 'trash']" />
                  取消订阅
                </button>
              </div>
              <div v-if="priceCheckResults.length" class="price-check-results">
                <h4>检查结果</h4>
                <ul>
                  <li v-for="(result, i) in priceCheckResults" :key="i">{{ result }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useFeedback } from '../composables/useFeedback.js'
import AppImage from '../ui/AppImage.js'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAttractionMap } from '../composables/useAttractionMap.js'
import alertsService from '../services/alertsService'
import { storeToRefs } from 'pinia'
import { useTravelStore } from '../stores/travel.js'
import { useAuthStore } from '../stores/auth.js'
import { localDateString } from '../utils/date.js'
import { FontAwesomeIcon } from '../ui/fontAwesome.js'

export default {
  components: { AppImage, FontAwesomeIcon },
  setup() {
    const feedback = useFeedback()
    const travel = useTravelStore()
    const auth = useAuthStore()
    const { attractionFavorites: favorites } = storeToRefs(travel)
    // 模拟景点数据
    const attractionsData = ref([
      {
        id: 1,
        name: '故宫博物院',
        location: '北京市东城区',
        region: '华北',
        type: '历史文化',
        image: '/images/web/attr-1.jpg',
        gallery: [
          '/images/web/attr-1.jpg',
          '/images/web/attr-1.jpg'
        ],
        rating: 4.8,
        reviewCount: 12456,
        price: 60,
        originalPrice: 80,
        discount: 7.5,
        tags: ['世界遗产', '5A景区', '必去景点'],
        openingHours: '08:30-17:00 (周一闭馆)',
        description: '故宫是中国明清两代的皇家宫殿，旧称紫禁城，位于北京中轴线的中心。北京故宫以三大殿为中心，占地面积72万平方米，建筑面积约15万平方米，有大小宫殿七十多座，房屋九千余间。',
        highlights: [
          '中国古代宫廷建筑之精华',
          '世界上现存规模最大、保存最完整的木质结构古建筑之一',
          '收藏有大量珍贵文物',
          '可欣赏皇家建筑群和珍贵文物'
        ],
        reviews: [
          {
            id: 1,
            name: '张先生',
            avatar: '/default-avatar.svg',
            rating: 5,
            date: '2024-01-15',
            content: '故宫真的太震撼了！建筑宏伟，文物精美，每一处都体现了古代工匠的智慧。建议早点去，避开人流高峰。',
            images: ['/images/web/attr-1.jpg']
          },
          {
            id: 2,
            name: '李女士',
            avatar: '/default-avatar.svg',
            rating: 4,
            date: '2024-01-10',
            content: '历史文化底蕴深厚，导游讲解很专业。就是人太多了，建议淡季来。',
            images: []
          }
        ],
        isHot: true
      },
      {
        id: 2,
        name: '九寨沟',
        location: '四川省阿坝州九寨沟县',
        region: '西南',
        type: '自然风光',
        image: '/images/web/attr-2.jpg',
        gallery: [
          '/images/web/attr-2.jpg',
          '/images/web/attr-2.jpg',
          '/images/web/attr-2.jpg'
        ],
        rating: 4.9,
        reviewCount: 8923,
        price: 220,
        originalPrice: 310,
        discount: 7.1,
        tags: ['世界自然遗产', '5A景区', '摄影圣地'],
        openingHours: '07:00-18:00',
        description: '九寨沟以"九寨归来不看水"而闻名，是一个以高山湖泊群、瀑布、彩林、雪峰、蓝冰和藏族风情并称"六绝"的景区。',
        highlights: [
          '拥有108个高山湖泊',
          '四季景色各异，秋季最为迷人',
          '世界级的地质奇观',
          '藏族文化体验'
        ],
        isHot: true
      },
      {
        id: 3,
        name: '上海迪士尼乐园',
        location: '上海市浦东新区',
        region: '华东',
        type: '主题公园',
        image: '/images/web/attr-3.webp',
        gallery: [
          '/images/web/attr-3.webp',
          '/images/web/attr-3.webp'
        ],
        rating: 4.6,
        reviewCount: 15678,
        price: 399,
        originalPrice: 499,
        discount: 8.0,
        tags: ['主题乐园', '亲子游', '娱乐'],
        openingHours: '08:00-22:00',
        description: '上海迪士尼乐园是中国内地首座迪士尼主题乐园，拥有六大主题园区，为游客带来原汁原味的迪士尼体验。',
        highlights: [
          '六大主题园区',
          '全球首创的"加勒比海盗"主题园区',
          '适合全年龄段的娱乐项目',
          '精彩的演出和巡游'
        ],
        isHot: false
      },
      {
        id: 4,
        name: '西湖',
        location: '浙江省杭州市',
        region: '华东',
        type: '自然风光',
        image: '/images/web/attr-4.webp',
        gallery: [
          '/images/web/attr-4.webp',
          '/images/web/attr-4.webp'
        ],
        rating: 4,
        reviewCount: 23456,
        price: 0,
        originalPrice: null,
        discount: null,
        tags: ['世界文化遗产', '免费景点', '江南风光'],
        openingHours: '全天开放',
        description: '西湖以其秀丽的湖光山色和众多的名胜古迹闻名中外，是中国著名的旅游胜地，也被誉为人间天堂。',
        highlights: [
          '免费开放的5A级景区',
          '十景闻名天下',
          '四季景色各异',
          '深厚的文化底蕴'
        ],
        isHot: true
      },
      {
        id: 5,
        name: '兵马俑',
        location: '陕西省西安市临潼区',
        region: '西北',
        type: '历史文化',
        image: '/images/web/attr-5.jpg',
        gallery: [
          '/images/web/attr-5.jpg',
          '/images/web/attr-5.jpg'
        ],
        rating: 4.8,
        reviewCount: 18765,
        price: 120,
        originalPrice: 150,
        discount: 8.0,
        tags: ['世界文化遗产', '5A景区', '历史古迹'],
        openingHours: '08:30-17:30',
        description: '兵马俑是古代墓葬雕塑的一个类别，被誉为"世界第八大奇迹"，是秦始皇陵的一部分。',
        highlights: [
          '世界第八大奇迹',
          '每个兵马俑都独一无二',
          '展现秦代军事文化',
          '考古发现的重要遗址'
        ],
        isHot: true
      },
      {
        id: 6,
        name: '张家界国家森林公园',
        location: '湖南省张家界市',
        region: '华中',
        type: '自然风光',
        image: '/images/web/attr-6.webp',
        gallery: [
          '/images/web/attr-6.webp',
          '/images/web/attr-6.webp'
        ],
        rating: 4.7,
        reviewCount: 12345,
        price: 228,
        originalPrice: 248,
        discount: 9.2,
        tags: ['世界自然遗产', '5A景区', '地质奇观'],
        openingHours: '07:00-18:00',
        description: '张家界以其独特的石英砂岩峰林地貌著称，是电影《阿凡达》的取景地，被誉为"中国山水画的原本"。',
        highlights: [
          '《阿凡达》取景地',
          '独特的石英砂岩峰林',
          '玻璃栈道体验',
          '天然氧吧'
        ],
        isHot: false
      },
      {
        id: 7,
        name: '泰山',
        location: '山东省泰安市',
        region: '华东',
        type: '自然风光',
        image: '/images/web/attr-7.jpg',
        gallery: [
          '/images/web/attr-7.jpg',
          '/images/web/attr-7.jpg'
        ],
        rating: 4.6,
        reviewCount: 9876,
        price: 115,
        originalPrice: 127,
        discount: 9.1,
        tags: ['世界自然与文化双重遗产', '5A景区', '登山'],
        openingHours: '06:00-17:00',
        description: '泰山是中国五岳之首，有"天下第一山"之称，是中华民族的象征，也是世界自然与文化双重遗产。',
        highlights: [
          '五岳之首',
          '日出观赏胜地',
          '深厚的文化内涵',
          '登山健身好去处'
        ],
        isHot: false
      },
      {
        id: 8,
        name: '广州长隆欢乐世界',
        location: '广东省广州市番禺区',
        region: '华南',
        type: '主题公园',
        image: '/images/web/attr-8.jpg',
        gallery: [
          '/images/web/attr-8.jpg',
          '/images/web/attr-8.jpg'
        ],
        rating: 4.5,
        reviewCount: 11234,
        price: 250,
        originalPrice: 280,
        discount: 8.9,
        tags: ['主题乐园', '刺激项目', '亲子游'],
        openingHours: '09:30-18:00',
        description: '长隆欢乐世界是一个大型主题游乐园，拥有多个世界级的游乐设施，适合各个年龄段的游客。',
        highlights: [
          '世界级过山车',
          '水上乐园',
          '动物世界',
          '精彩表演'
        ],
        isHot: false
      },
      {
        id: 9,
        name: '布达拉宫',
        location: '西藏自治区拉萨市',
        region: '西南',
        type: '历史文化',
        image: '/images/web/attr-9.jpg',
        gallery: [
          '/images/web/attr-9.jpg',
          '/images/web/attr-9.jpg'
        ],
        rating: 4.9,
        reviewCount: 8765,
        price: 200,
        originalPrice: 200,
        discount: null,
        tags: ['世界文化遗产', '5A景区', '宗教建筑'],
        openingHours: '09:00-16:00',
        description: '布达拉宫是西藏最庞大、最完整的古代宫堡建筑群，是藏传佛教的圣地，也是西藏的象征。',
        highlights: [
          '世界上海拔最高的古代宫堡',
          '藏传佛教圣地',
          '建筑艺术瑰宝',
          '西藏文化象征'
        ],
        isHot: true
      },
      {
        id: 10,
        name: '黄山',
        location: '安徽省黄山市',
        region: '华东',
        type: '自然风光',
        image: '/images/web/attr-10.jpg',
        gallery: [
          '/images/web/attr-10.jpg',
          '/images/web/attr-10.jpg'
        ],
        rating: 4.8,
        reviewCount: 15678,
        price: 190,
        originalPrice: 230,
        discount: 8.3,
        tags: ['世界自然与文化双重遗产', '5A景区', '奇松怪石'],
        openingHours: '06:00-17:30',
        description: '黄山以奇松、怪石、云海、温泉"四绝"著称，是中国最著名的山岳风景区之一。',
        highlights: [
          '奇松、怪石、云海、温泉四绝',
          '日出云海奇观',
          '摄影爱好者的天堂',
          '登山健身胜地'
        ],
        isHot: true
      },
      {
        id: 11,
        name: '颐和园',
        location: '北京市海淀区',
        region: '华北',
        type: '历史文化',
        image: '/images/web/attr-11.jpg',
        gallery: [
          '/images/web/attr-11.jpg',
          '/images/web/attr-11.jpg'
        ],
        rating: 4.7,
        reviewCount: 13456,
        price: 30,
        originalPrice: 30,
        discount: null,
        tags: ['世界文化遗产', '皇家园林', '5A景区'],
        openingHours: '06:30-18:00',
        description: '颐和园是中国现存规模最大、保存最完整的皇家园林，被誉为"皇家园林博物馆"。',
        highlights: [
          '中国古典园林之首',
          '昆明湖和万寿山',
          '长廊彩绘艺术',
          '皇家建筑群'
        ],
        isHot: false
      },
      {
        id: 12,
        name: '桂林漓江',
        location: '广西壮族自治区桂林市',
        region: '华南',
        type: '自然风光',
        image: '/images/web/attr-12.webp',
        gallery: [
          '/images/web/attr-12.webp',
          '/images/web/attr-12.webp'
        ],
        rating: 4.8,
        reviewCount: 18765,
        price: 210,
        originalPrice: 240,
        discount: 8.8,
        tags: ['世界自然遗产', '5A景区', '山水甲天下'],
        openingHours: '08:00-17:00',
        description: '桂林山水甲天下，漓江是桂林山水的精华，以山青、水秀、洞奇、石美而闻名。',
        highlights: [
          '桂林山水甲天下',
          '竹筏漂流体验',
          '喀斯特地貌奇观',
          '诗画般的风景'
        ],
        isHot: true
      }
    ])

    // 搜索和筛选相关
    const searchQuery = ref('')
    const selectedRegion = ref('')
    const selectedType = ref('')
    const priceRange = ref('')
    const sortOption = ref('default')
    const viewMode = ref('grid')
    const regions = ref(['华北', '华东', '华南', '华中', '西南', '西北', '东北'])
    const attractionTypes = ref(['自然风光', '历史文化', '主题公园', '休闲娱乐', '博物馆', '地标建筑'])
    
    // 分页相关
    const currentPage = ref(1)
    const itemsPerPage = 8
    
    // 弹窗相关
    const selectedAttraction = ref(null)
    const selectedImage = ref('')
    const compareList = ref([])
    const showCompareModal = ref(false)
    const showRecommendations = ref(false)
    
    // 计算属性
    const filteredAttractions = computed(() => {
      let result = [...attractionsData.value]
      
      // 搜索过滤
      if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        result = result.filter(a => 
          a.name.toLowerCase().includes(query) || 
          a.location.toLowerCase().includes(query)
        )
      }
      
      // 地区过滤
      if (selectedRegion.value) {
        result = result.filter(a => a.region === selectedRegion.value)
      }
      
      // 类型过滤
      if (selectedType.value) {
        result = result.filter(a => a.type === selectedType.value)
      }
      
      // 价格范围过滤
      if (priceRange.value) {
        switch (priceRange.value) {
          case 'free':
            result = result.filter(a => a.price === 0)
            break
          case '0-100':
            result = result.filter(a => a.price > 0 && a.price <= 100)
            break
          case '100-200':
            result = result.filter(a => a.price > 100 && a.price <= 200)
            break
          case '200-300':
            result = result.filter(a => a.price > 200 && a.price <= 300)
            break
          case '300+':
            result = result.filter(a => a.price > 300)
            break
        }
      }
      
      // 排序
      switch (sortOption.value) {
        case 'rating-desc':
          result.sort((a, b) => b.rating - a.rating)
          break
        case 'price-asc':
          result.sort((a, b) => a.price - b.price)
          break
        case 'price-desc':
          result.sort((a, b) => b.price - a.price)
          break
        case 'review-desc':
          result.sort((a, b) => b.reviewCount - a.reviewCount)
          break
        default:
          // 默认排序
          result.sort((a, b) => b.isHot - a.isHot || b.rating - a.rating)
      }
      
      return result
    })
    
    const paginatedAttractions = computed(() => {
      const start = (currentPage.value - 1) * itemsPerPage
      const end = start + itemsPerPage
      return filteredAttractions.value.slice(start, end)
    })
    
    const totalPages = computed(() => {
      return Math.ceil(filteredAttractions.value.length / itemsPerPage)
    })
    
    const compareAttractions = computed(() => {
      return attractionsData.value.filter(attraction => 
        compareList.value.includes(attraction.id)
      )
    })
    
    const recommendations = computed(() => {
      // 基于用户收藏和浏览历史推荐
      const hotAttractions = attractionsData.value.filter(a => a.isHot)
      const highRatedAttractions = attractionsData.value
        .filter(a => a.rating >= 4.7)
        .sort((a, b) => b.rating - a.rating)
      
      return [
        {
          id: hotAttractions[0]?.id || 1,
          name: hotAttractions[0]?.name || '故宫博物院',
          image: hotAttractions[0]?.image || '/images/placeholder-landscape.svg',
          rating: hotAttractions[0]?.rating || 4.8,
          reason: '热门景点，值得一游'
        },
        {
          id: highRatedAttractions[0]?.id || 2,
          name: highRatedAttractions[0]?.name || '九寨沟',
          image: highRatedAttractions[0]?.image || '/images/placeholder-landscape.svg',
          rating: highRatedAttractions[0]?.rating || 4.9,
          reason: '评分最高，用户口碑极佳'
        },
        {
          id: highRatedAttractions[1]?.id || 3,
          name: highRatedAttractions[1]?.name || '布达拉宫',
          image: highRatedAttractions[1]?.image || '/images/placeholder-landscape.svg',
          rating: highRatedAttractions[1]?.rating || 4.9,
          reason: '文化底蕴深厚，建筑宏伟'
        }
      ].filter(rec => rec.id)
    })
    
    // 方法
    const searchAttractions = () => {
      currentPage.value = 1
    }
    
    const prevPage = () => {
      if (currentPage.value > 1) currentPage.value--
    }
    
    const nextPage = () => {
      if (currentPage.value < totalPages.value) currentPage.value++
    }
    
    const showAttractionDetail = (attraction) => {
      selectedAttraction.value = attraction
      selectedImage.value = attraction.image
    }
    
    const closeModal = () => {
      selectedAttraction.value = null
    }
    
    const toggleFavorite = (id) => {
      try { travel.toggleFavorite('attractions', id) } catch (error) { feedback.error(error.message) }
    }
    
    const isFavorite = (id) => {
      return favorites.value.includes(String(id))
    }
    
    const bookAttraction = (id) => {
      const attraction = attractionsData.value.find(a => String(a.id) === String(id))
      if (!attraction) { feedback.error('未找到该景点，请刷新后重试'); return }
      if (!auth.isAuthenticated) {
        feedback.info('请先登录后再预订，未创建真实订单。')
        return
      }
      const price = Number(attraction.price) || 0
      const order = {
        type: 'attraction',
        name: `${attraction.name}门票（成人票）`,
        location: attraction.location || attraction.region || '',
        image: attraction.image || '',
        bookingDate: localDateString(),
        quantity: 1,
        unitPrice: price,
        totalPrice: price,
        status: 'pending'
      }
      try {
        travel.createOrder(order)
        feedback.success('演示景区订单已创建，请在个人中心「我的订单」中完成演示支付。')
      } catch (error) {
        feedback.error(error.message || '订单创建失败')
      }
    }
    
    const shareAttraction = async (attraction) => {
      try {
      if (navigator.share) {
        await navigator.share({
          title: attraction.name,
          text: attraction.description,
          url: typeof window !== 'undefined' ? window.location.href : ''
        })
      } else {
        // 降级处理：复制链接到剪贴板
        const shareText = `${attraction.name} - ${attraction.description}`
        if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
        await navigator.clipboard.writeText(shareText)
        feedback.success('景点信息已复制到剪贴板！')
      }
      } catch (error) {
        if (error.name !== 'AbortError') feedback.error('分享失败，请检查浏览器权限后重试。')
      }
    }
    
    const clearFilters = () => {
      searchQuery.value = ''
      selectedRegion.value = ''
      selectedType.value = ''
      priceRange.value = ''
      sortOption.value = 'default'
      currentPage.value = 1
    }
    
    const toggleCompare = (id) => {
      const index = compareList.value.indexOf(id)
      if (index === -1) {
        if (compareList.value.length < 4) {
          compareList.value.push(id)
        } else {
          feedback.warning('最多只能比较4个景点')
        }
      } else {
        compareList.value.splice(index, 1)
      }
    }
    
    const removeFromCompare = (id) => {
      const index = compareList.value.indexOf(id)
      if (index !== -1) {
        compareList.value.splice(index, 1)
      }
    }
    
    // 价格监控与优惠提醒功能
    const showDealsModal = ref(false)
    const activeDealsTab = ref('hot')
    const priceSubscriptions = computed(() => travel.subscriptions.filter(sub => sub.type === 'attraction'))
    const dealAlerts = ref([])
    const hotDeals = computed(() => alertsService.getHotDeals())
    
    const subscribePriceAlert = (attraction) => {
      try {
      travel.subscribe({
        itemId: attraction.id,
        itemName: attraction.name,
        type: 'attraction',
        targetPrice: Math.round(attraction.price * 90) / 100,
        currentPrice: attraction.price,
        location: attraction.location
      })
      
      feedback.success(`已保存 ${attraction.name} 的价格提醒订阅（本地演示）`)
      } catch (error) { feedback.error(error.message) }
    }
    
    const isPriceSubscribed = (attractionId) => {
      return priceSubscriptions.value.some(sub => String(sub.itemId) === String(attractionId) && sub.active)
    }
    
    const unsubscribePriceAlert = async (subscriptionId) => {
      const ownerId = travel.ownerId
      if (await feedback.confirm('确定要取消此价格提醒吗？', { confirmLabel: '取消订阅' }) && ownerId === travel.ownerId) {
        try { travel.unsubscribe(subscriptionId) } catch (error) { feedback.error(error.message); return }
        feedback.success('已取消订阅')
      }
    }

    // 价格监控：立即检查全部景点订阅（演示，确定性模拟），与酒店页行为一致
    const checkingPrices = ref(false)
    const priceCheckResults = ref([])
    let priceCheckIndex = 0
    const checkNowPrices = async () => {
      if (checkingPrices.value) return
      if (!auth.isAuthenticated) { feedback.info('请先登录后再检查价格订阅'); return }
      checkingPrices.value = true
      priceCheckResults.value = []
      const results = await alertsService.checkAllNow({ checkIndex: priceCheckIndex++ })
      checkingPrices.value = false
      travel.refresh()
      if (results.length === 0) {
        priceCheckResults.value = ['本轮检查未触发降价提醒。']
      } else {
        priceCheckResults.value = results.map(r => r.notification?.message || '价格已变化')
        feedback.success(`已触发 ${results.length} 条价格提醒`)
      }
    }
    const countAlertsFor = (sub) => travel.alerts.filter(a => a.subscriptionId === sub.id).length
    
    // 键盘可达性：Esc 关闭任意已打开的模态框
    function handleModalKeydown(e) {
      if (e.key !== 'Escape') return
      if (selectedAttraction.value) { closeModal(); return }
      if (showCompareModal.value) { showCompareModal.value = false; return }
      if (showDealsModal.value) { showDealsModal.value = false; return }
    }

    onMounted(() => {
      dealAlerts.value = alertsService.getHotDeals().slice(0, 3)
      if (typeof window !== 'undefined') window.addEventListener('keydown', handleModalKeydown)
    })

    onBeforeUnmount(() => {
      if (typeof window !== 'undefined') window.removeEventListener('keydown', handleModalKeydown)
    })
    
    const { mapContainer, mapLoading, mapError, retryMap } = useAttractionMap({
      viewMode, items: filteredAttractions, onSelect: showAttractionDetail
    })
    
    return {
      travel,
      searchQuery,
      selectedRegion,
      selectedType,
      priceRange,
      sortOption,
      viewMode,
      regions,
      attractionTypes,
      currentPage,
      filteredAttractions: computed(() => viewMode.value === 'map' ? filteredAttractions.value : paginatedAttractions.value),
      totalPages,
      selectedAttraction,
      selectedImage,
      favorites,
      compareList,
      showCompareModal,
      showRecommendations,
      compareAttractions,
      recommendations,
      // 地图相关
      mapContainer,
      mapLoading,
      mapError,
      retryMap,
      searchAttractions,
      prevPage,
      nextPage,
      showAttractionDetail,
      closeModal,
      toggleFavorite,
      isFavorite,
      bookAttraction,
      shareAttraction,
      clearFilters,
      toggleCompare,
      removeFromCompare,
      // 价格优惠新增
      showDealsModal,
      activeDealsTab,
      priceSubscriptions,
      dealAlerts,
      hotDeals,
      subscribePriceAlert,
      isPriceSubscribed,
      unsubscribePriceAlert,
      checkingPrices,
      priceCheckResults,
      checkNowPrices,
      countAlertsFor
    }
  }
}
</script>

<style scoped>
.attractions-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.search-section {
  background: #fff;
  border-radius: 14px;
  padding: 20px 24px;
  margin-bottom: 30px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.search-bar {
  display: flex;
  margin-bottom: 20px;
}

.search-bar input {
  flex: 1;
  padding: 12px 20px;
  border: 1px solid #ddd;
  border-radius: 10px 0 0 10px;
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search-bar input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.12);
}

.search-bar button {
  padding: 0 24px;
  background: var(--gradient-primary);
  color: white;
  border: none;
  border-radius: 0 10px 10px 0;
  cursor: pointer;
  transition: filter 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.search-bar button:hover {
  filter: brightness(1.08);
}

.filters {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
}

.filter-group label {
  margin-right: 10px;
  font-weight: 500;
  color: var(--text-secondary);
}

.filter-group select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
  outline: none;
  cursor: pointer;
  transition: border-color 0.2s;
}

.filter-group select:focus {
  border-color: var(--primary);
}

.view-and-actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
  flex-wrap: wrap;
  align-items: center;
}

.view-and-actions button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  white-space: nowrap;
}

.view-and-actions button:hover:not(:disabled) {
  background: #f8f9fa;
}

.view-and-actions .view-btn.active {
  background: #4361ee;
  color: white;
  border-color: #4361ee;
}

.view-and-actions .view-btn.active:hover {
  background: #3a0ca3;
}

.view-toggle {
  display: flex;
  gap: 5px;
  margin-left: auto;
}

.view-toggle button {
  padding: 8px 12px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.view-toggle button:hover {
  background: #f8f9fa;
}

.view-toggle button.active {
  background: #4361ee;
  color: white;
  border-color: #4361ee;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-left: 20px;
}

.action-buttons button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
}

.btn-compare {
  color: #4361ee;
  border-color: #4361ee;
}

.btn-compare:hover:not(:disabled) {
  background: #4361ee;
  color: white;
}

.btn-compare:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-recommend {
  color: #ff6b35;
  border-color: #ff6b35;
}

.btn-recommend:hover {
  background: #ff6b35;
  color: white;
}

.card-actions {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #e7e9f2;
  display: flex;
  gap: 10px;
}

.card-actions .btn-compare-small,
.card-actions .btn-alert-small {
  flex: 1;
  justify-content: center;
}

.btn-compare-small {
  padding: 6px 12px;
  border: 1px solid #4361ee;
  background: white;
  color: #4361ee;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-compare-small:hover {
  background: #4361ee;
  color: white;
}

.btn-compare-small.active {
  background: #4361ee;
  color: white;
}

/* 加载状态样式 */
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px 20px;
  margin-bottom: 40px;
}

.loading-spinner {
  text-align: center;
  color: #666;
}

.loading-spinner svg {
  font-size: 32px;
  margin-bottom: 15px;
  color: #4361ee;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 空状态样式 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  margin-bottom: 40px;
  background: #f8f9fa;
  border-radius: 12px;
}

.empty-state svg {
  font-size: 48px;
  margin-bottom: 20px;
  color: #ccc;
}

.empty-state h3 {
  margin: 0 0 10px;
  color: #666;
  font-size: 20px;
}

.empty-state p {
  margin: 0 0 20px;
  color: #999;
}

.btn-clear-filters {
  background: #4361ee;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-clear-filters:hover {
  background: #3a0ca3;
}

/* 地图视图样式 */
.map-container {
  position: relative;
  background: #f8f9fa;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 40px;
  animation: viewFade 0.25s ease-out;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.map-content {
  width: 100%;
  min-height: 500px;
  border-radius: 12px;
  overflow: hidden;
}

.map-notice { margin: 0; padding: 12px 16px; color: #596579; font-size: 14px; }
.map-status { position: absolute; inset: 45px 0 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; background: #f8f9fa; }
.map-status h3, .map-status p { margin: 0; }
.map-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }

/* 响应式设计 */
@media (max-width: 768px) {
  .map-content {
    min-height: 400px;
  }
}

@media (max-width: 480px) {
  .map-content {
    min-height: 300px;
  }
}

/* 列表视图样式 */
.attractions-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 40px;
  animation: viewFade 0.25s ease-out;
}

.attraction-list-item {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  gap: 20px;
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
}

.attraction-list-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
}

.list-image {
  position: relative;
  width: 200px;
  height: 150px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
}

.list-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.list-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.list-content h3 {
  margin: 0 0 10px;
  font-size: 20px;
  color: #2b2d42;
}

.description-preview {
  color: #666;
  font-size: 14px;
  line-height: 1.5;
  margin: 10px 0;
}

.list-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
}

.list-actions button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
}

.list-actions .btn-favorite {
  background: #f8f9fa;
  color: #4361ee;
  border: 1px solid #4361ee;
}

.list-actions .btn-favorite:hover {
  background: #4361ee;
  color: white;
}

.list-actions .btn-book {
  background: #4361ee;
  color: white;
}

.list-actions .btn-book:hover {
  background: #3a0ca3;
}

.attractions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 25px;
  margin-bottom: 40px;
  animation: viewFade 0.25s ease-out;
}

@keyframes viewFade {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.attraction-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #eef0f6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.07);
  transition: transform 0.3s, box-shadow 0.3s;
  cursor: pointer;
}

.attraction-card:hover {
  transform: translateY(-5px);
  border-color: #e3e7ff;
  box-shadow: 0 12px 28px rgba(67, 97, 238, 0.14);
}

.card-image {
  position: relative;
  height: 180px;
  overflow: hidden;
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s;
}

.attraction-card:hover .card-image img {
  transform: scale(1.05);
}

.rating-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(20, 24, 40, 0.78);
  color: #ffd700;
  padding: 4px 10px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  gap: 5px;
  backdrop-filter: blur(2px);
}

.hot-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  background: #ff4757;
  color: white;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 14px;
}

.card-content {
  padding: 16px 16px 18px;
  display: flex;
  flex-direction: column;
}

.card-content h3 {
  margin: 0 0 10px;
  font-size: 18px;
  color: #2b2d42;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.location {
  display: flex;
  align-items: center;
  color: #666;
  font-size: 14px;
  margin-bottom: 12px;
}

.location svg {
  margin-right: 5px;
  color: #4361ee;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.tag {
  background: #edf2ff;
  color: #4361ee;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  line-height: 1.4;
}

.price-section {
  display: flex;
  align-items: baseline;
  margin-top: 0;
  padding-top: 14px;
  border-top: 1px dashed #e7e9f2;
}

.price {
  font-size: 20px;
  font-weight: bold;
  color: #ff4757;
  margin-right: 10px;
  line-height: 1;
}

.original-price {
  font-size: 13px;
  color: #999;
  text-decoration: line-through;
  margin-right: 10px;
}

.discount {
  background: #ff4757;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 30px;
}

.pagination button {
  padding: 8px 16px;
  background: #4361ee;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.3s;
}

.pagination button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.pagination button:hover:not(:disabled) {
  background: #3a0ca3;
}

/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.attraction-modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 1000px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  animation: modalFadeIn 0.3s;
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.close-btn {
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  z-index: 10;
}

.close-btn:hover {
  color: #333;
}

.modal-content {
  display: flex;
  flex-direction: column;
  padding: 30px;
}

.modal-gallery {
  width: 100%;
  margin-bottom: 20px;
}

.modal-gallery img {
  width: 100%;
  max-height: 400px;
  object-fit: cover;
  border-radius: 8px;
}

.gallery-thumbnails {
  display: flex;
  gap: 10px;
  margin-top: 15px;
  overflow-x: auto;
  padding-bottom: 10px;
}

.gallery-thumbnails img {
  width: 80px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border 0.3s;
}

.gallery-thumbnails img:hover {
  border-color: #4361ee;
}

.modal-details {
  flex: 1;
}

.modal-details h2 {
  margin: 0 0 15px;
  color: #2b2d42;
}

.meta-info {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 20px;
  color: #666;
}

.meta-info > div {
  display: flex;
  align-items: center;
}

.meta-info svg {
  margin-right: 5px;
  color: #4361ee;
}

.current-price {
  font-size: 28px;
  font-weight: bold;
  color: #ff4757;
  margin-right: 15px;
}

.description, .highlights {
  margin: 25px 0;
}

.description h3, .highlights h3 {
  margin-bottom: 10px;
  color: #2b2d42;
  font-size: 20px;
}

.description p {
  line-height: 1.6;
  color: #555;
}

.highlights ul {
  list-style: none;
  padding: 0;
}

.highlights li {
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
}

.highlights svg {
  color: #4cc9f0;
  margin-right: 10px;
  margin-top: 3px;
}

.actions {
  display: flex;
  gap: 15px;
  margin-top: 30px;
}

.actions button {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-favorite {
  background: #f8f9fa;
  color: #4361ee;
  border: 1px solid #4361ee !important;
}

.btn-favorite.favorited {
  background: #4361ee;
  color: white;
}

.btn-favorite svg.favorited {
  color: #ffd700;
}

.btn-book {
  background: #4361ee;
  color: white;
}

.btn-book:hover {
  background: #3a0ca3;
}

.btn-share {
  background: #f8f9fa;
  color: #4361ee;
  border: 1px solid #4361ee !important;
}

.btn-share:hover {
  background: #4361ee;
  color: white;
}

/* 用户评价样式 */
.reviews-section {
  margin: 30px 0;
  padding: 20px 0;
  border-top: 1px solid #eee;
}

.reviews-section h3 {
  margin-bottom: 20px;
  color: #2b2d42;
  font-size: 20px;
}

.reviews-summary {
  margin-bottom: 20px;
}

.rating-overview {
  display: flex;
  align-items: center;
  gap: 15px;
}

.rating-number {
  font-size: 32px;
  font-weight: bold;
  color: #ff4757;
}

.rating-stars {
  display: flex;
  gap: 2px;
}

.rating-stars .star {
  color: #ffd700;
  font-size: 18px;
}

.review-count {
  color: #666;
  font-size: 14px;
}

.reviews-list {
  max-height: 400px;
  overflow-y: auto;
}

.review-item {
  padding: 15px 0;
  border-bottom: 1px solid #f0f0f0;
}

.review-item:last-child {
  border-bottom: none;
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.reviewer-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.reviewer-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.reviewer-name {
  font-weight: 500;
  color: #2b2d42;
}

.review-date {
  font-size: 12px;
  color: #999;
}

.review-rating {
  display: flex;
  gap: 2px;
}

.review-rating .star {
  color: #ffd700;
  font-size: 14px;
}

.review-content {
  color: #555;
  line-height: 1.6;
  margin-bottom: 10px;
}

.review-images {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.review-image {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.3s;
}

.review-image:hover {
  transform: scale(1.05);
}

/* 推荐区域样式 */
.recommendations-section {
  margin: 30px 0;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 12px;
}

.recommendations-section h3 {
  margin: 0 0 20px;
  color: #2b2d42;
  font-size: 24px;
}

.recommendations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.recommendation-card {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.3s;
}

.recommendation-card:hover {
  transform: translateY(-2px);
}

.recommendation-card img {
  width: 100%;
  height: 150px;
  object-fit: cover;
}

.recommendation-content {
  padding: 15px;
}

.recommendation-content h4 {
  margin: 0 0 8px;
  color: #2b2d42;
  font-size: 16px;
}

.recommendation-content p {
  margin: 0 0 10px;
  color: #666;
  font-size: 14px;
  line-height: 1.4;
}

.recommendation-rating {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #ffd700;
  font-size: 14px;
}

/* 比较模态框样式 */
.compare-modal {
  background: white;
  border-radius: 12px;
  width: 95%;
  max-width: 1200px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  animation: modalFadeIn 0.3s;
}

.compare-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #eee;
}

.compare-header h2 {
  margin: 0;
  color: #2b2d42;
}

.compare-content {
  padding: 20px;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
}

.compare-row {
  display: grid;
  grid-template-columns: 150px repeat(auto-fit, minmax(200px, 1fr));
  border-bottom: 1px solid #eee;
}

.compare-row.header {
  background: #f8f9fa;
  font-weight: bold;
}

.compare-cell {
  padding: 15px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  border-right: 1px solid #eee;
}

.compare-cell:last-child {
  border-right: none;
}

.attraction-header {
  position: relative;
}

.attraction-header img {
  width: 80px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 10px;
}

.attraction-header h3 {
  margin: 0;
  font-size: 14px;
  color: #2b2d42;
}

.btn-remove {
  position: absolute;
  top: 5px;
  right: 5px;
  background: #ff4757;
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.btn-remove:hover {
  background: #ff3742;
}

.compare-cell .price {
  font-size: 18px;
  font-weight: bold;
  color: #ff4757;
}

.compare-cell .original-price {
  font-size: 14px;
  color: #999;
  text-decoration: line-through;
}

.compare-cell .rating {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #ffd700;
}

.compare-cell .review-count {
  font-size: 12px;
  color: #666;
  margin-left: 5px;
}

.compare-cell .tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
}

.compare-cell .tag {
  background: #edf2ff;
  color: #4361ee;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
}

@media (max-width: 768px) {
  .modal-content {
    flex-direction: column;
  }
  
  .modal-gallery {
    margin-right: 0;
    margin-bottom: 20px;
  }
  
  .filters {
    flex-direction: column;
    gap: 10px;
  }
  
  .filter-group {
    width: 100%;
  }
  
  .filter-group select {
    flex: 1;
  }
  
  .attractions-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
  
  .attraction-list-item {
    flex-direction: column;
    gap: 15px;
  }
  
  .list-image {
    width: 100%;
    height: 200px;
  }
  
  .list-actions {
    flex-direction: row;
    justify-content: space-around;
  }
  
  .view-and-actions {
    margin-left: 0;
    margin-top: 10px;
    width: 100%;
    justify-content: flex-start;
  }
  
  .view-and-actions button {
    font-size: 12px;
    padding: 6px 12px;
  }
  
  .view-and-actions .view-btn span {
    display: none;
  }
  
  .view-and-actions .btn-compare span,
  .view-and-actions .btn-recommend span,
  .view-and-actions .btn-deals span {
    display: inline;
  }
  
  .view-toggle {
    margin-left: 0;
    margin-top: 10px;
  }
  
  .filters {
    flex-direction: column;
    gap: 10px;
  }
  
  .filter-group {
    width: 100%;
  }
  
  .filter-group select {
    flex: 1;
  }
  
  .reviews-section {
    margin: 20px 0;
  }
  
  .rating-overview {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .review-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .review-images {
    justify-content: center;
  }
  
  .action-buttons {
    margin-left: 0;
    margin-top: 10px;
    justify-content: center;
  }
  
  .recommendations-grid {
    grid-template-columns: 1fr;
  }
  
  .compare-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  
  .compare-cell {
    border-right: none;
    border-bottom: 1px solid #eee;
  }
  
  .compare-cell:last-child {
    border-bottom: none;
  }
}

/* 价格优惠样式 */
.view-and-actions .btn-deals {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  border: none;
  position: relative;
}

.view-and-actions .btn-deals:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
  background: linear-gradient(135deg, #e084eb 0%, #e5475c 100%);
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
  position: relative;
}

.btn-deals:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4);
}

.alert-badge {
  background: white;
  color: #f5576c;
  border-radius: 50%;
  min-width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  padding: 0 4px;
  margin-left: 4px;
}

.btn-alert-small {
  padding: 8px 16px;
  background: #fff;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 5px;
}

.btn-alert-small:hover {
  border-color: #f5576c;
  background: #fff5f7;
}

.btn-alert-small.active {
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

.deals-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

.deals-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 25px;
  border-bottom: 2px solid #f0f0f0;
}

.deals-tabs .tab-btn {
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 16px;
  color: #666;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.deals-tabs .tab-btn.active {
  color: #f5576c;
  border-bottom-color: #f5576c;
}

.deals-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
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

.deal-content {
  padding: 15px;
}

.deal-content h3 {
  margin: 0 0 10px 0;
  color: #2b2d42;
}

.deal-location, .deal-desc {
  color: #666;
  font-size: 14px;
  margin: 5px 0;
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

.deal-price .discount-badge {
  background: #f5576c;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.deal-valid {
  color: #666;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 5px;
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

.sub-date {
  font-size: 12px;
  color: #999;
}

.subscriptions-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.subscriptions-total {
  color: #888;
  font-size: 14px;
}

.btn-check-now {
  background: #17a2b8;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.btn-check-now:hover {
  background: #138496;
  transform: translateY(-2px);
}

.btn-check-now:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.alert-hint {
  color: #e67e22;
  font-size: 13px;
  margin-top: 4px !important;
}

.price-check-results {
  margin-top: 5px;
  padding: 12px;
  background: #fff8e1;
  border: 1px solid #ffe0b2;
  border-radius: 8px;
}

.price-check-results h4 {
  margin: 0 0 6px 0;
  color: #2b2d42;
  font-size: 14px;
}

.price-check-results ul {
  margin: 0;
  padding-left: 18px;
}

.price-check-results li {
  color: #666;
  font-size: 14px;
  line-height: 1.6;
}
</style>
