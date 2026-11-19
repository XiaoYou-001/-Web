# 浏览器验收脚本（tests/e2e）

这些脚本用 Chrome DevTools Protocol 驱动真实 Chrome/Edge，验证七个新增功能与同行聊天室的关键交互。它们不参与 `npm test`（单元/组件测试），也不会被打包进应用。

## 前置条件

- Node.js 22 或更新版本（使用全局 `fetch` 与 `WebSocket`，无需安装 Puppeteer/Playwright）。
- 本机 Chrome 或 Edge。默认自动查找常见安装路径，找不到时设置 `CHROME_PATH`。
- 运行中的 Vite（`npm run dev`，默认 `http://127.0.0.1:5173`）。
- 运行中的 Node 后端（`npm run start:backend`，默认 `http://127.0.0.1:3001`）。
- 协作与聊天场景（s7、s8）还需要 Go 聊天服务与密钥：

```powershell
# 终端 1：后端，密钥仅通过进程环境变量传入
$env:COLLAB_DATA_DIR="D:\Project\-Web\logs\runtime\collab-e2e"
$env:CHAT_AUTH_SECRET="local-e2e-chat-secret-0123456789"
$env:CHAT_ADMIN_SECRET="local-e2e-admin-secret-0123456789"
$env:CHAT_INTERNAL_URL="http://127.0.0.1:8080"
node server.js

# 终端 2：Go 聊天服务（已安装 Go 时）
$env:CHAT_AUTH_SECRET="local-e2e-chat-secret-0123456789"
$env:CHAT_ADMIN_SECRET="local-e2e-admin-secret-0123456789"
$env:CHAT_HISTORY_DIR="D:\Project\-Web\logs\runtime\chat-history"
go run .   # 在 go-chat-server 目录；或运行已构建的可执行文件
```

`CHAT_AUTH_SECRET` 与 `CHAT_ADMIN_SECRET` 都至少 16 字节；两个服务必须使用相同值。未配置 `CHAT_ADMIN_SECRET` 时 s8 的移除成员即时断开用例无法通过。Go 服务默认只接受同源与本机来源；自定义前端地址时设置 `CHAT_ALLOWED_ORIGINS`（完整 `scheme://host[:port]`，逗号分隔）。Vite 需把 `/history` 代理到 Go 服务（仓库 `vite.config.js` 已配置），否则刷新/断线补收只能读到浏览器本机缓存。

本机通过系统代理访问外网时，Node 后端需同时满足两类外部请求：Open-Meteo 走代理，高德 Web 服务直连。可这样启动后端：

```powershell
$env:NODE_USE_ENV_PROXY="1"
$env:HTTPS_PROXY="http://127.0.0.1:7897"   # 改成实际代理地址
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:NO_PROXY="127.0.0.1,localhost,::1,amap.com"
$env:no_proxy=$env:NO_PROXY
node server.js
```

若 `restapi.amap.com` 被代理转发，本机会出现 TLS reset，后端返回 502，s4 报“地点查询失败”；若完全禁用代理，s6 的 Open-Meteo 请求可能超时。`NO_PROXY` 中的 `amap.com` 让高德直连，其余外网仍走代理。浏览器本身不需要该配置。

## 运行

```powershell
npm run test:e2e                  # 依次运行 s1–s8
npm run test:e2e -- --only=s7,s8  # 只运行协作与聊天
npm run test:e2e -- --list        # 列出场景
```

总入口会先探测前端、后端与协作配置，缺失时给出明确提示并退出（退出码 2）。每个场景内部使用独立浏览器配置目录和带时间戳的账号，互不干扰；单个场景超时 300 秒。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `BASE_URL` | `http://127.0.0.1:5173` | Vite 地址 |
| `API_BASE_URL` | `http://127.0.0.1:3001` | 后端地址，仅用于前置探测 |
| `CHROME_PATH` | 自动查找 | Chrome/Edge 可执行文件 |
| `E2E_HEADED` | 空（无头） | 设为 `1` 显示浏览器窗口 |
| `E2E_PORT_OFFSET` | `0` | 调试端口偏移，避免与本机其他调试实例冲突 |
| `E2E_OUT` | `<仓库>/logs/e2e-out` | 截图与测试夹具输出目录 |

## 说明与限制

- 输出中的 `N/N passed` 是断言汇总；任一断言失败或脚本异常都会返回非零退出码。
- s1–s6 只依赖前端与后端；s6 会请求真实天气接口（后端 `/api/weather`，失败时脚本验证降级提示）；s4 会请求真实高德地点检索，需有效 Key、配额与上文代理配置。
- s3 在地图 READY 后会忽略高德底图瓦片产生的空 `Uncaught (in promise)`（无错误描述与堆栈），其他业务异常仍计为失败。
- s7/s8 使用两个独立浏览器配置目录模拟两位真实账号，覆盖加入、权限、移除、共享每日行程快照推送与写回、真实消息收发、清空本机缓存后从 Go 服务端恢复历史、对页面派发 `offline`/`online` 事件后的断线补收、撤销后重连拒绝。离线事件只模拟浏览器网络状态变化，不等同于真实弱网或物理断网。
- 截图与临时夹具在 `logs/e2e-out/`（已被 `.gitignore` 忽略），不进入版本库。
- 这些脚本是本机验收工具，不是覆盖所有设备/浏览器的兼容性测试；两台物理设备与公网部署仍未验收。
