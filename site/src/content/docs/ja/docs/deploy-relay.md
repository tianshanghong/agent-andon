---
title: "Andon リレーをデプロイする"
description: "コンテンツを読み取れない Agent Andon リレーをセルフホストしましょう — 封印された暗号文だけを転送する共有の入り口で、チームはどこからでも自分のボードにアクセスできます。"
---

これは運用者向けのガイドです：**1 つの** Andon リレーを **1 つの HTTPS URL** で動かせば、何人でも `andon hosted setup <your-url>`
でそれを指定できます — それぞれが、その同じ URL の下に、自分専用の隔離された、コンテンツを読み取れないボードを持ちます。
（ユーザー側：[hosted.md](/ja/docs/hosted/)。）

リレーは **暗号文だけを保存** し、誰のコンテンツも読み取れません — とはいえ、これはインターネットに面したマルチテナントの
サービスなので、広く公開する前に [キャパシティと不正利用](#6-キャパシティと不正利用公開前に読むこと) のセクションを読んでください。

---

## 1. 何を動かすのか

`andon relay` は単一の Node プロセス（標準ライブラリのみ、依存なし）で、次のことを行います：
- ボードを発行し（`POST /provision`）、封印されたイベントを取り込み（`POST /i/<board>`）、スナップショット・SSE
  ライブストリーム・Web Push・ボードバンドル（`/b/<board>`、`/sw.js`、…）を配信します。
- ファイルに永続化するのは、ハッシュ化されたトークン + VAPID 鍵ペア + プッシュ購読 **だけ** です。**封印された
  イベントは 6 時間の TTL で RAM 上に存在** し、平文を保存することも目にすることもありません。

リレーは **素の HTTP** で待ち受けます — HTTPS はあなたが前段に置きます（プッシュ通知とブラウザ内での復号にはセキュアコンテキストが必要です）。

---

## 2. 動かす

```bash
npm i -g agent-andon          # or: git clone … && npm i && npm run build, then use node dist/cli.js

# bind to localhost only and let a reverse proxy terminate TLS (recommended):
ANDON_RELAY_HOST=127.0.0.1 ANDON_RELAY_PORT=8788 ANDON_DATA_DIR=/var/lib/andon andon relay
```

| 設定項目 | デフォルト | 備考 |
|---|---|---|
| `ANDON_RELAY_PORT` / `--port` | `8788` | HTTP ポート |
| `ANDON_RELAY_HOST` | `0.0.0.0` | プロキシの背後では `127.0.0.1` に設定します |
| `ANDON_DATA_DIR` / `--data-dir` | `~/.andon` | **これは永続化してください** — `relay-tenants.json`（ハッシュ化されたトークン + 購読）と `relay-vapid.json` を保持します。失うと、すべてのボードが 404 になり、プッシュ通知も壊れます。 |
| `ANDON_IDLE_TTL_SEC` | `900`（15 分） | 完了／アイドルのセッションは、最後のイベントからこの時間が経つと削除されます（解散したチームが「完了」タイルの壁を残さないように）。アクティブ／確認待ちのセッションは、代わりに 6 時間のハード TTL を使います。 |

`SIGINT`/`SIGTERM` を丁寧に処理します（SSE ストリームを閉じるので、再起動がハングしません）。

### または Docker で

リレーは、マルチアーキテクチャイメージとして `ghcr.io/tianshanghong/agent-andon` で配布されており、CI がこのソースから
再現可能な形でビルドしています（`andon verify` が検証するのと同じコードで、来歴（provenance）と SBOM が添付されています）。
デフォルトでリレーを実行します。

```bash
docker run -d --name andon-relay \
  -v andon_data:/data \                         # persist hashed tokens + VAPID + subscriptions
  -e ANDON_PUSH_SUBJECT=mailto:you@example.com \
  ghcr.io/tianshanghong/agent-andon:latest      # CMD defaults to `relay`
```

あるいは最小構成の compose（TLS／リバースプロキシは自分で前段に置いてください — 8788 をインターネットに公開しないこと）：

```yaml
services:
  relay:
    image: ghcr.io/tianshanghong/agent-andon:latest
    restart: unless-stopped
    environment:
      ANDON_PUSH_SUBJECT: mailto:you@example.com   # a real contact for the VAPID JWT
    volumes:
      - andon_data:/data
    # route to it from your reverse proxy on port 8788; it needs OUTBOUND internet for Web Push
volumes:
  andon_data:
```

このイメージは非 root で、`/version` のヘルスチェックを備え、すべての状態を `/data` ボリューム（`ANDON_DATA_DIR`）に
保持します — そのボリュームはバックアップしてください。

---

## 3. 前段に HTTPS を置く

リレーは **`:8788` で素の HTTP** を話します — 前段の何かが TLS を終端します（ブラウザは、ブラウザ内での復号とプッシュ通知に
HTTPS を要求します）。リレー専用に何かを追加する必要はありません。**すでに動かしている** ものをポート 8788 に向けるだけです。
自分に当てはまる行を選んでください：

| あなたの構成 | TLS の処理方法 |
|---|---|
| **Docker で、すでにリバースプロキシ／トンネルがある** *（最も一般的）* | 既存の **Traefik / nginx-proxy / Cloudflare Tunnel** から `relay.example.com` → コンテナの `:8788` にルーティングします — 例は下記 |
| **何もインストールしていない素のホスト** | **Caddy** が一行で済みます（Let's Encrypt 自動）— 下記参照 |
| **自分だけ／自分のチームで、Tailscale 上** | `tailscale serve --bg 8788` → `https://<machine>.<tailnet>.ts.net`（tailnet 内のみ、公開証明書なし） |

**リバースプロキシ／トンネルの背後の Docker** — コンテナは HTTP のままで、前段が TLS を担います：

```yaml
# Traefik: labels on the relay service (Traefik — or, behind cloudflared, Cloudflare — supplies the cert)
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.relay.rule=Host(`relay.example.com`)"
  - "traefik.http.routers.relay.entrypoints=websecure"
  - "traefik.http.services.relay.loadbalancer.server.port=8788"
```
```
# Cloudflare Tunnel: no open ports — point an ingress hostname at the container
#   relay.example.com  ->  http://andon-relay:8788
```

**素のホスト — Caddy**（他に何もない場合に最も簡単。Let's Encrypt 自動）：

```
# /etc/caddy/Caddyfile
relay.example.com {
    reverse_proxy 127.0.0.1:8788
}
```
`sudo systemctl reload caddy` → `https://relay.example.com`。（nginx + certbot も同様に動きます：`proxy_pass http://127.0.0.1:8788;`。）

> ⚠️ **プロキシ + レート制限：** リレーは `req.socket.remoteAddress` でレート制限します。TLS を終端するプロキシの背後では、
> それは **プロキシの** IP になるため、IP ごとの制限が崩れ、全員が 1 つのバケットにまとめられてしまいます。リレーは
> `X-Forwarded-For` をまだ **解析しません**（素朴に信頼するとなりすまし可能なため）。解析するようになるまでは、公開する
> 場合はクライアントごとのレート制限を **プロキシ側で** 行ってください（Traefik/Caddy/nginx/Cloudflare のいずれも可能です）。

---

## 4. 動かし続ける（自動起動）

### Linux — systemd
```ini
# /etc/systemd/system/andon-relay.service
[Unit]
Description=Agent Andon relay
After=network.target

[Service]
Environment=ANDON_RELAY_HOST=127.0.0.1
Environment=ANDON_RELAY_PORT=8788
Environment=ANDON_DATA_DIR=/var/lib/andon
ExecStart=/usr/bin/andon relay
Restart=on-failure
User=andon
StateDirectory=andon

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now andon-relay
```

### macOS — launchd
`examples/com.agentandon.server.plist`（`andon serve` 向けに書かれています）を調整します：プログラム引数を `relay` に変更し、
`EnvironmentVariables` に `ANDON_RELAY_HOST`/`ANDON_DATA_DIR` を設定し、`launchctl load` で読み込みます。

---

## 5. 正直なコードを配信していることを検証する

対応する `agent-andon` バージョンがインストールされた任意のマシンから：
```bash
andon verify https://relay.example.com
```
これは、あなたのリレーが配信するボード + Service Worker を、オープンソースのバイト列と比較し、`✓ match`（または不一致）を
報告します。ユーザーにも、これを実行できることを伝えてください — それこそが透明性モデルの肝心な点です。

---

## 6. キャパシティと不正利用（公開前に読むこと）

**組み込み済み** のもの（単一プロセスの MVP）：

| ガード | 値 |
|---|---|
| リレーあたりのボード数 | `MAX_BOARDS = 500`（90 日超アイドルのボードは、空きを作るために退避されます） |
| ボードあたりのセッション数 | `MAX_SESSIONS = 200`（6 時間で TTL 掃除） |
| ボードあたりのプッシュ購読数 | `MAX_SUBS = 20` |
| プロビジョニングのレート | `20 / IP / hour` |
| 取り込みのレート | `600 / min`（ボード + IP ごと） |
| 読み取り（スナップショット／SSE） | `120 / min`（ボード + IP ごと）。SSE の同時接続は IP あたり ≤8、ボードあたり ≤20、合計 ≤500 |
| ボディサイズ | `64 KB`。加えて slowloris タイムアウトと `maxConnections` |
| テナントファイルの書き込み | アトミック（tmp + rename）。破損したファイルは、黙って破棄されず保存されます |

**まだ** 組み込まれて **いない** もの — 本格的な公開サービスを運用する前に追加してください：
- **プロビジョニングは誰でも可能** です（誰でもボードを発行でき、IP レート制限だけがかかります）。公開サービスでは、
  **招待コード／アカウント／proof-of-work** のゲートを追加するか、`/provision` の前段に認証を置いてください。
- **単一プロセス** — `MAX_BOARDS=500`、イベントはメモリ内、1 台のマシン。水平スケールするには、ボード ID のハッシュに
  よって各ボードを 1 つのインスタンスに固定する必要があります（ラウンドロビンは、SSE とボードごとの上限を黙って壊します）。
- **X-Forwarded-For** の処理（上記のプロキシに関する注記を参照）。
- **永続的／バックアップ済みの `ANDON_DATA_DIR`** — これはフラットな JSON ファイルです。バックアップしてください。

これらはいずれも、コンテンツを読み取れないという保証には影響しません（リレーは鍵も平文も一切保持しません）。これらは
可用性／不正利用に関する懸念です。

---

## 7. リレーを更新する

新しいバージョンを取得し、再ビルドし、サービスを再起動します。インストール済みの PWA は、次回の再起動時に **自動更新** されます
（ボード + Service Worker は `no-store` で配信され、SW は自動で自身を置き換えます）。ユーザーが **再ペアリングする必要は
ありません** — 鍵は、あなたのリレーではなく、各ユーザー自身のブラウザの中にあります。ワイヤーフォーマットの変更は追加的に
保ってください（オプションのフィールドを追加するだけにとどめ、AAD／パディング／プッシュペイロードの形は変えない）。そうすれば、
古い PWA + 新しいリレーの組み合わせでも、ユーザーが再起動するまできれいにデグレードします。更新後は、配信されるバンドルの
ハッシュが変わります — `andon verify` を再実行し、（運用として）新しいハッシュを公開して、ユーザーが確認できるようにしてください。
