---
title: "配置与安全"
description: "配置 Agent Andon——端口、鉴权 token、空闲自动移除（TTL），以及本地看板服务器和中继的安全模型。"
---

面向自托管看板的环境变量、token 鉴权，以及网络/安全模型。

## 安全

默认情况下，服务器绑定 `0.0.0.0` 且**无鉴权**——局域网里的任何人都能读取并上报状态。
在可信的家庭 Wi-Fi 上没问题；但**不要把它放在公网/不可信网络上。** 对于共享网络，
请设置一个 token（并在所有会运行 hook 的环境里也把它 export 出来）：

```bash
ANDON_TOKEN=somesecret andon serve
```

设置 token 后，`/state` 和 `/event` 都会要求提供它。hook 和 CLI 会自动以 `x-andon-token`
请求头的形式发送它（只要它们的环境中有 `ANDON_TOKEN`）；在看板设备上，用 `?token=somesecret`
打开，token 就会一路带过去。`/healthz` 保持开放，因此 `andon doctor` 始终可用。

看板只暴露高层级的状态（状态、项目名、一行消息）——绝不包含代码或完整日志。
事件正文上限为 64 KB。

> 要把看板暴露到局域网之外？别用端口转发——请改用[运行 Andon](/zh-cn/docs/running/)
> （Tailscale Serve）或[中继](/zh-cn/docs/deploy-relay/)里介绍的 HTTPS 方案。

## 环境变量

| 环境变量 | 默认值 | 含义 |
|---|---|---|
| `AGENT_STATUS_URL` | `http://127.0.0.1:8787` | hook 上报到的服务器基础 URL |
| `ANDON_TOKEN` | *(无)* | 设置后，`/state` 和 `/event` 所要求的共享 token |
| `ANDON_PORT` / `ANDON_HOST` | `8787` / `0.0.0.0` | 服务器绑定的端口 / 主机 |
| `ANDON_LABEL` | 文件夹名 | 卡片标题（每个终端各一个） |
| `ANDON_SESSION` | — | 覆盖某个卡片的会话 id（例如用于后台任务） |
| `ANDON_IDLE_TTL_SEC` | `900`（15 分钟） | 一个已完成/空闲的卡片在被自动移除前会保留多久，这样退出的子 agent / 队友就不会堆积起来。活跃和"需要你"的卡片则改用 6 小时的硬性 TTL。 |

（中继专用的环境变量——`ANDON_RELAY_PORT`、`ANDON_DATA_DIR`、`ANDON_PUSH_SUBJECT`、……——见
[部署中继](/zh-cn/docs/deploy-relay/)。）
