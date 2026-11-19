import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
// 截图与夹具属于运行产物，仍写入 gitignore 的 logs/ 目录。
export const OUT = process.env.E2E_OUT || fileURLToPath(new URL('../../logs/e2e-out', import.meta.url))
mkdirSync(OUT, { recursive: true })

export async function clickText(page, selector, text, { index = 0, exact = false } = {}) {
  const result = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .filter(el => { const t = (el.innerText || el.textContent || '').trim(); return ${exact} ? t === ${JSON.stringify(text)} : t.includes(${JSON.stringify(text)}) })
    const el = els[${index}]
    if (!el) return 'MISSING'
    el.scrollIntoView({ block: 'center' })
    el.click()
    return 'OK'
  })()`)
  if (result !== 'OK') throw new Error(`clickText: no ${selector} containing ${text}`)
}

export async function registerAndLogin(page, { phone, password = 'e2e-pass-123' } = {}) {
  await page.goto(BASE + '/register')
  await page.waitFor("!!document.querySelector('#register-phone')", { timeout: 15000 })
  await page.fill('#register-phone', phone)
  await page.fill('#register-password', password)
  await page.fill('#register-confirmPassword', password)
  await page.click('form button[type="submit"]')
  await page.waitFor("location.pathname === '/login'", { timeout: 8000 })
  await page.waitFor("!!document.querySelector('#login-phone')", { timeout: 8000 })
  await page.fill('#login-phone', phone)
  await page.fill('#login-password', password)
  await page.click('#agreeTerms')
  await page.click('form button[type="submit"]')
  await page.waitFor("localStorage.getItem('isAuthenticated') === 'true'", { timeout: 8000 })
  return phone
}

export async function createTravel(page, { title, startDate, endDate, persons = 2, budget = 3000 }) {
  await page.goto(BASE + '/routes')
  await page.waitFor("!!document.querySelector('.control-bar')")
  await clickText(page, 'button', '新建旅行')
  await page.waitFor("!!document.querySelector('.modal-body')")
  await page.fill('.modal-body input[placeholder*="例如"]', title)
  await page.evaluate(`(() => {
    const dates = [...document.querySelectorAll('.modal-body input[type="date"]')]
    const set = (el, value) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) }
    set(dates[0], ${JSON.stringify(startDate)})
    set(dates[1], ${JSON.stringify(endDate)})
    const numbers = [...document.querySelectorAll('.modal-body input[type="number"]')]
    set(numbers[0], ${JSON.stringify(String(persons))})
    set(numbers[1], ${JSON.stringify(String(budget))})
    return dates.length + '/' + numbers.length
  })()`)
  await page.click('.modal-footer button.btn-primary')
  await page.waitFor("!document.querySelector('.modal-body')", { timeout: 6000 })
  const id = await page.evaluate(`(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('travel_data:v1:'))
    if (!key) return null
    const data = JSON.parse(localStorage.getItem(key))
    const routes = data.routes || data.travels || []
    // 行程按“最新在前”保存，多条行程时不能只取最后一条。
    const matches = routes.filter(route => route.title === ${JSON.stringify(title)})
    const pool = matches.length ? matches : routes
    const latest = [...pool].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    return latest.length ? String(latest[0].id) : null
  })()`)
  if (!id) throw new Error('travel not saved to localStorage')
  return id
}

export async function openTravel(page, id) {
  await page.goto(`${BASE}/routes/${id}`)
  await page.waitFor("!!document.querySelector('.workbench')", { timeout: 10000 })
  await page.evaluate('window.scrollTo(0,0)')
}

export async function collectErrors(page) {
  return page.evaluate(`(() => (window.__e2eErrors || []).slice())()`)
}
