---
title: "Claude Code Stop hook 通知示例"
description: "一段可直接复制粘贴的 Claude Code Stop hook:当 agent 把控制权交回给你时弹出桌面通知——再讲清 Stop 事件到底意味着什么,以及如何用 Agent Andon 搭一套更完整的方案。"
updated: 2026-06-27
howto:
  - name: "打开你的 Claude Code 设置"
    text: "编辑 ~/.claude/settings.json(如果文件不存在就新建一个)。"
  - name: "添加一个 Stop hook"
    text: "在 hooks.Stop 下,添加一个运行你通知命令的 command hook。"
  - name: "保存并测试"
    text: "保存文件,结束 Claude Code 的一轮——通知就会弹出。"
---

每当 agent 完成本轮、把控制权交回给你时,Claude Code 都会触发一个 **`Stop`** hook。这正是收到提醒的最佳时机——省得你切回那个十分钟前就已经安静下来的终端。下面给出一段可以直接粘贴的极简 Stop hook、这个事件真正的含义,以及什么时候该上更完整的方案。

## 极简 Stop hook

Claude Code 从 **`~/.claude/settings.json`** 读取 hook。添加一个运行通知命令的 `Stop` hook:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code handed the turn back\" with title \"Agent done\"'"
          }
        ]
      }
    ]
  }
}
```

保存,在 Claude Code 里结束一轮,桌面通知就会弹出来。在 Linux 上,把命令换成 `notify-send "Agent done" "Claude Code handed the turn back"`。

## `Stop` 到底意味着什么

`Stop` 在 Claude **把控制权交回给你**时触发——它*并不*保证整个任务已经完成;agent 可能只是在等你的下一条指令。还有两个相关事件值得了解:

- **`Notification`** —— Claude 在*任务进行中*等待一个授权或你的输入(也就是“要你确认”的时刻)。往往是你最想抓住的那一个。
- **`StopFailure`** —— 这一轮以错误结束(较新版本的 Claude Code)。

一行式的 `Stop` hook 能抓住第一种情况,却会漏掉这些,而且它只会提醒它所在的那一台机器。

## 更进一步的 Stop hook

如果你同时跑不止一个 agent,或者想把提醒发到手机上,这种原始 hook 很快就会变得繁琐——每台机器各装一个通知器、`Notification` 没人管、也没办法一次看到好几个会话。

**Agent Andon** 帮你把这一切都接好:

```
npm i -g agent-andon
andon install claude
```

这会把 `Stop`、`Notification` 和 `StopFailure` 三个 hook 一起装好,并把它们映射到一个你可以在任意屏幕上打开的**看板**——工作中、要你确认、完成、卡住——配上桌面横幅通知和可选的手机推送。`andon install --dry-run claude` 会打印出最终生成的 `settings.json` 而不实际写入;`andon uninstall claude` 只会移除它添加过的内容。

完整的事件→状态映射见 [命令与事件](/zh-cn/docs/commands/),提醒渠道见 [通知](/zh-cn/docs/notifications/)。
