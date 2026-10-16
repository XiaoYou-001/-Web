# Node.js 后端服务使用指南

后端将旅行客服请求转发到 AI 服务，统一返回完整 JSON 和内容分类信息。目前接口不提供 SSE 流式响应；兼容旧客户端传入 `stream` 参数，但上游请求固定使用 `stream: false`。

## 安装与配置

使用 Node.js 22.12 或更高版本，在项目根目录执行：

```powershell
npm ci
Copy-Item .env.example .env
```

如果已有 `.env`，直接编辑，不要覆盖。填写以下服务端配置：

```dotenv
PORT=3001
AI_API_KEY=replace-with-your-new-key
AI_API_ENDPOINT=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
AI_REQUEST_TIMEOUT_MS=30000
```

服务启动时读取项目根目录的 `.env`，已有系统环境变量优先。修改配置后需重启服务。`AI_API_KEY` 不得使用 `VITE_` 前缀，也不得提交到 Git。`.env.example` 仅保留空值和示例。

旧版本曾将密钥写入源码和本指南。请在服务商控制台撤销旧密钥并创建新密钥；删除工作区中的旧值不会撤销凭证，Git 历史中也可能仍保留旧值。

## 启动与验证

```powershell
npm run start:backend
```

Windows 也可以运行 `start-backend.bat`。该脚本在依赖缺失时通过 `npm ci` 安装锁定版本。

默认地址为 `http://localhost:3001`：

| 接口 | 用途 |
| --- | --- |
| `GET /api/health` | 进程健康检查，不代表上游 AI 已就绪 |
| `GET /api/ai/models` | 查询配置中的模型别名 |
| `POST /api/ai/chat` | 获取 AI 回复及结构化分类 |

聊天请求示例：

```json
{
  "message": "请帮我规划北京旅行",
  "model": "open-source-llm",
  "structured": true
}
```

缺少 `AI_API_KEY` 时，聊天接口返回 HTTP 503 和 `AI_NOT_CONFIGURED`，健康检查和模型列表仍可访问。消息须为 1 至 2000 个字符，无效消息返回 HTTP 400；上游响应超时返回 HTTP 504 和 `TIMEOUT`。

错误统一返回 `{ "code": "错误码", "error": "友好提示" }`。上游认证失败使用 `AI_AUTH_FAILED`，上游地址不存在使用 `AI_ENDPOINT_INVALID`，限流使用 `RATE_LIMIT`，异常数据使用 `INVALID_RESPONSE`，服务不可达使用 `SERVICE_UNAVAILABLE`。浏览器不会收到上游原始错误内容。

超时覆盖等待响应头和读取完整响应体。浏览器取消等待或断开当前请求后，后端会中止相应的上游连接；切换模型、客服类型、刷新对话和离开页面也会取消旧请求，迟到的回复不进入新会话。

## 前端连接配置

前端默认请求同源 `/api/ai/chat`。`npm run dev` 的 Vite 代理会把 `/api` 转发至本机 Node 服务，读取 `PORT`，默认端口为 3001。修改 `.env` 后需同时重启前后端。

```dotenv
VITE_API_BASE_URL=/api
VITE_API_REQUEST_TIMEOUT_MS=10000
VITE_AI_REQUEST_TIMEOUT_MS=45000
```

AI 的前端等待时间应大于 `AI_REQUEST_TIMEOUT_MS`，为代理与响应传输留出时间。所有超时配置必须为 1 至 300000 的整数，普通 JSON 请求默认 10 秒，AI 默认 45 秒。请求不会自动重试，临时故障由用户点击“重试”再次发起。

生产环境需要将 `/api` 反向代理至 Node 服务；`vite preview` 不包含开发代理。也可在构建前将 `VITE_API_BASE_URL` 设置为完整 HTTP(S) API 基地址，HTTPS 页面需使用 HTTPS API。跨域部署需服务端允许对应来源。`VITE_` 配置会进入浏览器，不得放置密钥。

```powershell
npm run test:backend
npm run build
```

后端回归测试使用本地模拟上游，不发送真实 AI 请求，不需要真实密钥，也不产生模型调用费用。

## 当前限制

当前服务只提供 AI 转发，不包含账号、线路、支付或短信业务接口；正式认证、限流及按部署环境收紧 CORS 仍需接入。线路页面继续使用按账号保存的本地数据，只有接入真实线路后端后才填写 `VITE_ROUTES_API_BASE_URL`。旧 `VITE_APP_API_BASE_URL` 作为线路适配器的兼容配置保留，不影响 AI 地址。
