---
title: "如何在 Claude Code 完成或需要你时收到桌面与手机提醒"
description: "Claude Code 与 Codex 可能跑上好几分钟,然后悄无声息地完成,或卡住等着你。下面教你用 Agent Andon,在某个 agent 需要你的那一刻就收到桌面或手机提醒。"
updated: 2026-06-27
howto:
  - name: "安装 Agent Andon"
    text: "用 `npm i -g agent-andon` 安装 CLI。它零依赖,完全在你自己的机器上运行。"
  - name: "接好 agent 的 hook"
    text: "运行 `andon install claude`(以及 `andon install codex`),添加上报每个会话状态的生命周期 hook。不改动工作流。"
  - name: "打开看板"
    text: "运行 `andon serve`,在任意浏览器、手机或闲置的 iPad 上打开看板,一眼看全每个会话。"
  - name: "开启提醒"
    text: "桌面横幅默认开启;需要的话再接上菜单栏摘要,并连上一个内容盲中继,就能随处收到手机推送。"
---

你让 Claude Code 去做一项任务,切走去忙别的,然后……就只能等。它做完了吗?是不是卡在某个提示上,等着你点“是”?你切回去一看,发现它四分钟前就做完了——更糟的是,它从头到尾一直卡着。再乘上好几个 agent,一整天就耗在了盯着终端上。

**Agent Andon** 解决的正是这个问题:它盯着你的 coding agent,一旦某个**完成**、**需要你处理**或**卡住**,就第一时间提醒你——这一切都呈现在一块看板上,任意屏幕都能打开,还可选配桌面和手机提醒。

## 安装 Agent Andon

```
npm i -g agent-andon
```

这是一个零依赖的 CLI,在本地运行——无需账号,也没有遥测。

## 接好 agent 的 hook

Andon 读取每个工具的**原生生命周期 hook**——它不会包裹或代理你的 agent。

```
andon install claude
```

就这么简单:Claude Code 现在会上报自己的状态变化(工作中 → 要你确认 → 完成 → 卡住),而你的工作方式完全不变。也在跑 OpenAI Codex?`andon install codex` 同样适用。

## 每个状态的含义

- **工作中** —— agent 正忙,不需要你做任何事。
- **要你确认** —— 它在等一个提示、一项权限或一个决定。这是最值得你尽快抓住的状态。
- **完成** —— agent 完成了本轮,把接力棒交回给你。
- **卡住** —— 它报错了或停滞了。

## 在任意屏幕上打开看板

```
andon serve
```

在任意浏览器、你的手机,或挂在墙上的 iPad 上,打开命令打印出来的 URL。每个会话显示为一行,哪一个**需要你**,就浮到最上面——于是一眼就知道该看哪里。

## 收到桌面和手机提醒

**桌面横幅**默认开启。**菜单栏摘要**也只差接一下——Andon 在 `/menubar` 提供纯文本状态,你把 SwiftBar、xbar 或 Waybar 指向它即可。

想**随处收到手机推送**——哪怕人不在机器旁——就连上一个**内容盲中继**,它在转发提醒的同时,无法读取你的项目名或消息内容。用下面这条命令把 Andon 指向它:

```
andon hosted setup <relay-url>
```

你可以自己跑一个中继,也可以用托管中继(即将上线)。桌面和菜单栏的细节见[通知](/zh-cn/docs/notifications/),中继相关见[托管 Andon](/zh-cn/docs/hosted/)。

## 同样适用于 Codex

上面这一切对 **OpenAI Codex** 同样适用——`andon install codex`,同一块看板,同样的提醒。把 Claude Code 和 Codex 的会话并排盯着看。

---

整个流程就是这样:安装、接好 hook、打开看板、开启提醒。agent 完成或需要你,从此变成一条通知——而不是你十分钟后才发现的事。
