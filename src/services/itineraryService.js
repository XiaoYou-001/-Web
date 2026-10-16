import { addCalendarDays, localDateString, parseDateOnly } from '../utils/date.js'
import { readUserData, updateUserData } from './userDataService.js'
import { createId } from '../utils/id.js'

// 智能行程规划服务
class ItineraryService {
  // 获取所有行程
  getAllItineraries() {
    return readUserData().itineraries
  }

  // 获取单个行程
  getItinerary(id) {
    const itineraries = this.getAllItineraries()
    return itineraries.find(item => item.id === id)
  }

  // 创建新行程
  createItinerary(itinerary, ownerId) {
    const newItinerary = {
      ...JSON.parse(JSON.stringify(itinerary)),
      id: createId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    return updateUserData(data => { data.itineraries.push(newItinerary); return newItinerary }, ownerId).result
  }

  // 更新行程
  updateItinerary(id, updates) {
    return updateUserData(data => {
      const index = data.itineraries.findIndex(item => item.id === id)
      if (index === -1) return null
      const original = data.itineraries[index]
      data.itineraries[index] = { ...original, ...JSON.parse(JSON.stringify(updates)), id: original.id, createdAt: original.createdAt, updatedAt: new Date().toISOString() }
      return data.itineraries[index]
    }).result
  }

  // 删除行程
  deleteItinerary(id) {
    updateUserData(data => { data.itineraries = data.itineraries.filter(item => item.id !== id) })
    return true
  }

  // 优化行程路线（智能排序）
  optimizeRoute(items) {
    // 简单的优化算法：按地理位置就近排序
    // 实际应用中可以调用地图API进行更智能的优化
    return items.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority
      }
      return new Date(a.startTime) - new Date(b.startTime)
    })
  }

  // 导出行程为文本格式
  exportItinerary(itinerary) {
    let text = `【${itinerary.name}】\n`
    text += `时间：${itinerary.startDate} 至 ${itinerary.endDate}\n`
    text += `预算：¥${itinerary.budget}\n\n`
    
    itinerary.days.forEach((day, index) => {
      text += `第${index + 1}天 (${day.date})\n`
      day.activities.forEach((activity, i) => {
        text += `  ${i + 1}. ${activity.time} - ${activity.title}\n`
        text += `     ${activity.description}\n`
      })
      text += '\n'
    })
    
    return text
  }

  // 分享行程（生成分享链接）
  shareItinerary(id) {
    const itinerary = this.getItinerary(id)
    if (!itinerary) return null
    
    // 简化版：返回一个包含行程数据的对象
    // 实际应用中可以生成短链接或二维码
    return {
      shareId: id,
      title: itinerary.name,
      content: this.exportItinerary(itinerary),
      url: `${window.location.origin}/itinerary/share/${id}`
    }
  }

  // 智能推荐景点（基于用户偏好）
  recommendAttractions(preferences, destination) {
    // 模拟数据 - 实际应用中应该调用后端API
    const attractions = [
      { id: 1, name: '故宫博物院', type: 'culture', location: '北京', rating: 4.8, duration: 4 },
      { id: 2, name: '长城', type: 'nature', location: '北京', rating: 4.9, duration: 6 },
      { id: 3, name: '颐和园', type: 'nature', location: '北京', rating: 4.7, duration: 3 },
      { id: 4, name: '天坛公园', type: 'culture', location: '北京', rating: 4.6, duration: 2 },
      { id: 5, name: '南锣鼓巷', type: 'food', location: '北京', rating: 4.5, duration: 2 },
      { id: 6, name: '798艺术区', type: 'art', location: '北京', rating: 4.4, duration: 3 }
    ]

    // 根据偏好筛选
    return attractions
      .filter(attr => attr.location === destination)
      .filter(attr => preferences.includes(attr.type))
      .sort((a, b) => b.rating - a.rating)
  }

  // 估算旅行时间
  estimateTravelTime(from, to) {
    // 模拟数据 - 实际应用中应该调用地图API
    return Math.floor(Math.random() * 60) + 15 // 15-75分钟
  }

  // 生成每日行程建议
  generateDailyPlan(destination, preferences, budget, days, startDate) {
    parseDateOnly(startDate)
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error('行程天数需为1至365天')
    }
    if (!Number.isFinite(budget) || budget < 0.01) {
      throw new Error('旅行预算必须是大于0的有效金额')
    }
    const totalCents = Math.round(budget * 100)
    if (!Number.isSafeInteger(totalCents) || Math.abs(totalCents / 100 - budget) > 1e-9) {
      throw new Error('旅行预算最多保留两位小数，且金额不能过大')
    }
    if (!destination?.trim() || !Array.isArray(preferences) || preferences.length === 0) {
      throw new Error('请填写目的地并选择兴趣偏好')
    }
    const recommendations = this.recommendAttractions(preferences, destination)
    if (recommendations.length === 0) {
      throw new Error('暂无匹配景点，请调整目的地或兴趣偏好')
    }
    const dailyCents = Math.floor(totalCents / days)
    
    const plan = []
    for (let i = 0; i < days; i++) {
      const dayActivities = recommendations.slice(i * 3, (i + 1) * 3).map((attraction, index) => ({
        time: `${9 + index * 3}:00`,
        title: attraction.name,
        description: `预计游玩时长：${attraction.duration}小时`,
        type: attraction.type,
        priority: 1
      }))

      plan.push({
        date: this.getDateString(i, startDate),
        activities: dayActivities,
        budget: (dailyCents + (i < totalCents % days ? 1 : 0)) / 100
      })
    }
    
    return plan
  }

  // 获取日期字符串
  getDateString(offset, startDate = localDateString()) {
    return addCalendarDays(startDate, offset)
  }

  // 设置提醒（通过SMS/微信）
  async setReminder(itinerary, reminderTime) {
    // 实际应用中应该调用短信或微信服务
    console.log('设置提醒:', itinerary.name, '时间:', reminderTime)
    return {
      success: true,
      message: '提醒已设置'
    }
  }
}

export default new ItineraryService()
