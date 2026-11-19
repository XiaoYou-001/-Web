// 功能 6：天气联动与备选安排 —— 真实 Open-Meteo 请求、备选、替换/撤销、失败与过期缓存、超出范围。
import { launch, sleep } from './cdp.mjs'
import { BASE, OUT, registerAndLogin, createTravel, clickText } from './helpers.mjs'

const stamp = String(Date.now()).slice(-8)
const phone = '135' + stamp
const results = []
const ok = (name, extra = '') => { results.push({ name, pass: true, extra }); console.log('PASS', name, extra) }
const bad = (name, extra = '') => { results.push({ name, pass: false, extra }); console.log('FAIL', name, extra) }
const check = (name, condition, extra = '') => condition ? ok(name, extra) : bad(name, extra)

const WEST_LAKE = [120.1551, 30.2741] // 高德 GCJ-02
const LINGYIN = [120.1010, 30.2408]
const PEOPLE_SQUARE = [121.4737, 31.2304]
const MUSEUM = [120.1602, 30.2520]
const THEATER = [120.2120, 30.2460]

const page = await launch({ port: 9227 })
page.on('Runtime.exceptionThrown', p => p.exceptionDetails && results.push({ name: 'runtime-exception', pass: false, extra: p.exceptionDetails.exception?.description || p.exceptionDetails.text }))

const place = (name, location) => ({ id: `place-${name}`, name, location, coordinateSystem: 'GCJ-02' })

async function currentKey() {
  return page.evaluate(`(() => {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null')
    return user && user.id ? 'travel_data:v1:' + encodeURIComponent(user.id) : null
  })()`)
}

async function seedRoute(routeId, mutateSource) {
  const res = await page.evaluate(`(() => {
    const key = ${JSON.stringify(await currentKey())}
    if (!key) return 'NO_KEY'
    const data = JSON.parse(localStorage.getItem(key) || 'null')
    if (!data) return 'NO_DATA'
    const route = (data.routes || []).find(r => String(r.id) === ${JSON.stringify(String(routeId))})
    if (!route) return 'NO_ROUTE'
    const mutate = ${mutateSource}
    mutate(route)
    localStorage.setItem(key, JSON.stringify(data))
    return 'OK'
  })()`)
  if (res !== 'OK') throw new Error('seedRoute: ' + res)
}

async function readRoute(routeId) {
  return page.evaluate(`(() => {
    const key = ${JSON.stringify(await currentKey())}
    if (!key) return null
    const data = JSON.parse(localStorage.getItem(key) || 'null')
    if (!data) return null
    return (data.routes || []).find(r => String(r.id) === ${JSON.stringify(String(routeId))}) || null
  })()`)
}

async function weatherCacheEntries() {
  return page.evaluate(`(() => Object.keys(localStorage)
    .filter(k => k.startsWith('weather_cache:v1:'))
    .map(k => { try { return { key: k, ...JSON.parse(localStorage.getItem(k)) } } catch { return { key: k, broken: true } } }))()`)
}

async function ageWeatherCache(daysAgo) {
  return page.evaluate(`(() => {
    let touched = 0
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('weather_cache:v1:')) continue
      try {
        const entry = JSON.parse(localStorage.getItem(key))
        entry.cachedAt = Date.now() - ${Math.round(daysAgo * 3600 * 1000)}
        localStorage.setItem(key, JSON.stringify(entry))
        touched++
      } catch { /* ignore */ }
    }
    return touched
  })()`)
}

async function openSchedule(routeId) {
  await page.goto(`${BASE}/routes/${routeId}`)
  await page.waitFor("!!document.querySelector('.route-detail')", { timeout: 12000 })
  await clickText(page, '.detail-tabs button', '日程编辑')
  await page.waitFor("!!document.querySelector('.travel-weather')", { timeout: 10000 })
  await sleep(300)
}

async function waitWeatherSettled() {
  // 不只等待“正在获取天气”消失：组件挂载前状态节点可能还不存在，必须等到真实结果或明确空态。
  await page.waitFor(`(() => {
    const root = document.querySelector('.travel-weather')
    if (!root) return false
    const state = root.querySelector('.tw-state')?.innerText || ''
    if (state.includes('正在获取天气')) return false
    const desc = root.querySelector('.tw-desc')?.innerText?.trim() || ''
    const temp = root.querySelector('.tw-temp')?.innerText?.trim() || ''
    const meta = root.querySelector('.tw-meta')?.innerText?.trim() || ''
    if (desc || temp || meta) return true
    return root.innerText.includes('无法匹配天气') || root.innerText.includes('暂无天气预报') || root.innerText.includes('天气获取失败') || root.innerText.includes('还没有确认坐标')
  })()`, { timeout: 30000 })
  await sleep(300)
}

async function weatherText() { return page.evaluate("document.querySelector('.travel-weather').innerText") }
async function metaText() { return page.evaluate("document.querySelector('.tw-meta')?.innerText || ''") }
async function headerTitle() { return page.evaluate("document.querySelector('.tw-head h4')?.innerText || ''") }

async function clickDay(index) {
  await page.evaluate(`document.querySelectorAll('.day-tab')[${index}].click()`)
  await sleep(300)
  await waitWeatherSettled()
}

async function activityTitles() {
  return page.evaluate("([...document.querySelectorAll('.activity-row .row-title')].map(el => el.value))")
}

async function rowTravelMinutes(index) {
  return page.evaluate(`(() => {
    const row = document.querySelectorAll('.activity-row')[${index}]
    if (!row) return 'NO_ROW'
    const label = [...row.querySelectorAll('label')].find(l => (l.textContent || '').includes('到下一站交通分钟'))
    return label ? label.querySelector('input').value : 'NO_LABEL'
  })()`)
}

async function findActivity(title) {
  return page.evaluate(`(() => {
    const el = [...document.querySelectorAll('.tw-activity')].find(item => (item.querySelector('.tw-activity-head strong')?.innerText || '').includes(${JSON.stringify(title)}))
    return el ? el.innerText : 'MISSING'
  })()`)
}

async function backupAction(title, action) {
  return page.evaluate(`(() => {
    const act = [...document.querySelectorAll('.tw-activity')].find(item => (item.querySelector('.tw-activity-head strong')?.innerText || '').includes('灵隐寺'))
    if (!act) return 'NO_ACT'
    const li = [...act.querySelectorAll('.tw-backup-list li')].find(item => item.innerText.includes(${JSON.stringify(title)}))
    if (!li) return 'NO_LI:' + act.innerText.slice(0, 200)
    const button = [...li.querySelectorAll('button')].find(item => item.innerText.trim() === ${JSON.stringify(action)})
    if (!button) return 'NO_BUTTON'
    button.click()
    return 'OK'
  })()`)
}

async function addManualBackup() {
  const res = await page.evaluate(`(() => {
    const act = [...document.querySelectorAll('.tw-activity')].find(item => (item.querySelector('.tw-activity-head strong')?.innerText || '').includes('灵隐寺'))
    if (!act) return 'NO_ACT'
    const form = act.querySelector('details.tw-add')
    if (!form) return 'NO_FORM'
    form.open = true
    const set = (el, value) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const inputs = [...form.querySelectorAll('input')]
    if (inputs.length < 4) return 'NO_INPUTS'
    set(inputs[0], '中国茶叶博物馆')
    set(inputs[1], '雨天室内展馆')
    set(inputs[2], '90')
    if (!inputs[3].checked) inputs[3].click()
    return 'OK'
  })()`)
  if (res !== 'OK') throw new Error('addManualBackup: ' + res)
  await page.evaluate("([...document.querySelectorAll('.tw-activity details.tw-add button[type=submit]')].find(b => b.innerText.includes('添加手动备选'))).click()")
  await sleep(350)
}

async function addPoolBackup() {
  const res = await page.evaluate(`(() => {
    const act = [...document.querySelectorAll('.tw-activity')].find(item => (item.querySelector('.tw-activity-head strong')?.innerText || '').includes('灵隐寺'))
    if (!act) return 'NO_ACT'
    act.querySelector('details.tw-add').open = true
    const select = act.querySelector('.tw-pool select')
    if (!select) return 'NO_SELECT'
    const option = [...select.options].find(item => item.textContent.includes('杭州大剧院'))
    if (!option) return 'NO_OPTION:' + [...select.options].map(item => item.textContent.trim()).join('|')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return 'OK'
  })()`)
  if (res !== 'OK') throw new Error('addPoolBackup: ' + res)
  await sleep(100)
  const clicked = await page.evaluate(`(() => {
    const act = [...document.querySelectorAll('.tw-activity')].find(item => (item.querySelector('.tw-activity-head strong')?.innerText || '').includes('灵隐寺'))
    const button = [...act.querySelectorAll('.tw-pool button')].find(item => item.innerText.includes('添加候选池备选'))
    if (!button || button.disabled) return 'NO_BUTTON'
    button.click()
    return 'OK'
  })()`)
  if (clicked !== 'OK') throw new Error('addPoolBackup click: ' + clicked)
  await sleep(350)
}

async function confirmSwap() {
  const res = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('.tw-swap-actions button')].find(item => item.innerText.includes('确认替换'))
    if (!button) return 'NO_BUTTON'
    button.click()
    return 'OK'
  })()`)
  if (res !== 'OK') throw new Error('confirmSwap: ' + res)
  await sleep(350)
}

async function blockWeather() {
  await page.send('Network.enable')
  await page.send('Network.setBlockedURLs', { urls: ['*api/weather*'] })
}
async function unblockWeather() {
  await page.send('Network.setBlockedURLs', { urls: [] })
}

async function clickRefresh() {
  await page.evaluate("document.querySelector('.tw-refresh').click()")
  await sleep(150)
  await page.waitFor("!document.querySelector('.tw-refresh') || !document.querySelector('.tw-refresh').disabled", { timeout: 30000 }).catch(() => {})
  await sleep(200)
}

try {
  await registerAndLogin(page, { phone })
  ok('注册并登录', phone)
  const travelId = await createTravel(page, { title: '天气备选测试旅行', startDate: '2026-11-18', endDate: '2026-11-20', persons: 2, budget: 3000 })
  ok('创建旅行', travelId)

  await seedRoute(travelId, `(route) => {
    route.days = [
      { date: '2026-11-18', activities: [
        { id: 'w1', time: '08:00', title: '西湖散步', category: '景点', durationMinutes: 90, travelMinutes: 20, travelEstimate: { minutes: 20, distanceMeters: 1200, mode: 'walking', origin: ${JSON.stringify(WEST_LAKE)}, destination: ${JSON.stringify(LINGYIN)}, checkedAt: '2026-11-17T01:00:00.000Z' }, place: ${JSON.stringify(place('西湖', WEST_LAKE))} },
        { id: 'w2', time: '10:00', title: '灵隐寺', category: '景点', durationMinutes: 120, travelMinutes: 15, place: ${JSON.stringify(place('灵隐寺', LINGYIN))}, backups: [{ id: 'b1', title: '浙江省博物馆', note: '雨天免费', durationMinutes: 90, indoor: true, source: 'manual', place: ${JSON.stringify(place('浙江省博物馆', MUSEUM))}, createdAt: '2026-11-15T00:00:00.000Z' }] },
        { id: 'w3', time: '12:00', title: '楼外楼', category: '用餐', durationMinutes: 60, timeSlot: 'lunch', persons: 2 }
      ] },
      { date: '2026-11-19', activities: [
        { id: 'w4', time: '09:00', title: '自由活动', category: '景点', durationMinutes: 120 }
      ] },
      { date: '2026-11-20', activities: [
        { id: 'w5', time: '10:00', title: '人民广场', category: '景点', durationMinutes: 90, place: ${JSON.stringify(place('人民广场', PEOPLE_SQUARE))} }
      ] }
    ]
    route.pendingActivities = [
      { id: 'cand-1', title: '杭州大剧院', description: '室内演出', place: ${JSON.stringify(place('杭州大剧院', THEATER))} }
    ]
  }`)
  ok('写入带确认坐标的三天行程、用餐活动与候选池')

  await openSchedule(travelId)
  await waitWeatherSettled()
  const day1Text = await weatherText()
  check('天气面板显示第 1 天', (await headerTitle()).includes('第 1 天') && (await headerTitle()).includes('2026-11-18'), await headerTitle())
  const meta1 = await metaText()
  const desc1 = await page.evaluate("document.querySelector('.tw-desc')?.innerText || ''")
  check('真实 Open-Meteo 返回天气描述', desc1.trim().length > 1 && !day1Text.includes('天气获取失败'), JSON.stringify(desc1))
  check('天气来源与更新时间可见', meta1.includes('来源 Open-Meteo') && meta1.includes('更新于'), meta1.replace(/\n/g, ' | '))
  check('天气按当天确认地点匹配', meta1.includes('西湖'), meta1.replace(/\n/g, ' | '))
  check('显示时区信息', meta1.includes('时区 Asia/Shanghai'), meta1)
  const tempText = await page.evaluate("document.querySelector('.tw-temp')?.innerText || ''")
  check('显示温度区间', /\d/.test(tempText) && tempText.includes('℃'), tempText)
  const rainBadge = await page.evaluate("!!document.querySelector('.tw-rain-badge')")
  const rainCard = await page.evaluate("!!document.querySelector('.tw-card.rain')")
  const tipText = await page.evaluate("(document.querySelector('.tw-rain-tip') || document.querySelector('.tw-tip'))?.innerText || ''")
  check('有雨标记与提示一致', rainBadge === rainCard && rainBadge === tipText.includes('预报有雨'), `badge=${rainBadge} tip=${tipText.slice(0, 60).replace(/\n/g, ' ')}`)
  await page.screenshot(`${OUT}/s6-weather-desktop.png`, { fullPage: true })
  check('天气只做提示、不自动改行程', day1Text.includes('天气只做提示'), '')
  check('加载天气不修改活动', JSON.stringify(await activityTitles()) === JSON.stringify(['西湖散步', '灵隐寺', '楼外楼']), JSON.stringify(await activityTitles()))

  const cache1 = await weatherCacheEntries()
  const day18Cache = cache1.find(entry => entry.weather && entry.weather.days.some(day => day.date === '2026-11-18'))
  check('真实天气写入本地缓存', Boolean(day18Cache) && day18Cache.weather.source === 'Open-Meteo', day18Cache ? day18Cache.key : JSON.stringify(cache1.map(item => item.key)))
  check('缓存记录预报范围与日期', Boolean(day18Cache) && day18Cache.weather.range.start === '2026-11-18' && day18Cache.weather.range.end === '2026-11-18', day18Cache ? JSON.stringify(day18Cache.weather.range) : '')

  await clickDay(1)
  const day2Text = await weatherText()
  check('没有确认坐标的日期提示无法匹配', day2Text.includes('还没有确认坐标') && day2Text.includes('无法匹配天气'), day2Text.slice(0, 160).replace(/\n/g, ' | '))
  check('无坐标日期仍可添加手动备选', day2Text.includes('室内/雨天备选') && day2Text.includes('添加备选'), '')

  await clickDay(2)
  const meta3 = await metaText()
  check('多目的地按当天地点匹配', meta3.includes('人民广场') && !meta3.includes('西湖'), meta3.replace(/\n/g, ' | '))
  const cache3 = await weatherCacheEntries()
  check('不同地点分别缓存', cache3.filter(entry => entry.weather).length >= 2, `keys=${cache3.length}`)

  // 第一天：备选增删、替换与撤销
  await clickDay(0)
  const summary1 = await page.evaluate("document.querySelector('.tw-backups summary')?.innerText || ''")
  check('展示已有备选数量', summary1.includes('1'), summary1.replace(/\n/g, ' '))
  check('备选展示名称、室内与备注', (await findActivity('灵隐寺')).includes('浙江省博物馆') && (await findActivity('灵隐寺')).includes('室内'), '')
  await addManualBackup()
  const manualText = await findActivity('灵隐寺')
  const summary2 = await page.evaluate("document.querySelector('.tw-backups summary')?.innerText || ''")
  const formReset = await page.evaluate(`(() => {
    const act = [...document.querySelectorAll('.tw-activity')].find(item => (item.querySelector('.tw-activity-head strong')?.innerText || '').includes('灵隐寺'))
    return [...act.querySelectorAll('.tw-add input')].slice(0, 3).map(el => el.value)
  })()`)
  check('可添加手动室内备选', summary2.includes('2') && manualText.includes('中国茶叶博物馆') && manualText.includes('雨天室内展馆') && manualText.includes('室内'), summary2.replace(/\n/g, ' '))
  check('添加后表单清空', JSON.stringify(formReset) === JSON.stringify(['', '', '']), JSON.stringify(formReset))
  await addPoolBackup()
  const summary3 = await page.evaluate("document.querySelector('.tw-backups summary')?.innerText || ''")
  check('可从候选池添加备选', summary3.includes('3') && (await findActivity('灵隐寺')).includes('杭州大剧院'), summary3.replace(/\n/g, ' '))
  check('用餐活动不能加天气备选', !(await page.evaluate("document.querySelector('.travel-weather').innerText")).includes('楼外楼'), '')

  const swapClick = await backupAction('浙江省博物馆', '替换')
  check('点击替换进入预览', swapClick === 'OK', swapClick)
  await sleep(300)
  const swapText = await page.evaluate("document.querySelector('.tw-swap')?.innerText || ''")
  check('替换前展示前后差异', swapText.includes('替换前') && swapText.includes('西湖') === false && swapText.includes('灵隐寺') && swapText.includes('替换后') && swapText.includes('浙江省博物馆'), swapText.replace(/\n/g, ' | ').slice(0, 240))
  check('提示交通耗时需重新查询', swapText.includes('交通耗时需要重新查询'), '')
  check('提示账本与实际支出不改动', swapText.includes('账本和已记录的实际支出不会自动改动'), '')
  await confirmSwap()
  check('确认替换后活动标题更新', (await activityTitles())[1] === '浙江省博物馆', JSON.stringify(await activityTitles()))
  check('替换后显示来源活动', (await findActivity('浙江省博物馆')).includes('已替换自'), '')
  check('替换后相邻交通估算失效', (await rowTravelMinutes(0)) === '', await rowTravelMinutes(0))
  check('替换后提供撤销入口', (await page.evaluate(`([...document.querySelectorAll('.tw-activity button')].some(item => item.innerText.includes('撤销替换')))`)), '')

  const undoClick = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('.tw-activity button')].find(item => item.innerText.includes('撤销替换'))
    if (!button) return 'NO_BUTTON'
    button.click()
    return 'OK'
  })()`)
  check('可撤销替换', undoClick === 'OK', undoClick)
  await sleep(350)
  check('撤销后标题恢复', (await activityTitles())[1] === '灵隐寺', JSON.stringify(await activityTitles()))
  check('撤销后交通估算恢复', (await rowTravelMinutes(0)) === '20', await rowTravelMinutes(0))

  const delClick = await backupAction('杭州大剧院', '删除')
  check('可删除备选', delClick === 'OK', delClick)
  await sleep(300)
  const summary4 = await page.evaluate("document.querySelector('.tw-backups summary')?.innerText || ''")
  const backupNames = await page.evaluate("[...document.querySelectorAll('.tw-backup-list .tw-backup-name')].map(el => el.innerText)")
  check('删除后备选数量减少', summary4.includes('2') && !backupNames.some(text => text.includes('杭州大剧院')), `${summary4.replace(/\n/g, ' ')} | ${JSON.stringify(backupNames)}`)

  // 保存并重载
  await clickText(page, 'button', '保存修改')
  await page.waitFor("!!document.querySelector('.feedback-notice')", { timeout: 8000 })
  await sleep(400)
  const saved = await readRoute(travelId)
  const savedDay1 = saved.days.find(day => day.date === '2026-11-18')
  check('保存后备选持久化', savedDay1.activities[1].backups.length === 2 && savedDay1.activities[1].backups.every(item => item.title !== '杭州大剧院'), JSON.stringify(savedDay1.activities[1].backups.map(item => item.title)))
  check('保存后备选字段完整', savedDay1.activities[1].backups.every(item => item.id && item.title && typeof item.indoor === 'boolean' && item.source === 'manual'), JSON.stringify(savedDay1.activities[1].backups))
  check('保存后活动标题仍为原活动', savedDay1.activities[1].title === '灵隐寺')
  check('保存后交通估算恢复为 20', savedDay1.activities[0].travelEstimate?.minutes === 20, JSON.stringify(savedDay1.activities[0].travelEstimate))

  await openSchedule(travelId)
  await waitWeatherSettled()
  const reloadedSummary = await page.evaluate("document.querySelector('.tw-backups summary')?.innerText || ''")
  check('刷新后备选仍在', reloadedSummary.includes('2'), reloadedSummary.replace(/\n/g, ' '))
  const reloadedMeta = await metaText()
  check('刷新后天气命中本地缓存', reloadedMeta.includes('本地缓存') && reloadedMeta.includes('来源 Open-Meteo'), reloadedMeta.replace(/\n/g, ' | '))

  // 接口失败：新缓存时显示本地缓存而不是过期缓存
  await blockWeather()
  await clickRefresh()
  await page.waitFor("!!document.querySelector('.tw-stale')", { timeout: 25000 }).catch(() => {})
  const freshFailText = await page.evaluate("document.querySelector('.tw-stale')?.innerText || ''")
  check('接口失败时显示缓存提示与错误', freshFailText.includes('接口暂时不可用') && freshFailText.includes('本地缓存'), freshFailText.replace(/\n/g, ' '))
  check('新缓存不冒充过期缓存', !freshFailText.includes('过期缓存'), freshFailText.replace(/\n/g, ' '))
  check('失败时天气卡仍展示上次数据', (await page.evaluate("document.querySelector('.tw-desc')?.innerText || ''")).length > 1)
  await unblockWeather()
  await clickRefresh()
  await page.waitFor("!document.querySelector('.tw-stale')", { timeout: 25000 }).catch(() => {})
  check('恢复后刷新清除失败提示', !(await page.evaluate("!!document.querySelector('.tw-stale')")))

  // 过期缓存回退
  const aged = await ageWeatherCache(2)
  check('构造过期缓存', aged > 0, `touched=${aged}`)
  await blockWeather()
  await clickRefresh()
  await page.waitFor("!!document.querySelector('.tw-stale')", { timeout: 25000 }).catch(() => {})
  const staleFailText = await page.evaluate("document.querySelector('.tw-stale')?.innerText || ''")
  check('过期缓存回退并明确标注', staleFailText.includes('过期缓存') && staleFailText.includes('接口暂时不可用'), staleFailText.replace(/\n/g, ' '))
  await unblockWeather()
  await clickRefresh()
  await page.waitFor("!document.querySelector('.tw-stale')", { timeout: 25000 }).catch(() => {})
  check('网络恢复后重试成功', Boolean(await page.evaluate("document.querySelector('.tw-desc')")) && !(await page.evaluate("!!document.querySelector('.tw-stale')")))

  // 超出预报范围
  const farId = await createTravel(page, { title: '越界天气旅行', startDate: '2026-12-20', endDate: '2026-12-21', persons: 1, budget: 1000 })
  await seedRoute(farId, `(route) => {
    route.days = [
      { date: '2026-12-20', activities: [{ id: 'f1', time: '09:00', title: '故宫', category: '景点', place: ${JSON.stringify(place('故宫', [116.397, 39.918]))} }] },
      { date: '2026-12-21', activities: [] }
    ]
  }`)
  await openSchedule(farId)
  await waitWeatherSettled()
  const farText = await weatherText()
  check('超出 16 天时明确提示暂无预报', farText.includes('超出未来 16 天的预报范围'), farText.slice(0, 200).replace(/\n/g, ' | '))
  const farCache = await weatherCacheEntries()
  check('超出范围不请求上游也不写缓存', !farCache.some(entry => entry.weather && entry.weather.days.some(day => day.date === '2026-12-20')), `keys=${farCache.length}`)
  const farManual = await page.evaluate(`(() => {
    const form = document.querySelector('.tw-activity details.tw-add')
    if (!form) return 'NO_FORM'
    form.open = true
    return 'OK'
  })()`)
  check('无天气时仍可展开手动备选', farManual === 'OK', farManual)
  const farAdd = await page.evaluate(`(() => {
    const act = document.querySelector('.tw-activity')
    const form = act.querySelector('details.tw-add')
    const set = (el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) }
    const inputs = [...form.querySelectorAll('input')]
    set(inputs[0], '国家博物馆')
    form.querySelector('button[type=submit]').click()
    return 'OK'
  })()`)
  await sleep(350)
  const farSummary = await page.evaluate("document.querySelector('.tw-backups summary')?.innerText || ''")
  check('无天气时手动备选可用', farAdd === 'OK' && farSummary.includes('1') && (await page.evaluate("document.querySelector('.travel-weather').innerText")).includes('国家博物馆'), farSummary.replace(/\n/g, ' '))

  // 手机布局
  await openSchedule(travelId)
  await waitWeatherSettled()
  await page.viewport(390, 844, { mobile: true })
  await sleep(400)
  const mobileOverflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
  check('390px 日程与天气面板无横向溢出', mobileOverflow === 0, `overflow=${mobileOverflow}`)
  await page.screenshot(`${OUT}/s6-weather-390.png`, { fullPage: true })
  await page.viewport(1440, 900)

  const errors = await page.consoleErrors()
  check('页面无脚本错误', errors.length === 0, errors.join(' | ').slice(0, 400))
  check('无未捕获异常', results.every(item => item.name !== 'runtime-exception'), '')
} catch (error) {
  bad('脚本执行异常', error.message)
  console.error(error)
} finally {
  await page.close()
}

console.log('\nSUMMARY')
for (const item of results) console.log(item.pass ? 'PASS' : 'FAIL', item.name, item.extra || '')
const failed = results.filter(item => !item.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exitCode = failed.length ? 1 : 0
