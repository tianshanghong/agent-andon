---
title: "开发 Andon"
description: "从源码构建、运行并测试 Agent Andon——面向贡献者的搭建指南。"
---

```bash
npm run build     # tsc -> dist/ (and marks the bin executable)
npm test          # node:test unit + integration tests
npm run dev       # tsc --watch
```

架构：
- `src/store.ts` —— 纯粹、经过测试的状态模型。
- `src/server.ts` —— 自托管的 HTTP 层；`src/commands/*` 是各个 CLI 子命令。
- `assets/dashboard.html` —— 自包含的看板（单个文件；自托管**和**托管模式都原样提供它）。
- `src/hosted/*` —— 可选的内容盲中继（与本地产品之间界限清晰）；`src/sounds.ts` —— 对外提供的提示音。

贡献流程参见 [CONTRIBUTING.md](https://github.com/tianshanghong/agent-andon/blob/main/CONTRIBUTING.md)，
运行中继参见 [deploy-relay.md](/zh-cn/docs/deploy-relay/)。
