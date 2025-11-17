// routeService.js - 处理旅行线路相关的API调用
import axios from 'axios'

// API基础配置
const API_BASE_URL = import.meta.env.VITE_APP_API_BASE_URL || 'https://api.example.com/v1'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器 - 添加认证token
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('authToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 线路服务API
export const routeService = {
  /**
   * 获取用户的旅行线路列表
   * @param {Object} params - 查询参数
   * @returns {Promise} 线路列表
   */
  getUserRoutes(params = {}) {
    return api.get('/routes', { params })
      .then(response => response.data)
      .catch(error => {
        console.error('获取线路列表失败:', error)
        throw error
      })
  },

  /**
   * 获取智能推荐线路
   * @param {Object} preferences - 用户偏好设置
   * @returns {Promise} 推荐线路列表
   */
  getSmartRecommendations(preferences = {}) {
    return api.post('/routes/recommendations', preferences)
      .then(response => response.data)
      .catch(error => {
        console.error('获取推荐线路失败:', error)
        // 如果API调用失败，返回模拟数据作为降级方案
        return this.getMockRecommendations()
      })
  },

  /**
   * 获取线路详情
   * @param {string} id - 线路ID
   * @returns {Promise} 线路详情
   */
  getRouteDetail(id) {
    return api.get(`/routes/${id}`)
      .then(response => response.data)
      .catch(error => {
        console.error('获取线路详情失败:', error)
        throw error
      })
  },

  /**
   * 创建新线路
   * @param {Object} routeData - 线路数据
   * @returns {Promise} 创建的线路
   */
  createRoute(routeData) {
    return api.post('/routes', routeData)
      .then(response => response.data)
      .catch(error => {
        console.error('创建线路失败:', error)
        throw error
      })
  },

  /**
   * 更新线路
   * @param {string} id - 线路ID
   * @param {Object} routeData - 更新的线路数据
   * @returns {Promise} 更新后的线路
   */
  updateRoute(id, routeData) {
    return api.put(`/routes/${id}`, routeData)
      .then(response => response.data)
      .catch(error => {
        console.error('更新线路失败:', error)
        throw error
      })
  },

  /**
   * 删除线路
   * @param {string} id - 线路ID
   * @returns {Promise} 操作结果
   */
  deleteRoute(id) {
    return api.delete(`/routes/${id}`)
      .then(response => response.data)
      .catch(error => {
        console.error('删除线路失败:', error)
        throw error
      })
  },

  /**
   * 切换线路收藏状态
   * @param {string} id - 线路ID
   * @returns {Promise} 更新后的线路
   */
  toggleFavorite(id) {
    return api.patch(`/routes/${id}/favorite`)
      .then(response => response.data)
      .catch(error => {
        console.error('切换收藏状态失败:', error)
        throw error
      })
  },

  /**
   * 获取景点详情
   * @param {string} attractionId - 景点ID
   * @returns {Promise} 景点详情
   */
  getAttractionDetail(attractionId) {
    return api.get(`/attractions/${attractionId}`)
      .then(response => response.data)
      .catch(error => {
        console.error('获取景点详情失败:', error)
        throw error
      })
  },

  /**
   * 模拟推荐数据 - 当API不可用时使用
   * @returns {Array} 模拟推荐线路列表
   */
  getMockRecommendations() {
    return [
      {
        id: 'rec-1',
        title: '故宫长城一日精华游',
        description: '适合时间有限的游客，一天内体验北京两大世界遗产',
        difficulty: 'medium',
        duration: 1,
        distance: 12,
        attractions: [
          {name: '天安门广场', time: '08:00-09:00', rating: 4.7},
          {name: '故宫博物院', time: '09:30-12:30', rating: 4.8},
          {name: '八达岭长城', time: '14:00-17:00', rating: 4.9}
        ],
        tags: ['世界遗产', '经典路线', '一日游'],
        coverImage: 'https://copyright.bdstatic.com/vcg/creative/1aceea7f204b2475d79dc874233bbd82.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw=='
      },
      {
        id: 'rec-2',
        title: '皇家园林二日游',
        description: '深度体验北京最著名的皇家园林，感受皇家气派与园林艺术',
        difficulty: 'easy',
        duration: 2,
        distance: 8,
        attractions: [
          {name: '颐和园', time: '09:00-12:00', rating: 4.8},
          {name: '圆明园遗址公园', time: '13:30-16:30', rating: 4.6},
          {name: '北海公园', time: '09:00-11:30', rating: 4.7},
          {name: '什刹海', time: '14:00-17:00', rating: 4.5}
        ],
        tags: ['皇家园林', '自然风光', '深度游'],
        coverImage: 'https://copyright.bdstatic.com/vcg/creative/fa3d00f2dd0d2d2fc5b7f6e5d8ce63a1.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw=='
      },
      {
        id: 'rec-3',
        title: '北京文化艺术三日行',
        description: '探访北京的艺术区、博物馆和文化地标，感受现代与传统的交融',
        difficulty: 'medium',
        duration: 3,
        distance: 15,
        attractions: [
          {name: '中国国家博物馆', time: '09:00-12:00', rating: 4.9},
          {name: '798艺术区', time: '14:00-17:00', rating: 4.6},
          {name: '南锣鼓巷', time: '19:00-21:00', rating: 4.4},
          {name: '故宫博物院', time: '09:00-13:00', rating: 4.8},
          {name: '国家大剧院', time: '14:30-17:30', rating: 4.7},
          {name: '北京艺术博物馆', time: '09:00-12:00', rating: 4.5},
          {name: '前门大街', time: '14:00-18:00', rating: 4.5}
        ],
        tags: ['文化艺术', '博物馆', '城市探索'],
        coverImage: 'https://copyright.bdstatic.com/vcg/creative/10f2f032f8b98f0778c11ae5c7d5d8e6.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw=='
      },
      {
        id: 'rec-4',
        title: '北京周边自然风光之旅',
        description: '远离城市喧嚣，探索北京周边的自然风光和历史古迹',
        difficulty: 'challenging',
        duration: 2,
        distance: 150,
        attractions: [
          {name: '慕田峪长城', time: '09:00-13:00', rating: 4.9},
          {name: '红螺寺', time: '14:30-17:00', rating: 4.6},
          {name: '龙庆峡', time: '09:00-12:00', rating: 4.7},
          {name: '永宁古城', time: '13:30-16:30', rating: 4.5}
        ],
        tags: ['自然风光', '户外探险', '小众秘境'],
        coverImage: 'https://copyright.bdstatic.com/vcg/creative/6fbe34e3cf19cecf03b10c9736f66e00.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw=='
      }
    ]
  },

  /**
   * 模拟用户线路数据 - 当API不可用时使用
   * @returns {Array} 模拟用户线路列表
   */
  getMockUserRoutes() {
    return [
      {
        id: 1,
        title: '北京经典三日游',
        startDate: '2023-10-01',
        endDate: '2023-10-03',
        coverImage: 'https://copyright.bdstatic.com/vcg/creative/1aceea7f204b2475d79dc874233bbd82.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw==',
        themes: ['历史文化', '城市探索'],
        companion: 'family',
        preferences: {
          culture: 80,
          relaxation: 40,
          budget: 60
        },
        progress: 75,
        isFavorite: true,
        createdAt: '2023-09-15'
      },
      {
        id: 2,
        title: '周末休闲二日游',
        startDate: '2023-09-23',
        endDate: '2023-09-24',
        coverImage: 'https://copyright.bdstatic.com/vcg/creative/fa3d00f2dd0d2d2fc5b7f6e5d8ce63a1.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw==',
        themes: ['自然风光', '轻松休闲'],
        companion: 'friends',
        preferences: {
          culture: 30,
          relaxation: 80,
          budget: 50
        },
        progress: 45,
        isFavorite: false,
        createdAt: '2023-09-20'
      },
      {
        id: 3,
        title: '文化艺术之旅',
        startDate: '2023-11-05',
        endDate: '2023-11-07',
        coverImage: 'https://copyright.bdstatic.com/vcg/creative/10f2f032f8b98f0778c11ae5c7d5d8e6.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw==',
        themes: ['文化艺术', '博物馆'],
        companion: 'solo',
        preferences: {
          culture: 90,
          relaxation: 40,
          budget: 70
        },
        progress: 20,
        isFavorite: true,
        createdAt: '2023-10-28'
      }
    ]
  }
}

export default routeService