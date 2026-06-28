---
title: "部署 Andon 中继"
description: "自托管内容盲的 Agent Andon 中继——它作为共享入口，只转发密封后的密文，让你的团队从任何地方都能访问各自的看板。"
---

这是面向运营者的指南：在**一个 HTTPS URL** 上运行**一个** Andon 中继，任意数量的人都能用
`andon hosted setup <your-url>` 指向它——每个人都在同一个 URL 下拥有各自隔离、内容盲的看板。
（用户侧：[托管 Andon](/zh-cn/docs/hosted/)。）

中继**只存储密文**，读不到任何人的内容——但它是一个面向公网的多租户服务，所以在大范围对外暴露之前，
请先阅读[容量与滥用](#6-容量与滥用上线公开前必读)这一节。

---

## 1. 你运行的是什么

`andon relay` 是单个 Node 进程（仅用标准库、零依赖），它会：
- 签发看板（`POST /provision`）、接收密封后的事件（`POST /i/<board>`），并提供快照、SSE 实时流、
  Web Push，以及看板包（`/b/<board>`、`/sw.js`、……）；
- **只**把哈希后的 token + 一对 VAPID 密钥 + 推送订阅持久化到一个文件；**密封后的事件保存在内存中，
  TTL 为 6 小时**；它从不存储、也从不看到明文。

它监听**普通 HTTP**——你需要在前面加一层 HTTPS（推送和浏览器内解密都要求安全上下文）。

---

## 2. 运行它

```bash
npm i -g agent-andon          # or: git clone … && npm i && npm run build, then use node dist/cli.js

# bind to localhost only and let a reverse proxy terminate TLS (recommended):
ANDON_RELAY_HOST=127.0.0.1 ANDON_RELAY_PORT=8788 ANDON_DATA_DIR=/var/lib/andon andon relay
```

| 设置 | 默认值 | 说明 |
|---|---|---|
| `ANDON_RELAY_PORT` / `--port` | `8788` | HTTP 端口 |
| `ANDON_RELAY_HOST` | `0.0.0.0` | 在代理后面时设为 `127.0.0.1` |
| `ANDON_DATA_DIR` / `--data-dir` | `~/.andon` | **务必持久化**——它保存着 `relay-tenants.json`（哈希后的 token + 订阅）和 `relay-vapid.json`。丢了它，每个看板都会 404，推送也会失效。 |
| `ANDON_IDLE_TTL_SEC` | `900`（15 分钟） | 已完成/空闲的会话会在其最后一条事件之后经过这段时间被清除（这样已经解散的团队就不会留下一墙的“完成”卡片）；活跃/需要你的会话则改用 6 小时的硬性 TTL |

它能优雅地处理 `SIGINT`/`SIGTERM`（关闭 SSE 流，这样重启就不会卡住）。

### 或者用 Docker

中继以多架构镜像的形式发布在 `ghcr.io/tianshanghong/agent-andon`，由 CI 从本仓库源码可复现地构建
（就是 `andon verify` 所校验的那份代码；附带来源证明 + SBOM）。它默认运行中继。

```bash
docker run -d --name andon-relay \
  -v andon_data:/data \                         # persist hashed tokens + VAPID + subscriptions
  -e ANDON_PUSH_SUBJECT=mailto:you@example.com \
  ghcr.io/tianshanghong/agent-andon:latest      # CMD defaults to `relay`
```

或者用一个极简的 compose（自己在前面加 TLS / 反向代理——不要把 8788 暴露到公网）：

```yaml
services:
  relay:
    image: ghcr.io/tianshanghong/agent-andon:latest
    restart: unless-stopped
    environment:
      ANDON_PUSH_SUBJECT: mailto:you@example.com   # a real contact for the VAPID JWT
    volumes:
      - andon_data:/data
    # route to it from your reverse proxy on port 8788; it needs OUTBOUND internet for Web Push
volumes:
  andon_data:
```

该镜像以非 root 身份运行，带有 `/version` 健康检查，并把所有状态都放在 `/data` 卷（`ANDON_DATA_DIR`）
里——记得给这个卷做备份。

---

## 3. 在前面加一层 HTTPS

中继只用**普通 HTTP，监听 `:8788`**——由前面的某个东西来终结 TLS（浏览器要求用 HTTPS 才能做
浏览器内解密 + 推送）。你不用为中继额外加任何东西；只要把你**已经在跑的**那套东西指向 8788 端口即可。
挑选符合你情况的那一行：

| 你的环境 | TLS 如何处理 |
|---|---|
| **Docker，且已经有反向代理 / 隧道** *（最常见）* | 用你现有的 **Traefik / nginx-proxy / Cloudflare Tunnel** 把 `relay.example.com` → 容器的 `:8788`——示例见下 |
| **一台裸主机，还什么都没装** | **Caddy** 是那条一行搞定的方案（自动 Let's Encrypt）——见下 |
| **只有你 / 你的团队，在 Tailscale 上** | `tailscale serve --bg 8788` → `https://<machine>.<tailnet>.ts.net`（仅限 tailnet，无公网证书） |

**反向代理 / 隧道后面的 Docker**——容器始终只跑 HTTP；由前面来做 TLS：

```yaml
# Traefik: labels on the relay service (Traefik — or, behind cloudflared, Cloudflare — supplies the cert)
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.relay.rule=Host(`relay.example.com`)"
  - "traefik.http.routers.relay.entrypoints=websecure"
  - "traefik.http.services.relay.loadbalancer.server.port=8788"
```
```
# Cloudflare Tunnel: no open ports — point an ingress hostname at the container
#   relay.example.com  ->  http://andon-relay:8788
```

**裸主机——Caddy**（如果你别的都没有，这是最简单的；自动 Let's Encrypt）：

```
# /etc/caddy/Caddyfile
relay.example.com {
    reverse_proxy 127.0.0.1:8788
}
```
`sudo systemctl reload caddy` → `https://relay.example.com`。（nginx + certbot 同理：`proxy_pass http://127.0.0.1:8788;`。）

> ⚠️ **代理 + 限流：**中继按 `req.socket.remoteAddress` 来限流。在一个终结 TLS 的代理后面，这个地址
> 是**代理的** IP，于是所有人的按 IP 限流就会塌缩成同一个桶。中继**还不会**解析 `X-Forwarded-For`
> （如果不加判断地信任它，这个头是可以伪造的）。在它支持之前，如果你把它公开暴露，请在**代理层**做
> 按客户端的限流（Traefik/Caddy/nginx/Cloudflare 都能做到）。

---

## 4. 让它持续运行（自动启动）

### Linux —— systemd
```ini
# /etc/systemd/system/andon-relay.service
[Unit]
Description=Agent Andon relay
After=network.target

[Service]
Environment=ANDON_RELAY_HOST=127.0.0.1
Environment=ANDON_RELAY_PORT=8788
Environment=ANDON_DATA_DIR=/var/lib/andon
ExecStart=/usr/bin/andon relay
Restart=on-failure
User=andon
StateDirectory=andon

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now andon-relay
```

### macOS —— launchd
参照 `examples/com.agentandon.server.plist` 适配（它是为 `andon serve` 写的）：把程序参数改成
`relay`，在 `EnvironmentVariables` 里设置 `ANDON_RELAY_HOST`/`ANDON_DATA_DIR`，再用 `launchctl load`
加载。

---

## 5. 验证它提供的是诚实的代码

在任意一台装了对应版本 `agent-andon` 的机器上：
```bash
andon verify https://relay.example.com
```
它会把你的中继提供的看板 + service worker 和开源的字节做比对，并报告 `✓ match`（或不匹配）。
告诉你的用户他们也可以运行这条命令——这正是整个透明度模型的意义所在。

---

## 6. 容量与滥用（上线公开前必读）

**已经内置**的部分（单进程 MVP）：

| 防护 | 取值 |
|---|---|
| 每个中继的看板数 | `MAX_BOARDS = 500`（闲置超过 90 天的看板会被清除以腾出空间） |
| 每个看板的会话数 | `MAX_SESSIONS = 200`（在 6 小时 TTL 时清扫） |
| 每个看板的推送订阅数 | `MAX_SUBS = 20` |
| 签发速率 | 20 / IP / 小时 |
| 接收速率 | 每个看板+IP 600 / 分钟 |
| 读取（快照/SSE） | 每个看板+IP 120 / 分钟；每个 IP ≤8 个并发 SSE，每个看板 ≤20，总计 ≤500 |
| 请求体大小 | 64 KB；另加 slowloris 超时 + `maxConnections` |
| 租户文件写入 | 原子写入（tmp + rename）；损坏的文件会被保留，而不会被悄悄丢弃 |

**尚未**内置的部分——在运行真正的公开服务之前请自行补上：
- **签发是开放的**（任何人都能签发一个看板，仅受 IP 限流）。对于公开服务，请加一道
  **邀请码 / 账号 / 工作量证明**的关卡，或者在 `/provision` 前面加上鉴权。
- **单进程**——`MAX_BOARDS=500`、事件存在内存里、就一台机器。要做横向扩展，你必须按看板 id 的哈希
  把某个看板固定到某一个实例上（轮询会悄悄破坏 SSE 以及按看板的各项上限）。
- **X-Forwarded-For** 的处理（见上面关于代理的提示）。
- **持久化 / 有备份的 `ANDON_DATA_DIR`**——它就是一个扁平的 JSON 文件；记得备份。

这些都不影响内容盲的保证（中继从不持有密钥或明文）；它们关乎的是可用性 / 滥用方面的问题。

---

## 7. 更新中继

拉取新版本，重新构建，重启服务。已安装的 PWA 会在下一次重新启动时**自动更新**（看板 + service worker
以 `no-store` 方式提供，且 SW 会自我替换）；用户**无需重新配对**——他们的密钥存在自己的浏览器里，
而不在你的中继上。请让传输格式（wire format）的改动保持可叠加（追加可选字段；不要改动 AAD / 填充 /
推送负载的结构），这样旧 PWA + 新中继在用户重新启动之前也能优雅降级。更新之后，对外提供的看板包
哈希会变——请重新运行 `andon verify`，并（在运营层面）公布新的哈希，好让用户能够确认它。
