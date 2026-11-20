import assert from 'node:assert/strict'
import { launch } from './cdp.mjs'
import { registerAndLogin, createTravel, openTravel, clickText } from './helpers.mjs'

const owner = await launch({ port: 9238 })
let reader
let passed = 0
function check(label, condition) {
  assert.ok(condition, label)
  console.log('PASS', label)
  passed++
}
try {
  reader = await launch({ port: 9239 })
  await registerAndLogin(owner, { phone: '135' + String(Date.now()).slice(-8) })
  const day = '2031-05-02'
  const id = await createTravel(owner, { title: '原链接更新验收', startDate: day, endDate: day })
  await openTravel(owner, id)
  await owner.fill('.add-quick input', '景山公园')
  await owner.click('.add-quick button')
  await owner.fill('.add-quick input', '同行午餐')
  await owner.click('.add-quick button')
  await owner.click('.travel-share summary')
  await owner.waitFor('!document.querySelector(".travel-share > button").disabled')
  await clickText(owner, '.travel-share button', '创建只读分享')
  await owner.waitFor('!!document.querySelector(".feedback-dialog")')
  await owner.click('.feedback-actions button:last-child')
  await owner.waitFor('!!document.querySelector(".travel-share a")')
  const url = await owner.evaluate('document.querySelector(".travel-share a").href')
  await reader.goto(url)
  await reader.waitFor('document.querySelector(".public-share article")?.innerText.includes("景山公园")')
  check('独立浏览器读取首次发布内容', true)

  await reader.send('Network.enable')
  await reader.send('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
  })
  await clickText(reader, '.public-share button', '刷新分享')
  await reader.waitFor('document.querySelector(".public-share [role=alert]")?.innerText.includes("刷新失败")')
  check('断网刷新时仍可阅读已取得的分享', (await reader.text('.public-share article')).includes('景山公园'))
  await reader.send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
  })


  await owner.fill('.row-title', '北海公园')
  await clickText(owner, '.travel-share button', '预览更新')
  await owner.waitFor('document.querySelector(".share-preview")?.innerText.includes("北海公园")')
  check('发布前可对照两个版本', (await owner.text('.share-preview')).includes('景山公园'))
  check('同日未修改的活动不出现在差异中', !(await owner.text('.share-preview')).includes('同行午餐'))
  await owner.fill('.row-title', '鼓楼')
  await clickText(owner, '.share-preview button', '确认更新原链接')
  await owner.waitFor('document.querySelector(".share-preview")?.innerText.includes("鼓楼")')
  await clickText(reader, '.public-share button', '刷新分享')
  await reader.waitFor('!!document.querySelector(".public-share article")')
  check('修改预览后需要重新确认，访客仍看到旧行程', (await reader.text('.public-share article')).includes('景山公园'))
  await clickText(owner, '.share-preview button', '确认更新原链接')
  await owner.waitFor('document.querySelector(".travel-share [role=status]").textContent.includes("原链接已更新")')
  check('发布后网址保持一致', url === await owner.evaluate('document.querySelector(".travel-share a").href'))
  await clickText(reader, '.public-share button', '刷新分享')
  await reader.waitFor('document.querySelector(".public-share article")?.innerText.includes("鼓楼")')
  check('收件人在原链接看到更新时间和新版', (await reader.text('.public-share article')).includes('更新于'))

  await clickText(owner, '.travel-share button', '撤销链接')
  await owner.waitFor('!document.querySelector(".travel-share a")')
  await clickText(reader, '.public-share button', '刷新分享')
  await reader.waitFor('document.querySelector(".public-share [role=alert]")?.innerText.includes("已被撤销")')
  check('撤销后原链接停止提供行程', !await reader.evaluate('document.querySelector(".public-share article") !== null'))
  console.log(`${passed}/${passed} passed`)
} finally {
  await reader?.close()
  await owner.close()
}
