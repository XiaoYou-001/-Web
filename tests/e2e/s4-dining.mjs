// Feature 4 browser verification: 美食探索与用餐安排 (real AMap search, favorites, meal scheduling, cost links)
import { launch, sleep } from './cdp.mjs'
import { BASE, OUT, registerAndLogin, createTravel, openTravel, clickText } from './helpers.mjs'

const stamp = String(Date.now()).slice(-8)
const phone = '135' + stamp
const results = []
const ok = (name, extra = '') => { results.push({ name, pass: true, extra }); console.log('PASS', name, extra) }
const bad = (name, extra = '') => { results.push({ name, pass: false, extra }); console.log('FAIL', name, extra) }

const page = await launch({ port: 9226 })
const runtimeErrors = []
page.on('Runtime.exceptionThrown', p => runtimeErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text))

async function fillIn(scopeSel, selector, value) {
  const res = await page.evaluate(`(() => {
    const scope = document.querySelector(${JSON.stringify(scopeSel)})
    if (!scope) return 'NO_SCOPE'
    const el = scope.querySelector(${JSON.stringify(selector)})
    if (!el) return 'NO_FIELD'
    el.focus()
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : (el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype)
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return 'OK'
  })()`)
  if (res !== 'OK') throw new Error(`fillIn(${scopeSel} ${selector}): ${res}`)
}

// 按 <label> 文案定位表单控件（表单在各面板里结构一致）
async function fillByLabel(scopeSel, labelText, value) {
  const res = await page.evaluate(`(() => {
    const scope = document.querySelector(${JSON.stringify(scopeSel)})
    if (!scope) return 'NO_SCOPE'
    const label = [...scope.querySelectorAll('label')].find(l => (l.textContent || '').trim().startsWith(${JSON.stringify(labelText)}))
    if (!label) return 'NO_LABEL'
    const el = label.querySelector('input, select, textarea')
    if (!el) return 'NO_FIELD'
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : (el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype)
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return 'OK'
  })()`)
  if (res !== 'OK') throw new Error(`fillByLabel(${labelText}): ${res}`)
}

const bodyText = () => page.evaluate('document.body.innerText')
const feedbackText = () => page.evaluate("([...document.querySelectorAll('.feedback-notice')].map(n => n.innerText).join(' | '))")
const diningText = () => page.evaluate("(document.querySelector('.travel-dining') || {}).innerText || ''")
const workbenchText = () => page.evaluate("(document.querySelector('.workbench') || {}).innerText || ''")
async function clearNotices() {
  await page.evaluate("document.querySelectorAll('.feedback-notice button[aria-label=\"关闭提示\"]').forEach(b => b.click())")
  await sleep(120)
}
async function saveRoute() {
  await page.evaluate(`(() => { const btn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').includes('保存修改')); if (btn) btn.click(); return !!btn })()`)
  await sleep(700)
}

try {
  await registerAndLogin(page, { phone })
  ok('注册并登录', phone)
  const travelId = await createTravel(page, { title: '美食测试旅行', startDate: '2026-12-10', endDate: '2026-12-12', persons: 3, budget: 3000 })
  ok('创建旅行', travelId)

  async function routeState() {
    return page.evaluate(`(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('travel_data:v1:'))
      if (!key) return null
      const data = JSON.parse(localStorage.getItem(key))
      const route = (data.routes || []).find(r => String(r.id) === ${JSON.stringify(travelId)})
      if (!route) return null
      const meals = []
      for (const day of route.days || []) {
        for (const activity of day.activities || []) {
          if (activity.category === '用餐') meals.push({ date: day.date, title: activity.title, time: activity.time, persons: activity.meal?.persons, budgetPerPerson: activity.meal?.budgetPerPerson, estimatedTotal: activity.meal?.estimatedTotal, note: activity.meal?.note })
        }
      }
      return { meals, linked: (route.expenses || []).filter(row => row.sourceMealId).map(row => ({ title: row.title, estimate: row.estimate })), pending: (route.pendingActivities || []).length }
    })()`)
  }
  async function statCounts() {
    return page.evaluate("(() => { const chips = [...document.querySelectorAll('.food-stats .stat-chip')]; const value = chip => chip ? (chip.querySelector('span')?.innerText || '').trim() : ''; return { favorites: value(chips[0]), meals: value(chips[1]), unknown: value(chips[2]) } })()")
  }

  await page.goto(`${BASE}/food?travel=${travelId}`)
  await page.waitFor("!!document.querySelector('.food-view')", { timeout: 15000 })
  await sleep(500)
  const banner = await page.evaluate("(document.querySelector('.travel-context-banner') || {}).innerText || ''")
  if ((await bodyText()).includes('美食测试旅行') || banner.includes('美食测试旅行')) ok('美食页带入当前旅行上下文'); else bad('美食页带入当前旅行上下文', banner)

  const emptyFav = await bodyText()
  if (emptyFav.includes('还没有收藏')) ok('初始无收藏'); else bad('初始无收藏')

  await fillByLabel('.search-row', '城市', '杭州')
  await fillByLabel('.search-row', '餐厅或菜品', '西湖 杭帮菜')
  await page.evaluate("document.querySelector('.search-btn').click()")
  let searchState = 'timeout'
  for (let i = 0; i < 200; i++) {
    searchState = await page.evaluate(`(() => {
      if (document.querySelector('.result-section .restaurant-card')) return 'READY'
      const error = document.querySelector('.search-panel .error-line')
      if (error) return 'ERROR:' + error.innerText
      return 'LOADING'
    })()`)
    if (searchState !== 'LOADING') break
    await sleep(150)
  }
  if (searchState === 'READY') {
    const cards = await page.evaluate("document.querySelectorAll('.result-section .restaurant-card').length")
    const cardText = await page.evaluate("(document.querySelector('.result-section .restaurant-card') || {}).innerText || ''")
    if (cards > 0 && cardText.includes('来源 高德地图')) ok('真实地点检索返回高德餐厅', `cards=${cards}`)
    else bad('真实地点检索返回高德餐厅', JSON.stringify({ cards, cardText }))
  } else bad('真实地点检索返回高德餐厅', searchState)

  await clickText(page, '.result-section .restaurant-card .restaurant-actions button', '收藏', { exact: true, index: 0 })
  await sleep(400)
  const favTitle1 = await page.evaluate("(document.querySelector('.favorite-card .restaurant-head h3') || {}).innerText || ''")
  const favCount1 = await page.evaluate("(document.querySelector('.favorites-section h2') || {}).innerText || ''")
  const stored = await page.evaluate("Object.keys(localStorage).some(k => k.startsWith('travel_dining:v1:'))")
  if (favCount1.includes('1') && favTitle1 && stored) ok('收藏真实餐厅并写入本账号存储', JSON.stringify(favTitle1)); else bad('收藏真实餐厅并写入本账号存储', JSON.stringify({ favCount1, favTitle1, stored }))

  await clickText(page, '.result-section .restaurant-card .restaurant-actions button', '收藏', { exact: true, index: 0 })
  await sleep(500)
  const favCount2 = await page.evaluate("(document.querySelector('.favorites-section h2') || {}).innerText || ''")
  const favNames = await page.evaluate("[...document.querySelectorAll('.favorite-card .restaurant-head h3')].map(h => h.innerText)")
  if (favCount2.includes('2') && favNames.length === 2 && favNames[0] && favNames[1]) ok('收藏第二家餐厅', JSON.stringify(favNames))
  else bad('收藏第二家餐厅', JSON.stringify({ favCount2, favNames }))

  await clickText(page, '.favorite-card .restaurant-actions button', '编辑备注', { index: 0 })
  await page.waitFor("!!document.querySelector('.favorite-card .favorite-form')")
  await fillByLabel('.favorite-card .favorite-form', '口味或菜系', '微辣、杭帮菜')
  await fillByLabel('.favorite-card .favorite-form', '人均预算', '88')
  await fillByLabel('.favorite-card .favorite-form', '备注', '适合带长辈')
  await page.evaluate("document.querySelector('.favorite-card .favorite-form button[type=submit]').click()")
  await sleep(400)
  const editedFav = await page.evaluate("(document.querySelector('.favorite-card') || {}).innerText || ''")
  if (editedFav.includes('口味：微辣、杭帮菜') && editedFav.includes('人均 ¥88') && editedFav.includes('备注：适合带长辈')) ok('编辑收藏口味、人均预算与备注', JSON.stringify(editedFav.slice(0, 120)))
  else bad('编辑收藏口味、人均预算与备注', JSON.stringify(editedFav.slice(0, 200)))

  // 安排第一餐：人均 80 × 3 人 = ¥240，写入旅行并关联预计费用
  await clickText(page, '.favorite-card .restaurant-actions button', '安排到行程', { index: 0 })
  await page.waitFor("!!document.querySelector('.plan-box .meal-form')")
  await fillByLabel('.plan-box .meal-form', '日期', '2026-12-10')
  await fillByLabel('.plan-box .meal-form', '人数', '3')
  await fillByLabel('.plan-box .meal-form', '人均预算', '80')
  await fillByLabel('.plan-box .meal-form', '口味或备注', '少辣')
  await page.evaluate("document.querySelector('.plan-box .meal-form button[type=submit]').click()")
  await page.waitFor("!document.querySelector('.plan-box')", { timeout: 6000 })
  await sleep(300)
  let state = await routeState()
  const meal1 = state?.meals?.find(meal => meal.date === '2026-12-10')
  if (meal1 && meal1.persons === 3 && meal1.budgetPerPerson === 80 && meal1.estimatedTotal === 240 && meal1.note === '少辣') ok('人均预算×人数生成预计餐费', JSON.stringify(meal1))
  else bad('人均预算×人数生成预计餐费', JSON.stringify(state))
  if (state?.linked?.length === 1 && state.linked[0].estimate === 240) ok('预计餐费写入关联费用记录', JSON.stringify(state.linked))
  else bad('预计餐费写入关联费用记录', JSON.stringify(state?.linked))
  let counts = await statCounts()
  if (counts.meals === '1' && counts.unknown === '0') ok('美食页统计已安排用餐', JSON.stringify(counts)); else bad('美食页统计已安排用餐', JSON.stringify(counts))

  // 安排第二餐：留空人均预算 → 费用待确认，绝不按 0 元
  await clickText(page, '.favorite-card .restaurant-actions button', '安排到行程', { index: 1 })
  await page.waitFor("!!document.querySelector('.plan-box .meal-form')")
  await fillByLabel('.plan-box .meal-form', '日期', '2026-12-11')
  await fillByLabel('.plan-box .meal-form', '人数', '2')
  await fillByLabel('.plan-box .meal-form', '口味或备注', '不吃香菜')
  await page.evaluate("document.querySelector('.plan-box .meal-form button[type=submit]').click()")
  await page.waitFor("!document.querySelector('.plan-box')", { timeout: 6000 })
  await sleep(300)
  state = await routeState()
  const meal2 = state?.meals?.find(meal => meal.date === '2026-12-11')
  if (meal2 && meal2.budgetPerPerson === null && meal2.estimatedTotal === null && state.linked.length === 1) ok('留空预算记为待确认且不生成费用', JSON.stringify(meal2))
  else bad('留空预算记为待确认且不生成费用', JSON.stringify(state))
  counts = await statCounts()
  if (counts.meals === '2' && counts.unknown === '1') ok('待确认用餐计入待确认统计', JSON.stringify(counts)); else bad('待确认用餐计入待确认统计', JSON.stringify(counts))

  await openTravel(page, travelId)
  await page.waitFor("!!document.querySelector('.travel-dining')", { timeout: 10000 })
  await page.evaluate("document.querySelector('.travel-dining').open = true")
  await sleep(400)
  let dining = await diningText()
  if (dining.includes('已安排 2 天') && dining.includes('¥240（另有 1 项待确认）')) ok('工作台汇总预计餐费并标注待确认', dining.split('\n').slice(0, 3).join(' / '))
  else bad('工作台汇总预计餐费并标注待确认', dining.slice(0, 400))
  if (dining.includes('2 项') && dining.includes('待确认') && dining.includes('少辣') && dining.includes('不吃香菜')) ok('用餐列表展示时段、人数与备注')
  else bad('用餐列表展示时段、人数与备注', dining.slice(0, 400))
  let wb = await workbenchText()
  if (wb.includes('已录入预计费用：¥240')) ok('预计餐费进入费用汇总'); else bad('预计餐费进入费用汇总', wb.split('\n').slice(0, 4).join(' / '))

  // 替换餐厅：保留预算与预计费用，但旧交通估算失效
  const replaceValue = await page.evaluate(`(() => {
    const select = document.querySelector('.meal-list li select')
    if (!select) return 'NO_SELECT'
    const option = [...select.options].find(o => o.textContent.trim().startsWith(${JSON.stringify(favNames[1])}))
    if (!option) return 'NO_OPTION:' + [...select.options].map(o => o.textContent.trim()).join(',')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value)
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return option.value
  })()`)
  if (String(replaceValue).startsWith('NO_')) throw new Error('替换餐厅下拉：' + replaceValue)
  await clickText(page, '.meal-list li button', '替换', { index: 0 })
  await sleep(500)
  dining = await diningText()
  const replaceNotice = await feedbackText()
  if (dining.includes(favNames[1]) && dining.includes('¥240（另有 1 项待确认）') && replaceNotice.includes('已替换餐厅')) ok('替换餐厅保留预算并提示交通估算失效', replaceNotice.split('\n')[0])
  else bad('替换餐厅保留预算并提示交通估算失效', JSON.stringify({ dining: dining.slice(0, 300), replaceNotice }))

  // 移回候选池：预计餐费从费用记录移除，改到草稿后保存
  await clickText(page, '.meal-list li button', '移回候选池', { index: 0 })
  await sleep(500)
  dining = await diningText()
  wb = await workbenchText()
  const poolNotice = await feedbackText()
  if (dining.includes('已安排 1 天') && wb.includes('待安排候选池（1）') && poolNotice.includes('预计餐费已移除')) ok('移回候选池并移除关联餐费', poolNotice.split('\n')[0])
  else bad('移回候选池并移除关联餐费', JSON.stringify({ dining: dining.slice(0, 200), poolNotice, wb: wb.split('\n').slice(0, 6).join(' / ') }))

  await saveRoute()
  await openTravel(page, travelId)
  await page.waitFor("!!document.querySelector('.travel-dining')", { timeout: 10000 })
  await page.evaluate("document.querySelector('.travel-dining').open = true")
  await sleep(400)
  dining = await diningText()
  wb = await workbenchText()
  if (dining.includes('已安排 1 天') && wb.includes('待安排候选池（1）') && wb.includes('已录入预计费用：¥0')) ok('保存后移出状态与餐费一起持久化')
  else bad('保存后移出状态与餐费一起持久化', JSON.stringify({ dining: dining.slice(0, 160), wb: wb.split('\n').slice(0, 4).join(' / ') }))

  // 从候选池重新安排：预计费用应补回
  const rescheduled = await page.evaluate(`(() => {
    const details = [...document.querySelectorAll('.workbench details')].find(d => (d.querySelector('summary')?.textContent || '').includes('待安排候选池'))
    if (!details) return 'NO_DETAILS'
    const select = details.querySelector('select')
    if (select && select.options.length) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, select.options[0].value)
      select.dispatchEvent(new Event('input', { bubbles: true }))
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const btn = [...details.querySelectorAll('button')].find(b => (b.textContent || '').includes('安排到当天'))
    if (!btn) return 'NO_BUTTON:' + details.textContent.slice(0, 120)
    btn.click()
    return 'OK'
  })()`)
  await sleep(600)
  dining = await diningText()
  wb = await workbenchText()
  if (rescheduled === 'OK' && dining.includes('已安排 2 天') && wb.includes('已录入预计费用：¥240')) ok('从候选池重新安排后补回预计餐费')
  else bad('从候选池重新安排后补回预计餐费', JSON.stringify({ rescheduled, dining: dining.slice(0, 200), wb: wb.split('\n').slice(0, 4).join(' / ') }))

  // 时间冲突：需用户明确确认
  await saveRoute()
  await page.goto(`${BASE}/food?travel=${travelId}`)
  await page.waitFor("!!document.querySelector('.food-view')", { timeout: 15000 })
  await sleep(300)
  await clickText(page, '.favorite-card .restaurant-actions button', '安排到行程', { index: 0 })
  await page.waitFor("!!document.querySelector('.plan-box .meal-form')")
  await fillByLabel('.plan-box .meal-form', '日期', '2026-12-10')
  await fillByLabel('.plan-box .meal-form', '时间', '12:30')
  await fillByLabel('.plan-box .meal-form', '人数', '1')
  await fillByLabel('.plan-box .meal-form', '人均预算', '50')
  await page.evaluate("document.querySelector('.plan-box .meal-form button[type=submit]').click()")
  await sleep(500)
  let conflictMsg = await page.evaluate("(document.querySelector('.plan-box [role=status]') || {}).innerText || ''")
  const confirmVisible = await page.evaluate("!!document.querySelector('.plan-box .meal-confirm input[type=checkbox]')")
  if (conflictMsg.includes('时间重叠') && confirmVisible) ok('与既有安排冲突时要求确认', conflictMsg)
  else bad('与既有安排冲突时要求确认', JSON.stringify({ conflictMsg, confirmVisible }))
  if (confirmVisible) {
    await page.evaluate("document.querySelector('.plan-box .meal-confirm input[type=checkbox]').click()")
    await sleep(150)
    await page.evaluate("document.querySelector('.plan-box .meal-form button[type=submit]').click()")
    await sleep(800)
    state = await routeState()
    const day10 = state?.meals?.filter(meal => meal.date === '2026-12-10') || []
    if (day10.length === 2 && day10.some(meal => meal.estimatedTotal === 50)) ok('用户确认后仍可添加冲突用餐', JSON.stringify(day10))
    else bad('用户确认后仍可添加冲突用餐', JSON.stringify(state))
  }

  // 手机宽度
  await page.viewport(390, 844, { mobile: true })
  await sleep(400)
  const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  if (overflow <= 1) ok('390px 美食页无横向溢出', `overflow=${overflow}`); else bad('390px 美食页无横向溢出', `overflow=${overflow}`)
  await page.viewport(1440, 900)
  await sleep(200)

  // 账号隔离
  await page.evaluate("localStorage.clear()")
  await registerAndLogin(page, { phone: '133' + stamp })
  await page.goto(`${BASE}/food?travel=${travelId}`)
  await page.waitFor("!!document.querySelector('.food-view')", { timeout: 15000 })
  await sleep(500)
  const bText = await bodyText()
  const bFavCount = await page.evaluate("(document.querySelector('.favorites-section h2') || {}).innerText || ''")
  if (bFavCount.includes('0') && bText.includes('还没有收藏')) ok('账号B看不到账号A的餐厅收藏'); else bad('账号B看不到账号A的餐厅收藏', JSON.stringify({ bFavCount, sample: bText.slice(0, 200) }))

  const errors = await page.evaluate('(window.__e2eErrors || []).slice()').catch(() => [])
  const pageErrors = errors.filter(text => !/Map SDK|Failed to load resource|net::ERR/.test(text))
  if (pageErrors.length === 0) ok('页面无脚本错误'); else bad('页面无脚本错误', JSON.stringify(pageErrors))
  if (runtimeErrors.length === 0) ok('无未捕获异常'); else bad('无未捕获异常', JSON.stringify(runtimeErrors))
} catch (error) {
  bad('harness 异常', error.message)
  await page.screenshot(`${OUT}/s4-failure.png`, { fullPage: true }).catch(() => {})
} finally {
  const failed = results.filter(r => !r.pass)
  console.log('\nSUMMARY')
  for (const row of results) console.log((row.pass ? 'PASS ' : 'FAIL ') + row.name + (row.extra ? ' :: ' + row.extra : ''))
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log(JSON.stringify(await page.evaluate('(window.__e2eErrors || []).slice()').catch(() => [])))
  await page.close()
  process.exitCode = failed.length ? 1 : 0
}
