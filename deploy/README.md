# 三人试用部署

本方案使用一台 Linux 服务器和 Docker Compose：Caddy 提供网页、HTTPS 和入口密码；Node 提供 AI、地图代理及分享；Go 提供聊天。只有 80/443 映射到公网，3001/8080 不开放。所有命令除特别注明外均在项目根目录执行。

## 1. 服务器准备

建议 Ubuntu 24.04、2核2GB、带公网 IP。按 [Docker 官方 Ubuntu 安装说明](https://docs.docker.com/engine/install/ubuntu/)安装 Docker Engine 和 Compose 插件，确认 `docker version` 和 `docker compose version` 正常。大陆服务器的网站先完成所需备案。

域名 A 记录指向服务器公网 IPv4；只有配置了正确 IPv6 时才添加 AAAA。安全组开放 TCP 80、443，SSH 22 尽量只允许自己的 IP。不开放 3001、8080。Caddy 在域名和网络正确时自动申请与续期 HTTPS 证书。

## 2. 在本机准备配置和镜像

Windows 启动已安装的 Docker Desktop，使用 Linux containers。复制模板：

```powershell
Copy-Item deploy/settings.example deploy/settings.env
docker run --rm -it caddy:2-alpine caddy hash-password
```

按提示输入独立的访问密码，将输出的 bcrypt 散列填入 `SITE_PASSWORD_HASH`，保留外侧单引号。编辑 `deploy/settings.env`：填写域名、AI 密钥、高德公开 Key 和服务端安全码。该文件已被 Git 忽略，也不会进入 Docker 构建上下文。不要把密码明文放入散列字段。

默认保护整个站点，浏览器先弹出入口用户名/密码框，再进入应用。把入口凭据私下交给另外两人；它与应用内演示账号不同。分享链接也需要入口密码，当前不提供匿名公网分享。Basic Auth 是小范围访问控制，不是正式账号系统，也不替代 AI 服务商的消费限额。

本机和服务器都为 x86_64 时：

```powershell
docker compose --env-file deploy/settings.env config --quiet
docker compose --env-file deploy/settings.env --parallel 1 build
docker image save -o deploy/travel-images.tar travel-web-frontend:local travel-web-api:local travel-web-chat:local
```

这会在本机构建 Linux 镜像，不把编译压力放到2GB服务器上。ARM 服务器需要对应架构镜像，不要直接混用。构建需要访问 Docker 镜像仓库、npm 和 Go 模块源。

可先将 `SITE_ADDRESS` 暂设为 `http://localhost`，执行 `docker compose --env-file deploy/settings.env up -d --no-build` 在本机验收；完成后 `docker compose --env-file deploy/settings.env down`，再将地址改回正式域名。不要用公网 HTTP 传输入口密码。

## 3. 上传并启动

在服务器建立 `/opt/travel/deploy`，通过 SSH/SFTP 上传：

- `compose.yaml` → `/opt/travel/compose.yaml`
- `deploy/settings.env` → `/opt/travel/deploy/settings.env`
- `deploy/travel-images.tar` → `/opt/travel/deploy/travel-images.tar`

无需上传整个源码、根目录 `.env` 或 `node_modules`。服务器执行：

```bash
cd /opt/travel
chmod 600 deploy/settings.env
sudo docker load -i deploy/travel-images.tar
sudo docker compose --env-file deploy/settings.env config --quiet
sudo docker compose --env-file deploy/settings.env up -d --no-build
sudo docker compose --env-file deploy/settings.env ps
sudo docker compose --env-file deploy/settings.env logs --tail=100
```

不要公开完整的 `docker compose config` 输出，里面可能包含密钥。首次签发 HTTPS 需要域名解析正确且80/443可达。Node 和聊天无需在宿主机单独安装。

## 4. 上线验收

1. 无痕窗口访问 HTTPS 网站，未输入入口凭据时网页与 `/api/ai/chat` 均应返回401。
2. 登录入口后，刷新一个前端深层链接，页面能正常打开。
3. 发送一条短 AI 问题，确认逐字回复、取消请求正常。健康检查成功不代表 AI 密钥有额度，需实际调用确认；先在 AI 提供方设置消费上限。
4. 检查地图搜索、底图及路线查询，并按高德控制台要求配置域名。
5. 两个浏览器进入同一个聊天室，互发消息；手机先打开网站完成入口认证，再进入聊天室。
6. 创建分享，用另一台设备读取；重启 api 后分享仍可读取；撤销后不可读取。

分享数据保存在 `travel-web_shares` Docker 卷，证书保存在 `travel-web_caddy_data`。普通 `down` 和更新镜像不会删除卷；**不要执行 `down -v` 或清理这些卷**。卷持久化不是备份，服务器损坏仍会丢数据。

目前 Node 的地图/分享限流使用 `req.ip`，此配置不信任代理头，因此三人共享代理 IP 配额（分享创建20次/小时、地图180次/分钟）。这是小范围试用的保守限制；不要直接开启任意代理信任来放宽它。个人账号和行程仍保存在各自浏览器，不会因部署而跨设备同步。

## 5. 更新和备份

更新时在本机重新 build/save，上传新 tar，在服务器 load 后重新执行 `up -d --no-build`。修改地图公开 Key 要重新构建网页；修改服务端密钥只需更新服务器配置并执行 `up -d --no-build`。

分享文件备份（短暂停止 Node，避免复制中途写入）：

```bash
cd /opt/travel
mkdir -p backups
sudo docker compose --env-file deploy/settings.env stop api
sudo docker compose --env-file deploy/settings.env cp api:/data/shares "backups/shares-$(date +%Y%m%d-%H%M%S)"
sudo docker compose --env-file deploy/settings.env start api
```

无论复制是否成功都应重新启动 api。将备份另存到自己的电脑，备份包含分享内容和撤销标记，应一起保留；不要仅备份有效分享。服务器配置中的密钥也需要妥善保管。

## 2026-10-30 本次部署状态

已部署到用户的杭州 Ubuntu 24.04 x86_64 服务器，应用目录 `/opt/travel`。Docker Engine 29.9.2、Compose 5.6.1 已安装，三个容器均启动，Node健康检查通过。由于尚无域名，当前 `WEB_BIND=127.0.0.1`、`WEB_HTTP_PORT=8088`，仅通过SSH隧道验收，没有开放公网网站。

本机建立隧道的命令（保持该终端运行）：

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8088:127.0.0.1:8088 root@120.26.131.166
```

之后浏览器打开 `http://localhost:8088`。入口用户名和随机密码保存在本机 `deploy/access.local`（已被Git忽略），不要提交或公开此文件。若8088已被本次验收隧道占用，直接打开网页，不要重复建立隧道。此localhost地址仅适用于建立隧道的电脑，不是可分享的公网地址。

已验证：未认证401、前端深层页面回退、真实Go WebSocket握手、跨站Origin403、分享创建与敏感字段剔除、Node容器替换后分享仍存在、撤销后不可访问、地图SDK代理返回200。地图底图视觉效果及跨设备浏览器流程未在这次服务器部署中验收。空闲三个容器合计约35MiB，不能当作负载测试结果。

现有全量201项测试通过；随后新增压缩JSON拒绝回归，后端6项测试通过；Go测试通过。部署修复包含Node镜像补充日期工具文件、WebSocket来源检查、移除影响AI取消的强制刷新设置、拒绝压缩JSON请求体。依赖审计仍有历史告警，未进行大规模依赖升级。

AI密钥已配置到服务器，但实际调用30秒超时。服务器直连 `glai2.wuxidata.com.cn:4001` TCP超时，本机对比检查也超时，尚不能确认AI可用；需确认提供方接口公网可达或由用户指定其他服务。未把密钥发送到替代接口。

后续正式上线：确定域名及所需备案、解析到服务器、设置 `SITE_ADDRESS` 为域名、将 `WEB_BIND` 改为 `0.0.0.0`，端口改回80/443；放通网站端口并执行 `up -d --no-build` 后验证HTTPS及跨设备访问。公网开放前再次确认配置和可用性。
