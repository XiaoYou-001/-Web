// 功能 5：行程方案对比 —— 真实浏览器交互验证（复制、指标差异、口径提示、空方案、采用、隔离）。
import { launch, sleep } from './cdp.mjs'
import { BASE, OUT, registerAndLogin, createTravel, clickText } from './helpers.mjs'

const stamp = String(Date.now()).slice(-8)
const phone = '137' + stamp
const phoneB = '136' + stamp
const results = []
const ok = (name, extra = '') => { results.push({ name, pass: true, extra }); console.log('PASS', name, extra) }
const bad = (name, extra = '') => { results.push({ name, pass: false, extra }); console.log('FAIL', name, extra) }
const check = (name, condition, extra = '') => condition ? ok(name, extra) : bad(name, extra)

const page = await launch({ port: 9226 })
page.on('Runtime.exceptionThrown', p => p.exceptionDetails && results.push({ name: 'runtime-exception', pass: false, extra: p.exceptionDetails.exception?.description || p.exceptionDetails.text }))

async function currentUserKey() {
  return page.evaluate(`(() => {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null')
    return user && user.id ? 'travel_data:v1:' + encodeURIComponent(user.id) : null
  })()`)
}

async function seedRoute(routeId) {
  const res = await page.evaluate(`(() => {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null')
    if (!user || !user.id) return 'NO_USER'
    const key = 'travel_data:v1:' + encodeURIComponent(user.id)
    const raw = localStorage.getItem(key)
    if (raw === null) return 'NO_KEY'
    const data = JSON.parse(localStorage.getItem(key))
    const route = (data.routes || []).find(r => String(r.id) === ${JSON.stringify(routeId)})
    if (!route) return 'NO_ROUTE'
    Object.assign(route, {
      themes: ['亲子', '人文'],
      preferences: { pace: 'normal' },
      destinations: ['杭州'],
      companion: 'family',
      persons: 2,
      budget: 3000,
      progress: 40,
      shareToken: 'share-seed-token',
      days: [
        { date: '2026-12-20', activities: [
          { id: 'a1', time: '08:00', title: '西湖漫步', category: '景点', durationMinutes: 90, travelEstimate: { minutes: 20, source: 'amap' }, completed: true },
          { id: 'a2', time: '10:00', title: '灵隐寺', category: '景点', durationMinutes: 120, completed: false },
          { id: 'a3', time: '12:00', title: '楼外楼', category: '用餐', durationMinutes: 60, completed: false }
        ] },
        { date: '2026-12-21', activities: [
          { id: 'a4', time: '09:00', title: '河坊街', category: '景点', durationMinutes: 60, completed: true }
        ] }
      ],
      pendingActivities: [{ id: 'p1', title: '夜游西湖', category: '景点' }],
      expenses: [
        { id: 'e1', category: '交通', title: '高铁票', estimate: 600, actual: 580 },
        { id: 'e2', category: '门票', title: '灵隐寺门票', estimate: 90, actual: null },
        { id: 'e3', category: '其他', title: '游船', estimate: null, actual: null }
      ],
      preparation: { items: [{ id: 'prep1', title: '身份证', category: '证件', done: true, completedAt: '2026-12-01T00:00:00.000Z' }], updatedAt: '2026-12-01T00:00:00.000Z' },
      ledger: { version: 1, currency: 'CNY', members: [{ id: 'm1', name: '我' }], expenses: [], settlements: [{ id: 's1', fromId: 'm1', toId: 'm1', amountCents: 100, coveredExpenseIds: ['e1'], createdAt: '2026-12-02T00:00:00.000Z', note: '' }], updatedAt: '2026-12-02T00:00:00.000Z' }
    })
    localStorage.setItem(key, JSON.stringify(data))
    return 'OK'
  })()`)
  if (res !== 'OK') throw new Error('seedRoute: ' + res)
}

async function readRoutes() {
  return page.evaluate(`(() => {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null')
    if (!user || !user.id) return []
    const raw = localStorage.getItem('travel_data:v1:' + encodeURIComponent(user.id))
    if (raw === null) return []
    try { return JSON.parse(raw).routes || [] } catch { return [] }
  })()`)
}

async function readRoute(routeId) {
  const routes = await readRoutes()
  return routes.find(route => String(route.id) === String(routeId)) || null
}

async function mutateRoute(routeId, fnSource) {
  const res = await page.evaluate(`(() => {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null')
    if (!user || !user.id) return 'NO_USER'
    const key = 'travel_data:v1:' + encodeURIComponent(user.id)
    const raw = localStorage.getItem(key)
    if (raw === null) return 'NO_KEY'
    const data = JSON.parse(raw)
    const route = (data.routes || []).find(r => String(r.id) === ${JSON.stringify(String(routeId))})
    if (!route) return 'NO_ROUTE'
    const mutate = ${fnSource}
    mutate(route)
    localStorage.setItem(key, JSON.stringify(data))
    return 'OK'
  })()`)
  if (res !== 'OK') throw new Error('mutateRoute: ' + res)
}

async function variantByName(name) {
  const routes = await readRoutes()
  return routes.find(route => route.isPlanVariant && route.planName === name) || null
}

async function openCompare(baseId) {
  await page.goto(`${BASE}/plans/compare?base=${encodeURIComponent(baseId)}`)
  await page.waitFor("!!document.querySelector('.plan-compare')", { timeout: 10000 })
  await sleep(250)
}

async function pickerState() {
  return page.evaluate(`(() => [...document.querySelectorAll('.plan-picker li')].map(li => ({
    name: (li.querySelector('strong')?.innerText || '').trim(),
    checked: Boolean(li.querySelector('input[type=checkbox]')?.checked)
  })))()`)
}

async function clickPlan(name) {
  const res = await page.evaluate(`(() => {
    const li = [...document.querySelectorAll('.plan-picker li')].find(el => (el.querySelector('strong')?.innerText || '').trim() === ${JSON.stringify(name)})
    if (!li) return 'MISSING'
    li.querySelector('input[type=checkbox]').click()
    return 'OK'
  })()`)
  if (res !== 'OK') throw new Error('clickPlan missing: ' + name)
  await sleep(150)
}

async function selectPlans(names) {
  const wanted = new Set(names)
  for (let i = 0; i < 16; i++) {
    const state = await pickerState()
    const missing = state.filter(item => wanted.has(item.name) && !item.checked)
    const extra = state.filter(item => !wanted.has(item.name) && item.checked)
    if (!missing.length && !extra.length) return true
    const checkedCount = state.filter(item => item.checked).length
    if (missing.length && checkedCount < 3) { await clickPlan(missing[0].name); continue }
    if (missing.length && extra.length && checkedCount > 2) { await clickPlan(extra[0].name); continue }
    if (extra.length && checkedCount > 2) { await clickPlan(extra[0].name); continue }
    if (missing.length) {
      // 已达 3 个上限且没有可先取消的方案：真实点击一次，验证是否被拒绝并给出提示。
      await clickPlan(missing[0].name)
      const after = await pickerState()
      return after.filter(item => item.checked).length === checkedCount && after.some(item => item.name === missing[0].name && item.checked)
    }
    return false
  }
  return false
}

async function metric(label, index) {
  return page.evaluate(`(() => {
    const row = [...document.querySelectorAll('.metrics tbody tr')].find(tr => (tr.querySelector('th')?.innerText || '').trim() === ${JSON.stringify(label)})
    if (!row) return 'NO_ROW'
    const cell = [...row.querySelectorAll('td')][${index}]
    return cell ? cell.innerText.trim() : 'NO_CELL'
  })()`)
}

async function metricsRowCount() {
  return page.evaluate("document.querySelectorAll('.metrics tbody tr').length")
}

async function panelHeaders() {
  return page.evaluate(`(() => [...document.querySelectorAll('.metrics thead th')].slice(1).map(th => th.innerText.trim().split('\\n')[0]))()`)
}

async function basisNotes() {
  return page.evaluate(`(() => [...document.querySelectorAll('.basis li')].map(li => li.innerText.trim()))()`)
}

async function dayRow(date) {
  return page.evaluate(`(() => {
    const row = [...document.querySelectorAll('.day-diff tbody tr')].find(tr => (tr.querySelector('th')?.innerText || '').trim() === ${JSON.stringify(date)})
    return row ? [...row.querySelectorAll('td')].map(td => td.innerText.trim()) : null
  })()`)
}

async function bodyText() { return page.evaluate('document.body.innerText') }

async function copyPlan(name, { preset = null } = {}) {
  if (preset) {
    await clickText(page, '.preset-chips button', preset, { exact: true })
    await sleep(120)
  }
  await page.fill('.copy-box input', name)
  await page.evaluate("document.querySelector('.copy-box button.primary').click()")
  await page.waitFor(`([...document.querySelectorAll('.plan-picker strong')].map(el => el.innerText.trim()).includes(${JSON.stringify(name)}))`, { timeout: 8000 })
  await sleep(300)
}

async function adoptPlan(name) {
  const res = await page.evaluate(`(() => {
    const li = [...document.querySelectorAll('.adopt-list li')].find(el => (el.querySelector('strong')?.innerText || '').trim() === ${JSON.stringify(name)})
    if (!li) return 'MISSING'
    const button = li.querySelector('button')
    if (!button) return 'NO_BUTTON'
    if (button.disabled) return 'DISABLED'
    button.click()
    return 'OK'
  })()`)
  if (res !== 'OK') throw new Error('adoptPlan: ' + res)
  await sleep(300)
  const visible = await page.evaluate("!!document.querySelector('dialog.feedback-dialog[open]')")
  if (!visible) return 'NO_DIALOG'
  await page.evaluate("document.querySelector('.feedback-dialog .feedback-actions button:last-child').click()")
  await sleep(500)
  return 'OK'
}

async function overflow() {
  return page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
}

try {
  await registerAndLogin(page, { phone })
  ok('注册并登录', phone)
  const travelId = await createTravel(page, { title: '方案对比测试旅行', startDate: '2026-12-20', endDate: '2026-12-21', persons: 2, budget: 3000 })
  ok('创建旅行', travelId)
  await seedRoute(travelId)
  ok('写入真实行程、费用、准备与账本数据')

  // 入口：我的旅行 → 方案对比
  await page.goto(BASE + '/routes')
  await page.waitFor("!!document.querySelector('.routes-page, .routes')", { timeout: 10000 }).catch(() => {})
  await sleep(400)
  const entryTitle = await page.evaluate("!!document.querySelector('button[title=\"方案对比\"]')")
  check('我的旅行提供方案对比入口', entryTitle)
  await page.evaluate("document.querySelector('button[title=\"方案对比\"]').click()")
  await page.waitFor("location.pathname === '/plans/compare'", { timeout: 8000 })
  await page.waitFor("!!document.querySelector('.plan-compare')", { timeout: 8000 })
  await sleep(400)
  check('入口跳转到方案对比页并带基准旅行', decodeURIComponent(await page.evaluate('location.search')).includes(`base=${travelId}`), await page.evaluate('location.search'))
  check('页面标题正确', (await bodyText()).includes('行程方案对比'))

  const baseCard = await page.evaluate("document.querySelector('.base-card').innerText")
  check('展示原旅行日期与人数', baseCard.includes('2026-12-20 至 2026-12-21') && baseCard.includes('2 人'), baseCard.replace(/\n/g, ' | '))
  const initialPicker = await pickerState()
  check('初始只有原旅行一个方案', initialPicker.length === 1 && initialPicker[0].name === '原旅行', JSON.stringify(initialPicker))
  check('方案不足时提示先复制', (await bodyText()).includes('还没有其他方案'), '')

  // 复制方案
  await copyPlan('轻松版')
  const afterFirstCopy = await pickerState()
  check('复制后出现第二个方案', afterFirstCopy.length === 2, JSON.stringify(afterFirstCopy))
  check('复制成功提示', (await page.evaluate("document.querySelector('.status-line')?.innerText || ''")).includes('已创建方案「轻松版」'))

  const v1 = await variantByName('轻松版')
  const base1 = await readRoute(travelId)
  check('方案归入同一组并保留来源', v1 && v1.planGroupId === base1.id && v1.sourceRouteId === base1.id && v1.isPlanVariant === true, JSON.stringify({ group: v1?.planGroupId, source: v1?.sourceRouteId }))
  check('方案不继承账本结算', v1 && v1.ledger === undefined)
  check('方案不继承分享令牌', v1 && v1.shareToken === undefined)
  check('方案不继承实际支出', v1 && v1.expenses.every(item => item.actual === null || item.actual === undefined), JSON.stringify(v1?.expenses))
  check('方案不继承准备完成状态', v1 && v1.preparation.items.every(item => item.done === false && item.completedAt === ''))
  check('方案不继承活动完成/跳过标记', v1 && v1.days.flatMap(day => day.activities).every(item => item.completed === false && item.skipped === false))
  check('复制不修改原旅行', base1 && base1.persons === 2 && base1.budget === 3000 && base1.ledger && base1.expenses.find(item => item.id === 'e1').actual === 580)

  // 指标与口径
  check('指标表包含 2 个方案列', (await metricsRowCount()) >= 10 && (await panelHeaders()).length === 2, JSON.stringify(await panelHeaders()))
  check('天数指标', (await metric('天数', 0)) === '2 天' && (await metric('天数', 1)) === '2 天', `${await metric('天数', 0)} / ${await metric('天数', 1)}`)
  check('活动数量指标', (await metric('活动数量', 0)) === '4 项' && (await metric('活动数量', 1)) === '4 项', `${await metric('活动数量', 0)} / ${await metric('活动数量', 1)}`)
  check('预计费用只统计已录金额', (await metric('预计费用', 0)) === '¥690.00' && (await metric('预计费用', 1)) === '¥690.00', `${await metric('预计费用', 0)} / ${await metric('预计费用', 1)}`)
  check('预算上限与预计费用分开展示', (await metric('预算上限', 0)) === '¥3000.00' && (await metric('与预算上限', 0)) === '剩余 ¥2310.00', `${await metric('预算上限', 0)} / ${await metric('与预算上限', 0)}`)
  check('未录入费用标为待确认', (await metric('未录入费用', 0)) === '1 项待确认' && (await metric('未录入费用', 1)) === '1 项待确认', `${await metric('未录入费用', 0)}`)
  check('交通查询缺口指标', (await metric('已查交通', 0)) === '1 / 2 段' && (await metric('未查交通', 0)) === '1 段未查询', `${await metric('已查交通', 0)} / ${await metric('未查交通', 0)}`)
  check('待安排候选指标', (await metric('待安排候选', 0)) === '1 项')
  const basis1 = await basisNotes()
  check('存在未录入费用时给出比较口径提示', basis1.some(note => note.includes('未录入的费用')), JSON.stringify(basis1))
  check('存在未查交通时给出比较口径提示', basis1.some(note => note.includes('未查询的交通耗时')), JSON.stringify(basis1))
  const pageText1 = await bodyText()
  check('只做客观对比并声明不判定优劣', pageText1.includes('不会自动判定哪个方案更好') && pageText1.includes('没有“最优方案”结论') && !pageText1.includes('最佳'), '')

  const day20 = await dayRow('2026-12-20')
  check('每日差异列出当天活动', day20 && day20[0].includes('西湖漫步') && day20[1].includes('楼外楼'), JSON.stringify(day20))
  check('未查交通的活动标注缺口', day20 && day20[0].includes('交通未查询'), JSON.stringify(day20))
  const day21 = await dayRow('2026-12-21')
  check('第二天差异正确', day21 && day21[0].includes('河坊街'), JSON.stringify(day21))

  // 独立编辑方案（模拟用户在工作台改方案后持久化）
  await mutateRoute(v1.id, `(route) => {
    route.persons = 3
    route.budget = 2000
    route.endDate = '2026-12-22'
    route.days[1].activities = []
    const other = route.expenses.find(item => item.id === 'e3')
    other.estimate = 100
  }`)
  await openCompare(travelId)
  check('编辑方案不改动原旅行', (await readRoute(travelId)).persons === 2 && (await readRoute(travelId)).expenses.find(item => item.id === 'e3').estimate === null)
  check('不同人数时提示比较口径', (await basisNotes()).some(note => note.includes('人数不同')), JSON.stringify(await basisNotes()))
  check('不同日期范围时提示比较口径', (await basisNotes()).some(note => note.includes('日期范围不同')), JSON.stringify(await basisNotes()))
  check('人数指标区分两个方案', (await metric('人数', 0)) === '2 人' && (await metric('人数', 1)) === '3 人', `${await metric('人数', 0)} / ${await metric('人数', 1)}`)
  check('预算指标区分两个方案', (await metric('预算上限', 0)) === '¥3000.00' && (await metric('预算上限', 1)) === '¥2000.00', `${await metric('预算上限', 0)} / ${await metric('预算上限', 1)}`)
  check('预计费用随方案独立变化', (await metric('预计费用', 0)) === '¥690.00' && (await metric('预计费用', 1)) === '¥790.00', `${await metric('预计费用', 0)} / ${await metric('预计费用', 1)}`)
  check('活动数量随方案独立变化', (await metric('活动数量', 0)) === '4 项' && (await metric('活动数量', 1)) === '3 项', `${await metric('活动数量', 0)} / ${await metric('活动数量', 1)}`)
  check('方案已无未录入费用', (await metric('未录入费用', 1)) === '无', await metric('未录入费用', 1))
  check('预算差额按方案计算', (await metric('与预算上限', 1)) === '剩余 ¥1210.00', await metric('与预算上限', 1))

  // 第三、第四个方案与选择上限
  await copyPlan('省钱版', { preset: '省钱版' })
  check('预设名称按钮填入输入框', (await page.evaluate("document.querySelector('.copy-box input').value")) === '省钱版')
  await copyPlan('深度版')
  check('可创建多个方案', (await pickerState()).length === 4, JSON.stringify((await pickerState()).map(item => item.name)))
  const allSelected = await selectPlans(['原旅行', '轻松版', '省钱版', '深度版'])
  check('最多同时比较 3 个方案', !allSelected && (await page.evaluate("document.querySelector('.warn-line')?.innerText || ''")).includes('最多同时比较 3 个方案'), await page.evaluate("document.querySelector('.warn-line')?.innerText || ''"))
  check('上限拦截后仍有 3 个方案在比较', (await pickerState()).filter(item => item.checked).length === 3)
  check('被拒绝的第 4 个方案复选框恢复未选中', (await pickerState()).find(item => item.name === '轻松版').checked === false && (await pickerState()).filter(item => item.checked).length === 3, JSON.stringify(await pickerState()))
  await selectPlans(['原旅行', '轻松版'])
  const onlyTwo = (await pickerState()).filter(item => item.checked)
  check('可以只比较 2 个方案', onlyTwo.length === 2, JSON.stringify(onlyTwo.map(item => item.name)))
  await clickPlan('原旅行')
  check('少于 2 个方案时给出提示', (await page.evaluate("document.querySelector('.warn-line')?.innerText || ''")).includes('至少选择 2 个方案'), '')
  check('少于 2 个方案时不改变选择', (await pickerState()).filter(item => item.checked).length === 2)

  // 空方案
  const cheap = await variantByName('省钱版')
  await mutateRoute(cheap.id, '(route) => { route.days = [] }')
  await openCompare(travelId)
  await selectPlans(['原旅行', '省钱版'])
  const cheapPanelIndex = (await panelHeaders()).findIndex(name => name === '省钱版')
  check('空方案仍可参与比较', cheapPanelIndex !== -1, JSON.stringify(await panelHeaders()))
  check('空方案指标显示空方案', (await metric('活动数量', cheapPanelIndex)) === '空方案', await metric('活动数量', cheapPanelIndex))
  check('空方案提示无法比较日程', (await basisNotes()).some(note => note.includes('空方案')), JSON.stringify(await basisNotes()))
  const emptyDay = await dayRow('2026-12-20')
  check('空方案每日显示没有安排', emptyDay && emptyDay[cheapPanelIndex] === '没有安排', JSON.stringify(emptyDay))

  // 采用方案
  await openCompare(travelId)
  await selectPlans(['原旅行', '轻松版'])
  const beforeAdopt = await readRoute(travelId)
  const adoptResult = await adoptPlan('轻松版')
  check('采用方案弹出确认并执行', adoptResult === 'OK', adoptResult)
  const adopted = await readRoute(travelId)
  check('采用后写回原旅行 id', adopted && adopted.id === beforeAdopt.id)
  check('采用后日程来自所选方案', adopted && adopted.days.length === 2 && adopted.days[0].activities.length === 3 && adopted.days[1].activities.length === 0, JSON.stringify((adopted?.days || []).map(day => day.activities.length)))
  check('采用后预算与人数来自所选方案', adopted && adopted.persons === 3 && adopted.budget === 2000, JSON.stringify({ persons: adopted?.persons, budget: adopted?.budget }))
  check('采用后记录来源方案', adopted && adopted.adoptedFrom && adopted.adoptedFrom.planName === '轻松版', JSON.stringify(adopted?.adoptedFrom))
  check('采用保留实际支出', adopted && adopted.expenses.find(item => item.id === 'e1').actual === 580)
  check('采用保留账本结算', adopted && adopted.ledger && adopted.ledger.settlements.length === 1 && adopted.ledger.settlements[0].id === 's1')
  check('采用后其他方案仍保留', (await readRoutes()).filter(route => route.isPlanVariant).length === 3)
  check('采用后方案仍独立存在', (await variantByName('轻松版')) !== null)
  const afterAdoptText = await bodyText()
  check('采用结果提示保留实际支出', afterAdoptText.includes('保留 1 项实际支出'), afterAdoptText.match(/已采用[^\n]*/)?.[0] || '')
  check('原旅行卡片标记已采用方案', afterAdoptText.includes('已采用「轻松版」'), '')

  // 旅行列表：方案标签与采用后入口
  await page.goto(BASE + '/routes')
  await page.waitFor("!!document.querySelector('.control-bar')", { timeout: 10000 })
  await sleep(400)
  const listText = await bodyText()
  const tags = await page.evaluate("document.querySelectorAll('.plan-tag').length")
  check('旅行列表显示方案名称标签', tags === 3, `tags=${tags}`)
  check('采用后的原旅行仍在列表', listText.includes('方案对比测试旅行'), '')

  // 手机布局
  await openCompare(travelId)
  await page.viewport(390, 844, { mobile: true })
  await sleep(400)
  const mobileOverflow = await overflow()
  check('390px 方案对比页无横向溢出', mobileOverflow === 0, `overflow=${mobileOverflow}`)
  await page.screenshot(`${OUT}/s5-plan-compare-390.png`, { fullPage: true })
  await page.viewport(1440, 900)

  // 账号隔离：只清认证状态，保留账号A的本地数据，验证账号B读不到
  await page.evaluate("localStorage.removeItem('isAuthenticated'); localStorage.removeItem('currentUser')")
  await registerAndLogin(page, { phone: phoneB })
  await page.goto(`${BASE}/plans/compare?base=${encodeURIComponent(travelId)}`)
  await page.waitFor("!!document.querySelector('.plan-compare')", { timeout: 10000 })
  await sleep(300)
  const bText = await bodyText()
  check('账号B无法查看账号A的方案', bText.includes('请从「我的旅行」选择要对比的旅行'), '')
  check('账号B本地没有账号A的旅行', (await readRoutes()).length === 0, JSON.stringify((await readRoutes()).length))

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
