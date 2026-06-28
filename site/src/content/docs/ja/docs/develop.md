---
title: "Andon を開発する"
description: "Agent Andon をソースからビルド・実行・テストする — コントリビューター向けのセットアップ。"
---

```bash
npm run build     # tsc -> dist/ (and marks the bin executable)
npm test          # node:test unit + integration tests
npm run dev       # tsc --watch
```

アーキテクチャ：
- `src/store.ts` — 純粋で、テスト済みの状態モデル。
- `src/server.ts` — セルフホストの HTTP レイヤー。`src/commands/*` が CLI のサブコマンドです。
- `assets/dashboard.html` — 自己完結したボード（1 ファイル。セルフホストとホスト型の**両方**が、これをそのまま配信します）。
- `src/hosted/*` — オプションのコンテンツを読み取れないリレー（ローカル製品とはきれいに分離された境界）。`src/sounds.ts` — 配信されるチャイム。

コントリビュートの流れについては [CONTRIBUTING.md](https://github.com/tianshanghong/agent-andon/blob/main/CONTRIBUTING.md) を、
リレーの動かし方については [deploy-relay.md](/ja/docs/deploy-relay/) を参照してください。
