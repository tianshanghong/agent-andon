---
title: "Andon を動かす：起動・確認・停止"
description: "Agent Andon の各コンポーネント — ボードサーバー、スマホアクセス用の Tailscale Serve、オプションのコンテンツを読み取れないリレー — を起動・確認・停止する方法。"
---

Andon には、動かす可能性のある独立したコンポーネントが最大 3 つあります。それぞれが個別に起動・停止します。
このページは、それぞれの正確なコマンドをまとめたものです。

| コンポーネント | ポート | 概要 | 必要になるとき |
|---|---|---|---|
| **`andon serve`** | 8787 | ボードサーバー（あなたのコンピューター上） | 常に — これが *ボードそのもの* |
| **Tailscale Serve** | — | 8787 を HTTPS で *自分の* tailnet に公開する | 自分だけがボードにアクセス／スマホへプッシュ通知 |
| **`andon relay`** | 8788 | コンテンツを読み取れないホスト型リレー | **自分の** リレーを動かす場合のみ — [deploy-relay.md](/ja/docs/deploy-relay/) を参照 |

> Tailscale Serve とリレーは、リモート／スマホからのアクセスのための **代替手段** です — 両方を動かすことはありません。
> ほとんどの人は `andon serve` だけを動かします。

---

## 1. ボード — `andon serve`（ポート 8787）

**起動（フォアグラウンド — `Ctrl-C` で停止）：**
```bash
andon serve
```

**起動（バックグラウンド — ターミナルを閉じても動き続ける）：**
```bash
nohup andon serve > /tmp/andon.log 2>&1 &      # macOS / Linux
```
（Windows：専用のターミナルウィンドウで実行するか、`start /b andon serve` を使います。）

**起動しているか確認：**
```bash
lsof -iTCP:8787 -sTCP:LISTEN        # shows the listener if it's up
pgrep -fl "cli.js serve"            # shows the process
```

**停止：**
- フォアグラウンド：ターミナルで **`Ctrl-C`**。
- バックグラウンド／どのターミナルか分からない場合：`pkill -f "cli.js serve"`

**ログイン時に自動起動（オプション）：** macOS — `examples/com.agentandon.server.plist` を `launchd` 向けに調整します。
Linux — `systemd --user` ユニットを使います。手動で起動したい場合は省略してかまいません。

---

## 2. Tailscale Serve によるスマホ／リモートアクセス（リレー不要）

これは、ローカルのボード（8787）を、**自分の Tailscale デバイス** だけがアクセスできる **HTTPS** アドレスに
配置します — リレーを動かさなくても、ボードとスマホへのプッシュ通知には十分です。

> **重要なポイント：** `tailscale serve` は **開いたままにしておくプロセスではなく、永続的な設定** です。一度
> **設定すれば**、Tailscale がそれを保存し、再起動後も維持されます。これは *転送する* だけです — ボード自体は
> 動いている必要があり（8787 で `andon serve`）、そうでなければ HTTPS アドレスは **502** を返します。両者は別物です。

**前提条件：** コンピューターとスマホの **両方** に Tailscale がインストールされ、ログイン済みであること（同じアカウント）。
tailnet で HTTPS 証明書が有効になっていること（管理コンソール → **DNS** → MagicDNS + HTTPS を有効化）。

**設定する（一度だけ）：**
```bash
tailscale serve --bg 8787
```
`https://<your-machine>.<your-tailnet>.ts.net` → `127.0.0.1:8787` を、**tailnet 内のみ** で配信します。

**現在のマッピングを確認：**
```bash
tailscale serve status
```

**マッピングを削除：**
```bash
tailscale serve reset
```

**スマホで：** `https://…ts.net` アドレスを開き（Tailscale アプリが接続された状態で）→ **ホーム画面に追加**
（iPhone/iPad でのプッシュ通知に必須）→ **通知を有効化** をタップします。

> `tailscale serve` = **プライベート**（自分の tailnet のみ）。`tailscale funnel` = **公開インターネット** —
> 意図して使うのでなければ使わないでください。

---

## 3. 自分のリレー — `andon relay`（ポート 8788）

> **リレーをまったく動かしたくない？** その必要はありません — 私たちのものを使ってください。`andon hosted setup https://relay.agentandon.com`
> は、私たちが運用するコンテンツを読み取れないリレーを指定します。どこからでもボードを、セットアップ不要、ホストするものは何もありません。
> [ホスト型 Andon](/ja/docs/hosted/) を参照してください。

コンテンツを読み取れないリレーを自分でホストする場合のみです（ほとんどの人は、代わりに私たちが運用するリレーや Tailscale を
使います）。本番運用の完全ガイド — HTTPS、キャパシティ、自動起動：**[deploy-relay.md](/ja/docs/deploy-relay/)**。

| アクション | コマンド |
|---|---|
| 起動（フォアグラウンド） | `andon relay` |
| 起動（バックグラウンド） | `nohup andon relay > /tmp/andon-relay.log 2>&1 &` |
| 確認 | `lsof -iTCP:8788 -sTCP:LISTEN` |
| 停止 | `Ctrl-C`（フォアグラウンド）· `pkill -f "cli.js relay"`（バックグラウンド） |

---

## クイックリファレンス

```bash
# What's running?
lsof -nP -iTCP:8787 -iTCP:8788 -sTCP:LISTEN     # the board / relay ports
tailscale serve status                           # the Tailscale HTTPS mapping

# Stop everything
pkill -f "dist/cli.js"      # stops andon serve + andon relay
tailscale serve reset       # removes the Tailscale HTTPS mapping
```

**「Tailscale 経由でスマホ」の経路 = Tailscale Serve のマッピング（一度設定すれば永続）+ `andon serve` が
動いていること。** 動かしたいとき：`andon serve` を起動します。今はもう終わり：`pkill -f "cli.js serve"` —
マッピングはそのままで構いません。次に `andon serve` を起動すれば再びアクセスできます。
