<template>
  <div class="culture-tourism-container">
    <header class="page-header animated-header">
      <h1 class="page-title">特色文旅</h1>
      <p class="page-subtitle">探索非遗文化、红色文旅及时事资讯</p>
    </header>

    <div class="content-tabs">
      <div 
        class="tab animated-tab" 
        :class="{ active: activeTab === 'heritage' }"
        @click="switchTab('heritage')"
      >
        非遗文化
      </div>
      <div 
        class="tab animated-tab" 
        :class="{ active: activeTab === 'red-tourism' }"
        @click="switchTab('red-tourism')"
      >
        红色文旅
      </div>
      <div 
        class="tab animated-tab" 
        :class="{ active: activeTab === 'news' }"
        @click="switchTab('news')"
      >
        时事资讯
      </div>
    </div>

    <div class="tab-content">
      <!-- 非遗文化 Tab -->
      <div v-show="activeTab === 'heritage'" class="tab-pane animated-content">
        <div class="section-header">
          <h2>非遗文化</h2>
          <p>传承千年文化瑰宝</p>
        </div>
        
        <div class="heritage-grid">
          <div class="heritage-card" v-for="item in heritageItems" :key="item.id">
            <div class="card-image">
              <img :src="item.image" :alt="item.title">
            </div>
            <div class="card-content">
              <h3>{{ item.title }}</h3>
              <p>{{ item.description }}</p>
              <button class="learn-more-btn">了解更多</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 红色文旅 Tab -->
      <div v-show="activeTab === 'red-tourism'" class="tab-pane animated-content">
        <div class="section-header">
          <h2>红色文旅</h2>
          <p>追寻革命足迹，传承红色基因</p>
        </div>
        
        <div class="red-tourism-grid">
          <div class="tourism-card" v-for="item in redTourismItems" :key="item.id">
            <div class="card-image">
              <img :src="item.image" :alt="item.title">
            </div>
            <div class="card-content">
              <h3>{{ item.title }}</h3>
              <p>{{ item.description }}</p>
              <button class="learn-more-btn">查看详情</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 时事资讯 Tab -->
      <div v-show="activeTab === 'news'" class="tab-pane animated-content">
        <div class="section-header">
          <h2>时事资讯</h2>
          <p>最新文化旅游动态</p>
        </div>
        
        <div class="news-list">
          <div class="news-item" v-for="item in newsItems" :key="item.id">
            <div class="news-date">
              <div class="date-day">{{ item.day }}</div>
              <div class="date-month">{{ item.month }}</div>
            </div>
            <div class="news-content">
              <h3>{{ item.title }}</h3>
              <p>{{ item.summary }}</p>
              <div class="news-meta">
                <span class="category">{{ item.category }}</span>
                <span class="time">{{ item.time }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CultureTourismView',
  data() {
    return {
      activeTab: 'heritage', // 默认显示非遗文化
      heritageItems: [
        {
          id: 1,
          title: '京剧',
          description: '中国国粹，被誉为"东方歌剧"，以其独特的唱腔、表演和脸谱艺术闻名于世。',
          image: 'https://aisearch.cdn.bcebos.com/pic_create/2025-12-04/17/26cfca8a56dda552.jpg'
        },
        {
          id: 2,
          title: '书法',
          description: '汉字书写的艺术，包括篆、隶、楷、行、草五种主要字体，体现中华文化精髓。',
          image: 'https://pic.rmb.bdstatic.com/bjh/3f119130cf43/241110/89c5942139b6250eada0865544f5289e.jpeg'
        },
        {
          id: 3,
          title: '剪纸',
          description: '民间传统装饰艺术，用剪刀或刻刀在纸上镂空雕刻，创造出各种图案。',
          image: 'https://inews.gtimg.com/om_bt/OhHN5Dq7UfQCOcd350CHjtx8d9ikMKQ-q2M3o02uBVS80AA/641'
        },
        {
          id: 4,
          title: '皮影戏',
          description: '以兽皮或纸板做成的人物剪影表演故事的民间戏剧形式。',
          image: 'https://q2.itc.cn/images01/20250528/554af73832534395a19f3dcc4be78db0.jpeg'
        },
        {
          id: 5,
          title: '针灸',
          description: '通过针刺或艾灸刺激穴位调节气血，体现中医“天人合一”理论。',
          image: 'https://pic.rmb.bdstatic.com/bjh/bb864d33292/241227/78ecf5cbb95f83ba3ac20f886880c3be.jpeg'
        },
        {
          id: 6,
          title: '茶',
          description: '涵盖茶叶种植、加工、品饮的完整茶文化体系，体现人与自然和谐共生的智慧。',
          image: 'https://b0.bdstatic.com/ugc/UAanx415gfVzNHRf35gFDw953604308182b8ccf681f4fccaea7d2a.jpg'
        }
      ],
      redTourismItems: [
        {
          id: 1,
          title: '井冈山革命纪念馆',
          description: '中国革命的摇篮，毛泽东等老一辈无产阶级革命家创建的第一个农村革命根据地。',
          image: 'https://jgsgmbwg.com/static/images/5.jpg'
        },
        {
          id: 2,
          title: '延安革命纪念馆',
          description: '中国共产党中央委员会所在地，中共中央在这里领导了抗日战争等重要历史事件。',
          image: 'https://youimg1.c-ctrip.com/target/0100x12000811hnmt4161_D_10000_1200.jpg?proc=autoorient'
        },
        {
          id: 3,
          title: '西柏坡纪念馆',
          description: '新中国从这里走来，中共中央在这里指挥了决定中国命运的三大战役。',
          image: 'https://pic.rmb.bdstatic.com/bjh/bc17a0d3fb9/250130/4e824a837a45ce9202d3079308f79b62.jpeg'
        },
        {
          id: 4,
          title: '遵义会议会址',
          description: '中国共产党历史上生死攸关的转折点，确立了毛泽东在党内的领导地位。',
          image: 'https://x0.ifengimg.com/res/2021/0C8B67F7E44900A980F18E59F5FBE0857E063882_size1857_w6720_h4480.jpeg'
        },
        {
          id: 5,
          title: '沂蒙山根据地‌',
          description: '抗战时期重要根据地，红嫂精神发源地。',
          image: 'https://q4.itc.cn/q_70/images03/20250707/6b0a0cca4d11471992b9a498627c9f4d.jpeg'
        },
        {
          id: 6,
          title: '南湖革命纪念馆‌',
          description: '中国共产党诞生地，红船精神发源地，国家一级博物馆。',
          image: 'https://gips2.baidu.com/it/u=854828118,3559840194&fm=3074&app=3074&f=JPEG?w=909&h=800&type=normal&func=S'
        }
      ],
      newsItems: [
        {
          id: 1,
          day: '15',
          month: 'May',
          title: '文化和旅游部发布2023年文化和旅游发展统计公报',
          summary: '数据显示，2023年国内旅游总人次同比增长15.5%，旅游业复苏势头强劲。',
          category: '政策动态',
          time: '2023-05-15'
        },
        {
          id: 2,
          day: '22',
          month: 'Apr',
          title: '国家级非遗代表性传承人记录工作全面启动',
          summary: '将对全国范围内具有代表性的非遗传承人进行全面系统记录和保护。',
          category: '非遗保护',
          time: '2023-04-22'
        },
        {
          id: 3,
          day: '10',
          month: 'Apr',
          title: '红色旅游融合发展示范区建设加快推进',
          summary: '首批国家级红色旅游融合发展示范区名单公布，推动红色旅游高质量发展。',
          category: '产业发展',
          time: '2023-04-10'
        },
        {
          id: 4,
          day: '05',
          month: 'Mar',
          title: '全国乡村旅游重点村名录扩大至2000个',
          summary: '文化和旅游部新增一批全国乡村旅游重点村，助力乡村振兴战略实施。',
          category: '乡村旅游',
          time: '2023-03-05'
        }
      ]
    }
  },
  methods: {
    switchTab(tabName) {
      this.activeTab = tabName;
    }
  }
}
</script>

<style scoped>
.culture-tourism-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  min-height: calc(100vh - 100px);
}

.page-header {
  text-align: center;
  margin-bottom: 20px;
  padding: 15px 0;
  background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
  border-radius: 15px;
  color: white;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  animation: slideInDown 0.8s ease-out;
  position: relative;
  overflow: hidden;
}

.page-header::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
  transform: scale(0);
  transition: transform 0.5s ease-out;
}

.page-header:hover::before {
  transform: scale(1);
}

.page-title {
  font-size: 1.8rem;
  margin-bottom: 5px;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  animation: fadeInUp 0.6s ease-out;
}

.page-subtitle {
  font-size: 1rem;
  opacity: 0.9;
  animation: fadeInUp 0.6s ease-out 0.2s both;
}

@keyframes slideInDown {
  0% {
    transform: translateY(-100%);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes fadeInUp {
  0% {
    transform: translateY(20px);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

.pulse-animation {
  animation: pulse 2s infinite;
}

.content-tabs {
  display: flex;
  justify-content: center;
  margin-bottom: 30px;
  background: white;
  border-radius: 50px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  padding: 5px;
  animation: fadeIn 0.5s ease-out;
}

.tab {
  padding: 15px 30px;
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 600;
  border-radius: 50px;
  transition: all 0.3s ease;
  text-align: center;
  flex: 1;
  position: relative;
  overflow: hidden;
}

.tab::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 3px;
  background: linear-gradient(90deg, #f6d365, #fda085);
  transition: all 0.3s ease;
  transform: translateX(-50%);
}

.tab:hover::after {
  width: 80%;
}

.tab:hover {
  background: rgba(246, 211, 101, 0.1);
  transform: translateY(-3px);
}

.tab.active {
  background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
  color: white;
  box-shadow: 0 4px 10px rgba(246, 211, 101, 0.4);
  transform: translateY(-3px);
}

.tab.active::after {
  width: 0;
}

.animated-tab {
  animation: bounceIn 0.6s ease-out;
}

@keyframes bounceIn {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
  70% {
    transform: scale(0.9);
  }
  100% {
    transform: scale(1);
  }
}

.animated-content {
  animation: fadeInUp 0.6s ease-out;
}

.section-header {
  text-align: center;
  margin-bottom: 30px;
  animation: slideInLeft 0.7s ease-out;
}

@keyframes slideInLeft {
  0% {
    transform: translateX(-50px);
    opacity: 0;
  }
  100% {
    transform: translateX(0);
    opacity: 1;
  }
}

.heritage-grid, .red-tourism-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 30px;
  margin-bottom: 40px;
}

.heritage-card, .tourism-card {
  background: white;
  border-radius: 15px;
  overflow: hidden;
  box-shadow: 0 6px 15px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  animation: cardEntrance 0.6s ease-out forwards;
  opacity: 0;
  transform: translateY(30px);
}

@keyframes cardEntrance {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.heritage-card {
  animation-delay: 0.1s;
}

.heritage-card:nth-child(2) {
  animation-delay: 0.2s;
}

.heritage-card:nth-child(3) {
  animation-delay: 0.3s;
}

.heritage-card:nth-child(4) {
  animation-delay: 0.4s;
}

.heritage-card:nth-child(5) {
  animation-delay: 0.5s;
}

.heritage-card:nth-child(6) {
  animation-delay: 0.6s;
}

.red-tourism-grid .tourism-card {
  animation-delay: 0.1s;
}

.red-tourism-grid .tourism-card:nth-child(2) {
  animation-delay: 0.2s;
}

.red-tourism-grid .tourism-card:nth-child(3) {
  animation-delay: 0.3s;
}

.red-tourism-grid .tourism-card:nth-child(4) {
  animation-delay: 0.4s;
}

.red-tourism-grid .tourism-card:nth-child(5) {
  animation-delay: 0.5s;
}

.red-tourism-grid .tourism-card:nth-child(6) {
  animation-delay: 0.6s;
}

.heritage-card:hover, .tourism-card:hover {
  transform: translateY(-10px);
  box-shadow: 0 12px 25px rgba(0, 0, 0, 0.15);
}

.card-image {
  height: 200px;
  overflow: hidden;
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.heritage-card:hover .card-image img, .tourism-card:hover .card-image img {
  transform: scale(1.1);
}

.card-content {
  padding: 20px;
}

.card-content h3 {
  font-size: 1.4rem;
  margin-bottom: 10px;
  color: #333;
}

.card-content p {
  color: #666;
  line-height: 1.6;
  margin-bottom: 20px;
}

.learn-more-btn {
  background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 25px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 4px 10px rgba(246, 211, 101, 0.3);
  position: relative;
  overflow: hidden;
}

.learn-more-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: 0.5s;
}

.learn-more-btn:hover::before {
  left: 100%;
}

.learn-more-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 15px rgba(246, 211, 101, 0.4);
}

.news-list {
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.news-item {
  display: flex;
  background: white;
  border-radius: 15px;
  overflow: hidden;
  box-shadow: 0 6px 15px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  animation: newsEntrance 0.6s ease-out forwards;
  opacity: 0;
  transform: translateX(-20px);
}

@keyframes newsEntrance {
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.news-item:nth-child(2) {
  animation-delay: 0.1s;
}

.news-item:nth-child(3) {
  animation-delay: 0.2s;
}

.news-item:nth-child(4) {
  animation-delay: 0.3s;
}

.news-item:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}

.news-date {
  background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
  color: white;
  padding: 20px;
  text-align: center;
  min-width: 80px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  transition: all 0.3s ease;
}

.news-date:hover {
  transform: scale(1.05);
}

.date-day {
  font-size: 2rem;
  font-weight: bold;
}

.date-month {
  font-size: 0.9rem;
  text-transform: uppercase;
}

.news-content {
  padding: 20px;
  flex: 1;
}

.news-content h3 {
  font-size: 1.3rem;
  margin-bottom: 10px;
  color: #333;
}

.news-content p {
  color: #666;
  line-height: 1.6;
  margin-bottom: 15px;
}

.news-meta {
  display: flex;
  gap: 15px;
}

.category {
  background: rgba(246, 211, 101, 0.2);
  color: #f6d365;
  padding: 5px 10px;
  border-radius: 15px;
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.3s ease;
}

.category:hover {
  transform: scale(1.1);
  background: rgba(246, 211, 101, 0.3);
}

.time {
  color: #999;
  font-size: 0.9rem;
}

@keyframes fadeIn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .content-tabs {
    flex-direction: column;
    border-radius: 15px;
  }
  
  .tab {
    border-radius: 10px;
    margin-bottom: 5px;
  }
  
  .news-item {
    flex-direction: column;
  }
  
  .news-date {
    padding: 15px;
    min-width: auto;
    flex-direction: row;
    gap: 10px;
  }
  
  .heritage-grid, .red-tourism-grid {
    grid-template-columns: 1fr;
  }
}
</style>