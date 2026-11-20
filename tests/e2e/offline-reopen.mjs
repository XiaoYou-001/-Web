import assert from 'node:assert/strict'
import express from 'express'
import { access, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { launch, sleep } from './cdp.mjs'

const directory = resolve(process.env.OFFLINE_DIST || 'dist')
await access(join(directory,'offline-sw.js'))
const app = express()
app.use('/api', (_req,res) => res.json({enabled:false}))
app.use(express.static(directory))
app.get(/.*/, (_req,res) => res.sendFile(join(directory,'index.html')))
let server, port = 0, page
const profile = await mkdtemp(join(tmpdir(),'travel-offline-e2e-'))
async function online() {
  server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, '127.0.0.1', () => resolve(instance))
    instance.once('error',reject)
  })
  port = server.address().port
}
async function disconnectServer() {
  if (!server) return
  const stopped = new Promise(resolve => server.close(resolve))
  server.closeAllConnections()
  await stopped
  server = null
}
async function reopen() {
  if (page) { await page.close({persistProfile:true}); await sleep(300) }
  page = await launch({port:9757, profile})
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if (location.origin === ${JSON.stringify(process.env.BASE_URL)}) {
      const NativeDate = Date
      const instant = NativeDate.parse('2030-09-12T12:00:00Z')
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [instant])) }
        static now() { return instant }
      }
    }`
  })
}
try {
  await online()
  process.env.BASE_URL = 'http://127.0.0.1:' + port
  const { BASE, clickText, registerAndLogin, createTravel, openTravel } = await import('./helpers.mjs')
  await reopen()
  await registerAndLogin(page, {phone:'198' + String(Date.now()).slice(-8)})
  const date = '2030-09-12'
  const title = '离线预约验收'
  const id = await createTravel(page, {title, startDate:date, endDate:date})
  const fixture = {
    title, timeZone:'UTC', days:[{date, activities:[
      {title:'出发点', time:'00:01', durationMinutes:5, travelMinutes:15},
      {title:'预约展览', time:'23:59', timeLocked:true, place:{name:'南门',address:'测试街 12 号'}, notes:'预约凭证 A'}
    ]}]
  }
  await page.evaluate(`(() => {
    const key = 'travel_data:v1:' + encodeURIComponent(JSON.parse(localStorage.currentUser).id)
    const data = JSON.parse(localStorage.getItem(key))
    Object.assign(data.routes.find(route => String(route.id) === ${JSON.stringify(id)}), ${JSON.stringify(fixture)})
    localStorage.setItem(key, JSON.stringify(data))
  })()`)
  await openTravel(page,id)
  await page.evaluate("Promise.all([caches.open('travel-offline-reader:/:previous'), caches.open('other-app-cache')]).then(() => true)")
  await clickText(page,'.offline-trip button','保存到此设备')
  await page.waitFor("!!document.querySelector('.offline-trip a')", {timeout:25000})
  assert.match(await page.text('.offline-trip'), /行程最后保存.+离线资源准备/s)
  const cachedPaths = await page.evaluate(`(async () => {
    const key = (await caches.keys()).find(key => key.startsWith('travel-offline-reader:'))
    return (await (await caches.open(key)).keys()).map(req => new URL(req.url).pathname).sort()
  })()`)
  assert.equal(cachedPaths.length,2)
  assert.ok(cachedPaths.every(path => /^\/offline(?:\.html|-reader-[a-f0-9]{16}\.js)$/.test(path)))
  const cacheNames = await page.evaluate('caches.keys()')
  assert.ok(!cacheNames.includes('travel-offline-reader:/:previous') && cacheNames.includes('other-app-cache'))
  await openTravel(page,id)
  assert.ok(await page.evaluate("!!document.querySelector('.offline-trip a')"))
  await disconnectServer()
  await reopen()
  await page.goto(BASE+'/routes/'+id)
  await page.waitFor("document.querySelector('#reader h1')?.textContent === '离线预约验收'")
  assert.match(await page.text('#reader section'), /下一项预约.*预约展览.*测试街 12 号.*23:44/s)
  assert.match(await page.text('#reader'), /预约凭证 A/)
  await clickText(page,'#reader a','返回离线旅行列表')
  await page.waitFor("document.querySelector('#reader h1')?.innerText === '离线旅行'")
  await clickText(page,'#reader a',title)
  await page.waitFor("document.querySelector('#reader h1')?.innerText === '离线预约验收'")
  await online()
  await page.goto(BASE+'/profile')
  await page.evaluate("localStorage.removeItem('isAuthenticated');localStorage.removeItem('currentUser')")
  await registerAndLogin(page,{phone:'197'+String(Date.now()).slice(-8)})
  await disconnectServer()
  await reopen()
  await page.goto(BASE+'/routes/'+id)
  await page.waitFor("document.querySelector('#reader h1')?.innerText.includes('当前账号未保存')")
  assert.ok(!(await page.text('body')).includes('预约展览'))
  await page.evaluate("localStorage.removeItem('isAuthenticated')")
  await page.goto(BASE+'/offline.html?trip='+encodeURIComponent(id))
  await page.waitFor("document.querySelector('#reader h1')?.innerText.includes('请登录')")
  assert.ok(!(await page.text('body')).includes(title))
  console.log('10/10 passed')
} finally {
  await page?.close()
  await disconnectServer()
}
