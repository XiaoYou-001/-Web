// 功能 7：同行协商空间 —— 两个真实账号、两套浏览器存储、真实后端认证与权限。
// 重点覆盖：同行人本机旅行 id 与组织者空间 id 不同也能加入并刷新保留；
// 投票 / 留言 / 任务认领；组织者开关共享编辑权限与移除成员；被移除后的访问提示；
// 账号隔离；邀请码换取的聊天室房间号；移动端布局。
import { launch, sleep } from './cdp.mjs'
import { BASE, OUT, registerAndLogin, createTravel, clickText, collectErrors } from './helpers.mjs'

const stamp = String(Date.now()).slice(-8)
const phoneA = '136' + stamp
const phoneB = '137' + (String(Number(stamp) + 4321).padStart(8, '0')).slice(-8)
const PASSWORD = 'e2e-pass-123'
const results = []
const ok = (name, extra = '') => { results.push({ name, pass: true, extra }); console.log('PASS', name, extra) }
const bad = (name, extra = '') => { results.push({ name, pass: false, extra }); console.log('FAIL', name, extra) }
const check = (name, condition, extra = '') => condition ? ok(name, extra) : bad(name, extra)

const org = await launch({ port: 9228 })
const mem = await launch({ port: 9229 })
for (const [page, label] of [[org, 'organizer'], [mem, 'member']]) {
  page.on('Runtime.exceptionThrown', p => results.push({ name: `${label}-runtime-exception`, pass: false, extra: p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '' }))
}

const nicknameOf = phone => `用户${phone.slice(-4)}`

async function collabText(page) {
  return page.evaluate("document.querySelector('.collab')?.innerText || ''")
}

async function waitCollab(page, predicate, { timeout = 15000 } = {}) {
  await page.waitFor(`(() => { const el = document.querySelector('.collab'); if (!el) return false; return (${predicate})(el.innerText || '') })()`, { timeout })
}

async function connectCollab(page) {
  await page.waitFor("!!document.querySelector('.collab')", { timeout: 12000 })
  await page.waitFor("!!document.querySelector('.collab input[type=password]')", { timeout: 8000 })
  await page.fill('.collab input[type=password]', PASSWORD)
  await clickText(page, '.collab button', '连接协作服务')
  await waitCollab(page, text => text.includes('协作身份'))
}

async function clickCollab(page, text) {
  await clickText(page, '.collab button', text)
}

async function ownerIdOf(page) {
  return page.evaluate("JSON.parse(localStorage.getItem('currentUser') || 'null')?.id || ''")
}

async function bindingOf(page, routeId) {
  return page.evaluate(`(() => {
    const owner = JSON.parse(localStorage.getItem('currentUser') || 'null')?.id || ''
    return localStorage.getItem('collab_trip:v1:' + encodeURIComponent(owner) + ':' + encodeURIComponent(${JSON.stringify(String(routeId))})) || ''
  })()`)
}

try {
  // ---------- 组织者 A：真实注册、建行程、连接协作、创建空间、发邀请 ----------
  await registerAndLogin(org, { phone: phoneA, password: PASSWORD })
  const idA = await createTravel(org, { title: '协作组织者行程', startDate: '2026-12-20', endDate: '2026-12-22' })
  await org.evaluate(`(() => {
    const owner = JSON.parse(localStorage.getItem('currentUser')).id
    const key = 'travel_data:v1:' + encodeURIComponent(owner)
    const data = JSON.parse(localStorage.getItem(key))
    const route = (data.routes || []).find(r => String(r.id) === ${JSON.stringify(idA)})
    route.pendingActivities = [
      { id: 'p-westlake', title: '西湖', location: [120.1551, 30.2741], coordinateSystem: 'GCJ-02' },
      { id: 'p-lingyin', title: '灵隐寺', location: [120.101, 30.2408], coordinateSystem: 'GCJ-02' }
    ]
    route.days = [
      {
        date: '2026-12-20', budget: 260,
        activities: [
          { id: 'org-a1', time: '09:00', title: '西湖晨游', description: '沿湖步行', notes: '带伞', completed: false, skipped: false },
          { id: 'org-a2', time: '13:30', title: '灵隐寺', description: '避开午后高峰', notes: '', completed: false, skipped: false }
        ]
      },
      {
        date: '2026-12-21', budget: 180,
        activities: [{ id: 'org-a3', time: '10:00', title: '河坊街', description: '试吃小吃', notes: '', completed: false, skipped: false }]
      },
      { date: '2026-12-22', activities: [] }
    ]
    localStorage.setItem(key, JSON.stringify(data))
    return 'OK'
  })()`)
  await org.goto(`${BASE}/routes/${idA}`)
  await org.waitFor("!!document.querySelector('.workbench')", { timeout: 12000 })
  await connectCollab(org)
  check('组织者连接协作身份后显示绑定手机号', (await collabText(org)).includes(phoneA), '')

  await clickCollab(org, '创建协作空间')
  await waitCollab(org, text => text.includes('成员（1）'))
  const orgText = await collabText(org)
  check('创建协作空间后显示组织者与 2 个候选地点', orgText.includes('组织者') && orgText.includes('候选地点投票（2）'), '')
  check('组织者看到邀请码表单', orgText.includes('生成邀请码'), '')

  // 勾选“允许编辑共享资料”，验证邀请权限会带到成员身上。
  await org.click('.invite-form input[type=checkbox]')
  await clickCollab(org, '生成邀请码')
  await org.waitFor("!!document.querySelector('.invite-code code')", { timeout: 8000 })
  const inviteCode = (await org.evaluate("document.querySelector('.invite-code code').innerText")).trim()
  check('生成真实邀请码', /^[A-Za-z0-9_-]{6,64}$/.test(inviteCode), inviteCode.slice(0, 6) + '…')

  // ---------- 同行人 B：自己的账号、自己的本机旅行（id 与 A 不同） ----------
  await registerAndLogin(mem, { phone: phoneB, password: PASSWORD })
  const idB = await createTravel(mem, { title: '同行人自己的行程', startDate: '2026-12-20', endDate: '2026-12-22' })
  check('两名用户的本机旅行 id 不同（覆盖协作空间 id 不一致的旧缺陷）', idA !== idB, `A=${idA.slice(0, 8)} B=${idB.slice(0, 8)}`)

  await mem.goto(`${BASE}/routes/${idB}`)
  await mem.waitFor("!!document.querySelector('.workbench')", { timeout: 12000 })
  await connectCollab(mem)
  await mem.fill('.collab input[placeholder="输入邀请码加入"]', inviteCode)
  await clickCollab(mem, '加入')
  await waitCollab(mem, text => text.includes('成员（2）'))

  const memText = await collabText(mem)
  check('同行人加入后看到 2 名成员且身份为成员', memText.includes('成员（2）') && memText.includes(nicknameOf(phoneA)), '')
  const boundB = await bindingOf(mem, idB)
  check('同行人本机旅行 id 已绑定到组织者的服务端空间 id', Boolean(boundB), boundB.slice(0, 8) + '…')
  check('组织者的空间 id 与同行人本机 id 不同', boundB !== idB, '')

  // ---------- 每日行程快照：组织者推送，同行人写回本机 ----------
  await clickCollab(org, '刷新')
  await waitCollab(org, text => text.includes('成员（2）'))
  await clickCollab(org, '同步本地行程到云端')
  await waitCollab(org, text => text.includes('共享每日行程（3 天 / 3 项）') && text.includes('西湖晨游'), { timeout: 12000 })
  const sharedText = await collabText(org)
  check('组织者把本机每日行程同步到云端', sharedText.includes('共享每日行程（3 天 / 3 项）') && sharedText.includes('最近同步'), '')
  check('共享行程保留日期、当日预算与活动摘要', sharedText.includes('2026-12-20') && sharedText.includes('预算 ¥260') && sharedText.includes('西湖晨游'), '')

  await clickCollab(mem, '刷新')
  await waitCollab(mem, text => text.includes('共享每日行程（3 天 / 3 项）') && text.includes('西湖晨游'), { timeout: 12000 })
  check('同行人刷新后看到组织者共享的每日行程', (await collabText(mem)).includes('灵隐寺'), '')

  await clickCollab(mem, '把云端行程写回本机')
  await mem.waitFor("!!document.querySelector('.feedback-dialog')", { timeout: 6000 })
  await mem.click('.feedback-actions .feedback-danger')
  await mem.waitFor("(() => { const el = document.querySelector('.collab'); return el && el.innerText.includes('已把云端 3 天共享行程写回本机并保存') })()", { timeout: 10000 })
  const memberLocal = await mem.evaluate(`(() => {
    const owner = JSON.parse(localStorage.getItem('currentUser')).id
    const data = JSON.parse(localStorage.getItem('travel_data:v1:' + encodeURIComponent(owner)) || 'null')
    const route = (data?.routes || []).find(r => String(r.id) === ${JSON.stringify(idB)})
    return JSON.stringify({
      title: route?.title || '',
      days: (route?.days || []).map(day => ({ date: day.date, budget: day.budget ?? null, titles: (day.activities || []).map(a => a.title) }))
    })
  })()`)
  const applied = JSON.parse(memberLocal)
  check('写回本机后同行人获得组织者的每日活动', applied.days.length === 3 && applied.days[0].titles.includes('西湖晨游') && applied.days[1].titles.includes('河坊街'), memberLocal.slice(0, 200))
  check('写回本机保留当日预算且不改旅行标题', applied.days[0].budget === 260 && applied.title === '同行人自己的行程', '')

  await mem.goto(`${BASE}/routes/${idB}`)
  await mem.waitFor("!!document.querySelector('.workbench')", { timeout: 12000 })
  await waitCollab(mem, text => text.includes('共享每日行程（3 天 / 3 项）'), { timeout: 12000 })
  check('写回本机并刷新后每日行程仍保留', (await collabText(mem)).includes('西湖晨游'), '')

  // 刷新：轮询/重新加载必须继续用绑定关系找到同一个空间，而不是当成“未创建”。
  await mem.goto(`${BASE}/routes/${idB}`)
  await mem.waitFor("!!document.querySelector('.workbench')", { timeout: 12000 })
  await waitCollab(mem, text => text.includes('成员（2）') && !text.includes('还没有协作空间'))
  const afterReload = await collabText(mem)
  check('刷新后仍能读取同一协作空间', afterReload.includes('成员（2）') && !afterReload.includes('还没有协作空间'), '')
  check('刷新后候选地点仍在', afterReload.includes('候选地点投票（2）'), '')

  // 投票
  await mem.evaluate(`(() => {
    const li = [...document.querySelectorAll('.votes li')].find(el => el.innerText.includes('西湖'))
    const btn = [...li.querySelectorAll('button')].find(b => b.innerText.trim() === '支持')
    btn.click()
    return 'OK'
  })()`)
  await mem.waitFor("(() => { const li = document.querySelector('.votes li'); return li && li.innerText.includes('支持 1') })()", { timeout: 8000 })
  check('同行人对候选地点投票成功', (await collabText(mem)).includes('支持 1'), '')

  // 留言
  await mem.fill('.comment-form textarea', '第一天的西湖能早点出发吗')
  await clickCollab(mem, '发布留言')
  await mem.waitFor("(() => [...document.querySelectorAll('.comments li')].some(li => li.innerText.includes('第一天的西湖能早点出发吗')))()", { timeout: 8000 })
  check('同行人发布按天留言成功', (await collabText(mem)).includes('第一天的西湖能早点出发吗'), '')

  // 任务认领
  await mem.fill('.collab input[placeholder="例如：预订民宿"]', '预订西湖边民宿')
  await clickCollab(mem, '添加任务')
  await mem.waitFor("(() => [...document.querySelectorAll('.tasks li')].some(li => li.innerText.includes('预订西湖边民宿')))()", { timeout: 8000 })
  await mem.evaluate(`(() => {
    const li = [...document.querySelectorAll('.tasks li')].find(el => el.innerText.includes('预订西湖边民宿'))
    const btn = [...li.querySelectorAll('button')].find(b => b.innerText.trim() === '认领')
    btn.click()
    return 'OK'
  })()`)
  await mem.waitFor("(() => [...document.querySelectorAll('.tasks li')].some(li => li.innerText.includes('认领：')))()", { timeout: 8000 })
  check('任务可被同行人认领', (await collabText(mem)).includes('认领：' + nicknameOf(phoneB)), '')

  // ---------- 组织者刷新后看到投票/留言/任务，并开启共享编辑权限 ----------
  await clickCollab(org, '刷新')
  await org.waitFor(`(() => { const el = document.querySelector('.collab'); return el && el.innerText.includes('支持 1') })()`, { timeout: 10000 })
  const orgSynced = await collabText(org)
  check('组织者刷新后看到同行人的协商内容', orgSynced.includes('支持 1') && orgSynced.includes('第一天的西湖能早点出发吗') && orgSynced.includes('预订西湖边民宿'), '')

  const memberNameB = nicknameOf(phoneB)
  // 组织者自己那条也带名字，必须排除“（我）”才能定位到同行人的成员条目。
  const memberItemSelector = `[...document.querySelectorAll('.members li')].find(el => el.innerText.includes(${JSON.stringify(memberNameB)}) && !el.innerText.includes('（我）'))`
  await org.evaluate(`(() => {
    const li = ${memberItemSelector}
    const box = li?.querySelector('input[type=checkbox]')
    if (!box) return 'MISSING'
    box.click()
    return 'OK'
  })()`)
  await sleep(600)
  await mem.evaluate("(() => { const b = [...document.querySelectorAll('.collab button')].find(x => x.innerText.trim() === '刷新'); if (b) b.click(); return !!b })()")
  await mem.waitFor("(() => { const el = document.querySelector('.collab'); return el && el.innerText.includes('同步本地候选地点') })()", { timeout: 12000 })
  check('组织者开启权限后同行人获得共享资料编辑权', true, '')

  // ---------- 移动端布局 ----------
  await mem.viewport(390, 844, { mobile: true })
  await sleep(500)
  const overflow = await mem.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  check('390px 协作面板无横向溢出', overflow === 0, `overflow=${overflow}`)
  await mem.screenshot(`${OUT}/s7-collaboration-390.png`, { fullPage: true })
  await mem.viewport(1440, 900)

  const memErrorsBeforeRemoval = await collectErrors(mem)

  // ---------- 组织者移除成员；被移除者立刻失去读取权限 ----------
  const removalDebug = await org.evaluate(`(() => {
    const li = ${memberItemSelector}
    return JSON.stringify({
      memberCount: document.querySelectorAll('.members li').length,
      member: li ? li.innerText.replace(/\\n/g, ' | ') : 'MISSING',
      buttons: li ? [...li.querySelectorAll('button')].map(b => b.innerText.trim() + (b.disabled ? '(disabled)' : '')) : []
    })
  })()`)
  console.log('DEBUG removal', removalDebug)
  const removalClick = await org.evaluate(`(() => {
    const li = ${memberItemSelector}
    const btn = li && [...li.querySelectorAll('button')].find(b => b.innerText.trim() === '移除')
    if (!btn) return 'MISSING'
    btn.click()
    return btn.disabled ? 'DISABLED' : 'OK'
  })()`)
  check('组织者点击移除成员', removalClick === 'OK', removalClick)
  // 移除是危险操作，组件先弹确认框，确认后才真正调用服务端。
  await org.waitFor("!!document.querySelector('.feedback-dialog')", { timeout: 6000 })
  await org.click('.feedback-actions .feedback-danger')
  await org.waitFor("(() => { const el = document.querySelector('.collab'); return el && el.innerText.includes('成员（1）') })()", { timeout: 10000 })
  check('组织者移除成员后成员数回到 1', true, '')

  await mem.evaluate("(() => { const b = [...document.querySelectorAll('.collab button')].find(x => x.innerText.trim() === '刷新'); if (b) b.click(); return !!b })()")
  await mem.waitFor("(() => { const el = document.querySelector('.collab'); return el && el.innerText.includes('你已不在该旅行的协作空间中') })()", { timeout: 12000 })
  const removedText = await collabText(mem)
  check('被移除的成员看到权限提示且看不到协商内容', removedText.includes('你已不在该旅行的协作空间中') && !removedText.includes('候选地点投票'), '')
  // 被移除时保留绑定：重新加入必须走新邀请码，而不是悄悄回退成本机 id 当成“没有空间”。
  check('被移除后仍指向原服务端空间，不会误判为未创建', (await bindingOf(mem, idB)) === boundB, '')

  // 账号隔离：组织者没有同行人本机旅行的绑定，同行人本机数据完整。
  const orgBindingForB = await bindingOf(org, idB)
  check('绑定按账号隔离，组织者不持有同行人的绑定', orgBindingForB === '', '')
  const memLocalRoutes = await mem.evaluate(`(() => {
    const owner = JSON.parse(localStorage.getItem('currentUser')).id
    const data = JSON.parse(localStorage.getItem('travel_data:v1:' + encodeURIComponent(owner)) || 'null')
    return (data?.routes || []).map(r => r.title)
  })()`)
  check('同行人本机旅行数据未被协作操作破坏', memLocalRoutes.includes('同行人自己的行程'), JSON.stringify(memLocalRoutes))
  check('被移除前同行人页面无脚本错误', memErrorsBeforeRemoval.length === 0, memErrorsBeforeRemoval.join(' | ').slice(0, 300))

  // ---------- 聊天室：令牌由后端签发，房间号使用服务端空间 id；Go 聊天服务本地未运行 ----------
  // 直接调用服务端接口，确认令牌真实签发、且被移除成员已无法取得令牌。
  const chatTokenProbe = await org.evaluate(`(async () => {
    const owner = JSON.parse(localStorage.getItem('currentUser')).id
    const sess = JSON.parse(localStorage.getItem('collab_session:v1:' + encodeURIComponent(owner)) || 'null')
    const res = await fetch('/api/collaboration/trips/' + encodeURIComponent(${JSON.stringify(boundB)}) + '/chat-token', {
      method: 'POST', headers: { Authorization: 'Bearer ' + sess.token }
    })
    const data = await res.json().catch(() => ({}))
    return JSON.stringify({ status: res.status, roomId: data.roomId || '', hasToken: typeof data.token === 'string' && data.token.length > 20 })
  })()`)
  const chatProbe = JSON.parse(chatTokenProbe)
  check('组织者可获取真实聊天令牌且房间号为 trip-<服务端空间id>', chatProbe.status === 200 && chatProbe.hasToken && chatProbe.roomId === 'trip-' + boundB, chatTokenProbe)

  const removedChatProbe = await mem.evaluate(`(async () => {
    const owner = JSON.parse(localStorage.getItem('currentUser')).id
    const sess = JSON.parse(localStorage.getItem('collab_session:v1:' + encodeURIComponent(owner)) || 'null')
    const res = await fetch('/api/collaboration/trips/' + encodeURIComponent(${JSON.stringify(boundB)}) + '/chat-token', {
      method: 'POST', headers: { Authorization: 'Bearer ' + sess.token }
    })
    const data = await res.json().catch(() => ({}))
    return JSON.stringify({ status: res.status, code: data.code || '' })
  })()`)
  const removedChat = JSON.parse(removedChatProbe)
  check('被移除成员请求聊天令牌被服务端拒绝', removedChat.status === 403, removedChatProbe)

  const orgErrorsBeforeChat = await collectErrors(org)
  await clickCollab(org, '打开同行聊天室')
  await org.waitFor("location.pathname === '/chat'", { timeout: 10000 })
  const chatUrl = await org.evaluate('location.search')
  check('聊天室房间号使用服务端协作空间 id', chatUrl.includes('room=' + encodeURIComponent('trip-' + boundB)), chatUrl.slice(0, 80))
  await org.waitFor("!!document.querySelector('.chat-room')", { timeout: 10000 })
  await sleep(1500)
  const chatBanner = await org.evaluate("(document.querySelector('.connection-banner')?.innerText || document.querySelector('.header-live')?.innerText || '').trim()")
  results.push({ name: `聊天服务连接状态（本地未运行 Go 服务）：${chatBanner.replace(/\n/g, ' ').slice(0, 40)}`, pass: true, extra: '' })
  check('组织者离开工作台前无脚本错误', orgErrorsBeforeChat.length === 0, orgErrorsBeforeChat.join(' | ').slice(0, 300))

  await org.screenshot(`${OUT}/s7-collaboration-chat.png`)
} catch (error) {
  bad('脚本执行异常', error.message)
  console.error(error)
} finally {
  await org.close()
  await mem.close()
}

console.log('\nSUMMARY')
for (const item of results) console.log(item.pass ? 'PASS' : 'FAIL', item.name, item.extra || '')
const failed = results.filter(item => !item.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exitCode = failed.length ? 1 : 0
