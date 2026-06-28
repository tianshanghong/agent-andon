---
title: "Claude Code と Codex の通知：デスクトップ通知とメニューバー"
description: "Claude Code と Codex のエージェント向けにデスクトップ通知とメニューバーのインジケーターを設定し、エージェントがあなたの対応を必要とした・完了した・行き詰まった瞬間に知らせを受け取りましょう。"
---

Andon の唯一の仕事は、**ちょうどいいタイミングであなたの注意を引く** こと — エージェントが
あなたの対応を必要としたり、ブロックされたりしたとき — そして、それ以外のときは静かにして
いることです。ボードはどのデバイスでも使える共通のチャンネルで、ここで挙げる手段はそれを
補完し、それぞれ macOS / Linux / Windows で、環境に応じてうまくフォールバックします。

## ネイティブのデスクトップ通知

サーバーを実行しているマシンに表示されるバナーで、**デフォルトでオン** です。あなたの対応が
必要な状態では目立つように、完了時には静かに通知します：

- **確認待ち（琥珀色）** / **停止（赤）** → バナー + 音（即時）。
- **完了（緑）** → *静かな* バナー 1 回（音なし）。一時的な緑が誤った「準備完了」を発火させない
  よう、4 秒間デバウンスされます。

```bash
andon serve                 # alerts on by default
andon serve --say           # also speak needs-you / stuck aloud
andon serve --no-notify     # turn alerts off
```

`osascript`/`say`（macOS）、`notify-send`/`spd-say`（Linux）、PowerShell トースト/`System.Speech`
（Windows）を使います。ツールが見つからない場合 → 静かにスキップされます。（`--demo` では
自動的にオフになるので、循環するダミーのエージェントがスパムのように通知することはありません。）
通知は **スロットリング** されており（セッションごとのクールダウン + グローバルなトークン
バケット）、`/event` に送信してくる多忙な — あるいは悪意のある — LAN クライアントが、大量の
プロセス生成を引き起こすことはできません。

## メニュー／ステータスバー

別の画面を用意しなくても、一目で把握できるサマリー：

```bash
curl -s http://127.0.0.1:8787/menubar     # plain-text summary endpoint
```

SwiftBar/xbar（macOS）または Waybar/polybar（Linux）に接続します。
`examples/andon-menubar.5s.sh` を参照してください。

## 中断を減らしたい？ 承認は自分で設定する

Andon は **あなたの権限／承認の設定に一切手を触れません** — それはあなたが管理するものです。
琥珀色の「確認待ち」が望むより頻繁に発火する場合は、エージェント自身の設定で安全な操作を
事前承認しておきましょう（そうすれば Andon は残りの場合にだけ点灯します）：

- **Claude Code** — `~/.claude/settings.json` の `permissions.allow` に読み取り専用の
  パターンを追加します。例：`"Read"`、`"Bash(git status:*)"`、`"Bash(npm test:*)"`。あなたの
  `deny`／`ask` ルールが常に優先され、Bash のマッチャーはシェル演算子を認識します（そのため
  `Bash(git status:*)` が `git status && rm -rf` を承認することはありません）。`/permissions`
  を参照してください。
- **Codex** — `~/.codex/config.toml` で `approval_policy`（例：`"untrusted"` は信頼された
  読み取り専用コマンドを自動実行します）や `sandbox_mode` を設定します。

これを *あなた* の手に委ねておくことで、Andon があなたの安全ルールを弱めることは決して
ありません — そしてボードは、あなたが本当に必要とされるタイミングを忠実に映す鏡であり
続けます。
