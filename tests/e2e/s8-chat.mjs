// 功能 7 深化：真实 Go 聊天服务在线时的消息收发、在线人数、令牌校验、服务端历史恢复、
// 断网重连补收与移除成员即时断开。
// 前置：Node 后端（含 CHAT_AUTH_SECRET / CHAT_ADMIN_SECRET / CHAT_INTERNAL_URL）与 Go chat-server 均在运行。
import { launch, sleep } from './cdp.mjs'
import { BASE, OUT, registerAndLogin, createTravel, clickText } from './helpers.mjs'

const stamp = String(Date.now()).slice(-8)
const phoneA = '136' + stamp
const phoneB = '137' + (String(Number(stamp) + 7321).padStart(8, '0')).slice(-8)
const PASSWORD = 'e2e-pass-123'
const results = []
const ok = (name, extra = '') => { results.push({ name, pass: true, extra }); console.log('PASS', name, extra) }
const bad = (name, extra = '') => { results.push({ name, pass: false, extra }); console.log('FAIL', name, extra) }
const check = (name, condition, extra = '') => condition ? ok(name, extra) : bad(name, extra)

let serverTripId = ''
const org = await launch({ port: 9230 })
const mem = await launch({ port: 9231 })
for (const [page, label] of [[org, 'organizer'], [mem, 'member']]) {
  page.on('Runtime.exceptionThrown', p => results.push({ name: `${label}-runtime-exception`, pass: false, extra: p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '' }))
}

async function waitCollab(page, predicate, { timeout = 15000 } = {}) {
  await page.waitFor(`(() => { const el = document.querySelector('.collab'); return !!el && (${predicate})(el.innerText || '') })()`, { timeout })
}

async function connectCollab(page) {
  await page.waitFor("!!document.querySelector('.collab input[type=password]')", { timeout: 15000 })
  await page.fill('.collab input[type=password]', PASSWORD)
  await clickText(page, '.collab button', '连接协作服务')
  await waitCollab(page, text => text.includes('协作身份'))
}

async function openChatFromWorkbench(page) {
  await page.waitFor("!!document.querySelector('.collab')", { timeout: 12000 })
  await clickText(page, '.collab button', '打开同行聊天室')
  await page.waitFor("location.pathname === '/chat'", { timeout: 10000 })
  await page.waitFor("!!document.querySelector('.chat-room')", { timeout: 10000 })
}

async function waitConnected(page, { timeout = 15000 } = {}) {
  await page.waitFor("(() => { const el = document.querySelector('.hint-conn'); return !!el && el.innerText.includes('已连接') })()", { timeout })
}

async function sendChat(page, text) {
  await page.fill('.message-input', text)
  await page.click('.btn-send')
}

async function chatText(page) {
  return page.evaluate("document.querySelector('.messages-container')?.innerText || ''")
}

async function chatState(page) {
  return page.evaluate(`(() => ({
    connected: (document.querySelector('.hint-conn')?.innerText || '').includes('已连接'),
    status: document.querySelector('.connection-banner')?.innerText || document.querySelector('.header-live')?.innerText || '',
    online: document.querySelector('.header-live')?.innerText || '',
    sendDisabled: !!document.querySelector('.btn-send')?.disabled,
    inputDisabled: !!document.querySelector('.message-input')?.disabled
  }))()`)
}

try {
  // ---------- 准备两个真实协作账号 ----------
  await registerAndLogin(org, { phone: phoneA, password: PASSWORD })
  const idA = await createTravel(org, { title: '聊天互通测试行程', startDate: '2026-12-24', endDate: '2026-12-26' })
  await org.goto(`${BASE}/routes/${idA}`)
  await org.waitFor("!!document.querySelector('.workbench')", { timeout: 12000 })
  await connectCollab(org)
  await clickText(org, '.collab button', '创建协作空间')
  await waitCollab(org, text => text.includes('成员（1）'))

  await clickText(org, '.collab button', '生成邀请码')
  await org.waitFor("!!document.querySelector('.invite-code code')", { timeout: 8000 })
  const inviteCode = (await org.evaluate("document.querySelector('.invite-code code').innerText")).trim()
  serverTripId = await org.evaluate(`(() => {
    const owner = JSON.parse(localStorage.getItem('currentUser')).id
    return localStorage.getItem('collab_trip:v1:' + encodeURIComponent(owner) + ':' + encodeURIComponent(${JSON.stringify(idA)})) || ${JSON.stringify(idA)}
  })()`)
  check('协作空间已创建并取得服务端 id', Boolean(serverTripId), serverTripId.slice(0, 8) + '…')

  await registerAndLogin(mem, { phone: phoneB, password: PASSWORD })
  const idB = await createTravel(mem, { title: '聊天同行人的行程', startDate: '2026-12-24', endDate: '2026-12-26' })
  await mem.goto(`${BASE}/routes/${idB}`)
  await mem.waitFor("!!document.querySelector('.workbench')", { timeout: 12000 })
  await connectCollab(mem)
  await mem.fill('.collab input[placeholder="输入邀请码加入"]', inviteCode)
  await clickText(mem, '.collab button', '加入')
  await waitCollab(mem, text => text.includes('成员（2）'))
  check('同行人加入协作空间', true, '')

  // ---------- 两端进入同行聊天室并真实连上 Go 服务 ----------
  await openChatFromWorkbench(org)
  await waitConnected(org)
  check('组织者连接真实聊天服务', true, '')

  await openChatFromWorkbench(mem)
  await waitConnected(mem)
  check('同行人连接真实聊天服务', true, '')

  await org.waitFor("(() => (document.querySelector('.header-live')?.innerText || '').includes('2 人在线'))()", { timeout: 15000 })
  await mem.waitFor("(() => (document.querySelector('.header-live')?.innerText || '').includes('2 人在线'))()", { timeout: 15000 })
  check('两端在线人数一致为 2', true, (await chatState(org)).online.replace(/\n/g, ' '))

  const orgErrorsBeforeChat = await org.consoleErrors()
  const memErrorsBeforeChat = await mem.consoleErrors()

  // ---------- 双向真实消息 ----------
  const msgFromOrg = '集合时间改到早上八点'
  await sendChat(org, msgFromOrg)
  await mem.waitFor(`(() => (document.querySelector('.messages-container')?.innerText || '').includes(${JSON.stringify(msgFromOrg)}))()`, { timeout: 12000 })
  check('同行人实时收到组织者消息', true, msgFromOrg)

  const msgFromMem = '收到，我会提前到'
  await sendChat(mem, msgFromMem)
  await org.waitFor(`(() => (document.querySelector('.messages-container')?.innerText || '').includes(${JSON.stringify(msgFromMem)}))()`, { timeout: 12000 })
  check('组织者实时收到同行人消息', true, msgFromMem)

  const orgChatText = await chatText(org)
  check('消息列表双向可见且带发送者区分', orgChatText.includes(msgFromOrg) && orgChatText.includes(msgFromMem), '')

  // ---------- 刷新后从服务端历史恢复（先清掉本机缓存，确保数据来自 Go /history） ----------
  const memUrl = await mem.evaluate('location.href')
  const chatStorageKey = await mem.evaluate(`(() => {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null')
    const room = new URLSearchParams(location.search).get('room')
    return user && room ? 'chat_history_' + user.id + '_' + room : ''
  })()`)
  check('取得本机聊天记录键', Boolean(chatStorageKey), chatStorageKey)
  await mem.evaluate(`localStorage.removeItem(${JSON.stringify(chatStorageKey)})`)
  const localCleared = await mem.evaluate(`localStorage.getItem(${JSON.stringify(chatStorageKey)}) === null`)
  check('刷新前已清除本机聊天记录', localCleared, '')
  await mem.goto(memUrl)
  await mem.waitFor("!!document.querySelector('.chat-room')", { timeout: 10000 })
  await waitConnected(mem)
  await mem.waitFor(`(() => (document.querySelector('.messages-container')?.innerText || '').includes(${JSON.stringify(msgFromOrg)}))()`, { timeout: 15000 })
  check('清空本机缓存后仍从 Go 服务端历史恢复消息', true, '')
  const restoreNote = await mem.evaluate("document.querySelector('.chat-replay-note')?.innerText || ''")
  check('首次进入显示服务端历史加载提示', restoreNote.includes('加载') && restoreNote.includes('历史'), restoreNote)

  // ---------- 断网重连：离线期间错过的消息在恢复在线后补收 ----------
  await mem.evaluate("window.dispatchEvent(new Event('offline'))")
  await mem.waitFor("(() => { const el = document.querySelector('.hint-conn'); return !!el && !el.innerText.includes('已连接') })()", { timeout: 8000 })
  check('离线事件后聊天连接断开', !(await chatState(mem)).connected, '')

  const offlineMessage = '离线期间发送的集合提醒'
  await sendChat(org, offlineMessage)
  await sleep(800)
  const beforeOnline = await chatText(mem)
  check('离线期间不会收到实时消息', !beforeOnline.includes(offlineMessage), '')

  await mem.evaluate("window.dispatchEvent(new Event('online'))")
  await waitConnected(mem)
  await mem.waitFor(`(() => (document.querySelector('.messages-container')?.innerText || '').includes(${JSON.stringify(offlineMessage)}))()`, { timeout: 15000 })
  check('恢复在线后自动补收离线期间的消息', true, offlineMessage)
  const replayNote = await mem.evaluate("document.querySelector('.chat-replay-note')?.innerText || ''")
  check('恢复在线后显示补收提示', replayNote.includes('补收'), replayNote)

  // ---------- 手机布局 ----------
  await org.viewport(390, 844, { mobile: true })
  await sleep(400)
  const overflow = await org.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  check('390px 同行聊天室无横向溢出', overflow === 0, `overflow=${overflow}`)
  await org.screenshot(`${OUT}/s8-chat-390.png`, { fullPage: true })
  await org.viewport(1440, 900)

  // ---------- 令牌校验：无令牌的 trip 房间连接必须被拒绝 ----------
  const probe = await new Promise(resolve => {
    let settled = false
    const ws = new WebSocket(`ws://127.0.0.1:8080/ws?userId=anonymous&username=hacker&roomId=trip-${serverTripId}`)
    const done = result => { if (settled) return; settled = true; try { ws.close() } catch { /* ignore */ } resolve(result) }
    ws.addEventListener('open', () => done('OPEN'))
    ws.addEventListener('close', () => done('CLOSED'))
    ws.addEventListener('error', () => done('ERROR'))
    setTimeout(() => done('TIMEOUT'), 6000)
  })
  check('未携带令牌的同行房间连接被服务端拒绝', probe === 'CLOSED' || probe === 'ERROR', probe)

  // ---------- 组织者移除成员：Go 通过 /internal/revoke 立即断开同行人 ----------
  await org.goto(`${BASE}/routes/${idA}`)
  await org.waitFor("!!document.querySelector('.collab')", { timeout: 12000 })
  await clickText(org, '.collab button', '刷新')
  await waitCollab(org, text => text.includes('成员（2）'))
  const memberNameB = `用户${phoneB.slice(-4)}`
  const removalClick = await org.evaluate(`(() => {
    const li = [...document.querySelectorAll('.members li')].find(el => el.innerText.includes(${JSON.stringify(memberNameB)}) && !el.innerText.includes('（我）'))
    const btn = li && [...li.querySelectorAll('button')].find(b => b.innerText.trim() === '移除')
    if (!btn) return 'MISSING'
    btn.click()
    return 'OK'
  })()`)
  check('组织者发起移除成员', removalClick === 'OK', removalClick)
  await org.waitFor("!!document.querySelector('.feedback-dialog')", { timeout: 6000 })
  await org.click('.feedback-actions .feedback-danger')
  await waitCollab(org, text => text.includes('成员（1）'))

  await mem.waitFor("(() => { const el = document.querySelector('.hint-conn'); return !!el && !el.innerText.includes('已连接') })()", { timeout: 15000 })
  const revokedState = await chatState(mem)
  check('被移除成员的聊天连接被立即断开', !revokedState.connected, JSON.stringify(revokedState).slice(0, 200))
  check('被移除后聊天输入与发送不可用', revokedState.inputDisabled && revokedState.sendDisabled, JSON.stringify({ input: revokedState.inputDisabled, send: revokedState.sendDisabled }))

  const reconnectClick = await mem.evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => ['重连', '手动重连'].includes(b.innerText.trim()))
    if (!btn) return 'MISSING'
    btn.click()
    return 'OK'
  })()`)
  check('被移除成员尝试重连', reconnectClick === 'OK', reconnectClick)
  await sleep(3000)
  const afterReconnect = await chatState(mem)
  check('被移除成员无法重连成功', !afterReconnect.connected, JSON.stringify(afterReconnect).slice(0, 240))

  await org.screenshot(`${OUT}/s8-chat-organizer.png`)
  check('组织者聊天过程中无脚本错误', orgErrorsBeforeChat.length === 0, orgErrorsBeforeChat.join(' | ').slice(0, 300))
  check('同行人断开前无脚本错误', memErrorsBeforeChat.length === 0, memErrorsBeforeChat.join(' | ').slice(0, 300))
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
