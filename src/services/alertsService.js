import { readUserData, createUserSubscription, updateUserSubscription, deleteUserSubscription, createPriceAlert } from './userDataService.js'

// 稳定的字符串散列，用于确定性模拟，避免随机数导致结果不可复现
function stableHash(str) {
  let hash = 0
  const key = String(str ?? '')
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return hash
}

// 价格监控与优惠提醒服务
class AlertsService {
  // 获取所有订阅
  getAllSubscriptions() {
    return readUserData().subscriptions
  }

  // 创建价格订阅
  createSubscription(subscription, ownerId) {
    return createUserSubscription(subscription, ownerId).result
  }

  // 更新订阅
  updateSubscription(id, updates) {
    return updateUserSubscription(id, updates).result
  }

  // 删除订阅
  deleteSubscription(id) {
    deleteUserSubscription(id)
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
        image: '/images/web/nav-4.jpg',
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
        image: '/images/web/nav-1.png',
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
        image: '/images/web/nav-3.jpg',
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
        image: '/images/web/nav-4.jpg',
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
        image: '/images/web/nav-3.jpg',
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
        image: '/images/web/nav-1.png',
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

  // 返回该订阅在给定检查次数下的“模拟市价”（确定性，价格随时间逐步下探）
  simulatePrice(currentPrice, subscriptionId, checkIndex = 0) {
    const base = Number.isFinite(currentPrice) ? currentPrice : 0
    if (base <= 0) return base
    // 每次检查约降价 1%~3%，检查次数越多越接近目标价
    const magnitude = 0.01 + (stableHash(subscriptionId ?? '') % 3) / 100
    const drop = base * magnitude * (checkIndex + 1)
    return Math.max(1, Math.round(base - drop))
  }

  // 检查价格变化（确定性模拟）：当模拟市价不高于目标价时触发降价提醒
  // 允许外部传入 simulatedPrice 以覆盖模拟结果（便于测试与手动触发）
  async checkPriceChanges(subscription, { simulatedPrice, checkIndex = 0 } = {}) {
    const base = Number.isFinite(subscription.currentPrice) ? subscription.currentPrice : 0
    const target = Number.isFinite(subscription.targetPrice) ? subscription.targetPrice : base
    const current = Number.isFinite(simulatedPrice)
      ? simulatedPrice
      : this.simulatePrice(base, subscription.id, checkIndex)

    if (current <= target) {
      return {
        hasChange: true,
        oldPrice: base,
        newPrice: current,
        change: current - base,
        changePercent: base > 0 ? Math.round(((current - base) / base) * 100) : 0
      }
    }
    return { hasChange: false, oldPrice: base, newPrice: current }
  }

  // 发送提醒通知：将提醒记录持久化到当前账号的本地数据，供「已触发的提醒」展示
  async sendNotification(subscription, priceChange) {
    const direction = priceChange.change <= 0 ? '降价' : '上涨'
    const message = `【价格提醒】${subscription.itemName} 价格${direction}至 ${priceChange.newPrice}元，较订阅时（${priceChange.oldPrice}元）变动 ${Math.abs(priceChange.change)}元`
    try {
      createPriceAlert({
        type: subscription.type || 'ticket',
        itemName: subscription.itemName,
        subscriptionId: subscription.id,
        message,
        oldPrice: priceChange.oldPrice,
        newPrice: priceChange.newPrice
      })
    } catch {
      return { success: false, message: '提醒保存失败' }
    }
    return {
      success: true,
      message,
      channels: ['local']
    }
  }

  // 检查单个订阅（按 id），触发降价时持久化提醒
  async checkSubscription(id, { simulatedPrice, checkIndex = 0 } = {}) {
    const subscription = readUserData().subscriptions.find(sub => sub.id === id)
    if (!subscription) throw new Error('该订阅不存在')
    if (!subscription.active) return { subscription, priceChange: null, triggered: false, reason: 'inactive' }
    const priceChange = await this.checkPriceChanges(subscription, { simulatedPrice, checkIndex })
    if (!priceChange.hasChange) return { subscription, priceChange, triggered: false }
    const notification = await this.sendNotification(subscription, priceChange)
    return { subscription, priceChange, triggered: true, notification }
  }

  // 轮询所有订阅的价格变化（确定性模拟）
  async pollAllSubscriptions({ checkIndex = 0 } = {}) {
    const subscriptions = readUserData().subscriptions.filter(sub => sub.active)
    const notifications = []
    for (const subscription of subscriptions) {
      const priceChange = await this.checkPriceChanges(subscription, { checkIndex })
      if (priceChange.hasChange) {
        const notification = await this.sendNotification(subscription, priceChange)
        notifications.push({ subscription, priceChange, notification })
      }
    }
    return notifications
  }

  // 检查全部订阅并返回触发结果（持久化触发的提醒）
  async checkAllNow({ checkIndex = 0 } = {}) {
    const subscriptions = readUserData().subscriptions.filter(sub => sub.active)
    const results = []
    for (const subscription of subscriptions) {
      const priceChange = await this.checkPriceChanges(subscription, { checkIndex })
      if (priceChange.hasChange) {
        const notification = await this.sendNotification(subscription, priceChange)
        results.push({ subscription, priceChange, notification })
      }
    }
    return results
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
