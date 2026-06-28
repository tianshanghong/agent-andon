---
title: "Claude Code 与 Codex 通知：桌面提醒与菜单栏"
description: "为你的 Claude Code 与 Codex agent 配置桌面提醒和菜单栏指示器，让某个 agent 需要你、完成或卡住的那一刻就第一时间收到提醒。"
---

Andon 的全部职责，就是在**恰当的时刻抓住你的注意力**——当某个 agent 需要你、或者被卡住时——其余时候则保持安静。看板是那条通用渠道（任何设备都能用）；下面这些是在它之外的额外补充，而且每一种都能在 macOS / Linux / Windows 上优雅降级。

## 原生桌面提醒

在运行服务器的那台机器上弹出横幅，**默认开启**。对需要你处理的状态高调提醒，对完成则保持安静：

- **需要你（琥珀）** / **卡住（红）** → 横幅 + 声音（即时）。
- **完成（绿）** → 一条*安静的*横幅（无声），并做 4 秒防抖，这样短暂闪过的绿色就不会误报一次“就绪”。

```bash
andon serve                 # alerts on by default
andon serve --say           # also speak needs-you / stuck aloud
andon serve --no-notify     # turn alerts off
```

使用 `osascript`/`say`（macOS）、`notify-send`/`spd-say`（Linux）、PowerShell toast/`System.Speech`（Windows）。缺少对应工具 → 静默跳过。（在 `--demo` 下会自动关闭，以免循环演示的假 agent 不停打扰你。）提醒会被**限流**（每个会话各自的冷却时间 + 一个全局令牌桶），这样即便有一个繁忙的——甚至是恶意的——局域网客户端不断向 `/event` 发送事件，也无法借此触发大量进程派生。

## 菜单栏 / 状态栏

无需单独一块屏幕，就能一眼看到的摘要：

```bash
curl -s http://127.0.0.1:8787/menubar     # plain-text summary endpoint
```

把它接到 SwiftBar/xbar（macOS）或 Waybar/polybar（Linux）；参见 `examples/andon-menubar.5s.sh`。

## 想少被打扰？自己配置批准策略

Andon **从不改动你的权限/批准设置**——那是你自己的事。如果琥珀色的“需要你”触发得比你希望的更频繁，可以在你 agent 自己的配置里预先批准那些安全的操作（之后 Andon 就只会为其余情况亮灯）：

- **Claude Code** —— 在 `~/.claude/settings.json` 的 `permissions.allow` 里添加只读的匹配规则，例如 `"Read"`、`"Bash(git status:*)"`、`"Bash(npm test:*)"`。你的 `deny`/`ask` 规则始终优先，而且 Bash 匹配器能识别 shell 操作符（所以 `Bash(git status:*)` 不会批准 `git status && rm -rf`）。参见 `/permissions`。
- **Codex** —— 在 `~/.codex/config.toml` 里设置 `approval_policy`（例如 `"untrusted"` 会自动运行受信任的只读命令）和/或 `sandbox_mode`。

把这件事留在*你自己*手里，意味着 Andon 永远不会削弱你的安全规则——而看板也始终如实映照出你真正被需要的那些时刻。
