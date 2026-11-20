import { getCurrentUser } from '../services/authService.js'
import { readUserData } from '../services/userDataService.js'
import { preparedAt } from '../services/offlineTravel.js'
import { todayItinerary } from '../utils/todayItinerary.js'

const base = new URL('.', document.currentScript.src)
const root = document.getElementById('reader')
function add(parent, tag, text) {
  const element = document.createElement(tag)
  element.textContent = text ?? ''
  parent.append(element)
  return element
}
function link(parent, text, path) {
  const a = add(parent, 'a', text)
  a.href = new URL(path, base).href
}
function stamp(value) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '旧记录未记录'
}
function renderTrip(trip, owner) {
  add(root, 'h1', trip.title)
  add(root, 'p', [trip.startDate, trip.endDate].join(' 至 '))
  add(root, 'small', '行程最后保存 ' + stamp(trip.savedAt) + ' · 离线资源准备 ' + stamp(preparedAt(owner, trip.id)))
  const today = todayItinerary(trip)
  const overview = add(root, 'section')
  add(overview, 'h2', '今日行程 · ' + today.date)
  const bookingNext = today.next && today.next.index === today.nextBooking?.index
  const rows = [['当前活动', today.current], [bookingNext ? '下一站 · 下一项预约' : '下一站', today.next]]
  if (!bookingNext) rows.push(['下一项预约', today.nextBooking])
  for (const [label, row] of rows) {
    if (!row) continue
    add(overview, 'h3', label + ' · ' + row.activity.time + ' ' + row.activity.title)
    if (row.timingNote) add(overview, 'p', row.timingNote)
    if (row.activity.place?.address) add(overview, 'p', row.activity.place.address)
  }
  if (today.latestDeparture) add(overview, 'p', '最晚 ' + today.latestDeparture.time + ' 从' + today.latestDeparture.from + '出发')
  if (!today.current && !today.next) add(overview, 'p', '今天没有正在进行或即将开始的定时活动。')
  for (const day of trip.days || []) {
    const section = add(root, 'section')
    add(section, 'h2', day.date)
    if (!day.activities?.length) add(section, 'p', '当天尚未安排活动')
    for (const activity of day.activities || []) {
      const row = add(section, 'article')
      add(row, 'h3', [activity.time, activity.title, activity.timeLocked ? '（预约锁定）' : ''].filter(Boolean).join(' '))
      for (const detail of [activity.place?.name, activity.place?.address, activity.description, activity.notes]) {
        if (detail) add(row, 'p', detail)
      }
    }
  }
  link(root, '返回离线旅行列表', 'offline.html')
}
function render() {
  root.replaceChildren()
  if (document.hidden) return
  try {
    const owner = getCurrentUser()?.id
    if (!owner) { add(root, 'h1', '请登录后查看离线旅行'); link(root, '联网登录', 'login'); return }
    const trips = readUserData(owner).routes.filter(trip => preparedAt(owner, trip.id))
    const path = location.pathname.slice(base.pathname.length)
    const id = path.startsWith('routes/') ? decodeURIComponent(path.slice(7).replace(/\/$/, '')) : new URLSearchParams(location.search).get('trip')
    if (id) {
      const trip = trips.find(item => String(item.id) === id)
      if (trip) renderTrip(trip, owner)
      else { add(root, 'h1', '当前账号未保存这段离线行程'); link(root, '查看离线旅行列表', 'offline.html') }
      return
    }
    add(root, 'h1', '离线旅行')
    if (!trips.length) add(root, 'p', '此账号还没有离线旅行。联网时，在旅行工作台点击“保存到此设备”。')
    for (const trip of trips) {
      const row = add(root, 'article')
      link(row, trip.title, 'offline.html?trip=' + encodeURIComponent(trip.id))
      add(row, 'p', '行程最后保存 ' + stamp(trip.savedAt))
    }
  } catch {
    root.replaceChildren()
    add(root, 'p', '本机的旅行记录无法读取，请联网检查账号和浏览器存储。')
  }
}
window.addEventListener('storage', render)
window.addEventListener('pageshow', render)
window.addEventListener('pagehide', () => root.replaceChildren())
document.addEventListener('visibilitychange', () => document.hidden ? root.replaceChildren() : render())
render()
