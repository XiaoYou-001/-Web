import { launch, sleep } from './cdp.mjs'
import { BASE, OUT, registerAndLogin, createTravel, openTravel, clickText } from './helpers.mjs'

const stamp = String(Date.now()).slice(-8)
const phone = '138' + stamp
const results = []
const ok = (name, extra = '') => { results.push({ name, pass: true, extra }); console.log('PASS', name, extra) }
const bad = (name, extra = '') => { results.push({ name, pass: false, extra }); console.log('FAIL', name, extra) }

const page = await launch({ port: 9223 })
const runtimeErrors = []
page.on('Runtime.exceptionThrown', p => runtimeErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text))

async function addManualItem(title, dueDate) {
  await page.fill('.preparation .add-form input[maxlength="80"]', title)
  if (dueDate) {
    await page.evaluate(`(() => { const d = document.querySelector('.preparation .add-form input[type="date"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(d, ${JSON.stringify(dueDate)}); d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  }
  await clickText(page, '.preparation .add-form button', '添加')
  await sleep(300)
}

try {
  await registerAndLogin(page, { phone })
  ok('注册并登录', phone)
  const travelId = await createTravel(page, { title: '准备测试旅行', startDate: '2026-12-01', endDate: '2026-12-03', persons: 3, budget: 3000 })
  ok('创建旅行', travelId)
  await openTravel(page, travelId)
  await page.waitFor("document.querySelector('.preparation summary') !== null", { timeout: 8000 })
  ok('工作台出现出行准备面板')

  const summaryBefore = await page.evaluate("document.querySelector('.preparation summary').innerText")
  if (!summaryBefore.includes('尚未生成清单')) bad('初始应为空清单', summaryBefore); else ok('初始为空清单', JSON.stringify(summaryBefore))

  await page.evaluate("document.querySelector('.preparation').open = true")
  await page.evaluate(`(() => { const sel = document.querySelector('.preparation .toolbar select'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(sel, 'general'); sel.dispatchEvent(new Event('change', { bubbles: true })); return sel.value })()`)
  await sleep(200)
  await clickText(page, '.preparation button', '按 ')
  await sleep(400)
  const afterApply = await page.evaluate("document.querySelector('.preparation summary').innerText")
  const countAfterApply = await page.evaluate("document.querySelectorAll('.preparation .items .item').length")
  if (countAfterApply > 0 && /已准备 \d+\/\d+/.test(afterApply)) ok('应用模板生成清单', afterApply.replace(/\n/g, ' ') + ` items=${countAfterApply}`); else bad('应用模板生成清单', afterApply + ' items=' + countAfterApply)
  const noteText = await page.evaluate("document.querySelector('.preparation .note')?.innerText || ''")
  ok('模板应用提示', noteText)

  await clickText(page, '.preparation button', '按 ')
  await sleep(400)
  const countAfterReapply = await page.evaluate("document.querySelectorAll('.preparation .items .item').length")
  if (countAfterReapply === countAfterApply) ok('重复应用模板不重复添加', `items=${countAfterReapply}`); else bad('重复应用模板不重复添加', `${countAfterApply} -> ${countAfterReapply}`)

  await addManualItem('手动准备项A', '2026-11-01')
  const hasManual = await page.evaluate("document.querySelector('.preparation .items')?.innerText.includes('手动准备项A')")
  const overdueShown = await page.evaluate("document.querySelector('.preparation .meta')?.innerText.includes('已超过截止')")
  if (hasManual) ok('手动添加事项'); else bad('手动添加事项')
  if (overdueShown) ok('逾期统计显示'); else bad('逾期统计显示')

  const doneBefore = await page.evaluate("document.querySelector('.preparation summary').innerText")
  await page.evaluate(`(() => { const item = [...document.querySelectorAll('.preparation .item')].find(li => li.innerText.includes('手动准备项A')); item.querySelector('input[type=checkbox]').click() })()`)
  await sleep(300)
  const doneAfter = await page.evaluate("document.querySelector('.preparation summary').innerText")
  if (doneBefore !== doneAfter) ok('勾选完成更新进度', `${doneBefore.replace(/\n/g, ' ')} -> ${doneAfter.replace(/\n/g, ' ')}`); else bad('勾选完成更新进度', doneAfter)

  await addManualItem('手动准备项B', '2026-11-10')
  ok('添加第二个未完成事项')

  // 编辑与删除
  await page.evaluate(`(() => { const li = [...document.querySelectorAll('.preparation .item')].find(el => el.innerText.includes('手动准备项B')); [...li.querySelectorAll('button')].find(b => b.innerText.trim() === '编辑').click() })()`)
  await sleep(200)
  await page.fill('.preparation .edit input[aria-label="事项名称"]', '手动准备项B-改名')
  await page.evaluate(`(() => { const edit = document.querySelector('.preparation .item .edit'); [...edit.querySelectorAll('button')].find(b => b.innerText.trim() === '保存').click() })()`)
  await sleep(300)
  const renamed = await page.evaluate("document.querySelector('.preparation').innerText.includes('手动准备项B-改名')")
  if (renamed) ok('编辑准备事项'); else bad('编辑准备事项')

  // 刷新恢复（工作台草稿）
  await page.goto(`${BASE}/routes/${travelId}`)
  await page.waitFor("document.querySelector('.preparation summary') !== null", { timeout: 8000 })
  await page.evaluate("document.querySelector('.preparation').open = true")
  await sleep(300)
  const persistedText = await page.evaluate("document.querySelector('.preparation').innerText")
  const itemA = await page.evaluate(`(() => { const li = [...document.querySelectorAll('.preparation .item')].find(el => el.innerText.includes('手动准备项A')); return li ? li.querySelector('input[type=checkbox]').checked : null })()`)
  const itemB = persistedText.includes('手动准备项B-改名')
  if (persistedText.includes('手动准备项A') && itemB) ok('刷新后清单恢复', `A done=${itemA} B recovered=${itemB}`); else bad('刷新后清单恢复')
  if (itemA === true) ok('刷新后完成状态恢复'); else bad('刷新后完成状态恢复', String(itemA))

  // 修改出发日期不丢失自定义事项
  await page.evaluate(`(() => {
    const inputs = [...document.querySelectorAll('.workbench input[type="date"]')]
    const el = inputs[0]
    if (!el) return 'none'
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, '2026-11-20'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
    return el.value
  })()`)
  await sleep(500)
  const afterDateChange = await page.evaluate("document.querySelector('.preparation')?.innerText.includes('手动准备项B-改名')")
  if (afterDateChange) ok('修改出发日期保留自定义事项'); else bad('修改出发日期保留自定义事项')

  // 保存旅行，旅行列表应显示进度与提醒
  await clickText(page, 'button', '保存修改')
  await sleep(1000)
  const saveStateText = await page.evaluate("document.body.innerText")
  if (saveStateText.includes('旅行已保存') || saveStateText.includes('已保存')) ok('保存修改成功'); else bad('保存修改成功', saveStateText.slice(0, 200))

  await page.goto(BASE + '/routes')
  await page.waitFor("!!document.querySelector('.control-bar')")
  const listText = await page.evaluate('document.body.innerText')
  if (listText.includes('准备 ')) ok('旅行列表显示准备进度', listText.split('\n').find(line => line.includes('准备 ')) || ''); else bad('旅行列表显示准备进度', listText.slice(0, 300))
  if (listText.includes('出行准备提醒') && listText.includes('超过截止日期')) ok('旅行列表准备提醒', listText.split('\n').find(line => line.includes('超过截止日期')) || ''); else bad('旅行列表准备提醒')

  // 无截止日期事项正常使用
  await openTravel(page, travelId)
  await page.evaluate("document.querySelector('.preparation').open = true")
  await addManualItem('无截止事项C', '')
  const noDue = await page.evaluate(`(() => { const li = [...document.querySelectorAll('.preparation .item')].find(el => el.innerText.includes('无截止事项C')); return li ? li.innerText : null })()`)
  if (noDue && noDue.includes('无截止日期')) ok('无截止日期事项正常显示'); else bad('无截止日期事项正常显示', String(noDue))

  // 删除
  await page.evaluate(`(() => { const li = [...document.querySelectorAll('.preparation .item')].find(el => el.innerText.includes('无截止事项C')); [...li.querySelectorAll('button')].find(b => b.innerText.trim() === '删除').click() })()`)
  await sleep(300)
  const dialogVisible = await page.evaluate("!!document.querySelector('dialog.feedback-dialog[open]')")
  if (!dialogVisible) bad('删除前弹出确认框')
  else {
    const confirmLabel = await page.evaluate("document.querySelector('.feedback-dialog .feedback-actions button:last-child').innerText.trim()")
    if (confirmLabel === '删除') ok('删除确认框文案', confirmLabel); else bad('删除确认框文案', confirmLabel)
    await page.evaluate("document.querySelector('.feedback-dialog .feedback-actions button:last-child').click()")
    await sleep(500)
  }
  const removedC = await page.evaluate("!document.querySelector('.preparation').innerText.includes('无截止事项C')")
  if (removedC) ok('删除准备事项'); else bad('删除准备事项')

  // 移动端
  await page.viewport(390, 844, { mobile: true })
  await openTravel(page, travelId)
  await page.evaluate("document.querySelector('.preparation').open = true")
  await sleep(200)
  const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  if (overflow <= 1) ok('390px 无横向溢出', `overflow=${overflow}`); else bad('390px 有横向溢出', `overflow=${overflow}`)
  const headerIcons = await page.evaluate(`document.querySelectorAll('.nav-link svg').length`)
  ok('移动端导航渲染', `nav svg=${headerIcons}`)
  await page.screenshot(OUT + '/prep-mobile.png', { fullPage: true })

  // 写入失败反馈
  await page.viewport(1440, 900)
  await page.evaluate(`(() => { window.__origSetItem = localStorage.setItem; localStorage.setItem = () => { throw new Error('QuotaExceededError') } })()`)
  await page.evaluate(`(() => { const item = [...document.querySelectorAll('.preparation .item')].find(li => li.innerText.includes('手动准备项A')); item.querySelector('input[type=checkbox]').click() })()`)
  await sleep(400)
  const feedbackText = await page.evaluate("document.body.innerText")
  const failureShown = /保存失败|存储|空间|失败/.test(feedbackText)
  await page.evaluate("localStorage.setItem = window.__origSetItem")
  if (failureShown) ok('写入失败有错误反馈'); else bad('写入失败有错误反馈')

  await page.screenshot(OUT + '/prep-desktop.png', { fullPage: true })
} catch (error) {
  bad('场景执行异常', error.message)
} finally {
  const pageErrors = await page.evaluate('(window.__e2eErrors||[]).slice(0,8)').catch(() => [])
  console.log('\nPAGE ERRORS:', JSON.stringify([...runtimeErrors, ...pageErrors].filter(e => !/favicon|ResizeObserver|Vue Devtools|Download the Vue/i.test(String(e))).slice(0, 10), null, 2))
  const failed = results.filter(r => !r.pass)
  console.log('\nSUMMARY')
  for (const row of results) console.log((row.pass ? 'PASS ' : 'FAIL ') + row.name + (row.extra ? ' :: ' + row.extra : ''))
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  await page.close()
  process.exitCode = failed.length ? 1 : 0
}
