import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launch, sleep } from './cdp.mjs'
import { registerAndLogin, createTravel, openTravel, clickText, OUT } from './helpers.mjs'

const page = await launch({ port: 9232 })
const controls = '.activity-timeline .delay-controls'
const editorTimes = () => page.evaluate('[...document.querySelectorAll(".row-time input")].map(input => input.value)')
const original = ['12:00', '13:30', '14:45']
const adjusted = ['12:00', '13:50', '14:45']
let passed = 0
function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name)
  passed++
  console.log('PASS', name)
}

try {
  await registerAndLogin(page, { phone: '136' + String(Date.now()).slice(-8) })
  const date = '2031-01-14'
  const id = await createTravel(page, { title: '当天延误验收', startDate: date, endDate: date })
  const activities = [
    { title: '午饭', time: '12:00', durationMinutes: 60, travelMinutes: 20 },
    { title: '公园', time: '13:30', durationMinutes: 30, travelMinutes: 15 },
    { title: '博物馆', time: '14:45', durationMinutes: 60 }
  ]
  await page.evaluate(`(() => {
    const key = 'travel_data:v1:' + encodeURIComponent(JSON.parse(localStorage.currentUser).id)
    const data = JSON.parse(localStorage.getItem(key))
    data.routes.find(route => String(route.id) === ${JSON.stringify(id)}).days = ${JSON.stringify([{ date, activities }])}
    localStorage.setItem(key, JSON.stringify(data))
  })()`)
  await openTravel(page, id)
  await page.waitFor('document.querySelectorAll(".activity-timeline .delay-controls").length === 3')
  await page.evaluate('document.querySelectorAll(".activity-timeline .delay-controls input[type=checkbox]")[2].click()')
  await clickText(page, controls + ' button', '延误调整')
  check('锁定预约后显示上一站的最晚出发时间', (await page.text(controls + ' section')).includes('最晚 14:30'), true)
  check('预览保持编辑器原时间', await editorTimes(), original)
  await page.fill(controls + ' section input[type=number]', '50')
  check('冲突预览指出晚到分钟', (await page.text(controls + ' section')).includes('晚到 10 分钟'), true)
  check('冲突预览禁用确认', await page.evaluate('document.querySelector(".delay-controls section button").disabled'), true)
  await page.fill(controls + ' section input[type=number]', '30')
  await clickText(page, controls + ' button', '确认调整当天安排')
  check('确认后更新中间一站', await editorTimes(), adjusted)
  await clickText(page, '.workbench .actions button', '撤销修改')
  check('撤销整次延误调整', await editorTimes(), original)
  check('撤销后保留原有预约锁定', await page.evaluate('document.querySelectorAll(".activity-timeline .delay-controls input[type=checkbox]")[2].checked'), true)

  await clickText(page, '.workbench .actions button', '出行模式')
  await page.evaluate('[...document.querySelectorAll(".workbench label")].find(el => el.innerText.includes("只看今天")).querySelector("input").click()')
  const outing = '.workbench article .delay-controls button'
  await clickText(page, outing, '延误调整')
  await clickText(page, outing, '确认调整当天安排')
  check('出行模式确认后同步到日程编辑器', await editorTimes(), adjusted)
  await openTravel(page, id)
  check('草稿刷新后日程编辑器正确恢复', await editorTimes(), adjusted)
  await clickText(page, '.btn-primary', '保存修改')
  await page.waitFor('document.querySelector(".workbench > p").innerText.includes("旅行已保存")')
  await openTravel(page, id)
  check('保存后重新进入保留调整', await editorTimes(), adjusted)
  await clickText(page, '.detail-tabs button', '行程日历')
  await page.waitFor('!!document.querySelector(".reservation-export form")')
  await page.fill('.reservation-export input', 'Asia/Tokyo')
  const directory = await mkdtemp(join(OUT, 's9-calendar-'))
  await page.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory })
  await clickText(page, '.reservation-export button', '下载预约日历')
  let downloaded
  for (let attempt = 0; attempt < 50; attempt++) {
    try { downloaded = await readFile(join(directory, '当天延误验收-预约.ics'), 'utf8'); break }
    catch (error) { if (error.code !== 'ENOENT') throw error; await sleep(100) }
  }
  check('日历下载包含按目的地时区换算的锁定预约', downloaded?.includes('DTSTART:20310114T054500Z'), true)
  check('日历文件包含提醒且排除未锁定活动', downloaded?.includes('TRIGGER:-PT30M') && !downloaded.includes('SUMMARY:公园'), true)
  console.log(`${passed}/${passed} passed`)
} finally {
  await page.close()
}
