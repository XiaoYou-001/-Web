// 浏览器验收总入口：依次运行 s1–s8，汇总通过数并在失败时返回非零退出码。
// 依赖本机的 Vite（5173）、Node 后端（3001），s7/s8 还需要 Go 聊天服务（8080）。
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const API = process.env.API_BASE_URL || 'http://127.0.0.1:3001'

const SCRIPTS = [
  { id: 's1', file: 's1-preparation.mjs', title: '出行准备中心' },
  { id: 's2', file: 's2-ledger.mjs', title: '旅行账本与 AA 分账' },
  { id: 's3', file: 's3-journal.mjs', title: '旅行手账与足迹' },
  { id: 's4', file: 's4-dining.mjs', title: '美食探索与用餐安排' },
  { id: 's5', file: 's5-plan-compare.mjs', title: '行程方案对比' },
  { id: 's6', file: 's6-weather.mjs', title: '天气联动与备选安排' },
  { id: 's7', file: 's7-collaboration.mjs', title: '同行协商空间', collaboration: true },
  { id: 's8', file: 's8-chat.mjs', title: '同行聊天室（真实 Go 服务）', collaboration: true, chat: true }
]

const args = process.argv.slice(2)
if (args.includes('--list')) {
  for (const item of SCRIPTS) console.log(`${item.id}\t${item.title}`)
  process.exit(0)
}
const onlyArg = args.find(arg => arg.startsWith('--only='))
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map(item => item.trim()).filter(Boolean)) : null
const selected = only ? SCRIPTS.filter(item => only.has(item.id)) : SCRIPTS
if (!selected.length) {
  console.error(`没有匹配的脚本：${[...only].join(', ')}（可选 ${SCRIPTS.map(item => item.id).join(', ')}）`)
  process.exit(2)
}

async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
    return response.status
  } catch {
    return 0
  }
}

const problems = []
const viteStatus = await probe(BASE + '/')
if (!viteStatus) problems.push(`前端未启动：${BASE}（先运行 npm run dev）`)
let collaborationOk = false
if (selected.some(item => item.collaboration)) {
  const status = await probe(API + '/api/collaboration/status')
  if (!status) {
    problems.push(`后端未启动：${API}（先运行 npm run start:backend）`)
  } else {
    try {
      const info = await fetch(API + '/api/collaboration/status').then(response => response.json())
      collaborationOk = Boolean(info.enabled && info.chatConfigured)
      if (!collaborationOk) problems.push('后端协作/聊天未配置 CHAT_AUTH_SECRET')
      if (selected.some(item => item.chat) && !info.chatRevokeConfigured) {
        problems.push('s8 需要配置 CHAT_ADMIN_SECRET 与 CHAT_INTERNAL_URL，否则移除成员后无法即时断开')
      }
    } catch {
      problems.push(`无法读取协作状态：${API}/api/collaboration/status`)
    }
  }
}
if (problems.length) {
  console.error('前置条件不满足：')
  for (const problem of problems) console.error(' - ' + problem)
  process.exit(2)
}

function runScript(item) {
  return new Promise(resolve => {
    const startedAt = Date.now()
    const child = spawn(process.execPath, [join(HERE, item.file)], { env: process.env })
    let summary = null
    let output = ''
    const onData = chunk => {
      const text = chunk.toString('utf8')
      output += text
      process.stdout.write(text)
      const matches = [...text.matchAll(/(\d+)\/(\d+) passed/g)]
      if (matches.length) summary = matches[matches.length - 1]
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    const timer = setTimeout(() => {
      child.kill()
      output += '\n[run-all] 超时（300 秒），已终止\n'
      process.stdout.write('\n[run-all] 超时（300 秒），已终止\n')
    }, 300000)
    child.on('close', code => {
      clearTimeout(timer)
      const pass = Number(summary?.[1] ?? 0)
      const total = Number(summary?.[2] ?? 0)
      resolve({
        id: item.id,
        title: item.title,
        code,
        pass,
        total,
        ok: code === 0 && total > 0 && pass === total,
        seconds: Math.round((Date.now() - startedAt) / 100) / 10
      })
    })
  })
}

const results = []
for (const item of selected) {
  console.log(`\n=== ${item.id} ${item.title} ===`)
  results.push(await runScript(item))
}

const failed = results.filter(item => !item.ok)
const total = results.reduce((sum, item) => sum + item.total, 0)
const passed = results.reduce((sum, item) => sum + item.pass, 0)
console.log('\n===== 浏览器验收汇总 =====')
for (const item of results) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.id}  ${item.pass}/${item.total}  ${item.seconds}s  ${item.title}`)
}
console.log(`\n合计 ${passed}/${total} 项断言通过，脚本 ${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
