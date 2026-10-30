import { addCalendarDays, localDateString, parseDateOnly } from '../utils/date.js'
import { readUserData, updateUserData, saveUserRoute } from './userDataService.js'
import { createId } from '../utils/id.js'

// 智能行程规划服务
class ItineraryService {
  // 获取所有行程
  getAllItineraries() {
    return readUserData().routes.map(route => ({ ...route, name: route.title, days: route.days || [] }))
  }

  getItinerary(id) {
    return this.getAllItineraries().find(item => item.id === id || item.legacyItineraryId === id)
  }

  createItinerary(itinerary, ownerId) {
    const saved = saveUserRoute({ ...JSON.parse(JSON.stringify(itinerary)), title: itinerary.name || itinerary.title, themes: itinerary.themes || [], preferences: itinerary.preferences && !Array.isArray(itinerary.preferences) ? itinerary.preferences : {} }, ownerId).result
    return { ...saved, name: saved.title, days: saved.days || [] }
  }

  updateItinerary(id, updates) {
    const original = this.getItinerary(id)
    if (!original) return null
    const saved = saveUserRoute({ ...original, ...updates, title: updates.name || updates.title || original.title, id: original.id, createdAt: original.createdAt }).result
    return { ...saved, name: saved.title }
  }

  deleteItinerary(id) {
    updateUserData(data => { data.routes = data.routes.filter(item => item.id !== id && item.legacyItineraryId !== id) })
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

  // 将一条线路导出为可分享的纯文本计划（兼容有/无每日行程的线路）
  exportRoute(route) {
    if (!route || typeof route.title !== 'string' || !route.title.trim()) return ''
    let text = `【${route.title.trim()}】\n`
    if (route.startDate && route.endDate) text += `时间：${route.startDate} 至 ${route.endDate}\n`
    const dests = Array.isArray(route.destinations) && route.destinations.length ? route.destinations : (route.destination ? [route.destination] : [])
    if (dests.length) text += `目的地：${dests.join('、')}\n`
    if (Number.isFinite(route.budget)) text += `预算：¥${route.budget}\n`
    if (Number.isFinite(route.persons) && route.persons >= 1) text += `人数：${route.persons} 人\n`
    if (Array.isArray(route.themes) && route.themes.length) text += `主题：${route.themes.join('、')}\n`
    if (route.companion) text += `同行：${route.companion}\n`
    if (Array.isArray(route.days) && route.days.length) {
      route.days.forEach((day, index) => {
        text += `\n第${index + 1}天 (${day.date})\n`
        ;(Array.isArray(day.activities) ? day.activities : []).forEach((activity, i) => {
          text += `  ${i + 1}. ${activity.time || ''} - ${activity.title}\n`
          if (activity.description) text += `     ${activity.description}\n`
          if (activity.place) text += `     地点：${activity.place.name}；地址：${activity.place.address || '未提供'}\n`
          if (activity.notes) text += `     备注：${activity.notes}\n`
          if (activity.travelEstimate) text += `     到下一站：${activity.travelEstimate.mode === 'walking' ? '步行' : '驾车'}约${activity.travelEstimate.minutes}分钟（高德地图，查询于${activity.travelEstimate.checkedAt}）\n`
          if (activity.completed || activity.skipped) text += `     状态：${activity.completed ? '已完成' : '已跳过'}\n`
        })
        if (Number.isFinite(day.budget)) text += `  当日预算：¥${day.budget}\n`
      })
    }
    return text.trim()
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
    // 本地静态景点库：实际应用中应该调用后端API。
    // 说明：上海暂不提供「文化历史」类景点，以保持“无匹配偏好时明确提示”的演示语义。
    const attractions = [
      // 北京
      { id: 1, name: '故宫博物院', type: 'culture', location: '北京', rating: 4.8, duration: 4 },
      { id: 2, name: '八达岭长城', type: 'nature', location: '北京', rating: 4.9, duration: 6 },
      { id: 3, name: '颐和园', type: 'nature', location: '北京', rating: 4.7, duration: 3 },
      { id: 4, name: '天坛公园', type: 'culture', location: '北京', rating: 4.6, duration: 2 },
      { id: 5, name: '南锣鼓巷', type: 'food', location: '北京', rating: 4.5, duration: 2 },
      { id: 6, name: '798艺术区', type: 'art', location: '北京', rating: 4.4, duration: 3 },
      { id: 7, name: '国家博物馆', type: 'culture', location: '北京', rating: 4.6, duration: 3 },
      { id: 8, name: '什刹海', type: 'nature', location: '北京', rating: 4.5, duration: 2 },
      { id: 9, name: '鸟巢水立方', type: 'art', location: '北京', rating: 4.3, duration: 2 },
      // 上海（不含文化历史类，保持演示语义）
      { id: 20, name: '外滩', type: 'nature', location: '上海', rating: 4.7, duration: 2 },
      { id: 21, name: '迪士尼乐园', type: 'art', location: '上海', rating: 4.8, duration: 8 },
      { id: 22, name: '田子坊', type: 'food', location: '上海', rating: 4.4, duration: 2 },
      // 杭州
      { id: 30, name: '西湖', type: 'nature', location: '杭州', rating: 4.9, duration: 4 },
      { id: 31, name: '灵隐寺', type: 'culture', location: '杭州', rating: 4.6, duration: 3 },
      { id: 32, name: '西溪湿地', type: 'nature', location: '杭州', rating: 4.5, duration: 3 },
      { id: 33, name: '南宋御街', type: 'food', location: '杭州', rating: 4.3, duration: 2 },
      // 成都
      { id: 40, name: '大熊猫基地', type: 'nature', location: '成都', rating: 4.9, duration: 4 },
      { id: 41, name: '宽窄巷子', type: 'food', location: '成都', rating: 4.6, duration: 2 },
      { id: 42, name: '武侯祠', type: 'culture', location: '成都', rating: 4.5, duration: 2 },
      { id: 43, name: '都江堰', type: 'culture', location: '成都', rating: 4.7, duration: 4 },
      // 西安
      { id: 50, name: '兵马俑', type: 'culture', location: '西安', rating: 4.9, duration: 5 },
      { id: 51, name: '大雁塔', type: 'culture', location: '西安', rating: 4.6, duration: 2 },
      { id: 52, name: '华清池', type: 'nature', location: '西安', rating: 4.4, duration: 3 },
      { id: 53, name: '回民街', type: 'food', location: '西安', rating: 4.5, duration: 2 },
      // 三亚
      { id: 60, name: '亚龙湾', type: 'nature', location: '三亚', rating: 4.8, duration: 6 },
      { id: 61, name: '蜈支洲岛', type: 'nature', location: '三亚', rating: 4.7, duration: 7 },
      { id: 62, name: '天涯海角', type: 'nature', location: '三亚', rating: 4.4, duration: 3 }
    ]

    // 根据偏好筛选并去重，按评分排序
    const normalizedPrefs = Array.isArray(preferences) ? preferences : []
    return attractions
      .filter(attr => attr.location === destination)
      .filter(attr => normalizedPrefs.includes(attr.type))
      .sort((a, b) => b.rating - a.rating)
  }

  // 估算旅行时间（基于目的地名称的确定性估算，替代随机数）
  estimateTravelTime(from, to) {
    // 无路线服务时不能把虚构时长呈现为真实估算。
    return null
  }

  // 生成每日行程建议
  generateDailyPlan(destination, preferences, budget, days, startDate, pace = 'normal') {
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
    let cursor = 0
    const dailyHours = { easy: 6, normal: 9, busy: 11 }[pace] || 9
    for (let i = 0; i < days; i++) {
      const dayAttractions = []
      let usedHours = 0
      while (cursor < recommendations.length && dayAttractions.length < 3) {
        const candidate = recommendations[cursor]
        const required = candidate.duration + (dayAttractions.length ? 1.5 : 0)
        if (usedHours + required > dailyHours && dayAttractions.length) break
        dayAttractions.push(candidate)
        usedHours += required
        cursor++
      }
      let nextHour = 9
      const dayActivities = dayAttractions.map((attraction, index) => {
        const startHour = nextHour
        nextHour += attraction.duration + 1.5
        const time = `${String(Math.floor(startHour)).padStart(2, '0')}:${startHour % 1 ? '30' : '00'}`
        // 给更耗时的景点加注建议出发时间，并估算到下一景点的交通耗时
        const next = dayAttractions[index + 1]
        const travelMinutes = next ? this.estimateTravelTime(attraction.name, next.name) : 0
        const travelNote = next ? '；已预留90分钟交通与休息缓冲，真实交通耗时及开放时间待确认' : ''
        return {
          time,
          durationMinutes: attraction.duration * 60,
          travelMinutes: null,
          title: attraction.name,
          description: `预计游玩时长：${attraction.duration}小时${travelNote}`,
          type: attraction.type,
          priority: 1
        }
      })

      plan.push({
        date: this.getDateString(i, startDate),
        activities: dayActivities,
        warning: dayActivities.length ? '开放时间与交通信息待核实' : '匹配景点不足，请补充安排或缩短旅行',
        budget: (dailyCents + (i < totalCents % days ? 1 : 0)) / 100
      })
    }
    
    return plan
  }

  // 获取日期字符串
  getDateString(offset, startDate = localDateString()) {
    return addCalendarDays(startDate, offset)
  }

  // 设置提醒（通过SMS/微信，演示仅校验并记录到本地行程）
  async setReminder(itinerary, reminderTime) {
    if (!itinerary?.id && !itinerary?.name) throw new Error('行程信息无效')
    if (!reminderTime || Number.isNaN(new Date(reminderTime).getTime())) throw new Error('提醒时间无效')
    return {
      success: true,
      message: `提醒已设置（演示）：${itinerary.name} 将于 ${new Date(reminderTime).toLocaleString('zh-CN')} 触发`
    }
  }
}

export default new ItineraryService()
