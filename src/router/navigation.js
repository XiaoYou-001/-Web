export const pageTitles = {
  home: '探索旅行', login: '登录', register: '注册', attractions: '景点推荐',
  routes: '线路制定', 'route-detail': '线路详情', tickets: '票务中心',
  hotels: '酒店订购', 'customer-service': '旅行客服', chat: '驴友聊天',
  profile: '个人中心', 'itinerary-share': '行程分享', 'not-found': '页面未找到'
}

export function scrollBehavior(to, from, savedPosition) {
  if (savedPosition) return savedPosition
  // 同一页面修改筛选条件时保留当前位置。
  if (to.path === from.path) return false
  return { left: 0, top: 0 }
}

export function pageTitle(name) {
  return `${pageTitles[name] || '旅行计划'} · 智绘旅游`
}
