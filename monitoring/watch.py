"""Travel service monitoring. Runtime dependencies are all in the Python standard library."""
import base64
import hashlib
import hmac
import json
import os
import smtplib
import sqlite3
import ssl
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

DB = os.getenv("WATCH_DB", "/data/watch.sqlite")
INTERVAL = 60
PROBES = {
    "entry": ("网站入口", "/", "HTTPS 返回登录挑战", "访客可能无法安全打开网站", "检查 Caddy、证书和入口鉴权"),
    "api": ("后端 API", "/api/health", "Node 返回健康状态", "行程后端可能不可用", "检查 Node 容器和健康接口"),
    "home": ("网页首页", "/", "登录后可读取智绘旅游首页", "用户可能无法打开首页", "检查 Caddy 凭据、静态构建产物和首页路由"),
    "chat": ("公共聊天", "/history?roomId=general&limit=1", "公共房间返回消息列表", "用户可能无法读取聊天历史", "检查 Go 服务日志及历史接口"),
    "models": ("AI 模型目录", "/api/ai/models", "模型列表至少包含一个模型", "客户端可能无法加载模型目录", "检查 Node 模型配置和 API 路由"),
}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def validate(key, status, headers, body):
    if key == "entry":
        return status == 401 and headers.get("WWW-Authenticate", "").lower().startswith("basic ")
    if status != 200:
        return False
    if key == "home":
        return "<title>智绘旅游</title>".encode() in body
    data = json.loads(body)
    if not isinstance(data, dict):
        return False
    if key == "api":
        return data.get("status") == "ok"
    if key == "chat":
        return data.get("roomId") == "general" and isinstance(data.get("messages"), list)
    models = data.get("models")
    return isinstance(models, list) and bool(models) and all(isinstance(m, str) and m.strip() for m in models)


def probe(key, cfg):
    origin = cfg["api_origin"] if key == "api" else cfg["site_origin"]
    headers = {}
    if key in {"home", "chat", "models"}:
        auth = (cfg["site_user"] + ":" + cfg["site_password"]).encode()
        headers["Authorization"] = "Basic " + base64.b64encode(auth).decode()
    start = time.monotonic()
    try:
        req = Request(origin + PROBES[key][1], headers=headers)
        try:
            response = build_opener(NoRedirect).open(req, timeout=10)
        except HTTPError as exc:
            response = exc
        with response:
            passed = validate(key, response.status, response.headers, response.read(524289))
            note = f"HTTP {response.status}" + ("" if passed else " · 响应不符合预期")
    except (ValueError, OSError, EOFError) as exc:
        passed, note = False, type(exc).__name__
    return passed, round((time.monotonic() - start) * 1000), note


def connect():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    return db


def initialize(db):
    db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS samples (
            id INTEGER PRIMARY KEY, key TEXT, at INTEGER, ok INTEGER, ms INTEGER, note TEXT
        );
        CREATE INDEX IF NOT EXISTS sample_lookup ON samples(key,id);
        CREATE INDEX IF NOT EXISTS sample_expiry ON samples(at);
        CREATE TABLE IF NOT EXISTS states (key TEXT PRIMARY KEY, state TEXT, failures INTEGER);
        CREATE TABLE IF NOT EXISTS mail (
            id INTEGER PRIMARY KEY, key TEXT, state TEXT, at INTEGER, attempts INTEGER DEFAULT 0,
            next_try INTEGER DEFAULT 0, sent INTEGER
        );
    """)


def record(db, key, ok, ms, note, now):
    with db:
        old = db.execute("SELECT state,failures FROM states WHERE key=?", (key,)).fetchone()
        previous, count = old if old else ("等待采样", 0)
        failures = 0 if ok else count + 1
        state = "正常" if ok else ("故障" if failures >= 3 else "重试中")
        db.execute("INSERT INTO samples(key,at,ok,ms,note) VALUES(?,?,?,?,?)", (key,now,ok,ms,note))
        db.execute("INSERT OR REPLACE INTO states VALUES(?,?,?)", (key,state,failures))
        if (state == "故障" and previous != state) or (ok and previous == "故障"):
            db.execute("INSERT INTO mail(key,state,at) VALUES(?,?,?)", (key,state,now))


def deliver(cfg, subject, body, event_id):
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = cfg["smtp_from"], cfg["smtp_to"], subject
    msg["Message-ID"] = f"<travel-watch-{event_id}@{cfg['smtp_from'].split('@')[-1]}>"
    msg.set_content(body)
    with smtplib.SMTP_SSL(cfg["smtp_host"], cfg["smtp_port"], timeout=12, context=ssl.create_default_context()) as smtp:
        smtp.login(cfg["smtp_user"], cfg["smtp_password"])
        smtp.send_message(msg)


def flush_mail(db, cfg, now):
    # Preserve incident/recovery order, including when the mail server is unavailable.
    for event in db.execute("SELECT * FROM mail WHERE sent IS NULL ORDER BY id LIMIT 10").fetchall():
        if event["next_try"] > now:
            break
        name, _, scope, impact, action = PROBES[event["key"]]
        down = event["state"] == "故障"
        subject = f"智绘旅游 · {name}{'异常' if down else '已恢复'}"
        when = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(event["at"]))
        body = "\n".join([subject, impact if down else scope, "排查入口：" + action, "事件时间：" + when])
        try:
            deliver(cfg, subject, body, event["id"])
        except (OSError, smtplib.SMTPException) as exc:
            attempts = event["attempts"] + 1
            with db:
                db.execute("UPDATE mail SET attempts=?,next_try=? WHERE id=?",
                           (attempts, now + min(3600, 60 * 2**min(6,attempts-1)), event["id"]))
            print("SMTP retry:", type(exc).__name__, flush=True)
            break
        with db:
            db.execute("UPDATE mail SET sent=? WHERE id=?", (now,event["id"]))


WINDOWS = {"1h": (3600, 60), "24h": (86400, 900), "7d": (604800, 7200)}


def snapshot(db, now, window="1h"):
    duration, bucket = WINDOWS[window]
    since = now - duration
    items = []
    for key, (name, _, scope, impact, action) in PROBES.items():
        rows = db.execute("SELECT at,ok,ms,note FROM samples WHERE key=? ORDER BY id DESC LIMIT 12", (key,)).fetchall()
        state = db.execute("SELECT state FROM states WHERE key=?", (key,)).fetchone()
        latest = dict(rows[0]) if rows else {}
        label = state[0] if state else "等待采样"
        if rows and now-latest["at"] > 150:
            label = "数据过期"
        totals = db.execute("""
            SELECT count(*) AS total, coalesce(sum(ok),0) AS passed, max(ms) AS peak
            FROM samples WHERE key=? AND at BETWEEN ? AND ?
        """, (key,since,now)).fetchone()
        trend = db.execute("""
            SELECT (at / ?) * ? AS at, round(avg(ms),1) AS ms, count(*) AS n
            FROM samples WHERE key=? AND at BETWEEN ? AND ? GROUP BY 1 ORDER BY 1
        """, (bucket,bucket,key,since,now)).fetchall()
        recent = db.execute("""
            SELECT at,ok,ms,note FROM samples WHERE key=? AND at BETWEEN ? AND ?
            ORDER BY id DESC LIMIT 50
        """,(key,since,now)).fetchall()
        items.append(dict(key=key,name=name,scope=scope,impact=impact,action=action,state=label,latest=latest,
                          stats=dict(totals),trend=[dict(r) for r in trend],recent=[dict(r) for r in recent],
                          history=[bool(row["ok"]) for row in reversed(rows)]))
    pending = db.execute("SELECT COUNT(*) FROM mail WHERE sent IS NULL").fetchone()[0]
    events = db.execute("""
        SELECT key,state,at,attempts,sent FROM mail WHERE at BETWEEN ? AND ?
        ORDER BY id DESC LIMIT 100
    """,(since,now)).fetchall()
    return dict(items=items,pending=pending,events=[dict(r) for r in events],
                since=since,now=now,bucket=bucket)


def schedule(cfg):
    with closing(connect()) as db, ThreadPoolExecutor(max_workers=len(PROBES)) as pool:
        while True:
            start = time.monotonic()
            jobs = {key: pool.submit(probe,key,cfg) for key in PROBES}
            for key, job in jobs.items():
                record(db, key, *job.result(), int(time.time()))
            now = int(time.time())
            with db:
                db.execute("DELETE FROM samples WHERE at<?", (now-30*86400,))
            time.sleep(max(0, INTERVAL-(time.monotonic()-start)))


def mail_worker(cfg):
    with closing(connect()) as db:
        while True:
            flush_mail(db,cfg,int(time.time()))
            time.sleep(10)


def serve(cfg):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/health":
                return self.reply(200, b"ok", "text/plain")
            header = self.headers.get("Authorization", "")
            try:
                user, password = base64.b64decode(header.removeprefix("Basic "), validate=True).split(b":",1)
                authenticated = header.startswith("Basic ") and user == b"admin" and hmac.compare_digest(
                    hashlib.sha256(password).hexdigest(),cfg["admin_hash"])
            except ValueError:
                authenticated = False
            if not authenticated:
                self.send_response(401)
                self.send_header("WWW-Authenticate", 'Basic realm="Travel Watch"')
                self.end_headers()
                return
            route = self.path.split("?")[0]
            if route == "/api/status":
                with closing(connect()) as db, db:
                    db.execute("BEGIN")
                    window = parse_qs(urlsplit(self.path).query).get("window", ["1h"])[0]
                    if window not in WINDOWS:
                        return self.reply(400,b"Unknown window","text/plain")
                    data = snapshot(db,int(time.time()),window)
                return self.reply(200,json.dumps(data,ensure_ascii=False).encode(),"application/json; charset=utf-8")
            files = {"/":("index.html","text/html"),"/style.css":("style.css","text/css"),"/status.js":("status.js","application/javascript")}
            if route not in files:
                return self.reply(404,b"Not found","text/plain")
            file, mime = files[route]
            self.reply(200,(Path(__file__).parent/"web"/file).read_bytes(),mime+"; charset=utf-8")

        def reply(self, status, data, mime):
            self.send_response(status)
            self.send_header("Content-Type",mime)
            self.send_header("Cache-Control","no-store")
            self.send_header("Content-Length",str(len(data)))
            self.send_header("X-Content-Type-Options","nosniff")
            self.send_header("Content-Security-Policy","default-src 'self'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(data)

        def log_message(self,*args):
            pass

    ThreadingHTTPServer(("0.0.0.0",3001),Handler).serve_forever()


if __name__ == "__main__":
    config = json.loads(Path(os.getenv("WATCH_CONFIG","/run/watch/config.json")).read_text())
    with closing(connect()) as connection:
        initialize(connection)
    threading.Thread(target=schedule,args=(config,),daemon=True).start()
    threading.Thread(target=mail_worker,args=(config,),daemon=True).start()
    serve(config)

