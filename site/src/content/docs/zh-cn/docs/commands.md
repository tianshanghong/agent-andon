---
title: "命令、hook 与事件映射：Claude Code / Codex 的 CLI 命令与生命周期 hook"
description: "Agent Andon 的每一条 CLI 命令，以及 Claude Code / Codex 的生命周期 hook 与事件如何映射到看板状态——install、serve、doctor、hosted 等等。"
---

完整的 CLI 参考、agent 事件如何变成看板状态、后台任务计数、Codex 的特别之处，以及给卡片命名。（快速上手和常用命令见 [README](https://github.com/tianshanghong/agent-andon/blob/main/README.md)。）

## 命令

| 命令 | 作用 |
|---|---|
| `andon serve [--demo] [--port N] [--token T] [--no-notify] [--say]` | 运行看板服务器；桌面提醒默认开启（`--no-notify` 关闭，`--say` 额外加上语音） |
| `andon install claude` | 接好 Claude Code 的状态 hook（带时间戳的备份） |
| `andon install codex` | 接好 Codex 的生命周期 hook（运行 `/hooks` 以信任） |
| `andon uninstall <claude\|codex>` | 只移除 Andon 添加的内容；其余配置原样保留 |
| `andon doctor` | 健康检查 + 已接好的内容 + 看板网址 |
| `andon post <state> <agent> [title] [msg]` | 手动推送一条状态 |
| `andon sub <+n\|-n> [id]` | 调整某个进程的后台任务计数 |
| `andon relay` / `andon hosted` / `andon verify` | 可选的托管中继——参见[托管 Andon](/zh-cn/docs/hosted/) |
| `andon hook` / `andon codexhook` | *（内部使用——由 hook 调用）* |

`andon install --dry-run claude` 只打印改动，不实际写入。

## 事件 → 状态映射（Claude Code）

| Claude Code 事件 | 看板状态 | 触发时机 |
|---|---|---|
| `SessionStart` | 空闲（石板灰） | 会话已启动——卡片立即出现 |
| `UserPromptSubmit` | 工作中（蓝色） | 你刚提交了一个提示词 |
| `PostToolUse` | 工作中（蓝色） | 某个工具刚运行——你一批准，琥珀色就消失 |
| `Notification` | 需要你（琥珀色，脉动） | 在等待权限 / 你的输入 |
| `Stop` | **已就绪**（绿色） | 这一轮交回到你手里——该你出手了，*而不是*“全部完成” |
| `StopFailure` | 卡住（红色，脉动） | 这一轮失败了（仅较新版本的 Claude Code） |
| `SessionEnd` | *移除* | 会话结束；卡片消失 |

每个会话各自拥有一张卡片（以 `session_id` 为键）。一个进程 = 一张卡片；它的子 agent 会归并到这张卡片里，而不会各自另开一张。在看板启动*之前*就*已经在运行*的会话，会在它的下一次事件（提示词、工具、一轮结束）时出现——Andon 完全不碰你的 statusLine。

## 后台工作：让卡片在“完成”之后依然如实

`Stop` 表示前台 agent 交回了这一轮——它**并不**意味着后台工作已经完成。如果某个进程启动了后台工作流，让它们也上报状态，这样卡片会保持“工作中”（蓝色）直到它们全部跑完，而不会错误地变绿：

```bash
export ANDON_SESSION="<this process's tile id>"   # the session_id of the parent tile
andon sub +1     # a background task started
#   ...do the work...
andon sub -1     # it finished
```

只要计数 `> 0`，卡片就显示 `WORKING ⋯N background`，并且只有当每个任务都上报了 `-1` 之后才会变绿。

## Codex

较新的 Codex（≈ 0.117+）拥有一套完整、兼容 Claude 的 **hooks** 系统，因此 Andon 能获得与 Claude Code 相同的生命周期——包括琥珀色的**需要你**：

```bash
andon install codex      # wires lifecycle hooks → ~/.codex/hooks.json
```

| Codex hook 事件 | 看板状态 |
|---|---|
| `SessionStart` | 空闲（卡片在启动时出现） |
| `UserPromptSubmit` / `PostToolUse` | 工作中（蓝色） |
| `PermissionRequest` | **需要你（琥珀色）** |
| `Stop` | 已就绪（绿色） |
| `SessionEnd` | *移除* |

> **Codex 需要多做一步：** 新的 hook 必须先被**信任**才会运行——在 Codex 里运行一次 `/hooks`（或用 `codex
> --dangerously-bypass-hook-trust` 启动）。`andon uninstall codex` 会再次干净地移除这些 hook，并保留一份带时间戳的备份。

遗留的注意点：红色“卡住”仍然基于陈旧度判定（没有专门的失败轮次 hook）。（已经在运行的会话会在下一次事件时出现，与 Claude 相同。）

## 给卡片命名

默认标题就是项目文件夹名。可按终端逐个覆盖：

```bash
ANDON_LABEL="backend refactor" claude
ANDON_LABEL="landing copy"     codex
```
