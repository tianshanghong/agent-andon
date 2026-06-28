---
title: "把旧 iPad 改造成 coding agent 的状态看板"
description: "把一台闲置的 iPad 挂上墙,做成一块随时在线的状态看板,盯着你的 Claude Code 和 Codex agent —— 一眼就能看出哪个需要你。下面是搭建步骤。"
updated: 2026-06-27
howto:
  - name: "运行看板"
    text: "在你的机器上运行 `andon serve`,记下它打印出的看板 URL。"
  - name: "在 iPad 上打开"
    text: "在 iPad 的 Safari 里打开这个 URL —— 同一 Wi-Fi 下直接打开,或通过 Tailscale / 你自己运行的中继随处访问。"
  - name: "让屏幕常亮"
    text: "把自动锁定设为永不,并用引导式访问把 iPad 锁定在看板上。"
  - name: "把它架起来"
    text: "用支架或墙面支架把 iPad 装在你一眼就能看到的位置。"
---

抽屉里那台闲置的旧 iPad,正好可以做一块**随时在线的状态看板**。把它挂到墙上跑 Agent Andon,你就能一眼看全每一个 Claude Code 和 Codex agent——完成时亮绿色,某个需要你时亮琥珀色——再也不用为了瞄一眼而来回切窗口。无需安装任何 app,它就是一个网页。

## 运行看板

在跑着你的 agent 的那台机器上:

```
andon serve
```

它会打印出一个看板 URL。(还没接好你的 agent?先运行 `andon install claude` / `andon install codex`。)

## 在 iPad 上打开

在 iPad 的 **Safari** 里打开这个 URL:

- **同一 Wi-Fi** —— 直接用打印出来的局域网 URL。
- **随处访问** —— 用 Tailscale Serve 把看板暴露出去,或者配对一个你自己运行的内容盲中继(`andon hosted setup <relay-url>`),改用它给出的 URL。参见[托管 Andon](/zh-cn/docs/hosted/)。

然后 **分享 → 添加到主屏幕**,即可获得无浏览器边框的全屏视图。

## 让它常亮

两个 iOS 设置就能把一台平板变成墙上的显示屏:

- **设置 → 显示与亮度 → 自动锁定 → 永不**,让屏幕保持常亮。
- **引导式访问**(设置 → 辅助功能 → 引导式访问)把 iPad 锁定在看板上,这样路过时误触也不会切走。

## 把它架起来

桌上放个便宜的支架,或者在你视线所及处装个墙面支架。从此一眼——而不是一次上下文切换——就能告诉你哪个 agent 需要你。

看板会把**需要你**的那个会话顶到最上面,其余时候保持安静——所以这台 iPad 平时一直很安静,直到有事需要你。看板服务器详见[运行 Andon](/zh-cn/docs/running/),如果你还想要桌面或手机提醒,参见[通知](/zh-cn/docs/notifications/)。
