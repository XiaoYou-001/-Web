<template>
  <el-config-provider :locale="zhCn">
  <div class="ticket-view-container">
    <!-- 页面头部 -->
    <div class="banner">
      <div class="banner-content">
        <h1>便捷票务服务</h1>
        <p>体验出行与景区票务查询，所有结果均为演示数据</p>
      </div>
    </div>

    <p class="demo-notice">票价和余票为模拟数据，预订不会生成真实订单或扣款。</p>

    <!-- 导航标签 -->
    <div class="ticket-tabs">
      <el-tabs v-model="activeTab" type="border-card" @tab-change="handleTabChange">
        <el-tab-pane label="出行票务" name="travel">
          <!-- 出行搜索 -->
          <div class="search-section">
            <h2>出行搜索</h2>
            <el-form @submit.prevent="searchTravel" class="travel-form">
              <div class="form-row">
                <el-form-item label="出发地" prop="origin" class="form-item">
                  <el-input
                    v-model="travelSearch.origin"
                    placeholder="请输入出发地"
                    :prefix-icon="Location"
                  />
                </el-form-item>
                <div class="swap-btn" @click="swapOriginDestination">
                  <el-icon><Switch /></el-icon>
                </div>
                <el-form-item label="目的地" prop="destination" class="form-item">
                  <el-input
                    v-model="travelSearch.destination"
                    placeholder="请输入目的地"
                    :prefix-icon="Place"
                  />
                </el-form-item>
              </div>
              <div class="form-row">
                <el-form-item label="出行日期" prop="date" class="form-item">
                  <el-date-picker
                    v-model="travelSearch.date"
                    type="date"
                    placeholder="选择日期"
                    format="YYYY-MM-DD"
                    value-format="YYYY-MM-DD"
                    :prefix-icon="Calendar"
                  />
                </el-form-item>
                <el-form-item label="出行方式" prop="transport" class="form-item">
                  <el-select v-model="travelSearch.transport" placeholder="选择出行方式">
                    <el-option label="航班" value="flight" />
                    <el-option label="高铁" value="highSpeedRail" />
                    <el-option label="火车" value="train" />
                    <el-option label="大巴" value="bus" />
                    <el-option label="地铁" value="subway" />
                    <el-option label="船舶" value="ship" />
                  </el-select>
                </el-form-item>
              </div>
              <div class="form-actions">
                <el-button type="primary" @click="searchTravel" :loading="isSearching" :icon="Search">
                  搜索票务
                </el-button>
                <el-button @click="resetTravelForm" :icon="RefreshRight">
                  重置
                </el-button>
              </div>
            </el-form>
          </div>

          <!-- 出行搜索结果 -->
          <div v-if="travelResults.length > 0" class="results-section">
            <div class="results-header">
              <h3>搜索结果 (共 {{ travelResults.length }} 条)</h3>
              <div class="sort-options">
                <el-select v-model="sortOption" placeholder="排序方式" size="small">
                  <el-option label="价格从低到高" value="priceAsc" />
                  <el-option label="价格从高到低" value="priceDesc" />
                  <el-option label="出发时间" value="departureTime" />
                </el-select>
              </div>
            </div>
            <el-card class="result-card" v-for="result in sortedTravelResults" :key="result.id">
              <div class="result-content">
                <div class="result-header">
                  <div class="route-info">
                    <h4 class="transport-type">{{ getTransportName(result.transport) }}</h4>
                    <div class="route-time">
                      <span class="time-point">{{ result.departureTime }}</span>
                      <div class="route-line">
                        <div class="line"></div>
                        <el-icon class="arrow-icon"><Right /></el-icon>
                      </div>
                      <span class="time-point">{{ result.arrivalTime }}</span>
                    </div>
                    <div class="route-stations">
                      <span class="station">{{ result.origin }}</span>
                      <span class="station">{{ result.destination }}</span>
                    </div>
                    <div class="duration">{{ result.duration }}</div>
                  </div>
                  <div class="price-info">
                    <span class="price-tag">¥{{ result.price }}</span>
                    <el-button type="primary" @click="selectTravel(result)" size="small">
                      查看详情
                    </el-button>
                  </div>
                </div>
                <div class="result-meta">
                  <span class="company">{{ result.company }}</span>
                  <span class="remaining">{{ result.remainingTickets }}张余票</span>
                </div>
              </div>
            </el-card>
          </div>
          <el-empty v-else-if="isSearched" description="暂无搜索结果" :image-size="200" />
        </el-tab-pane>
        <el-tab-pane label="景区票务" name="scenic">
          <!-- 景区搜索 -->
          <div class="search-section">
            <h2>景区搜索</h2>
            <el-form @submit.prevent="searchScenic" class="scenic-form">
              <div class="form-row">
                <el-form-item label="景区名称" prop="name" class="form-item">
                  <el-input
                    v-model="scenicSearch.name"
                    placeholder="请输入景区名称或关键词"
                    :prefix-icon="Position"
                  />
                </el-form-item>
                <el-form-item label="所在城市" prop="city" class="form-item">
                  <el-input
                    v-model="scenicSearch.city"
                    placeholder="请输入所在城市"
                    :prefix-icon="HomeFilled"
                  />
                </el-form-item>
              </div>
              <div class="form-actions">
                <el-button type="success" @click="searchScenic" :loading="isScenicSearching" :icon="Search">
                  搜索景区
                </el-button>
                <el-button @click="resetScenicForm" :icon="RefreshRight">
                  重置
                </el-button>
              </div>
            </el-form>
          </div>

          <!-- 景区搜索结果 -->
          <div v-if="scenicResults.length > 0" class="results-section">
            <div class="results-header">
              <h3>搜索结果 (共 {{ scenicResults.length }} 条)</h3>
              <div class="sort-options">
                <el-select v-model="scenicSortOption" placeholder="排序方式" size="small">
                  <el-option label="价格从低到高" value="priceAsc" />
                  <el-option label="价格从高到低" value="priceDesc" />
                  <el-option label="评分最高" value="rating" />
                </el-select>
              </div>
            </div>
            <div class="scenic-grid">
              <el-card class="scenic-card" v-for="scenic in sortedScenicResults" :key="scenic.id">
                <div class="scenic-image">
                  <app-image :src="scenic.imageUrl" :alt="scenic.name"  />
                </div>
                <div class="scenic-info">
                  <div class="scenic-header">
                    <h4 class="scenic-name">{{ scenic.name }}</h4>
                    <div class="scenic-rating">
                      <el-rate :model-value="parseFloat(scenic.rating)" disabled show-score />
                    </div>
                  </div>
                  <p class="scenic-city">{{ scenic.city }}</p>
                  <div class="scenic-tags">
                    <el-tag v-for="tag in scenic.tags" :key="tag" size="small">{{ tag }}</el-tag>
                  </div>
                  <div class="scenic-footer">
                    <span class="ticket-price">¥{{ scenic.ticketPrice }}起</span>
                    <el-button type="primary" @click="bookTicket(scenic)" size="small">
                      预订门票
                    </el-button>
                  </div>
                </div>
              </el-card>
            </div>
          </div>
          <el-empty v-else-if="isScenicSearched" description="暂无搜索结果" :image-size="200" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 详情模态框（出行） -->
    <el-dialog
      v-model="selectedTravelVisible"
      :title="selectedTravel ? `${getTransportName(selectedTravel.transport)}详情：${selectedTravel.origin} - ${selectedTravel.destination}` : ''"
      width="80%"
    >
      <div v-if="selectedTravel" class="travel-detail">
        <div class="detail-section">
          <h3>基本信息</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <label>出发时间：</label>
              <span>{{ selectedTravel.departureTime }}</span>
            </div>
            <div class="detail-item">
              <label>到达时间：</label>
              <span>{{ selectedTravel.arrivalTime }}</span>
            </div>
            <div class="detail-item">
              <label>行程时长：</label>
              <span>{{ selectedTravel.duration }}</span>
            </div>
            <div class="detail-item">
              <label>承运公司：</label>
              <span>{{ selectedTravel.company }}</span>
            </div>
            <div class="detail-item">
              <label>车次/航班号：</label>
              <span>{{ selectedTravel.number }}</span>
            </div>
            <div class="detail-item">
              <label>剩余票数：</label>
              <span class="remaining-highlight">{{ selectedTravel.remainingTickets }}张</span>
            </div>
          </div>
        </div>
        <div class="detail-section">
          <h3>票价信息</h3>
          <div class="price-table">
            <table>
              <thead>
                <tr>
                  <th>座位类型</th>
                  <th>票价</th>
                  <th>余票</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="seat in selectedTravel.seatTypes" :key="seat.type">
                  <td>{{ seat.type }}</td>
                  <td>¥{{ seat.price }}</td>
                  <td>{{ seat.remaining }}</td>
                  <td>
                    <el-button type="primary" size="small" :disabled="seat.remaining === 0">
                      选择
                    </el-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="detail-section">
          <h3>乘客信息</h3>
          <el-button type="primary" size="small" class="add-passenger-btn">
            添加乘客
          </el-button>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="selectedTravelVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmBooking">确认预订</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 景区详情模态框 -->
    <el-dialog
      v-model="selectedScenicVisible"
      :title="selectedScenic ? `${selectedScenic.name}详情` : ''"
      width="80%"
    >
      <div v-if="selectedScenic" class="scenic-detail">
        <div class="scenic-detail-images">
          <app-image :src="selectedScenic.detailImageUrl" :alt="selectedScenic.name" class="main-image"  />
          <div class="thumbnails">
            <app-image v-for="(thumb, index) in selectedScenic.thumbnails" :key="index" :src="thumb" :alt="selectedScenic.name"  />
          </div>
        </div>
        <div class="scenic-detail-info">
          <div class="detail-section">
            <div class="scenic-rating-large">
              <el-rate :model-value="parseFloat(selectedScenic.rating)" disabled show-score />
            </div>
            <p class="scenic-description">{{ selectedScenic.description }}</p>
            <div class="detail-grid">
              <div class="detail-item">
                <label>开放时间：</label>
                <span>{{ selectedScenic.openTime }}</span>
              </div>
              <div class="detail-item">
                <label>地址：</label>
                <span>{{ selectedScenic.address }}</span>
              </div>
              <div class="detail-item">
                <label>联系电话：</label>
                <span>{{ selectedScenic.phone }}</span>
              </div>
            </div>
          </div>
          <div class="detail-section">
            <h3>门票信息</h3>
            <div class="ticket-options">
              <div class="ticket-option" v-for="ticket in selectedScenic.ticketOptions" :key="ticket.id">
                <div class="ticket-info">
                  <h4>{{ ticket.name }}</h4>
                  <p>{{ ticket.description }}</p>
                </div>
                <div class="ticket-price">
                  <span class="price-tag">¥{{ ticket.price }}</span>
                  <el-button type="primary" size="small">选择</el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="selectedScenicVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmScenicBooking">确认预订</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
  </el-config-provider>
</template>

<script>
import { useFeedback } from '../composables/useFeedback.js'
import AppImage from '../ui/AppImage.js'
import { ref, computed, onBeforeUnmount } from "vue";
import { Search, RefreshRight, Location, Place, Calendar, Switch, Right, Position, HomeFilled } from '@element-plus/icons-vue';
import {
  ElConfigProvider, ElTabs, ElTabPane, ElForm, ElFormItem, ElInput,
  ElIcon, ElDatePicker, ElSelect, ElOption, ElButton, ElCard,
  ElEmpty, ElRate, ElTag, ElDialog
} from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs';

// 生成未来几天的日期
const generateFutureDates = (days = 7) => {
  const dates = [];
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date);
  }
  
  return dates;
};

// 格式化日期为YYYY-MM-DD HH:mm格式
const formatDate = (date, includeTime = true) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  if (!includeTime) {
    return `${year}-${month}-${day}`;
  }
  
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export default {
  name: 'TicketsView',
  components: { AppImage,
    ElConfigProvider, ElTabs, ElTabPane, ElForm, ElFormItem, ElInput,
    ElIcon, ElDatePicker, ElSelect, ElOption, ElButton, ElCard,
    ElEmpty, ElRate, ElTag, ElDialog, Switch, Right
  },
  setup() {
    const feedback = useFeedback()
    // 状态管理
    const activeTab = ref('travel');
    const isSearching = ref(false);
    const isSearched = ref(false);
    const isScenicSearching = ref(false);
    const isScenicSearched = ref(false);
    const sortOption = ref('priceAsc');
    const scenicSortOption = ref('rating');
    const selectedTravelVisible = ref(false);
    const selectedScenicVisible = ref(false);
    
    // 出行搜索相关
    const travelSearch = ref({
      origin: '',
      destination: '',
      date: formatDate(new Date(), false),
      transport: 'flight',
    });
    const travelResults = ref([]);
    const selectedTravel = ref(null);

    // 景区票务相关
    const scenicSearch = ref({
      name: '',
      city: '',
    });
    const scenicResults = ref([]);
    const selectedScenic = ref(null);

    const pendingSearches = new Map();
    const cancelSearch = kind => {
      const pending = pendingSearches.get(kind);
      if (pending) clearTimeout(pending.timer);
      pendingSearches.delete(kind);
      (kind === 'travel' ? isSearching : isScenicSearching).value = false;
    };
    const scheduleSearch = (kind, callback) => {
      cancelSearch(kind);
      (kind === 'travel' ? isSearching : isScenicSearching).value = true;
      const pending = {};
      pendingSearches.set(kind, pending);
      pending.timer = setTimeout(() => {
        if (pendingSearches.get(kind) !== pending) return;
        pendingSearches.delete(kind);
        callback();
      }, 800);
    };
    onBeforeUnmount(() => { cancelSearch('travel'); cancelSearch('scenic'); });

    // 生成模拟数据
    const generateMockTravelData = () => {
      const origins = ['北京', '上海', '广州', '深圳', '成都', '杭州', '武汉', '西安'];
      const destinations = ['上海', '北京', '深圳', '广州', '杭州', '成都', '西安', '武汉'];
      const companies = ['中国国际航空', '东方航空', '南方航空', '高铁集团', '中国铁路', '长途客运公司', '地铁运营公司', '轮渡公司'];
      const transports = ['flight', 'highSpeedRail', 'train', 'bus', 'subway', 'ship'];
      const futureDates = generateFutureDates(14);
      
      const mockData = [];
      
      // 生成10组模拟数据
      for (let i = 0; i < 10; i++) {
        const originIndex = Math.floor(Math.random() * origins.length);
        let destinationIndex = Math.floor(Math.random() * destinations.length);
        
        // 确保出发地和目的地不同
        while (origins[originIndex] === destinations[destinationIndex]) {
          destinationIndex = Math.floor(Math.random() * destinations.length);
        }
        
        const transport = transports[Math.floor(Math.random() * transports.length)];
        const date = futureDates[Math.floor(Math.random() * futureDates.length)];
        
        // 随机生成出发时间
        const departureHour = 6 + Math.floor(Math.random() * 12);
        const departureMinute = Math.random() > 0.5 ? 30 : 0;
        const departureDate = new Date(date);
        departureDate.setHours(departureHour, departureMinute);
        
        // 根据交通方式生成到达时间
        const hours = transport === 'flight' ? 1 + Math.floor(Math.random() * 4) :
                    transport === 'highSpeedRail' ? 1 + Math.floor(Math.random() * 6) :
                    transport === 'train' ? 3 + Math.floor(Math.random() * 10) :
                    transport === 'bus' ? 2 + Math.floor(Math.random() * 8) :
                    transport === 'subway' ? Math.floor(Math.random() * 2) :
                    1 + Math.floor(Math.random() * 3);
        
        const arrivalDate = new Date(departureDate);
        arrivalDate.setHours(arrivalDate.getHours() + hours);
        
        // 计算时长
        const totalMinutes = Math.round((arrivalDate - departureDate) / 60000);
        const durationHours = Math.floor(totalMinutes / 60);
        const durationMinutes = totalMinutes % 60;
        const duration = `${durationHours}小时${String(durationMinutes).padStart(2, '0')}分钟`;
        
        // 根据交通方式生成价格
        const basePrice = transport === 'flight' ? 800 :
                         transport === 'highSpeedRail' ? 300 :
                         transport === 'train' ? 150 :
                         transport === 'bus' ? 100 :
                         transport === 'subway' ? 10 :
                         50;
        const price = basePrice + Math.floor(Math.random() * basePrice);
        
        // 生成车次/航班号
        let number = '';
        if (transport === 'flight') {
          const airlineCodes = ['CA', 'MU', 'CZ', 'HU', 'ZH'];
          number = airlineCodes[Math.floor(Math.random() * airlineCodes.length)] + Math.floor(1000 + Math.random() * 9000);
        } else if (transport === 'highSpeedRail') {
          number = 'G' + Math.floor(100 + Math.random() * 900);
        } else if (transport === 'train') {
          number = 'K' + Math.floor(100 + Math.random() * 900);
        } else {
          number = Math.floor(100 + Math.random() * 900).toString();
        }
        
        // 根据交通方式生成座位类型
        let seatTypes = [];
        if (transport === 'flight') {
          seatTypes = [
            { type: '头等舱', price: Math.floor(price * 2.5), remaining: Math.floor(Math.random() * 10) },
            { type: '商务舱', price: Math.floor(price * 1.8), remaining: Math.floor(Math.random() * 15) },
            { type: '经济舱', price: price, remaining: Math.floor(Math.random() * 100) + 20 }
          ];
        } else if (transport === 'highSpeedRail') {
          seatTypes = [
            { type: '商务座', price: Math.floor(price * 1.8), remaining: Math.floor(Math.random() * 5) },
            { type: '一等座', price: Math.floor(price * 1.5), remaining: Math.floor(Math.random() * 15) },
            { type: '二等座', price: price, remaining: Math.floor(Math.random() * 100) + 30 }
          ];
        } else {
          seatTypes = [
            { type: '硬座', price: Math.floor(price * 0.8), remaining: Math.floor(Math.random() * 50) + 20 },
            { type: '软座', price: price, remaining: Math.floor(Math.random() * 30) + 10 }
          ];
        }
        
        mockData.push({
          id: i + 1,
          origin: origins[originIndex],
          destination: destinations[destinationIndex],
          transport: transport,
          departureTime: formatDate(departureDate),
          arrivalTime: formatDate(arrivalDate),
          duration: duration,
          price: price,
          company: companies[Math.floor(Math.random() * companies.length)],
          remainingTickets: Math.floor(Math.random() * 100) + 20,
          number: number,
          seatTypes: seatTypes
        });
      }
      
      return mockData;
    };
    
    // 生成模拟景区数据
    const generateMockScenicData = () => {
      const scenicSpots = [
        { name: '故宫博物院', city: '北京', rating: '4.8', imageUrl: 'https://picsum.photos/id/1/400/300', tags: ['历史古迹', '文化遗产'] },
        { name: '上海迪士尼乐园', city: '上海', rating: '4.7', imageUrl: 'https://picsum.photos/id/2/400/300', tags: ['主题乐园', '亲子'] },
        { name: '广州长隆欢乐世界', city: '广州', rating: '4.6', imageUrl: 'https://picsum.photos/id/3/400/300', tags: ['主题乐园', '刺激'] },
        { name: '深圳世界之窗', city: '深圳', rating: '4.5', imageUrl: 'https://picsum.photos/id/4/400/300', tags: ['主题乐园', '文化'] },
        { name: '成都大熊猫繁育研究基地', city: '成都', rating: '4.9', imageUrl: 'https://picsum.photos/id/5/400/300', tags: ['动物园', '亲子'] },
        { name: '杭州西湖', city: '杭州', rating: '4.9', imageUrl: 'https://picsum.photos/id/6/400/300', tags: ['自然风光', '休闲'] },
        { name: '武汉黄鹤楼', city: '武汉', rating: '4.6', imageUrl: 'https://picsum.photos/id/7/400/300', tags: ['历史古迹', '文化'] },
        { name: '西安兵马俑', city: '西安', rating: '4.9', imageUrl: 'https://picsum.photos/id/8/400/300', tags: ['历史古迹', '文化遗产'] },
        { name: '张家界国家森林公园', city: '张家界', rating: '4.8', imageUrl: 'https://picsum.photos/id/9/400/300', tags: ['自然风光', '探险'] },
        { name: '三亚亚龙湾', city: '三亚', rating: '4.7', imageUrl: 'https://picsum.photos/id/10/400/300', tags: ['海滩', '度假'] }
      ];
      
      return scenicSpots.map((spot, index) => {
        const ticketPrice = Math.floor(Math.random() * 200) + 50;
        return {
          id: index + 1,
          ...spot,
          ticketPrice,
          description: `${spot.name}是${spot.city}著名的旅游景点，每年吸引大量游客前来观光游览。景区风景优美，设施完善，是休闲度假的好去处。`,
          openTime: '08:00-18:00',
          address: `${spot.city}市${spot.name}景区路${index + 1}号`,
          phone: `0${spot.city === '北京' ? '10' : spot.city === '上海' ? '21' : spot.city === '广州' ? '20' : '28'}-${Math.floor(10000000 + Math.random() * 90000000)}`,
          detailImageUrl: `https://picsum.photos/id/${index + 20}/800/500`,
          thumbnails: [
            `https://picsum.photos/id/${index + 30}/100/100`,
            `https://picsum.photos/id/${index + 40}/100/100`,
            `https://picsum.photos/id/${index + 50}/100/100`
          ],
          ticketOptions: [
            { id: 1, name: '成人票', price: ticketPrice, description: '适用于18-60周岁游客' },
            { id: 2, name: '儿童票', price: Math.floor(ticketPrice * 0.5), description: '适用于6-18周岁游客' },
            { id: 3, name: '老人票', price: Math.floor(ticketPrice * 0.6), description: '适用于60周岁以上游客' },
            { id: 4, name: '学生票', price: Math.floor(ticketPrice * 0.7), description: '凭学生证购买' }
          ]
        };
      });
    };

    // 模拟出行搜索
    const searchTravel = () => {
      const criteria = { ...travelSearch.value };
      
      // 模拟API请求延迟
      scheduleSearch('travel', () => {
        // 根据搜索条件筛选数据
        const allData = generateMockTravelData();
        
        let filteredData = allData;
        
        if (criteria.origin) {
          filteredData = filteredData.filter(item => item.origin.includes(criteria.origin));
        }
        
        if (criteria.destination) {
          filteredData = filteredData.filter(item => item.destination.includes(criteria.destination));
        }
        
        if (criteria.transport !== 'all') {
          filteredData = filteredData.filter(item => item.transport === criteria.transport);
        }
        
        if (criteria.date) {
          filteredData = filteredData.filter(item => item.departureTime.startsWith(criteria.date));
        }
        
        travelResults.value = filteredData;
        isSearched.value = true;
        isSearching.value = false;
      });
    };

    // 模拟景区搜索
    const searchScenic = () => {
      const criteria = { ...scenicSearch.value };
      
      // 模拟API请求延迟
      scheduleSearch('scenic', () => {
        // 根据搜索条件筛选数据
        const allData = generateMockScenicData();
        
        let filteredData = allData;
        
        if (criteria.name) {
          filteredData = filteredData.filter(item => item.name.includes(criteria.name));
        }
        
        if (criteria.city) {
          filteredData = filteredData.filter(item => item.city.includes(criteria.city));
        }
        
        scenicResults.value = filteredData;
        isScenicSearched.value = true;
        isScenicSearching.value = false;
      });
    };

    // 重置出行表单
    const resetTravelForm = () => {
      cancelSearch('travel');
      travelSearch.value = {
        origin: '',
        destination: '',
        date: formatDate(new Date(), false),
        transport: 'flight',
      };
      travelResults.value = [];
      isSearched.value = false;
    };

    // 重置景区表单
    const resetScenicForm = () => {
      cancelSearch('scenic');
      scenicSearch.value = {
        name: '',
        city: '',
      };
      scenicResults.value = [];
      isScenicSearched.value = false;
    };

    // 交换出发地和目的地
    const swapOriginDestination = () => {
      const temp = travelSearch.value.origin;
      travelSearch.value.origin = travelSearch.value.destination;
      travelSearch.value.destination = temp;
    };

    // 获取交通方式名称
    const getTransportName = (transport) => {
      const transportMap = {
        flight: '航班',
        highSpeedRail: '高铁',
        train: '火车',
        bus: '大巴',
        subway: '地铁',
        ship: '船舶'
      };
      return transportMap[transport] || transport;
    };

    // 查看出行详情
    const selectTravel = (result) => {
      selectedTravel.value = result;
      selectedTravelVisible.value = true;
    };

    // 预订景区门票
    const bookTicket = (scenic) => {
      selectedScenic.value = scenic;
      selectedScenicVisible.value = true;
    };

    // 确认预订出行票
    const confirmBooking = () => {
      if (selectedTravel.value) {
        feedback.info('当前为出行票务演示，未创建真实订单或扣款。');
        selectedTravelVisible.value = false;
      }
    };

    // 确认预订景区门票
    const confirmScenicBooking = () => {
      if (selectedScenic.value) {
        feedback.info('当前为景区票务演示，未创建真实订单或扣款。');
        selectedScenicVisible.value = false;
      }
    };

    // 处理标签页切换
    const handleTabChange = (tab) => {
      activeTab.value = tab;
    };

    // 排序后的出行结果
    const sortedTravelResults = computed(() => {
      const results = [...travelResults.value];
      
      switch (sortOption.value) {
        case 'priceAsc':
          return results.sort((a, b) => a.price - b.price);
        case 'priceDesc':
          return results.sort((a, b) => b.price - a.price);
        case 'departureTime':
          return results.sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));
        default:
          return results;
      }
    });

    // 排序后的景区结果
    const sortedScenicResults = computed(() => {
      const results = [...scenicResults.value];
      
      switch (scenicSortOption.value) {
        case 'priceAsc':
          return results.sort((a, b) => a.ticketPrice - b.ticketPrice);
        case 'priceDesc':
          return results.sort((a, b) => b.ticketPrice - a.ticketPrice);
        case 'rating':
          return results.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
        default:
          return results;
      }
    });

    return {
      zhCn, Search, RefreshRight, Location, Place, Calendar, Position, HomeFilled,
      activeTab,
      travelSearch,
      travelResults,
      scenicSearch,
      scenicResults,
      selectedTravel,
      selectedScenic,
      selectedTravelVisible,
      selectedScenicVisible,
      isSearching,
      isSearched,
      isScenicSearching,
      isScenicSearched,
      sortOption,
      scenicSortOption,
      searchTravel,
      searchScenic,
      resetTravelForm,
      resetScenicForm,
      swapOriginDestination,
      getTransportName,
      selectTravel,
      bookTicket,
      confirmBooking,
      confirmScenicBooking,
      handleTabChange,
      sortedTravelResults,
      sortedScenicResults
    };
  },
};
</script>

<style src="../styles/tickets-element.css"></style>

<style scoped>
/* 全局样式 */
.ticket-view-container {
  min-height: 100vh;
  background: linear-gradient(180deg, #f2f4ff 0%, #f5f7fa 45%);
}

/* 页面头部 */
.banner {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
  padding: 60px 20px;
  margin-bottom: 30px;
}

.banner-content h1 {
  font-size: 42px;
  margin-bottom: 10px;
  font-weight: bold;
}

.banner-content p {
  font-size: 18px;
  opacity: 0.9;
}

/* 导航标签 */
.ticket-tabs {
  width: 90%;
  max-width: 1200px;
  margin: 0 auto 40px;
}

/* 现代化的 el-tabs 外观 */
.ticket-tabs :deep(.el-tabs--border-card) {
  border-color: var(--border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}

.ticket-tabs :deep(.el-tabs--border-card > .el-tabs__header) {
  background-color: #f8f9ff;
}

.ticket-tabs :deep(.el-tabs--border-card > .el-tabs__header .el-tabs__item.is-active) {
  color: var(--primary);
  background-color: #fff;
}

.ticket-tabs :deep(.el-tabs--border-card > .el-tabs__header .el-tabs__item:not(.is-disabled):hover) {
  color: var(--primary);
}

/* 搜索区域 */
.search-section {
  background-color: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 30px;
}

.search-section h2 {
  color: #1f2937;
  margin-bottom: 24px;
  font-size: 22px;
  font-weight: 600;
  padding-bottom: 12px;
  border-bottom: 2px solid #e5e7eb;
}

/* 表单样式 */
.travel-form,
.scenic-form {
  width: 100%;
}

.form-row {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.form-item {
  flex: 1;
  min-width: 200px;
}

.swap-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: #f3f4f6;
  border-radius: 50%;
  cursor: pointer;
  margin: auto 0;
  transition: all 0.3s ease;
}

.swap-btn:hover {
  background-color: #e5e7eb;
  transform: rotate(180deg);
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

/* 结果区域 */
.results-section {
  margin-top: 30px;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.results-header h3 {
  color: #1f2937;
  font-size: 20px;
  font-weight: 600;
}

.sort-options {
  display: flex;
  gap: 12px;
}

/* 出行结果卡片 */
.result-card {
  margin-bottom: 16px;
  border: 1px solid #e5e7eb;
  transition: all 0.3s ease;
}

.result-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.result-content {
  padding: 20px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.route-info {
  flex: 1;
}

.transport-type {
  color: var(--primary);
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}

.route-time {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 8px;
}

.time-point {
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
  min-width: 80px;
}

.route-time .time-point:first-child {
  text-align: right;
}

.route-time .time-point:last-child {
  text-align: left;
}

.route-line {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.line {
  height: 2px;
  background: linear-gradient(90deg, var(--primary) 0%, rgba(67, 97, 238, 0.25) 100%);
  position: relative;
  flex: 1;
}

.line::before {
  content: '';
  position: absolute;
  left: 0;
  top: -2px;
  width: 6px;
  height: 6px;
  background-color: var(--primary);
  border-radius: 50%;
}

.line::after {
  content: '';
  position: absolute;
  right: 0;
  top: -2px;
  width: 6px;
  height: 6px;
  background-color: #10b981;
  border-radius: 50%;
}

.arrow-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--primary);
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 3px #fff;
  line-height: 1;
}

.route-stations {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.station {
  font-size: 14px;
  color: #6b7280;
}

.duration {
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}

.price-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.price-tag {
  font-size: 24px;
  font-weight: 600;
  color: #ef4444;
}

.result-meta {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #6b7280;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

/* 景区结果网格 */
.scenic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.scenic-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.scenic-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.scenic-image {
  height: 200px;
  overflow: hidden;
}

.scenic-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.scenic-card:hover .scenic-image img {
  transform: scale(1.05);
}

.scenic-info {
  padding: 16px;
}

.scenic-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.scenic-name {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
  flex: 1;
  margin-right: 8px;
}

.scenic-rating {
  min-width: 100px;
}

.scenic-city {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 12px;
}

.scenic-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
}

.scenic-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.ticket-price {
  font-size: 18px;
  font-weight: 600;
  color: #ef4444;
}

/* 详情模态框 */
.travel-detail,
.scenic-detail {
  max-height: 60vh;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 30px;
}

.detail-section h3 {
  color: #1f2937;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid #e5e7eb;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item label {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}

.detail-item span {
  font-size: 16px;
  color: #1f2937;
}

.remaining-highlight {
  color: #10b981;
  font-weight: 600;
}

/* 价格表格 */
.price-table {
  overflow-x: auto;
}

.price-table table {
  width: 100%;
  border-collapse: collapse;
}

.price-table th,
.price-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}

.price-table th {
  background-color: #f9fafb;
  font-weight: 600;
  color: #6b7280;
}

.add-passenger-btn {
  margin-top: 12px;
}

/* 景区详情图片 */
.scenic-detail-images {
  margin-bottom: 24px;
}

.main-image {
  width: 100%;
  height: 300px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 12px;
}

.thumbnails {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.thumbnails img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.thumbnails img:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.scenic-description {
  font-size: 14px;
  line-height: 1.6;
  color: #4b5563;
  margin-bottom: 20px;
}

.scenic-rating-large {
  margin-bottom: 16px;
}

/* 门票选项 */
.ticket-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ticket-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background-color: #f9fafb;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.ticket-option:hover {
  background-color: #f3f4f6;
}

.ticket-info h4 {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}

.ticket-info p {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.ticket-option .ticket-price {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .banner-content h1 {
    font-size: 32px;
  }
  
  .banner-content p {
    font-size: 16px;
  }
  
  .ticket-tabs {
    width: 95%;
  }
  
  .search-section {
    padding: 20px;
  }
  
  .form-row {
    flex-direction: column;
    gap: 16px;
  }
  
  .form-item {
    min-width: 100%;
  }
  
  .swap-btn {
    margin: 0 auto;
  }
  
  .result-header {
    flex-direction: column;
    gap: 16px;
  }
  
  .price-info {
    align-items: flex-start;
  }
  
  .scenic-grid {
    grid-template-columns: 1fr;
  }
  
  .detail-grid {
    grid-template-columns: 1fr;
  }
  
  .ticket-option {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .ticket-option .ticket-price {
    align-self: stretch;
    justify-content: space-between;
  }
}

@media (max-width: 480px) {
  .banner {
    padding: 40px 16px;
  }
  
  .banner-content h1 {
    font-size: 28px;
  }
  
  .route-time {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .time-point {
    text-align: center;
  }
  
  .route-stations {
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
}
</style>
