import { apiConfig } from '../config/api.js'
import { ApiError, createApiClient } from './apiClient.js'

// 当前页面使用本地 travel store；仅显式配置真实线路后端时启用此适配器。
export function createRouteService({ client = apiConfig.routesBaseUrl ? createApiClient({ baseUrl: apiConfig.routesBaseUrl }) : null } = {}) {
  const request = async (path, options) => {
    if (!client) throw new ApiError('NOT_CONFIGURED')
    return client.request(path, options)
  }
  const resourceId = id => {
    if (!['string', 'number'].includes(typeof id) || !String(id).trim() || ['.', '..'].includes(String(id))) throw new ApiError('VALIDATION')
    return encodeURIComponent(String(id))
  }
  return {
    getUserRoutes: (params = {}, options = {}) => request('routes', { ...options, params }),
    getSmartRecommendations: (preferences = {}, options = {}) => request('routes/recommendations', { ...options, method: 'POST', json: preferences }),
    getRouteDetail: async (id, options = {}) => request('routes/' + resourceId(id), options),
    createRoute: (route, options = {}) => request('routes', { ...options, method: 'POST', json: route }),
    updateRoute: async (id, route, options = {}) => request('routes/' + resourceId(id), { ...options, method: 'PUT', json: route }),
    deleteRoute: async (id, options = {}) => request('routes/' + resourceId(id), { ...options, method: 'DELETE' }),
    toggleFavorite: async (id, options = {}) => request('routes/' + resourceId(id) + '/favorite', { ...options, method: 'PATCH' }),
    getAttractionDetail: async (id, options = {}) => request('attractions/' + resourceId(id), options),
    /**
     * 显式演示推荐数据，不自动掩盖接口失败
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
          coverImage: '/images/web/route-1.jpg'
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
          coverImage: '/images/web/route-2.jpg'
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
          coverImage: '/images/web/route-3.jpg'
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
          coverImage: '/images/web/route-4.jpg'
        }
      ]
    },

    /**
     * 显式演示线路数据，不自动替代用户的真实线路
     * @returns {Array} 模拟用户线路列表
     */
    getMockUserRoutes() {
      return [
        {
          id: 1,
          title: '北京经典三日游',
          startDate: '2023-10-01',
          endDate: '2023-10-03',
          coverImage: '/images/web/route-1.jpg',
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
          coverImage: '/images/web/route-2.jpg',
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
          coverImage: '/images/web/route-3.jpg',
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
}

export const routeService = createRouteService()
export default routeService
