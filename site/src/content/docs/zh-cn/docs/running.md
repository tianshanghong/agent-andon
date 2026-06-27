---
title: "运行 Andon:启动、检查、停止"
description: "启动、检查、停止 Agent Andon 的每个部分——看板服务器、用于手机访问的 Tailscale Serve,以及可选的内容盲中继。"
---

Andon 最多有三个相互独立、可按需运行的部分。每个都各自启动、各自停止——本页给出每一个对应的确切命令。

| 部分 | 端口 | 是什么 | 何时需要 |
|---|---|---|---|
| **`andon serve`** | 8787 | 看板服务器（在你自己的电脑上） | 始终需要——它*就是*看板本身 |
| **Tailscale Serve** | — | 通过 HTTPS 把 8787 暴露给*你自己的* tailnet | 仅供你自己访问看板 / 接收手机推送 |
| **`andon relay`** | 8788 | 内容盲托管中继 | 仅当你运行**自己的**中继时——参见[部署中继](/zh-cn/docs/deploy-relay/) |

> Tailscale Serve 和中继是远程/手机访问的**两种备选方案**，二选一即可——不必同时运行。
> 大多数人只跑 `andon serve`。

---

## 1. 看板 —— `andon serve`（端口 8787）

**启动（前台运行——`Ctrl-C` 停止）：**
```bash
andon serve
```

**启动（后台运行——关掉终端也不退出）：**
```bash
nohup andon serve > /tmp/andon.log 2>&1 &      # macOS / Linux
```
（Windows：在单独的终端窗口里运行，或使用 `start /b andon serve`。）

**检查是否在运行：**
```bash
lsof -iTCP:8787 -sTCP:LISTEN        # shows the listener if it's up
pgrep -fl "cli.js serve"            # shows the process
```

**停止：**
- 前台：在它所在的终端按 **`Ctrl-C`**。
- 后台 / 不知道在哪个终端：`pkill -f "cli.js serve"`

**登录时自动启动（可选）：** macOS —— 参照 `examples/com.agentandon.server.plist` 适配 `launchd`；
Linux —— 用一个 `systemd --user` 单元。如果你更愿意手动启动，跳过这步即可。

---

## 2. 通过 Tailscale Serve 实现手机 / 远程访问（无需中继）

这会把你本地的看板（8787）放到一个**仅你自己的 Tailscale 设备**才能访问的 **HTTPS** 地址上——
足够用来访问看板、接收手机推送，而且不用跑中继。

> **关键点：** `tailscale serve` 是一项**持久化的设置，而不是一个需要一直开着的进程。** 你只需
> **设置一次**；Tailscale 会把它存下来，重启也不会丢。它只负责*转发*——看板本身仍然必须在
> 运行（`andon serve` 监听 8787），否则那个 HTTPS 地址会返回 **502**。这是两回事。

**前置条件：** 电脑和手机**两端**都装好 Tailscale 并登录（同一账号）；
为你的 tailnet 启用 HTTPS 证书（管理控制台 → **DNS** → 启用 MagicDNS + HTTPS）。

**设置（只需一次）：**
```bash
tailscale serve --bg 8787
```
将 `https://<your-machine>.<your-tailnet>.ts.net` 转发到 `127.0.0.1:8787`，**仅限 tailnet 内访问**。

**查看当前映射：**
```bash
tailscale serve status
```

**移除映射：**
```bash
tailscale serve reset
```

**在手机上：** 打开 `https://…ts.net` 地址（Tailscale app 已连接）→ **添加到主屏幕**
（在 iPhone/iPad 上推送必需）→ 点按 **开启提醒**。

> `tailscale serve` = **私有**（仅限你的 tailnet）。`tailscale funnel` = **公网**——
> 除非你确实有意，否则别用它。

---

## 3. 你自己的中继 —— `andon relay`（端口 8788）

> **完全不想跑中继？** 不必——用我们的就行。`andon hosted setup https://relay.agentandon.com`
> 会把你接到我们托管的内容盲中继：随处访问看板，零配置，无需自己托管任何东西。
> 参见[托管 Andon](/zh-cn/docs/hosted/)。

只有当你自己托管内容盲中继时才需要（大多数人会改用托管中继，或 Tailscale）。完整的生产环境
指南——HTTPS、容量、自动启动：**[部署中继](/zh-cn/docs/deploy-relay/)**。

| 操作 | 命令 |
|---|---|
| 启动（前台） | `andon relay` |
| 启动（后台） | `nohup andon relay > /tmp/andon-relay.log 2>&1 &` |
| 检查 | `lsof -iTCP:8788 -sTCP:LISTEN` |
| 停止 | `Ctrl-C`（前台）· `pkill -f "cli.js relay"`（后台） |

---

## 快速参考

```bash
# What's running?
lsof -nP -iTCP:8787 -iTCP:8788 -sTCP:LISTEN     # the board / relay ports
tailscale serve status                           # the Tailscale HTTPS mapping

# Stop everything
pkill -f "dist/cli.js"      # stops andon serve + andon relay
tailscale serve reset       # removes the Tailscale HTTPS mapping
```

**“通过 Tailscale 用手机访问”这条路 = Tailscale Serve 映射（设置一次，持久生效）+ `andon serve`
正在运行。** 想让它在线：启动 `andon serve`。暂时不用了：`pkill -f "cli.js serve"`——映射可以
留着；下次再 `andon serve` 时它又能访问了。
