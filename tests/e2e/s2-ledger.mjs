import { launch, sleep } from './cdp.mjs'
import { BASE, OUT, registerAndLogin, createTravel, openTravel, clickText } from './helpers.mjs'

const stamp = String(Date.now()).slice(-8)
const phone = '139' + stamp
const results = []
const ok = (name, extra = '') => { results.push({ name, pass: true, extra }); console.log('PASS', name, extra) }
const bad = (name, extra = '') => { results.push({ name, pass: false, extra }); console.log('FAIL', name, extra) }

const page = await launch({ port: 9224 })
const runtimeErrors = []
page.on('Runtime.exceptionThrown', p => runtimeErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text))

const ADD_FORM = '.ledger .expense-form:not(.edit-form)'

async function fillField(scopeSel, labelText, value) {
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
  if (res !== 'OK') throw new Error(`fillField(${labelText}): ${res}`)
}

async function selectByText(scopeSel, labelText, optionText) {
  const res = await page.evaluate(`(() => {
    const scope = document.querySelector(${JSON.stringify(scopeSel)})
    if (!scope) return 'NO_SCOPE'
    const label = [...scope.querySelectorAll('label')].find(l => (l.textContent || '').trim().startsWith(${JSON.stringify(labelText)}))
    if (!label) return 'NO_LABEL'
    const sel = label.querySelector('select')
    if (!sel) return 'NO_SELECT'
    const option = [...sel.options].find(o => o.textContent.trim() === ${JSON.stringify(optionText)})
    if (!option) return 'NO_OPTION:' + [...sel.options].map(o => o.textContent.trim()).join(',')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, option.value)
    sel.dispatchEvent(new Event('input', { bubbles: true }))
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    return sel.value
  })()`)
  if (String(res).startsWith('NO_') || res === 'NO_OPTION') throw new Error(`selectByText(${labelText}->${optionText}): ${res}`)
}

async function clearNotices() {
  await page.evaluate("document.querySelectorAll('.feedback-notice button[aria-label=\"关闭提示\"]').forEach(b => b.click())")
  await sleep(100)
}

async function addMember(name) {
  await page.fill('.ledger input[aria-label="同行人名称"]', name)
  await clickText(page, '.ledger .block form.row button', '添加同行人')
  await sleep(250)
}

async function fillExpense({ title, amount, payer, participants }) {
  await fillField(ADD_FORM, '名称', title)
  await fillField(ADD_FORM, '金额', amount)
  if (payer) await selectByText(ADD_FORM, '付款人', payer)
  await page.evaluate(`(() => {
    const form = document.querySelector(${JSON.stringify(ADD_FORM)})
    for (const label of form.querySelectorAll('label.check')) {
      const name = label.textContent.trim().split('\\n')[0]
      const box = label.querySelector('input[type=checkbox]')
      const want = ${JSON.stringify(participants)}.includes(name)
      if (box.checked !== want) box.click()
    }
  })()`)
  await sleep(150)
}

async function submitExpense() {
  await page.evaluate(`document.querySelector(${JSON.stringify(ADD_FORM)}).querySelector('button[type=submit]').click()`)
  await sleep(350)
}

async function bodyText() { return page.evaluate('document.body.innerText') }
async function ledgerText() { return page.evaluate("document.querySelector('.ledger').innerText") }
async function feedbackText() {
  return page.evaluate("([...document.querySelectorAll('.feedback-notice')].map(n => n.innerText).join(' | '))")
}
async function confirmDialog() {
  const visible = await page.evaluate("!!document.querySelector('dialog.feedback-dialog[open]')")
  if (!visible) return false
  await page.evaluate("document.querySelector('.feedback-dialog .feedback-actions button:last-child').click()")
  await sleep(400)
  return true
}

try {
  await registerAndLogin(page, { phone })
  ok('注册并登录', phone)
  const travelId = await createTravel(page, { title: '账本测试旅行', startDate: '2026-12-10', endDate: '2026-12-13', persons: 3, budget: 3000 })
  ok('创建旅行', travelId)
  await openTravel(page, travelId)
  await page.waitFor("!!document.querySelector('.ledger summary')", { timeout: 8000 })
  await page.evaluate("document.querySelector('.ledger').open = true")
  await sleep(300)
  ok('工作台出现账本面板')

  const initialSummary = await page.evaluate("document.querySelector('.ledger summary').innerText")
  if (initialSummary.includes('尚未记账')) ok('初始账本为空', JSON.stringify(initialSummary)); else bad('初始账本为空', initialSummary)

  const noMemberHint = await page.evaluate("document.querySelector('.ledger').innerText.includes('至少添加一位同行人后可记账')")
  if (noMemberHint) ok('无同行人时提示不能记账'); else bad('无同行人时提示不能记账')

  for (const name of ['小林', '小陈', '小周']) await addMember(name)
  const memberCount = await page.evaluate("document.querySelectorAll('.ledger .chips li').length")
  if (memberCount === 3) ok('添加 3 位同行人'); else bad('添加 3 位同行人', String(memberCount))

  await addMember('小林')
  const dupFeedback = await feedbackText()
  if (dupFeedback.includes('该同行人已存在')) ok('重复同行人被拒绝', dupFeedback); else bad('重复同行人被拒绝', dupFeedback)

  // 均摊余数：100.00 / 3 = 33.34 + 33.33 + 33.33
  await fillExpense({ title: '海鲜晚餐', amount: '100.00', payer: '小林', participants: ['小林', '小陈', '小周'] })
  const evenPreview = await page.evaluate(`(() => { const el = [...document.querySelectorAll('${ADD_FORM} p.muted')].find(p => p.innerText.includes('均摊预览')); return el ? el.innerText : '' })()`)
  const previewCounts = { big: (evenPreview.match(/¥33\.34/g) || []).length, small: (evenPreview.match(/¥33\.33/g) || []).length }
  if (previewCounts.big === 1 && previewCounts.small === 2) ok('均摊预览余数分配', evenPreview); else bad('均摊预览余数分配', evenPreview)

  await submitExpense()
  const afterFirst = await page.evaluate("document.querySelector('.ledger summary').innerText")
  if (/共 1 笔/.test(afterFirst) && afterFirst.includes('¥100.00')) ok('记入第一笔支出', afterFirst.replace(/\n/g, ' ')); else bad('记入第一笔支出', afterFirst)
  const splitShown = await page.evaluate(`(() => {
    const li = [...document.querySelectorAll('.ledger .expenses li')].find(el => el.innerText.includes('海鲜晚餐'))
    return li && li.querySelector('.split') ? li.querySelector('.split').innerText : ''
  })()`)
  const splitSum = (splitShown.match(/¥(\d+\.\d{2})/g) || []).map(v => Number(v.slice(1))).reduce((a, b) => a + b, 0)
  if (Math.abs(splitSum - 100) < 1e-6) ok('分摊合计等于支出金额', `sum=${splitSum.toFixed(2)}`); else bad('分摊合计等于支出金额', `sum=${splitSum}`)

  // 非法金额
  await fillExpense({ title: '非法金额', amount: 'abc', payer: '小林', participants: ['小林'] })
  await submitExpense()
  const badAmountFeedback = await feedbackText()
  if (badAmountFeedback.includes('金额需为最多两位小数的非负数字')) ok('非法金额被拒绝', badAmountFeedback); else bad('非法金额被拒绝', badAmountFeedback)

  // 自定义分摊：一致 / 不一致
  await fillExpense({ title: '自驾油费', amount: '90', payer: '小陈', participants: ['小林', '小陈', '小周'] })
  await fillField(ADD_FORM, '分摊方式', 'custom')
  await sleep(200)
  for (const name of ['小林', '小陈', '小周']) await page.fill(`.ledger input[aria-label="${name}分摊金额（元）"]`, '30')
  await sleep(200)
  const customOkPreview = await page.evaluate(`(() => { const el = [...document.querySelectorAll('${ADD_FORM} p.muted')].find(p => p.innerText.includes('自定义分摊合计')); return el ? el.innerText : '' })()`)
  if (customOkPreview.includes('一致')) ok('自定义分摊预览一致', customOkPreview); else bad('自定义分摊预览一致', customOkPreview)
  await submitExpense()
  const afterCustom = await page.evaluate("document.querySelector('.ledger summary').innerText")
  if (/共 2 笔/.test(afterCustom)) ok('记入自定义分摊支出', afterCustom.replace(/\n/g, ' ')); else bad('记入自定义分摊支出', afterCustom)

  await fillExpense({ title: '分摊不一致', amount: '90', payer: '小陈', participants: ['小林', '小陈'] })
  await fillField(ADD_FORM, '分摊方式', 'custom')
  await sleep(200)
  await page.fill('.ledger input[aria-label="小林分摊金额（元）"]', '20')
  await page.fill('.ledger input[aria-label="小陈分摊金额（元）"]', '20')
  await sleep(200)
  const mismatchPreview = await page.evaluate(`(() => { const el = [...document.querySelectorAll('${ADD_FORM} p.muted')].find(p => p.innerText.includes('自定义分摊合计')); return el ? el.innerText : '' })()`)
  await submitExpense()
  const mismatchFeedback = await feedbackText()
  if (mismatchPreview.includes('不一致') && mismatchFeedback.includes('不一致')) ok('自定义分摊不一致被拒绝', mismatchFeedback); else bad('自定义分摊不一致被拒绝', mismatchPreview + ' || ' + mismatchFeedback)

  // 余额表
  await page.evaluate("document.querySelector('.ledger').open = true")
  const balanceTable = await page.evaluate("document.querySelector('.ledger table') ? document.querySelector('.ledger table').innerText : ''")
  const rows = (balanceTable.match(/\n/g) || []).length
  const remainingSumText = await page.evaluate(`(() => { const p = [...document.querySelectorAll('.ledger p.muted')].find(el => el.innerText.includes('余额守恒检查')); return p ? p.innerText : '' })()`)
  if (balanceTable.includes('小林') && balanceTable.includes('已付') && rows >= 3) ok('余额表生成', `rows=${rows}`); else bad('余额表生成', balanceTable.slice(0, 120))
  if (remainingSumText.includes('¥0.00')) ok('余额守恒为 0', remainingSumText); else bad('余额守恒为 0', remainingSumText)

  const transferText = await page.evaluate("document.querySelector('.ledger .transfers') ? document.querySelector('.ledger .transfers').innerText : ''")
  if (/→/.test(transferText)) ok('生成建议转账', transferText.replace(/\n/g, ' ')); else bad('生成建议转账', transferText)

  // 登记结算
  await page.evaluate("document.querySelector('.ledger .transfers li button').click()")
  await sleep(300)
  const settlementForm = await page.evaluate("document.querySelector('.ledger .settlement-form') ? document.querySelector('.ledger .settlement-form').innerText : ''")
  if (settlementForm.includes('结算金额')) ok('打开结算表单', settlementForm.replace(/\n/g, ' ')); else bad('打开结算表单', settlementForm)
  await page.evaluate("document.querySelector('.ledger .settlement-form button[type=submit]').click()")
  await sleep(400)
  const settledTags = await page.evaluate("document.querySelectorAll('.ledger .tag.settled').length")
  if (settledTags >= 1) ok('登记结算后支出标记已结算', `tags=${settledTags}`); else bad('登记结算后支出标记已结算', String(settledTags))

  await page.evaluate(`(() => {
    const li = [...document.querySelectorAll('.ledger .expenses li')].find(el => el.innerText.includes('海鲜晚餐'))
    ;[...li.querySelectorAll('button')].find(b => b.innerText.trim() === '修改').click()
  })()`)
  await sleep(200)
  await page.evaluate("document.querySelector('.ledger .edit-form').querySelector('button[type=submit]').click()")
  await sleep(300)
  const lockedFeedback = await feedbackText()
  if (lockedFeedback.includes('请先撤销对应结算')) ok('已结算支出禁止修改', lockedFeedback); else bad('已结算支出禁止修改', lockedFeedback)
  await page.evaluate("document.querySelector('.ledger .edit-form').querySelector('button.ghost').click()")
  await sleep(150)

  await page.evaluate("document.querySelector('.ledger .settlements').open = true")
  await page.evaluate("document.querySelector('.ledger .settlements button').click()")
  await sleep(300)
  const revokeConfirmed = await confirmDialog()
  const tagsAfterRevoke = await page.evaluate("document.querySelectorAll('.ledger .tag.settled').length")
  if (revokeConfirmed && tagsAfterRevoke === 0) ok('撤销结算恢复可编辑'); else bad('撤销结算恢复可编辑', `confirmed=${revokeConfirmed} tags=${tagsAfterRevoke}`)

  // 修改支出
  await page.evaluate(`(() => {
    const li = [...document.querySelectorAll('.ledger .expenses li')].find(el => el.innerText.includes('海鲜晚餐'))
    ;[...li.querySelectorAll('button')].find(b => b.innerText.trim() === '修改').click()
  })()`)
  await sleep(200)
  await page.evaluate(`(() => {
    const form = document.querySelector('.ledger .edit-form')
    const inputs = [...form.querySelectorAll('input')]
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
    set(inputs[0], '海鲜晚餐（改）')
    set(inputs[1], '120')
  })()`)
  await page.evaluate("document.querySelector('.ledger .edit-form').querySelector('button[type=submit]').click()")
  await sleep(350)
  const afterEdit = await page.evaluate("document.querySelector('.ledger summary').innerText")
  if (afterEdit.includes('¥210.00')) ok('修改支出后总额更新', afterEdit.replace(/\n/g, ' ')); else bad('修改支出后总额更新', afterEdit)

  // 移除有支出的同行人应被拒绝
  await page.evaluate(`(() => {
    const chip = [...document.querySelectorAll('.ledger .chips li')].find(el => el.innerText.includes('小林'))
    ;[...chip.querySelectorAll('button')].find(b => b.innerText.trim() === '移除').click()
  })()`)
  await sleep(300)
  const removeConfirmed = await confirmDialog()
  const removeFeedback = await feedbackText()
  const stillHasLin = await page.evaluate("document.querySelector('.ledger .chips').innerText.includes('小林')")
  if (removeConfirmed && stillHasLin && /不能移除/.test(removeFeedback)) ok('有支出的同行人不可移除', removeFeedback); else bad('有支出的同行人不可移除', `confirmed=${removeConfirmed} hasLin=${stillHasLin} ${removeFeedback}`)

  // 保存后刷新恢复 + 存储校验
  await clickText(page, 'button', '保存修改')
  await sleep(1200)
  const stored = await page.evaluate(`(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('travel_data:v1:'))
    const data = JSON.parse(localStorage.getItem(key))
    const route = (data.routes || []).find(r => String(r.id) === ${JSON.stringify(travelId)})
    if (!route || !route.ledger) return null
    return {
      members: route.ledger.members.map(m => m.name),
      expenseCount: route.ledger.expenses.length,
      sums: route.ledger.expenses.map(e => ({ amountCents: e.amountCents, shareSum: Object.values(e.shares || {}).reduce((a, b) => a + b, 0), mode: e.splitMode })),
      key
    }
  })()`)
  if (stored && stored.members.length === 3 && stored.expenseCount === 2) ok('账本保存到旅行数据', stored.key); else bad('账本保存到旅行数据', JSON.stringify(stored))
  const sumsOk = stored && stored.sums.every(s => s.amountCents === s.shareSum)
  if (sumsOk) ok('存储中分摊合计一致', JSON.stringify(stored.sums)); else bad('存储中分摊合计一致', JSON.stringify(stored && stored.sums))
  const scopedKeys = await page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('travel_data:v1:')).length")
  if (scopedKeys === 1) ok('数据按账号隔离存储', `keys=${scopedKeys}`); else bad('数据按账号隔离存储', `keys=${scopedKeys}`)

  await page.goto(`${BASE}/routes/${travelId}`)
  await page.waitFor("!!document.querySelector('.ledger summary')", { timeout: 8000 })
  await page.evaluate("document.querySelector('.ledger').open = true")
  await sleep(300)
  const restoredSummary = await page.evaluate("document.querySelector('.ledger summary').innerText")
  if (/共 2 笔/.test(restoredSummary) && restoredSummary.includes('¥210.00')) ok('刷新后账本恢复', restoredSummary.replace(/\n/g, ' ')); else bad('刷新后账本恢复', restoredSummary)

  // 从实际支出导入
  await page.evaluate(`(() => {
    const details = [...document.querySelectorAll('.workbench details')].find(d => d.innerText.includes('住宿、交通与费用记录'))
    if (!details) return 'NO_DETAILS'
    details.open = true
    const form = details.querySelector('form')
    const textInput = [...form.querySelectorAll('input')].find(i => i.type !== 'number')
    const numbers = [...form.querySelectorAll('input[type=number]')]
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
    set(textInput, '民宿两晚')
    set(numbers[1], '88')
    form.querySelector('button').click()
    return 'OK'
  })()`)
  await sleep(500)
  const importText = await page.evaluate("document.querySelector('.ledger .import') ? document.querySelector('.ledger .import').innerText : ''")
  if (importText.includes('从实际支出导入（1 笔）')) ok('实际支出可导入', importText.replace(/\n/g, ' ')); else bad('实际支出可导入', importText)
  await page.evaluate("document.querySelector('.ledger .import').open = true")
  await page.evaluate("document.querySelector('.ledger .import li button').click()")
  await sleep(300)
  const prefilledTitle = await page.evaluate(`document.querySelector('${ADD_FORM} input[maxlength="60"]').value`)
  if (prefilledTitle === '民宿两晚') ok('导入预填表单', prefilledTitle); else bad('导入预填表单', prefilledTitle)
  await submitExpense()
  const afterImport = await page.evaluate("document.querySelector('.ledger summary').innerText")
  const importGone = await page.evaluate("!document.querySelector('.ledger .import')")
  if (/共 3 笔/.test(afterImport) && importGone) ok('导入后不再重复列出', afterImport.replace(/\n/g, ' ')); else bad('导入后不再重复列出', afterImport + ' importGone=' + importGone)

  // 删除支出
  await page.evaluate(`(() => {
    const li = [...document.querySelectorAll('.ledger .expenses li')].find(el => el.innerText.includes('分摊不一致') || el.innerText.includes('自驾油费'))
    ;[...li.querySelectorAll('button')].find(b => b.innerText.trim() === '删除').click()
  })()`)
  await sleep(300)
  const delConfirmed = await confirmDialog()
  const afterDelete = await page.evaluate("document.querySelector('.ledger summary').innerText")
  if (delConfirmed && /共 2 笔/.test(afterDelete)) ok('删除支出', afterDelete.replace(/\n/g, ' ')); else bad('删除支出', `confirmed=${delConfirmed} ${afterDelete}`)

  // 移动端
  await page.viewport(390, 844, { mobile: true })
  await openTravel(page, travelId)
  await page.evaluate("document.querySelector('.ledger').open = true")
  await sleep(300)
  const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  if (overflow <= 1) ok('390px 账本无横向溢出', `overflow=${overflow}`); else bad('390px 账本有横向溢出', `overflow=${overflow}`)
  await page.screenshot(OUT + '/ledger-mobile.png', { fullPage: true })

  // 写入失败反馈
  await page.viewport(1440, 900)
  await page.evaluate("window.__origSet = localStorage.setItem; localStorage.setItem = () => { throw new Error('QuotaExceededError') }")
  await addMember('写入失败测试')
  await sleep(400)
  const failureShown = /保存失败|草稿冲突|存储|空间/.test(await bodyText())
  await page.evaluate("localStorage.setItem = window.__origSet")
  if (failureShown) ok('账本写入失败有反馈'); else bad('账本写入失败有反馈')

  await page.screenshot(OUT + '/ledger-desktop.png', { fullPage: true })
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
