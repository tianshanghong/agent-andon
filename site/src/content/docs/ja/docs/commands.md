---
title: "コマンド・フックとイベント対応：Claude Code / Codex の CLI コマンドとライフサイクルフック"
description: "Agent Andon の全 CLI コマンドと、Claude Code / Codex のライフサイクルフックとイベントがボードの状態にどう対応するか — install、serve、doctor、hosted など。"
---

完全な CLI リファレンス、エージェントのイベントがボードの状態に変わる仕組み、バックグラウンドタスクのカウント、Codex
固有の事項、そしてタイルへの命名。（クイックスタートとよく使うコマンドは [README](https://github.com/tianshanghong/agent-andon/blob/main/README.md) にあります。）

## コマンド

| コマンド | 動作 |
|---|---|
| `andon serve [--demo] [--port N] [--token T] [--no-notify] [--say]` | ボードサーバーを起動。デスクトップ通知はデフォルトでオン（`--no-notify` でオフ、`--say` で読み上げを追加） |
| `andon install claude` | Claude Code のステータスフックを接続（タイムスタンプ付きバックアップ） |
| `andon install codex` | Codex のライフサイクルフックを接続（`/hooks` を実行して信頼させる） |
| `andon uninstall <claude\|codex>` | Andon が追加したものだけを削除。設定の残りはそのまま |
| `andon doctor` | ヘルスチェック + 接続済みの内容 + ボードの URL |
| `andon post <state> <agent> [title] [msg]` | ステータスを手動で送信 |
| `andon sub <+n\|-n> [id]` | プロセスのバックグラウンドタスク数を増減 |
| `andon relay` / `andon hosted` / `andon verify` | オプションのホスト型リレー — [hosted.md](/ja/docs/hosted/) を参照 |
| `andon hook` / `andon codexhook` | *(内部用 — フックから呼び出される)* |

`andon install --dry-run claude` は、書き込まずに変更内容を表示します。

## イベント → 状態の対応（Claude Code）

| Claude Code のイベント | ボードの状態 | タイミング |
|---|---|---|
| `SessionStart` | アイドル（スレート） | セッションが起動 — タイルがすぐに表示される |
| `UserPromptSubmit` | 作業中（青） | プロンプトを送信した直後 |
| `PostToolUse` | 作業中（青） | ツールが実行された直後 — 承認した瞬間にアンバーが解除される |
| `Notification` | 確認待ち（アンバー、脈打つ） | 許可／入力を待っている |
| `Stop` | **準備完了**（緑） | ターンがあなたに戻された — あなたの番であり、**「すべて完了」ではありません** |
| `StopFailure` | 停止（赤、脈打つ） | ターンが失敗した（新しい Claude Code のみ） |
| `SessionEnd` | *削除* | セッションが終了。タイルが消える |

複数のセッションは、それぞれ独自のタイルを持ちます（`session_id` をキーにします）。1 プロセス =
1 タイルで、そのサブエージェントは独自のタイルを生成せず、親タイルにまとめられます。ボードの起動より
*前から動いていた* セッションは、次のイベント（プロンプト、ツール、ターン終了）で表示されます — Andon は
あなたの statusLine には一切干渉しません。

## バックグラウンド作業：「完了」後もカードを正直に保つ

`Stop` は、フォアグラウンドのエージェントがターンを戻したことを意味します — バックグラウンド作業が完了した
という意味では **ありません**。プロセスがバックグラウンドのワークフローを開始する場合は、それらに報告させて、
誤って緑になるのではなく、すべて片付くまでカードが「作業中」（青）のままになるようにしましょう：

```bash
export ANDON_SESSION="<this process's tile id>"   # the session_id of the parent tile
andon sub +1     # a background task started
#   ...do the work...
andon sub -1     # it finished
```

カウントが `> 0` の間、カードは `WORKING ⋯N background` と表示され、すべてのタスクが `-1` を報告して
初めて緑になります。

## Codex

最近の Codex（≈ 0.117 以降）には、Claude 互換の完全な **フック** システムがあり、Andon は Claude Code と
同じライフサイクルを得られます — アンバーの **確認待ち** を含めて：

```bash
andon install codex      # wires lifecycle hooks → ~/.codex/hooks.json
```

| Codex のフックイベント | ボードの状態 |
|---|---|
| `SessionStart` | アイドル（起動時にタイルが表示される） |
| `UserPromptSubmit` / `PostToolUse` | 作業中（青） |
| `PermissionRequest` | **確認待ち（アンバー）** |
| `Stop` | 準備完了（緑） |
| `SessionEnd` | *削除* |

> **Codex で必要になる追加の 1 ステップ：** 新しいフックは、実行される前に **信頼（trust）** させる必要が
> あります — Codex 内で一度 `/hooks` を実行します（または `codex
> --dangerously-bypass-hook-trust` で起動します）。`andon uninstall codex` は、タイムスタンプ付き
> バックアップを取りつつ、フックを再びきれいに削除します。

残る注意点：赤の「停止」は、古さ（staleness）に基づくままです（専用の失敗ターン用フックはありません）。
（すでに動いているセッションは、Claude と同様に次のイベントで表示されます。）

## タイルに名前を付ける

デフォルトのタイトルは、プロジェクトのフォルダ名です。ターミナルごとに上書きできます：

```bash
ANDON_LABEL="backend refactor" claude
ANDON_LABEL="landing copy"     codex
```
