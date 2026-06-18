# Deploying an Andon relay (the shared "unified entry")

This is the operator guide: run **one** Andon relay at **one HTTPS URL**, and any number of people point at
it with `andon hosted setup <your-url>` — each gets their own isolated, zero-knowledge board under that same
URL. (Users' side: [hosted.md](hosted.md).)

The relay **stores ciphertext only** and can't read anyone's content — but it's an internet-facing
multi-tenant service, so read the [capacity & abuse](#capacity--abuse-read-before-going-public) section
before exposing it widely.

---

## 1. What you're running

`andon relay` is a single Node process (stdlib only, no deps) that:
- mints boards (`POST /provision`), ingests sealed events (`POST /i/<board>`), and serves snapshots, an SSE
  live stream, Web Push, and the board bundle (`/b/<board>`, `/sw.js`, …);
- persists **only** hashed tokens + a VAPID keypair + push subscriptions to a file; **sealed events live in
  RAM with a 6h TTL**; it never stores or sees plaintext.

It listens on **plain HTTP** — you put HTTPS in front (push + in-browser decryption require a secure context).

---

## 2. Run it

```bash
npm i -g agent-andon          # or: git clone … && npm i && npm run build, then use node dist/cli.js

# bind to localhost only and let a reverse proxy terminate TLS (recommended):
ANDON_RELAY_HOST=127.0.0.1 ANDON_RELAY_PORT=8788 ANDON_DATA_DIR=/var/lib/andon andon relay
```

| Setting | Default | Notes |
|---|---|---|
| `ANDON_RELAY_PORT` / `--port` | `8788` | the HTTP port |
| `ANDON_RELAY_HOST` | `0.0.0.0` | set `127.0.0.1` when behind a proxy |
| `ANDON_DATA_DIR` / `--data-dir` | `~/.andon` | **persist this** — it holds `relay-tenants.json` (hashed tokens + subscriptions) and `relay-vapid.json`. Lose it and every board 404s + push breaks. |

It handles `SIGINT`/`SIGTERM` gracefully (closes SSE streams so restarts don't hang).

---

## 3. Put HTTPS in front

### Caddy (simplest — automatic Let's Encrypt)
```
# /etc/caddy/Caddyfile
relay.example.com {
    reverse_proxy 127.0.0.1:8788
}
```
`sudo systemctl reload caddy` — done, you have `https://relay.example.com`.

### Alternatives
- **nginx + certbot** — `proxy_pass http://127.0.0.1:8788;` plus a normal cert.
- **Cloudflare Tunnel** — no open ports; `cloudflared` → `127.0.0.1:8788`.
- **Tailscale Serve** (private, tailnet-only relay) — `tailscale serve --bg 8788`, served at
  `https://<machine>.<tailnet>.ts.net`. Good for "just my team", not the public internet.

> ⚠️ **Proxy + rate limits:** the relay rate-limits by `req.socket.remoteAddress`. Behind a TLS-terminating
> proxy that's the **proxy's** IP, so the per-IP limits collapse to one bucket for everyone. The relay does
> **not** yet parse `X-Forwarded-For` (it's spoofable if trusted naively). Until it does, do per-client
> rate-limiting **at the proxy** (Caddy/nginx/Cloudflare all can) if you expose it publicly.

---

## 4. Keep it running (auto-start)

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
Adapt `examples/com.agentandon.server.plist` (it's written for `andon serve`): change the program args to
`relay`, set `ANDON_RELAY_HOST`/`ANDON_DATA_DIR` in `EnvironmentVariables`, load with `launchctl load`.

---

## 5. Verify it's serving honest code

From any machine with the matching `agent-andon` version installed:
```bash
andon verify https://relay.example.com
```
It compares the board + service worker your relay serves against the open-source bytes and reports
`✓ match` (or a mismatch). Tell your users they can run this too — that's the whole point of T2 transparency.

---

## 6. Capacity & abuse (read before going public)

What's **built in** (single-process MVP):

| Guard | Value |
|---|---|
| Boards per relay | `MAX_BOARDS = 500` (idle boards >90d are evicted to make room) |
| Sessions per board | `MAX_SESSIONS = 200` (TTL-swept at 6h) |
| Push subscriptions per board | `MAX_SUBS = 20` |
| Provision rate | 20 / IP / hour |
| Ingest rate | 600 / min per board+IP |
| Read (snapshot/SSE) | 120 / min per board+IP; ≤8 concurrent SSE / IP, ≤20 / board, ≤500 total |
| Body size | 64 KB; plus slowloris timeouts + `maxConnections` |
| Tenant file writes | atomic (tmp + rename); a corrupt file is preserved, not silently dropped |

What's **NOT** built yet — add before running a real public service:
- **Provisioning is open** (anyone can mint a board, only IP-rate-limited). For a public service add an
  **invite code / account / proof-of-work** gate, or front `/provision` with auth.
- **Single process** — `MAX_BOARDS=500`, in-memory events, one box. To scale horizontally you must pin a
  board to one instance by a hash of its id (round-robin silently breaks SSE + the per-board caps).
- **X-Forwarded-For** handling (see the proxy note above).
- **Durable/backed-up `ANDON_DATA_DIR`** — it's a flat JSON file; back it up.

None of these affect the zero-knowledge guarantee (the relay never holds keys or plaintext); they're
availability/abuse concerns.

---

## 7. Updating the relay

Pull the new version, rebuild, restart the service. Already-installed PWAs **auto-update** on their next
relaunch (the board + service worker are served `no-store` and the SW self-replaces); users **don't
re-pair** — their key lives in their own browser, not on your relay. Keep wire-format changes additive
(append optional fields; don't change the AAD/padding/push-payload shape) so an old PWA + new relay degrades
cleanly until the user relaunches. After an update, the served-bundle hash changes — re-run `andon verify`
and (operationally) publish the new hash so users can confirm it.
