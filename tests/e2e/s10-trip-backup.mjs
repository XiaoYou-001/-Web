import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { launch, sleep } from './cdp.mjs'
import { BASE, clickText, createTravel, openTravel, registerAndLogin } from './helpers.mjs'

const directory = await mkdtemp(join(tmpdir(), 'travel-backup-test-'))
const source = await launch({ port: 9284 })
const target = await launch({ port: 9285 })
const stamp = String(Date.now()).slice(-8)
const dates = { startDate: '2030-11-20', endDate: '2030-11-20' }
const title = '周末苏州'
try {
  await registerAndLogin(source, { phone: '138' + stamp })
  const sourceId = await createTravel(source, { title, ...dates })
  await source.evaluate(`(() => {
    const key = 'travel_data:v1:' + encodeURIComponent(JSON.parse(localStorage.currentUser).id)
    const data = JSON.parse(localStorage[key])
    const trip = data.routes.find(item => item.id === ${JSON.stringify(sourceId)})
    trip.days = [{date: '2030-11-20', activities: [{title:'预约入馆', time:'09:00', timeLocked:true, place:{name:'苏州博物馆',location:[120.63,31.32],coordinateSystem:'GCJ-02'}}]}]
    trip.preparation = {items:[{id:'ticket',title:'门票',done:true}]}
    trip.ledger = {members:[{id:'m',name:'同行人'}],expenses:[{id:'x',title:'午餐',date:'2030-11-20',amountCents:6000,payerId:'m',participantIds:['m'],shares:{m:6000}}],settlements:[]}
    localStorage[key] = JSON.stringify(data)
  })()`)
  await openTravel(source, sourceId)
  await source.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory })
  await clickText(source, '.workbench summary', '旅行备份')
  await clickText(source, '.workbench button', '下载旅行备份')
  let filename
  for (let i = 0; i < 100 && !filename; i++) {
    filename = (await readdir(directory)).find(name => name.endsWith('.json'))
    if (!filename) await sleep(100)
  }
  assert.ok(filename, '浏览器下载了旅行备份')
  const path = join(directory, filename)
  const backup = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(backup.trip.id, undefined)

  await registerAndLogin(target, { phone: '139' + stamp })
  const originalId = await createTravel(target, { title, ...dates })
  await target.viewport(390, 844, { mobile: true })
  await target.goto(BASE + '/routes')
  await target.waitFor("!!document.querySelector('.restore-trip input[type=file]')")
  const { root } = await target.send('DOM.getDocument')
  const { nodeId } = await target.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.restore-trip input[type=file]' })
  await target.send('DOM.setFileInputFiles', { nodeId, files: [path] })
  await target.waitFor("document.querySelector('.backup-preview')?.innerText.includes('1 笔账本支出')")
  assert.ok(await target.evaluate("document.querySelector('.backup-preview').getBoundingClientRect().right <= innerWidth"))
  const routes = () => target.evaluate("JSON.parse(localStorage['travel_data:v1:' + encodeURIComponent(JSON.parse(localStorage.currentUser).id)]).routes")
  assert.equal((await routes()).length, 1, '预览不写入数据')
  await clickText(target, '.backup-preview button', '恢复为新旅行')
  await target.waitFor("!!document.querySelector('.workbench')")
  const saved = await routes()
  assert.equal(saved.length, 2)
  assert.ok(saved.some(item => item.id === originalId))
  assert.notEqual(saved[0].id, sourceId)
  assert.notEqual(saved[0].id, originalId)
  assert.deepEqual(saved[0].days, backup.trip.days)
  assert.deepEqual(saved[0].preparation, backup.trip.preparation)
  assert.deepEqual(saved[0].ledger, backup.trip.ledger)
  await target.fill('.activity-row .row-title', '改到下午参观')
  await clickText(target, 'button', '保存修改')
  await target.waitFor("JSON.parse(localStorage['travel_data:v1:' + encodeURIComponent(JSON.parse(localStorage.currentUser).id)]).routes[0].days[0].activities[0].title === '改到下午参观'")
  console.log('PASS 跨浏览器下载、预览、恢复同名新旅行，保留预约、坐标、清单、账本并继续编辑')
  console.log('1/1 passed')
} catch (error) {
  console.error('来源浏览器', await source.consoleErrors(), '目标浏览器', await target.consoleErrors())
  throw error
} finally {
  await Promise.all([source.close(), target.close()])
}
