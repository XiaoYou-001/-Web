// Feature 3 browser verification: 旅行手账与足迹 (quick journal, drafts, map, photos, isolation)
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { launch, sleep } from './cdp.mjs'
import { BASE, OUT, registerAndLogin, createTravel, openTravel, clickText } from './helpers.mjs'

const stamp = String(Date.now()).slice(-8)
const phoneA = '137' + stamp
const phoneB = '136' + stamp
const results = []
const ok = (name, extra = '') => { results.push({ name, pass: true, extra }); console.log('PASS', name, extra) }
const bad = (name, extra = '') => { results.push({ name, pass: false, extra }); console.log('FAIL', name, extra) }

const PHOTO_DIR = `${OUT}/fixtures`
mkdirSync(PHOTO_DIR, { recursive: true })
const PHOTO_PATH = `${PHOTO_DIR}/photo.png`
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c }
  return table
})()
const crc32 = buffer => { let c = -1; for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 }
function pngChunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}
function makePng(width = 8, height = 8) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2
  const stride = width * 3 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * stride + 1 + x * 3
      raw[offset] = 220; raw[offset + 1] = 60; raw[offset + 2] = 60
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))])
}
writeFileSync(PHOTO_PATH, makePng())

const page = await launch({ port: 9225 })
const runtimeErrors = []
page.on('Runtime.exceptionThrown', p => {
  const details = p.exceptionDetails || {}
  const exception = details.exception || {}
  runtimeErrors.push({
    text: details.text || '',
    description: exception.description || '',
    value: exception.value || '',
    url: details.url || '',
    line: details.lineNumber,
    column: details.columnNumber,
    stack: (details.stackTrace?.callFrames || []).slice(0, 4).map(frame => `${frame.functionName || '(anonymous)'}@${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`)
  })
})

const WORK_DRAFT = '.travel-journal .quick-form'

async function fillIn(scopeSel, selector, value) {
  const res = await page.evaluate(`(() => {
    const scope = document.querySelector(${JSON.stringify(scopeSel)})
    if (!scope) return 'NO_SCOPE'
    const el = scope.querySelector(${JSON.stringify(selector)})
    if (!el) return 'NO_FIELD'
    el.focus()
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return 'OK'
  })()`)
  if (res !== 'OK') throw new Error(`fillIn(${scopeSel} ${selector}): ${res}`)
}

const bodyText = () => page.evaluate('document.body.innerText')
const feedbackText = () => page.evaluate("([...document.querySelectorAll('.feedback-notice')].map(n => n.innerText).join(' | '))")
const draftKeys = () => page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('travel_journal_draft:v1:'))")
const currentUserId = () => page.evaluate("(JSON.parse(localStorage.getItem('currentUser') || 'null') || {}).id || ''")
async function clearNotices() {
  await page.evaluate("document.querySelectorAll('.feedback-notice button[aria-label=\"关闭提示\"]').forEach(b => b.click())")
  await sleep(120)
}

try {
  await registerAndLogin(page, { phone: phoneA })
  ok('账号A注册并登录', phoneA)
  const userIdA = await currentUserId()
  if (userIdA) ok('取得账号A id', userIdA); else bad('取得账号A id')

  const travelId = await createTravel(page, { title: '手账测试旅行', startDate: '2026-12-10', endDate: '2026-12-12', persons: 2, budget: 2000 })
  ok('创建旅行', travelId)
  await openTravel(page, travelId)
  await page.waitFor("!!document.querySelector('.travel-journal')", { timeout: 8000 })
  const summary = await page.evaluate("document.querySelector('.travel-journal summary').innerText")
  if (summary.includes('还没有记录')) ok('工作台手账面板初始为空', JSON.stringify(summary)); else bad('工作台手账面板初始为空', summary)

  await page.evaluate("document.querySelector('.travel-journal summary').click()")
  await page.waitFor("document.querySelector('.travel-journal').open === true")
  await fillIn(WORK_DRAFT, 'input[maxlength="80"]', '鼓浪屿的清晨')
  await fillIn(WORK_DRAFT, 'textarea', '海风很轻，街角的面线糊很热。')
  await sleep(800)
  const routeDraftKeys = (await draftKeys()).filter(key => key.includes('route'))
  if (routeDraftKeys.length === 1) ok('工作台输入自动保存为旅行内草稿'); else bad('工作台输入自动保存为旅行内草稿', JSON.stringify(routeDraftKeys))

  await openTravel(page, travelId)
  await page.waitFor("!!document.querySelector('.travel-journal')", { timeout: 8000 })
  const restored = await page.evaluate(`(() => {
    const form = document.querySelector(${JSON.stringify(WORK_DRAFT)})
    return form ? { title: form.querySelector('input[maxlength="80"]').value, content: form.querySelector('textarea').value } : null
  })()`)
  const restoreNotice = await feedbackText()
  if (restored?.title === '鼓浪屿的清晨' && restored.content.includes('面线糊') && restoreNotice.includes('已恢复上次未保存的手账草稿')) ok('刷新后恢复工作台草稿', restoreNotice)
  else bad('刷新后恢复工作台草稿', JSON.stringify({ restored, restoreNotice }))

  await page.evaluate(`document.querySelector(${JSON.stringify(WORK_DRAFT)}).querySelector('button[type=submit]').click()`)
  await sleep(400)
  const afterQuickSave = await page.evaluate("(document.querySelector('.travel-journal .entries') || {}).textContent || ''")
  const draftAfterSave = await draftKeys()
  if (afterQuickSave.includes('鼓浪屿的清晨') && draftAfterSave.length === 0) ok('工作台保存手账并清除草稿', JSON.stringify(draftAfterSave))
  else bad('工作台保存手账并清除草稿', JSON.stringify({ afterQuickSave, draftAfterSave }))

  await page.goto(BASE + '/journal')
  await page.waitFor("!!document.querySelector('.journal-page')", { timeout: 8000 })
  await sleep(600)
  let journalText = await page.evaluate("document.querySelector('.journal-page').innerText")
  const statsText = await page.evaluate("document.querySelector('.journal-hero .stats').innerText")
  if (journalText.includes('鼓浪屿的清晨') && /手账\s*1/.test(statsText)) ok('全部手账页显示已写内容与统计', JSON.stringify(statsText)); else bad('全部手账页显示已写内容与统计', JSON.stringify({ journalText, statsText }))

  await clickText(page, 'button', '写一篇手账')
  await page.waitFor("!!document.querySelector('.modal-overlay .modal')")
  await fillIn('.modal-overlay .modal', 'input[maxlength="80"]', '苏堤的清晨')
  await fillIn('.modal-overlay .modal', 'input[placeholder*="苏堤"]', '苏堤')
  await fillIn('.modal-overlay .modal', 'input[placeholder*="30.2501"]', '30.2501')
  await fillIn('.modal-overlay .modal', 'input[placeholder*="120.1501"]', '120.1501')
  await fillIn('.modal-overlay .modal', 'input[maxlength="200"]', '西湖, 清晨')
  await fillIn('.modal-overlay .modal', 'textarea', '沿湖走了两个小时，柳枝刚发芽。')
  await sleep(800)
  const pageDraftKeys = (await draftKeys()).filter(key => key.endsWith(':page'))
  if (pageDraftKeys.length === 1) ok('弹窗输入停顿后写入页面级草稿'); else bad('弹窗输入停顿后写入页面级草稿', JSON.stringify(await draftKeys()))

  await page.evaluate("document.querySelector('.modal-overlay .modal .close').click()")
  await page.waitFor("!document.querySelector('.modal-overlay')")
  const draftBar = await page.evaluate("(document.querySelector('.draft-bar') || {}).innerText || ''")
  if (draftBar.includes('有未保存的手账草稿')) ok('关闭弹窗后显示草稿提示', JSON.stringify(draftBar)); else bad('关闭弹窗后显示草稿提示', draftBar)

  await page.goto(BASE + '/journal')
  await page.waitFor("!!document.querySelector('.draft-bar')", { timeout: 8000 })
  await clickText(page, '.draft-bar button', '继续编辑')
  await page.waitFor("!!document.querySelector('.modal-overlay .modal')")
  const resumed = await page.evaluate(`(() => {
    const modal = document.querySelector('.modal-overlay .modal')
    return {
      title: modal.querySelector('input[maxlength="80"]').value,
      place: modal.querySelector('input[placeholder*="苏堤"]').value,
      content: modal.querySelector('textarea').value
    }
  })()`)
  if (resumed.title === '苏堤的清晨' && resumed.place === '苏堤' && resumed.content.includes('柳枝')) ok('刷新后从草稿继续编辑', JSON.stringify(resumed))
  else bad('刷新后从草稿继续编辑', JSON.stringify(resumed))

  await page.evaluate("document.querySelector('.modal-overlay .modal').querySelector('button[type=submit]').click()")
  await sleep(500)
  journalText = await page.evaluate("document.querySelector('.journal-page').innerText")
  const afterModalSaveDrafts = await draftKeys()
  if (journalText.includes('苏堤的清晨') && journalText.includes('#西湖') && !journalText.includes('有未保存的手账草稿') && afterModalSaveDrafts.length === 0) ok('保存弹窗手账并清除草稿', JSON.stringify(afterModalSaveDrafts))
  else bad('保存弹窗手账并清除草稿', JSON.stringify({ afterModalSaveDrafts, journalText: journalText.slice(0, 400) }))

  // 足迹地图：经纬度都填写时生成真实地图标记，不能只用列表假装地图
  const footprintRow = await page.evaluate("(document.querySelector('.footprints > ul > li') || {}).innerText || ''")
  if (footprintRow.includes('苏堤')) ok('足迹列表包含已确认坐标的地点', JSON.stringify(footprintRow)); else bad('足迹列表包含已确认坐标的地点', footprintRow)
  const mapLink = await page.evaluate("(document.querySelector('.footprints > ul > li a') || {}).href || ''")
  if (mapLink.includes('uri.amap.com/marker') && mapLink.includes('30.2501')) ok('足迹可跳转高德地图', mapLink); else bad('足迹可跳转高德地图', mapLink)
  const mapCanvas = await page.evaluate("!!document.querySelector('.footprints .map-canvas')")
  if (mapCanvas) ok('足迹地图容器已渲染'); else bad('足迹地图容器已渲染')
  let mapState = 'timeout'
  let mapReady = false
  for (let i = 0; i < 160; i++) {
    mapState = await page.evaluate(`(() => {
      const canvas = document.querySelector('.footprints .map-canvas')
      if (!canvas) return 'NO_CANVAS'
      if (canvas.querySelector('.amap-maps')) return 'READY'
      const alert = document.querySelector('.footprints .alert')
      if (alert) return 'ERROR:' + alert.innerText
      return 'LOADING'
    })()`)
    if (mapState === 'READY' || mapState.startsWith('ERROR')) break
    await sleep(100)
  }
  if (mapState === 'READY') { mapReady = true; ok('足迹地图由高德 SDK 真实渲染') } else bad('足迹地图由高德 SDK 真实渲染', mapState)

  // 照片：IndexedDB 上传 + 刷新后恢复
  await page.send('DOM.enable')
  const { root } = await page.send('DOM.getDocument', { depth: -1, pierce: true })
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.entry .upload input[type=file]' })
  if (nodeId) {
    await page.send('DOM.setFileInputFiles', { nodeId, files: [PHOTO_PATH] })
    await sleep(1200)
    const photoState = await page.evaluate(`(() => {
      const img = document.querySelector('.entry .photos img')
      return { has: !!img, src: img ? img.src.slice(0, 5) : '', loaded: img ? img.naturalWidth > 0 : false, notice: [...document.querySelectorAll('.feedback-notice')].map(n => n.innerText).join(' | ') }
    })()`)
    if (photoState.has && photoState.src === 'blob:' && photoState.loaded) ok('手账照片写入 IndexedDB 并显示', photoState.notice)
    else bad('手账照片写入 IndexedDB 并显示', JSON.stringify(photoState))
    await page.goto(BASE + '/journal')
    await page.waitFor("!!document.querySelector('.entry .photos img')", { timeout: 8000 }).then(() => ok('刷新后照片从 IndexedDB 恢复')).catch(() => bad('刷新后照片从 IndexedDB 恢复'))
  } else bad('找到照片上传控件')

  // 导出所选
  await clearNotices()
  await page.evaluate("document.querySelector('.entry input[type=checkbox]').click()")
  await sleep(150)
  await clickText(page, '.toolbar button', '导出所选')
  await sleep(300)
  const exportNotice = await feedbackText()
  if (exportNotice.includes('已导出 1 篇手账')) ok('导出所选手账有明确反馈', exportNotice); else bad('导出所选手账有明确反馈', exportNotice)

  // 手机宽度
  await page.viewport(390, 844, { mobile: true })
  await sleep(400)
  const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  if (overflow <= 1) ok('390px 手账页无横向溢出', `overflow=${overflow}`); else bad('390px 手账页无横向溢出', `overflow=${overflow}`)
  await page.viewport(1440, 900)
  await sleep(200)

  // 编辑已有手账：改动经纬度后足迹应更新
  await clickText(page, '.entry .actions button', '编辑')
  await page.waitFor("!!document.querySelector('.modal-overlay .modal')")
  await fillIn('.modal-overlay .modal', 'input[placeholder*="30.2501"]', '31.2304')
  await fillIn('.modal-overlay .modal', 'input[placeholder*="120.1501"]', '121.4737')
  await page.evaluate("document.querySelector('.modal-overlay .modal').querySelector('button[type=submit]').click()")
  await sleep(500)
  const editedLink = await page.evaluate("(document.querySelector('.footprints > ul > li a') || {}).href || ''")
  if (editedLink.includes('31.2304')) ok('编辑手账后足迹坐标同步更新', editedLink); else bad('编辑手账后足迹坐标同步更新', editedLink)

  // 删除手账
  await page.evaluate("document.querySelector('.entry .actions button.danger-text').click()")
  await sleep(300)
  const dialog = await page.evaluate("!!document.querySelector('dialog.feedback-dialog[open]')")
  if (dialog) {
    await page.evaluate("document.querySelector('.feedback-dialog .feedback-actions button:last-child').click()")
    await sleep(500)
    const remaining = await page.evaluate("document.querySelectorAll('.entry').length")
    if (remaining === 1) ok('删除单篇手账后其余内容保留'); else bad('删除单篇手账后其余内容保留', String(remaining))
  } else bad('删除手账弹出确认框')

  // 账号隔离
  const beforeSwitchKeys = await page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('travel_journal:v1:')).length")
  await page.evaluate("localStorage.clear()")
  await registerAndLogin(page, { phone: phoneB })
  await page.goto(BASE + '/journal')
  await page.waitFor("!!document.querySelector('.journal-page')")
  await sleep(500)
  const bText = await page.evaluate("document.querySelector('.journal-page').innerText")
  if (bText.includes('还没有手账') && !bText.includes('苏堤的清晨')) ok('账号B看不到账号A的手账', `A keys=${beforeSwitchKeys}`); else bad('账号B看不到账号A的手账', bText.slice(0, 300))

  // 损坏数据保护
  const userIdB = await currentUserId()
  await page.evaluate(`localStorage.setItem('travel_journal:v1:${userIdB}', '{broken')`)
  await page.goto(BASE + '/journal')
  await page.waitFor("!!document.querySelector('.journal-page')")
  await sleep(400)
  const corruptText = await page.evaluate("document.querySelector('.journal-page').innerText")
  const kept = await page.evaluate(`localStorage.getItem('travel_journal:v1:${userIdB}')`)
  if (corruptText.includes('手账数据无法读取') && kept === '{broken') ok('损坏的手账数据只提示不覆盖'); else bad('损坏的手账数据只提示不覆盖', JSON.stringify({ corruptText: corruptText.slice(0, 200), kept }))

  const errors = await page.evaluate('(window.__e2eErrors || []).slice()').catch(() => [])
  const pageErrors = errors.filter(text => !/Map SDK|Failed to load resource|net::ERR/.test(text))
  if (pageErrors.length === 0) ok('页面无脚本错误'); else bad('页面无脚本错误', JSON.stringify(pageErrors))
  // 高德 JS SDK 在瓦片请求失败时会以空原因 Promise.reject() 形成“Uncaught (in promise)”，
  // 没有 description/stack，地图本身仍能 READY。只忽略地图已渲染时的这类外部空拒绝，
  // 业务代码的未捕获异常仍然失败。
  const mapNoise = mapReady
    ? runtimeErrors.filter(error => error.text === 'Uncaught (in promise)' && !error.description && !error.stack?.length)
    : []
  const unexpectedRuntimeErrors = runtimeErrors.filter(error => !mapNoise.includes(error))
  if (unexpectedRuntimeErrors.length === 0) {
    ok('无业务未捕获异常', mapNoise.length ? `已忽略高德 SDK 空拒绝 ${mapNoise.length} 条` : '')
  } else {
    const groups = new Map()
    for (const error of unexpectedRuntimeErrors) {
      const key = `${error.text} | ${error.description} | ${error.url}:${error.line} | ${error.stack[0] || ''}`
      groups.set(key, (groups.get(key) || 0) + 1)
    }
    bad('无业务未捕获异常', JSON.stringify([...groups].slice(0, 8)))
  }
} catch (error) {
  bad('harness 异常', error.message)
  await page.screenshot(`${OUT}/s3-failure.png`, { fullPage: true }).catch(() => {})
} finally {
  const failed = results.filter(r => !r.pass)
  console.log('\nSUMMARY')
  for (const row of results) console.log((row.pass ? 'PASS ' : 'FAIL ') + row.name + (row.extra ? ' :: ' + row.extra : ''))
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log(JSON.stringify(await page.evaluate('(window.__e2eErrors || []).slice()').catch(() => [])))
  await page.close()
  process.exitCode = failed.length ? 1 : 0
}
