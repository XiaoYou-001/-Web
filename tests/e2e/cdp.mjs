// Minimal Chrome DevTools Protocol driver used for local browser verification.
// No extra dependencies: uses Node's global WebSocket (Node 22+).
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const CHROME_CANDIDATES = process.platform === 'win32'
  ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ]
  : process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']

function resolveChrome() {
  const explicit = process.env.CHROME_PATH
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`CHROME_PATH 指向的文件不存在: ${explicit}`)
    return explicit
  }
  const found = CHROME_CANDIDATES.find(candidate => existsSync(candidate))
  if (!found) {
    throw new Error('未找到 Chrome/Edge，请安装浏览器或设置 CHROME_PATH 环境变量')
  }
  return found
}

export async function launch({ port = 9223, profile = null, headless = process.env.E2E_HEADED !== '1' } = {}) {
  const CHROME = resolveChrome()
  port += Number(process.env.E2E_PORT_OFFSET || 0)
  profile = profile || mkdtempSync(join(tmpdir(), 'dsh-e2e-'))
  const args = [
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-features=Translate,MediaRouter',
    '--window-size=1440,900',
    'about:blank'
  ]
  if (headless) args.unshift('--headless=new')
  const proc = spawn(CHROME, args, { stdio: 'ignore' })
  let version
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      version = await res.json()
      break
    } catch { await sleep(100) }
  }
  if (!version) throw new Error('Chrome did not expose a debugging endpoint')

  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  const listeners = new Map()
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message + ' ' + (msg.error.data || '')))
      else resolve(msg.result)
      return
    }
    const key = `${msg.sessionId || ''}:${msg.method}`
    for (const fn of listeners.get(key) || []) fn(msg.params)
  })
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const messageId = ++id
    pending.set(messageId, { resolve, reject })
    ws.send(JSON.stringify({ id: messageId, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const on = (method, fn) => {
    const key = `${sessionId}:${method}`
    if (!listeners.has(key)) listeners.set(key, [])
    listeners.get(key).push(fn)
  }
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send('Log.enable', {}, sessionId)
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.__e2eErrors = []
      window.__e2eWarns = []
      const serialize = args => args.map(a => {
        if (typeof a === 'string') return a
        try { return JSON.stringify(a) } catch { return String(a) }
      }).join(' ')
      const originalError = console.error
      console.error = (...args) => { window.__e2eErrors.push(serialize(args)); originalError.apply(console, args) }
      const originalWarn = console.warn
      console.warn = (...args) => { window.__e2eWarns.push(serialize(args)); originalWarn.apply(console, args) }
      window.addEventListener('error', event => window.__e2eErrors.push('window.error: ' + event.message))
      window.addEventListener('unhandledrejection', event => window.__e2eErrors.push('unhandledrejection: ' + String(event.reason)))
    })()`
  }, sessionId)

  const page = {
    sessionId,
    targetId,
    on,
    send: (method, params) => send(method, params, sessionId),
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId)
      if (result.exceptionDetails) {
        throw new Error('Eval failed: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text) + '\n' + expression)
      }
      return result.result.value
    },
    async goto(url) {
      const loaded = new Promise(resolve => {
        const fn = () => resolve()
        on('Page.loadEventFired', fn)
        setTimeout(resolve, 15000)
      })
      await send('Page.navigate', { url }, sessionId)
      await loaded
      await sleep(300)
    },
    async waitFor(expression, { timeout = 8000, interval = 100 } = {}) {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        try { if (await page.evaluate(expression)) return true } catch { /* keep waiting */ }
        await sleep(interval)
      }
      throw new Error('Timed out waiting for: ' + expression)
    },
    async click(selector, { index = 0 } = {}) {
      return page.evaluate(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})]; const el = els[${index}]; if (!el) return 'MISSING'; el.scrollIntoView({block:'center'}); el.click(); return 'OK' })()`)
    },
    async fill(selector, value) {
      const result = await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'MISSING'; el.focus(); const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(proto, 'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return 'OK' })()`)
      if (result !== 'OK') throw new Error('fill: missing ' + selector)
      return result
    },
    async text(selector) {
      return page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? (el.innerText || el.textContent || '') : null })()`)
    },
    async viewport(width, height, { mobile = false } = {}) {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile,
        screenWidth: width, screenHeight: height
      }, sessionId)
      await sleep(150)
    },
    async screenshot(filePath, { fullPage = false } = {}) {
      let clip
      if (fullPage) {
        const { contentSize } = await send('Page.getLayoutMetrics', {}, sessionId)
        const height = Math.min(Math.ceil(contentSize.height), 12000)
        clip = { x: 0, y: 0, width: Math.ceil(contentSize.width), height, scale: 1 }
      }
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage, ...(clip ? { clip } : {}) }, sessionId)
      mkdirSync(join(filePath, '..'), { recursive: true })
      writeFileSync(filePath, Buffer.from(data, 'base64'))
      return filePath
    },
    async consoleErrors() {
      return page.evaluate(`(() => (window.__e2eErrors || []).slice())()`)
    },
    async close({persistProfile = false} = {}) {
      try { await send('Target.closeTarget', { targetId }) } catch { /* ignore */ }
      if (persistProfile) {
        // A hard kill can discard recently written localStorage despite a successful setItem.
        const exited = new Promise(resolve => proc.once('exit', resolve))
        void send('Browser.close').catch(() => {})
        await Promise.race([exited, sleep(3000)])
      }
      ws.close()
      if (proc.exitCode === null && !proc.signalCode) proc.kill('SIGKILL')
    }
  }
  return page
}

export { sleep }
