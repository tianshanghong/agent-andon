---
title: "托管 Andon:随处访问你的看板"
description: "把 Agent Andon 与内容盲托管中继配对,从你的网络之外访问看板并接收手机推送——端到端密封。"
---

Andon **以本地为先，永久免费自托管**——这始终是默认方式，什么都不向外分享。
本指南讲的是**可选、需主动开启**的托管模式：在任何地方查看你的看板（并接收手机提醒），
数据流经一个**只转发密文、读不到你 agent 内容**的中继。

> 想部署一个供他人共用的中继？参见 **[部署中继](/zh-cn/docs/deploy-relay/)**。

---

## 它是什么（一分钟看懂）

- 每条状态事件在离开你的机器之前，都已**在本地完成端到端加密**。
- **中继**只存储并转发这些**密文**，从不持有密钥——它只能看到粗粒度的路由信息（是哪个看板、
  一个哈希后的会话 id、working/waiting/done/error/idle 状态、时间）。
- 你打开的是和自托管**完全相同的看板**；它在**你的浏览器里**用链接 `#fragment` 中携带的密钥
  解密（该密钥从不发往服务器）。service worker 也以同样方式解密手机推送。
- **无需在本地运行 `andon serve`**——hook 正常的上报路径会顺带转发一份密封副本。

它有两种用法：

| | 谁来运行中继 | 谁能使用 |
|---|---|---|
| **A. 你自己的中继** | 你（在你掌控的机器上运行 `andon relay`） | 只有你 |
| **B. 共享中继** | 由运营者运行，对外是一个公开的 HTTPS URL | 很多人——每个人都在*同一个* URL 下拥有各自隔离的看板 |

两者是同一套代码；B 只是把 A 公开暴露而已。参见[多租户](#多租户一个-url多个看板)。

---

## 快速上手

```bash
# 1) Run a relay (yours), or skip this and use a shared relay URL someone gives you
andon relay                            # listens on :8788 (see deploy-relay.md for HTTPS/public use)

# 2) Opt in — generates a key that NEVER leaves your machine, prints your board link
andon hosted setup http://127.0.0.1:8788
#   → prints:  http://127.0.0.1:8788/b/<board-id>#k=<key>

# 3) Open that link in a browser. Done — your agents now show up there.
```

`andon hosted setup` 会先准确告诉你中继能看到什么、不能看到什么，然后询问 `[y/N]`
（默认**否**）。开启之后，每一条 Claude Code / Codex 状态都会（密封后）一并转发给中继。

**把看板链接当作密码对待**——其中 `#k=…` 那部分*就是*你的解密密钥。别把它截图发到聊天里；
请存进密码管理器。（或者扫描终端里显示的二维码来配对，免去复制粘贴。）

---

## 打开看板

- **在同一台电脑上：** 打开 `http://127.0.0.1:<port>/b/<board-id>#k=<key>`。`localhost` / `127.0.0.1`
  属于安全上下文，所以即便走普通 HTTP，浏览器内解密也能正常工作。
- **在手机 / 另一台设备上：** 中继必须可通过 **HTTPS** 访问（浏览器要求在安全上下文中才能解密 +
  推送）。有两条简单的路径：
  - **Tailscale**（你已经有了）：`tailscale serve --bg <relay-port>` → 给你一个
    `https://<machine>.<tailnet>.ts.net` 地址。在手机上打开 `https://…ts.net/b/<board-id>#k=<key>`。
  - **真实域名 + 证书**（用于共享中继）——参见[部署中继](/zh-cn/docs/deploy-relay/)。

### 手机提醒（PWA）
1. 在手机上通过 **HTTPS** 打开你的看板链接。
2. **iPhone：** 分享 → **添加到主屏幕**（iOS 只允许已安装的 PWA 使用 Web Push），然后从主屏幕
   打开它。**Android/Chrome：** 在普通标签页里就能用；“添加到主屏幕”可选。
3. 点按 **开启提醒** → 允许通知。当某个 agent 第一次**需要你**或**卡住**时，
   你会收到震动提醒——哪怕看板已关闭、手机已锁屏。通知文字是在**你的手机上**解密的；
   中继永远看不到它。

---

## 管理

```bash
andon hosted status                    # is hosted on? which relay + board id
andon hosted pair                      # re-print your board link — add a device, or recover a lost link
andon hosted off                       # stop forwarding — your agents go back to local-only
andon verify  <relay-url>              # check the relay serves the exact open-source code (see below)
```

来回切换没有任何代价；`off` 只是删除本地配置（`~/.andon/hosted.json`）。

---

## 中继能 / 不能看到什么

| | |
|---|---|
| ❌ **读不到** | 你的提示词、代码、项目名、标题、消息、leverage 计数 |
| • **能看到** | 你处于活跃状态以及大致的时间（每条事件的时间）、有多少个会话、你的 IP、密文大小所属的区间 |
| • **能做** | 延迟/扣留某条事件，或重新弹出你**过去真实发过**的某条推送通知（对一个其实已经解决的会话，再显示一条过期的“需要你”）——但它**无法凭空捏造新内容，也读不到内容** |

自托管**什么都不分享**，而且始终是默认方式。托管模式则是在便利性与元数据之间的取舍，这点我们直说。

---

## “可验证，而不只是信任”（透明度）

由于网页版看板的代码是*由中继提供的*，那种滴水不漏的“即便被攻破也读不到”只对已安装的应用成立。
对于**网页版看板**，诚实的说法是**“我们无法*偷偷地*给你装后门”**：

```bash
andon verify https://relay.example.com
```

它会抓取中继实际提供的看板和 service worker，对它们计算哈希，再与**你自己**那份开源副本的字节
做比对。**匹配**就意味着中继提供的正是经过审计的那份代码——没有暗中窃取密钥。如果在**同一版本下
持续不匹配**，说明它提供的是被改动过的代码；别把你的密钥托付给它。中继还会在 `GET /version`
处声明自己的哈希值。

---

## 多租户：一个 URL，多个看板

中继**天生就是多租户的**：一个进程服务多个看板，而入口是**单一的一个 URL**，而不是给每个用户
分配一个子域名。

```
            https://relay.example.com        (one URL = the shared entry)
            ├── /b/<A's board-id>#k=<A's key>     only A's key decrypts it
            ├── /b/<B's board-id>#k=<B's key>     only B's key decrypts it
            └── /b/<C's board-id>#k=<C's key>     only C's key decrypts it
            the relay holds only ciphertext for all of them
```

每个人都运行 `andon hosted setup https://relay.example.com`；每个人都会在那同一个 URL 下拿到一个
**256 位、无法猜测的**看板 id。隔离是双层的，而且经过测试：
- **谁也读不到谁：** 每个看板各有一把密钥 `K`，中继只存储密文（内容盲）。
- **谁也写不了谁：** 看板 id 是读取凭证；而写入需要该看板自己的写入令牌（用 A 的令牌去写 B 的看板 → `401`）。

---

## 升级（已安装的 PWA）

**自动完成——无需应用商店，无需重新配对。**
- 看板 HTML 以 `no-store` 方式提供，不会被任何地方缓存，所以每次启动都加载最新版本。
- service worker 会自动更新（浏览器会在重新启动/导航/约 24 小时时重新检查 `/sw.js`；它会调用
  `skipWaiting()`，因此新版本会立即接管）。
- 你的密钥 `K` 保存在**你设备上浏览器的 IndexedDB** 里（而非服务器），更新后依然保留 →
  配对状态保持不变。**想用最新版，重新启动一下 PWA 即可。**

（一台新*设备*仍然需要配对一次——那台设备的 IndexedDB 里还没有 `K`。）

---

## 故障排查

- **弄丢了看板链接（那个 `#k=…`）？** 它不在中继上——中继从来没有过你的密钥。它在你运行
  `andon hosted setup` 的那台机器上：在那台机器上运行 `andon hosted pair` 重新打印完整链接（或者读取
  `~/.andon/hosted.json`，把 `relayUrl` + `/b/` + `boardId` + `#k=` + `key` 拼接起来）。一台从*未*
  配对过的设备无法从中继恢复链接——回到那台机器拿到链接，再在新设备上打开一次。
- **“重新配对——在此设备上重新打开你的看板链接”** 这台设备没有密钥（新设备、清空了存储，
  或者从主屏幕启动时 `#k` 被去掉了）。把带 `#k=…` 的完整看板链接重新打开一次；它会重新缓存密钥。
- **看板能加载，但一切都是空白 / 无法解密。** 你打开的链接很可能**缺少** `#k=…` 那部分（有些工具
  会在 `#` 处截断）。请重新复制*完整的*链接。
- **某张过期的卡片一直不消失。** 卡片会在 agent 上报 `done`/`gone` 时清除，或者在 6 小时 TTL 之后
  清除。已完成的会话通常会自行了结；而一个已死掉/测试用的会话会一直留到 TTL 到期。
- **手机收不到推送。** 推送需要 **HTTPS**（所以通过 `127.0.0.1` 访问的看板不会推送）；在 iPhone 上，
  看板必须先**添加到主屏幕**；而且你必须点按 **开启提醒**并允许通知。
- **全部停止：** `andon hosted off`（停止转发）；如果你运行了自己的中继，再加上
  `lsof -ti tcp:<port> | xargs kill`。
