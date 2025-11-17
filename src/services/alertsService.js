// 价格监控与优惠提醒服务
class AlertsService {
  constructor() {
    this.subscriptionsKey = 'price_subscriptions'
    this.dealsKey = 'current_deals'
  }

  // 获取所有订阅
  getAllSubscriptions() {
    const stored = localStorage.getItem(this.subscriptionsKey)
    return stored ? JSON.parse(stored) : []
  }

  // 创建价格订阅
  createSubscription(subscription) {
    const subscriptions = this.getAllSubscriptions()
    const newSubscription = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      active: true,
      ...subscription
    }
    subscriptions.push(newSubscription)
    localStorage.setItem(this.subscriptionsKey, JSON.stringify(subscriptions))
    return newSubscription
  }

  // 更新订阅
  updateSubscription(id, updates) {
    const subscriptions = this.getAllSubscriptions()
    const index = subscriptions.findIndex(sub => sub.id === id)
    if (index !== -1) {
      subscriptions[index] = {
        ...subscriptions[index],
        ...updates
      }
      localStorage.setItem(this.subscriptionsKey, JSON.stringify(subscriptions))
      return subscriptions[index]
    }
    return null
  }

  // 删除订阅
  deleteSubscription(id) {
    const subscriptions = this.getAllSubscriptions()
    const filtered = subscriptions.filter(sub => sub.id !== id)
    localStorage.setItem(this.subscriptionsKey, JSON.stringify(filtered))
    return true
  }

  // 获取所有优惠信息
  getAllDeals() {
    // 模拟优惠数据 - 实际应用中应该从后端API获取
    return [
      {
        id: '1',
        type: 'hotel',
        title: '希尔顿酒店限时特惠',
        originalPrice: 899,
        currentPrice: 599,
        discount: 33,
        location: '北京',
        validUntil: '2025-11-15',
        image: 'https://qcloud.dpfile.com/pc/cPtCyE-pRHGSrv9jJhbNmVtkCAUPhLjMdrcHOAVWLOBQqusOJ_ESiPdf_7my1mHB.jpg',
        description: '豪华大床房，含双早',
        hot: true
      },
      {
        id: '2',
        type: 'ticket',
        title: '故宫门票特价',
        originalPrice: 60,
        currentPrice: 45,
        discount: 25,
        location: '北京',
        validUntil: '2025-11-20',
        image: 'https://pic.rmb.bdstatic.com/bjh/news/449d1ca673335ddb00d9e3d5fc7be51a.png',
        description: '成人票，当日有效',
        hot: true
      },
      {
        id: '3',
        type: 'attraction',
        title: '欢乐谷套票优惠',
        originalPrice: 280,
        currentPrice: 199,
        discount: 29,
        location: '北京',
        validUntil: '2025-11-12',
        image: 'https://qcloud.dpfile.com/pc/VTpIKjEjmJ35OYWV2YzxOugM6fXZYGQroGimW05NkfHxFSC0ofrhC9zwMlfBTCHs.jpg',
        description: '含所有游乐项目',
        hot: false
      },
      {
        id: '4',
        type: 'hotel',
        title: '如家酒店周末特惠',
        originalPrice: 299,
        currentPrice: 199,
        discount: 33,
        location: '上海',
        validUntil: '2025-11-10',
        image: 'https://qcloud.dpfile.com/pc/cPtCyE-pRHGSrv9jJhbNmVtkCAUPhLjMdrcHOAVWLOBQqusOJ_ESiPdf_7my1mHB.jpg',
        description: '标准双人间',
        hot: false
      },
      {
        id: '5',
        type: 'ticket',
        title: '迪士尼早鸟票',
        originalPrice: 599,
        currentPrice: 499,
        discount: 17,
        location: '上海',
        validUntil: '2025-11-25',
        image: 'https://qcloud.dpfile.com/pc/VTpIKjEjmJ35OYWV2YzxOugM6fXZYGQroGimW05NkfHxFSC0ofrhC9zwMlfBTCHs.jpg',
        description: '成人票，任意日期使用',
        hot: true
      },
      {
        id: '6',
        type: 'attraction',
        title: '东方明珠观光票',
        originalPrice: 180,
        currentPrice: 138,
        discount: 23,
        location: '上海',
        validUntil: '2025-11-18',
        image: 'https://pic.rmb.bdstatic.com/bjh/news/449d1ca673335ddb00d9e3d5fc7be51a.png',
        description: '含上中下三个观光层',
        hot: false
      }
    ]
  }

  // 筛选优惠
  filterDeals(filters = {}) {
    let deals = this.getAllDeals()
    
    if (filters.type) {
      deals = deals.filter(deal => deal.type === filters.type)
    }
    
    if (filters.location) {
      deals = deals.filter(deal => deal.location === filters.location)
    }
    
    if (filters.maxPrice) {
      deals = deals.filter(deal => deal.currentPrice <= filters.maxPrice)
    }
    
    if (filters.minDiscount) {
      deals = deals.filter(deal => deal.discount >= filters.minDiscount)
    }
    
    if (filters.onlyHot) {
      deals = deals.filter(deal => deal.hot)
    }
    
    return deals
  }

  // 获取热门优惠
  getHotDeals() {
    return this.getAllDeals().filter(deal => deal.hot)
  }

  // 检查价格变化（模拟）
  async checkPriceChanges(subscription) {
    // 模拟价格监控 - 实际应用中应该调用后端API
    const randomChange = Math.random()
    
    if (randomChange > 0.7) {
      return {
        hasChange: true,
        oldPrice: subscription.targetPrice + 100,
        newPrice: subscription.targetPrice - 50,
        change: -150,
        changePercent: -15
      }
    }
    
    return { hasChange: false }
  }

  // 发送提醒通知
  async sendNotification(subscription, priceChange) {
    // 实际应用中应该调用短信或微信服务
    const message = `【价格提醒】${subscription.itemName} 价格变动：${priceChange.oldPrice}元 → ${priceChange.newPrice}元，降价${Math.abs(priceChange.change)}元！`
    
    console.log('发送通知:', message)
    
    return {
      success: true,
      message: '通知已发送',
      channels: ['sms', 'wechat']
    }
  }

  // 轮询所有订阅的价格变化
  async pollAllSubscriptions() {
    const subscriptions = this.getAllSubscriptions().filter(sub => sub.active)
    const notifications = []
    
    for (const subscription of subscriptions) {
      const priceChange = await this.checkPriceChanges(subscription)
      
      if (priceChange.hasChange) {
        await this.sendNotification(subscription, priceChange)
        notifications.push({
          subscription,
          priceChange
        })
      }
    }
    
    return notifications
  }

  // 获取订阅统计
  getSubscriptionStats() {
    const subscriptions = this.getAllSubscriptions()
    const active = subscriptions.filter(sub => sub.active).length
    const total = subscriptions.length
    
    return {
      total,
      active,
      inactive: total - active,
      byType: {
        hotel: subscriptions.filter(sub => sub.type === 'hotel').length,
        ticket: subscriptions.filter(sub => sub.type === 'ticket').length,
        attraction: subscriptions.filter(sub => sub.type === 'attraction').length
      }
    }
  }

  // 推荐优惠（基于用户订阅偏好）
  getRecommendedDeals() {
    const subscriptions = this.getAllSubscriptions()
    const deals = this.getAllDeals()
    
    // 基于订阅类型推荐
    const preferredTypes = [...new Set(subscriptions.map(sub => sub.type))]
    
    return deals.filter(deal => 
      preferredTypes.includes(deal.type) || deal.hot
    ).slice(0, 6)
  }
}

export default new AlertsService()
