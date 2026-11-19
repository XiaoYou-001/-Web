# 三人试用部署

Vue 静态页面和入口密码由 Caddy 提供。Node 处理账号、协作、只读分享、地图代理与 AI。Go 处理聊天室和历史消息。默认仅监听本机，以下命令在项目根目录执行。

## 本地构建和启动

1. 启动 Docker Desktop（Linux containers）。首次配置时将 `deploy/settings.example` 复制为 `deploy/settings.env`。已有配置应逐项补齐，避免覆盖凭据。
2. 保持 `SITE_ADDRESS=http://localhost`、`CADDY_CONFIG_FILE=Caddyfile`、`WEB_BIND=127.0.0.1`、`WEB_HTTP_PORT=8088`、`WEB_HTTPS_PORT=8443`。只通过 `http://localhost:8088` 访问。
3. 用 `docker run --rm -it caddy:2-alpine caddy hash-password` 交互生成入口密码散列，填入 `SITE_PASSWORD_HASH` 并用单引号包裹。设置入口用户名。分别为 `CHAT_AUTH_SECRET` 和 `CHAT_ADMIN_SECRET` 生成独立随机值（每个至少 16 字节，可分别运行 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`）。Compose 会把相应值同时传给 Node 和 Go。
4. AI 使用 `GLAI2_API_KEY` 与 `AI_API_ENDPOINT`，地图使用公开浏览器 Key `VITE_AMAP_KEY` 和仅供服务端使用的 `AMAP_SECURITY_JS_CODE`。更改浏览器 Key 后重新构建 web。配置文件和入口密码文件仅在本机保存。

```powershell
docker compose -p travel-accept --env-file deploy/settings.env config --quiet
docker compose -p travel-accept --env-file deploy/settings.env build
docker compose -p travel-accept --env-file deploy/settings.env up -d --no-build --wait
docker compose -p travel-accept --env-file deploy/settings.env ps
```

## 本机验收

- 无痕窗口访问网页，先验证入口密码，再刷新前端深层链接。匿名访问页面、API 和聊天历史应返回 401。
- 用两个浏览器配置文件分别注册协作账号。创建行程、生成邀请并加入。通过同行聊天室互发消息，断线重连后读取历史。
- 执行下方命令替换 API 和聊天容器，刷新后检查成员关系、聊天记录和已创建的分享。移除成员，验证其连接断开，旧令牌无法重连或读取历史。
- 单独验证 AI 实际回复和取消、地图显示与路线查询、分享读取与撤销。容器健康检查仅覆盖进程响应。

```powershell
docker compose -p travel-accept --env-file deploy/settings.env up -d --force-recreate --no-deps --wait api chat
```

### AI 或地图出现 502 时

先在浏览器开发者工具的「网络」面板确认失败请求。AI 走 `/api/ai/chat`。地图 SDK 走 `/_AMapService/sdk`，随后还会加载高德初始化接口和底图资源。若页面只有灰色网格，继续查看这些后续请求。

可在项目根目录从 API 容器探测上游连通性。以下请求不携带凭据，只输出主机、HTTP 状态或连接错误：

```powershell
docker compose -p travel-accept --env-file deploy/settings.env exec -T api node -e "for (const u of [process.env.AI_API_ENDPOINT, 'https://webapi.amap.com/maps', 'https://restapi.amap.com/v3/log/init']) fetch(u,{signal:AbortSignal.timeout(8000)}).then(r=>console.log(new URL(u).host,r.status)).catch(e=>console.log(new URL(u).host,e.cause?.code || e.name))"
```

HTTP 401 或 405 表示已收到上游响应，仍需用应用验收鉴权和实际调用。若出现 `ECONNRESET`，在宿主机上比较直连和经当前代理访问同一个上游的结果。本机曾出现高德直连成功、经系统代理时 TLS 握手失败的情况；在 Windows 当前用户的代理例外中加入 `*.amap.com` 和 `*.autonavi.com` 后，重新打开浏览器验证了底图与地点标记。AI 上游在调整例外前已恢复，复现时应独立检查。

复验时，从本地入口向 AI 提问，确认流中有回复正文和结束事件。打开「发现 → 地图」，搜索城市「北京」、地点「故宫博物院」，选择结果后确认街道、地名和定位标记均可见。

## 数据与备份

Compose 命名卷 `shares`、`collaboration`、`chat_history` 分别保存分享、协作账号与行程、房间聊天历史。卷名带项目名前缀，后续更新应使用同一项目名。Caddy 使用单独的 `caddy_data` 和 `caddy_config` 卷。普通 `down` 保留卷，请勿使用 `down -v` 清理业务环境。

一致性备份时先停止 api 和 chat，使用 `docker compose cp` 分别复制 `api:/data/shares`、`api:/data/collaboration` 和 `chat:/data/history` 至独立备份目录，随后重新启动两个服务。备份应限制访问并异机保存。浏览器本地的个人行程与收藏需另行导出。

## 后续服务器交付

公网发布暂缓。需要迁移时，先使用与目标服务器相同架构构建三个镜像，并运行：

```powershell
docker image save -o deploy/travel-images.tar travel-web-frontend:local travel-web-api:local travel-web-chat:local
```

交付清单包括根目录的 `compose.yaml`、`deploy/travel-images.tar`、`deploy/settings.env` 以及 **`deploy/` 下由 `CADDY_CONFIG_FILE` 指定的实际文件**（域名或本机使用 `Caddyfile`，IP HTTPS 方案使用 `Caddyfile.ip`）。保持相对目录结构，限制配置文件权限。在目标机用 `docker load -i deploy/travel-images.tar` 加载，沿用原项目名，执行 Compose 配置检查和 `up -d --no-build --wait`。服务器保持回环监听时可通过 SSH 隧道验收。

历史记录：2026-10-30 的服务器试用通过 SSH 隧道完成；当时 AI 上游连接超时。本地验收与该记录均不能证明当前公网 HTTPS、跨设备或服务器 AI 可用性。
