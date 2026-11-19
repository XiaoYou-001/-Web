export const pageTitles = {
  'public-share': '只读旅行分享',
  home: '探索旅行', login: '登录', register: '注册', attractions: '景点推荐', food: '美食探索',
  routes: '我的旅行', 'route-detail': '旅行详情', 'plan-compare': '方案对比', tickets: '票务中心',
  hotels: '住宿方案', 'customer-service': '旅行助手', chat: '驴友聊天',
  profile: '个人中心', 'itinerary-share': '行程分享', journal: '旅行手账', 'not-found': '页面未找到'
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

// Only accept local destinations; never return to an authentication form.
export function loginDestination(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return '/'
  const path = value.split(/[?#]/)[0]
  if (path === '/login' || path === '/register') return '/'
  return value
}
