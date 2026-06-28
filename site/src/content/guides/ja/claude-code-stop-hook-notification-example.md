---
title: "Claude Code の Stop フックによる通知の例"
description: "エージェントがターンを返したときにデスクトップ通知を出す、コピペで使える Claude Code の Stop フック。さらに Stop イベントが本当は何を意味するのか、そして Agent Andon を使ったより本格的なセットアップも紹介します。"
updated: 2026-06-27
howto:
  - name: "Claude Code の設定を開く"
    text: "~/.claude/settings.json を編集します（なければ作成します）。"
  - name: "Stop フックを追加する"
    text: "hooks.Stop の下に、通知コマンドを実行する command フックを追加します。"
  - name: "保存してテストする"
    text: "ファイルを保存し、Claude Code のターンを終了します — 通知が出ます。"
---

Claude Code は、エージェントがターンを終えて操作をあなたに返すたびに **`Stop`** フックを発火します。10 分前に静かになったターミナルへわざわざ alt-tab で戻る代わりに、ちょうどこのタイミングで知らせを受け取れるのが理想です。ここでは、そのままコピペで使える最小限の Stop フック、このイベントが実際に何を意味するのか、そしてもっと本格的な仕組みが必要になるのはどんなときかを紹介します。

## 最小限の Stop フック

Claude Code はフックを **`~/.claude/settings.json`** から読み込みます。通知コマンドを実行する `Stop` フックを追加します：

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

保存して Claude Code でターンを終えると、デスクトップ通知が出ます。Linux では、コマンドを `notify-send "Agent done" "Claude Code handed the turn back"` に置き換えてください。

## `Stop` が実際に意味すること

`Stop` は Claude が **ターンをあなたに返した** ときに発火します — タスク全体が終わったことを約束するものでは *ありません*。エージェントは、ただあなたの次の指示を待っているだけかもしれません。関連して、知っておくとよいイベントが 2 つあります：

- **`Notification`** — Claude が *作業の途中で* 許可やあなたの入力を待っている状態（「確認待ち」になる瞬間）です。実は、いちばん捉えたいのはこれであることが多いでしょう。
- **`StopFailure`** — ターンがエラーで終わった状態です（新しい Claude Code）。

1 行の `Stop` フックは最初のケースは捉えますが、これらは取りこぼします。しかも、通知が届くのは実行しているその 1 台のマシンだけです。

## もっと多くをこなす Stop フック

複数のエージェントを動かす場合や、スマホに通知を届けたい場合、素の Stop フックはすぐに扱いづらくなります — 通知ツールはマシンごとに 1 つ、`Notification` への対応はなし、複数のセッションを一度に見る手段もありません。

**Agent Andon** は、それらすべてを自動で繋いでくれます：

```
npm i -g agent-andon
andon install claude
```

これで `Stop`・`Notification`・`StopFailure` のフックがまとめて導入され、どの画面でも開ける **ボード** に対応づけられます — 作業中・確認待ち・完了・停止 — デスクトップのバナーと、オプションでスマホ通知も付きます。`andon install --dry-run claude` は、書き込まずに出来上がる `settings.json` を表示します。`andon uninstall claude` は、追加したものだけを削除します。

イベント → 状態の完全な対応は [コマンド・イベント](/ja/docs/commands/) を、通知のチャンネルは [通知](/ja/docs/notifications/) を参照してください。
