import assert from 'node:assert/strict'
import { launch } from './cdp.mjs'
import { BASE, registerAndLogin } from './helpers.mjs'

const page = await launch({port: 9754})
try {
  await page.viewport(390, 844, {mobile:true})
  await registerAndLogin(page, {phone:'199' + String(Date.now()).slice(-8)})
  const route = {
    title: '规划检查定位', startDate: '2030-01-01', endDate: '2030-01-02',
    themes: [], preferences: {}, budget: 100,
    expenses: [{category:'其他', title:'车票', estimate:200}, {category:'餐饮', title:'午饭', estimate:null}],
    days: [{date:'2030-01-01', activities:[]}, {date:'2030-01-02', activities:[
      {title:'展览', time:'09:00', durationMinutes:30}, {title:'展览', time:'10:00', durationMinutes:null}
    ]}]
  }
  const id = await page.evaluate(`(async () => {
    const {saveUserRoute} = await import('/src/services/userDataService.js')
    return saveUserRoute(${JSON.stringify(route)}).result.id
  })()`)
  await page.goto(BASE + '/routes/' + id)
  await page.waitFor("!!document.querySelector('.plan-checks summary')")
  const shortcut = await page.evaluate("document.querySelector('.schedule-shortcut').getBoundingClientRect().bottom")
  assert.ok(shortcut < 844)
  await page.click('.schedule-shortcut')
  await page.waitFor("document.activeElement.matches('.editor-head h2')")
  await page.click('.plan-checks summary')
  assert.match(await page.text('.plan-checks summary'), /4 项/)
  for (const [label, selector] of [
    ['尚未安排', '[data-plan-field="quickTitle"]'],
    ['停留时长', '[data-activity-index="1"] [data-plan-field="durationMinutes"]'],
    ['费用尚未录入', '[data-expense-index="1"]'],
    ['超过预算', '[data-plan-field="budget"]']
  ]) {
    await page.evaluate(`[...document.querySelectorAll('.plan-checks li')]
      .find(item => item.innerText.includes(${JSON.stringify(label)})).querySelector('button').click()`)
    await page.waitFor(`document.activeElement.matches(${JSON.stringify(selector)}) &&
      document.activeElement.getBoundingClientRect().height > 0`)
  }
  await page.fill('[data-plan-field="budget"]', '240')
  await page.waitFor("document.querySelector('.plan-checks summary').innerText.includes('3 项')")
  await page.fill('.add-quick input', '湖边散步')
  const before = await page.evaluate("document.querySelectorAll('.row-title').length")
  const compositionAllowed = await page.evaluate(`document.querySelector('.add-quick input').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })
  )`)
  assert.ok(compositionAllowed)
  assert.equal(await page.evaluate("document.querySelectorAll('.row-title').length"), before)
  await page.evaluate("document.querySelector('.add-quick input').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true}))")
  await page.waitFor(`document.querySelectorAll('.row-title').length === ${before + 1}`)
  console.log('11/11 passed')
} finally {
  await page.close()
}
