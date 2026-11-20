import assert from 'node:assert/strict'
import { launch } from './cdp.mjs'
import { registerAndLogin, createTravel, openTravel, clickText } from './helpers.mjs'

const page = await launch({ port: 9248 })
let passed = 0
function check(name, value) {
  assert.ok(value, name)
  console.log('PASS', name)
  passed++
}
try {
  await registerAndLogin(page, { phone: '136' + String(Date.now()).slice(-8) })
  const date = '2030-10-03'
  const id = await createTravel(page, { title: '首屏行程', startDate: date, endDate: date })
  const activities = [
    { title: '早餐', time: '08:00', durationMinutes: 45 },
    { title: '午餐', time: '12:00', durationMinutes: 60 },
    { title: '公园', time: '13:20', travelMinutes: 20 },
    { title: '博物馆', time: '14:00', timeLocked: true, place: { name: '博物馆', location: [116.4, 39.9] } }
  ]
  await page.evaluate(`(() => {
    const key = 'travel_data:v1:' + encodeURIComponent(JSON.parse(localStorage.currentUser).id)
    const data = JSON.parse(localStorage.getItem(key))
    Object.assign(data.routes.find(route => String(route.id) === ${JSON.stringify(id)}), {
      days: ${JSON.stringify([{ date, activities }])}, lifecycle: 'ready', timeZone: 'Asia/Shanghai'
    })
    localStorage.setItem(key, JSON.stringify(data))
  })()`)
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const ActualDate = Date
    window.setTravelClock = value => { window.tripTime = ActualDate.parse(value) }
    setTravelClock('2030-10-03T04:30:00Z')
    window.Date = class extends ActualDate {
      constructor(...args) { super(...(args.length ? args : [window.tripTime])) }
      static now() { return window.tripTime }
    }
  ` })
  await page.viewport(390, 844, { mobile: true })
  await openTravel(page, id)
  await page.waitFor('!!document.querySelector(".today-trip")')
  check('首屏可直接看到当天入口', await page.evaluate(`(() => {
    const entry = document.querySelector('.today-trip header button').getBoundingClientRect()
    return entry.top >= 0 && entry.bottom <= innerHeight
  })()`))
  const card = await page.text('.today-trip')
  check('午餐进行中、公园为下一站、14:00 预约前须 13:40 出发', card.includes('当前活动') && card.includes('午餐') &&
    card.includes('下一固定预约') && card.includes('最晚 13:40 从「公园」出发'))
  check('预约有真实坐标时提供步行导航', await page.evaluate('!!document.querySelector(".today-trip a[href*=navigation]")'))
  await clickText(page, '.today-trip summary', '待补记')
  check('过期早餐只出现在待补记列表', (await page.text('.today-trip .record')).includes('早餐'))
  await clickText(page, '.today-trip .record button', '已完成')
  check('确认后待补记列表清空', !await page.evaluate('!!document.querySelector(".today-trip .record")'))
  await clickText(page, '.today-trip header button', '查看当天安排')
  check('详情入口定位当天出行安排', await page.evaluate('document.activeElement === document.querySelector(".outing-plan h3")'))
  check('出行模式下一站显示公园', (await page.text('.outing-next')).includes('13:20 公园'))
  await page.evaluate("setTravelClock('2030-10-03T08:00:00Z'); document.dispatchEvent(new Event('visibilitychange'))")
  await page.waitFor('document.querySelector(".outing-next").innerText.includes("没有后续定时活动")')
  check('回到前台重算时间，不再把过时活动误报为下一站', (await page.text('.today-trip summary')).includes('2'))
  check('末站缺少停留时长时显示结束待确认', (await page.text('.today-trip .stop')).includes('已到开始时间，结束待确认'))
  await openTravel(page, id)
  check('重新进入后，早餐的完成状态保留', !await page.evaluate('!!document.querySelector(".today-trip .record")'))
  console.log(`${passed}/${passed} passed`)
} finally {
  await page.close()
}
