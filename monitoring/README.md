# 智绘旅游服务观测台

面向旅行网站的独立监控服务。Python 标准库完成 HTTP 探测、定时任务、SQLite 持久化、SMTP 发信和管理接口，浏览器页面使用原生 JavaScript。服务独立构建和部署，无需安装 Uptime Kuma。

## 业务探测

| 探测 | 通过条件 |
| --- | --- |
| 网站入口 | HTTPS 证书校验通过，收到 401 和 Basic 鉴权挑战 |
| 后端 API | 内网健康接口返回 200，JSON 的 status 为 ok |
| 网页首页 | 使用站点凭据访问公网地址，返回 200 且包含页面标题 |
| 公共聊天 | 固定房间的历史接口返回对应房间 ID 和消息数组 |
| AI 模型目录 | 接口返回非空模型名称列表；生成质量及模型上游可用性需单独验证 |

五项探测每分钟并发执行，保留 30 天采样。面板支持近 1 小时、24 小时和 7 天统计，按业务展示分桶平均延迟、最近 50 条采样，以及当前时段最新 100 条告警中的相关事件，超过 150 秒没有新样本时标记数据过期。连续三次失败产生故障事件，故障后的首次成功产生恢复事件。SQLite 在同一事务内写入状态与待发事件。独立发件线程按顺序投递，SMTP 失败后退避重试。SMTP 已接收但本机尚未标记成功时发生重启，邮件可能重复。

## 运行与访问

在 monitoring 目录执行 `python -m unittest discover -p test_watch.py`。生产构建与启动命令为 `docker compose up -d --build --wait`。Compose 使用外部 Docker 网络 travel-web_default，并将面板绑定到服务器回环地址的 3001 端口。电脑端通过 SSH 转发后访问 http://127.0.0.1:13001/ 。

```powershell
ssh -N -L 127.0.0.1:13001:127.0.0.1:3001 root@120.26.131.166
```

运行前准备 /etc/travel-watch/config.json，设置为容器 UID 65532 只读，由服务器管理员管理。字段包括 site_origin（公网 HTTPS 地址）、api_origin（内网 API 地址）、site_user、site_password、smtp_host、smtp_port（隐式 TLS）、smtp_user、smtp_password、smtp_from、smtp_to 和 admin_hash。管理员用户名为 admin。admin_hash 为随机高强度面板密码的 UTF-8 字节的 SHA-256 十六进制摘要。数据库路径为容器内 /data/watch.sqlite，Compose 使用命名卷持久化。管理密码、站点凭据和 SMTP 授权码均在仓库外管理。

## 验证范围

用隔离数据库验证三次失败阈值、持续故障去重、成功恢复、邮件重试和采样过期。上线验收检查五项真实业务响应、接口登录保护、桌面与手机宽度的页面布局及 SMTP 测试邮件。探测从旅行网站所在的云主机发起，整机断电需要外部探针发现。


