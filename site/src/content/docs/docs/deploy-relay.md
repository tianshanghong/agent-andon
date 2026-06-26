---
title: "Deploying an Andon relay"
description: "Self-host the content-blind Agent Andon relay — the shared entry that forwards only sealed ciphertext so your team can reach their boards from anywhere."
---

This is the operator guide: run **one** Andon relay at **one HTTPS URL**, and any number of people point at
it with `andon hosted setup <your-url>` — each gets their own isolated, content-blind board under that same
URL. (Users' side: [hosted.md](/docs/hosted/).)

The relay **stores ciphertext only** and can't read anyone's content — but it's an internet-facing
multi-tenant service, so read the [capacity & abuse](#6-capacity--abuse-read-before-going-public) section
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
| `ANDON_IDLE_TTL_SEC` | `900` (15 min) | finished/idle sessions are dropped this long after their last event (so a torn-down team doesn't leave a wall of "ready" tiles); active/needs-you sessions use the 6h hard TTL instead |

It handles `SIGINT`/`SIGTERM` gracefully (closes SSE streams so restarts don't hang).

### Or with Docker

The relay ships as a multi-arch image at `ghcr.io/tianshanghong/agent-andon`, built reproducibly from this
source by CI (the same code `andon verify` checks; provenance + SBOM attached). It runs the relay by default.

```bash
docker run -d --name andon-relay \
  -v andon_data:/data \                         # persist hashed tokens + VAPID + subscriptions
  -e ANDON_PUSH_SUBJECT=mailto:you@example.com \
  ghcr.io/tianshanghong/agent-andon:latest      # CMD defaults to `relay`
```

Or a minimal compose (put your own TLS / reverse proxy in front — don't expose 8788 to the internet):

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

The image is non-root, has a `/version` healthcheck, and keeps all state in the `/data` volume
(`ANDON_DATA_DIR`) — back that volume up.

---

## 3. Put HTTPS in front

The relay speaks plain **HTTP on `:8788`** — something in front terminates TLS (browsers require HTTPS for
in-browser decryption + push). You don't add anything relay-specific; you point what you **already run** at
port 8788. Pick the row that matches you:

| Your setup | How TLS is handled |
|---|---|
| **Docker, with a reverse proxy / tunnel already** *(most common)* | route `relay.example.com` → the container's `:8788` from your existing **Traefik / nginx-proxy / Cloudflare Tunnel** — examples below |
| **A bare host, nothing installed yet** | **Caddy** is the one-liner (auto Let's Encrypt) — see below |
| **Just you / your team, on Tailscale** | `tailscale serve --bg 8788` → `https://<machine>.<tailnet>.ts.net` (tailnet-only, no public cert) |

**Docker behind a reverse proxy / tunnel** — the container stays HTTP-only; the front does TLS:

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

**Bare host — Caddy** (simplest if you have nothing else; automatic Let's Encrypt):

```
# /etc/caddy/Caddyfile
relay.example.com {
    reverse_proxy 127.0.0.1:8788
}
```
`sudo systemctl reload caddy` → `https://relay.example.com`. (nginx + certbot works the same: `proxy_pass http://127.0.0.1:8788;`.)

> ⚠️ **Proxy + rate limits:** the relay rate-limits by `req.socket.remoteAddress`. Behind a TLS-terminating
> proxy that's the **proxy's** IP, so the per-IP limits collapse to one bucket for everyone. The relay does
> **not** yet parse `X-Forwarded-For` (it's spoofable if trusted naively). Until it does, do per-client
> rate-limiting **at the proxy** (Traefik/Caddy/nginx/Cloudflare all can) if you expose it publicly.

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
`✓ match` (or a mismatch). Tell your users they can run this too — that's the whole point of the transparency model.

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

None of these affect the content-blind guarantee (the relay never holds keys or plaintext); they're
availability/abuse concerns.

---

## 7. Updating the relay

Pull the new version, rebuild, restart the service. Already-installed PWAs **auto-update** on their next
relaunch (the board + service worker are served `no-store` and the SW self-replaces); users **don't
re-pair** — their key lives in their own browser, not on your relay. Keep wire-format changes additive
(append optional fields; don't change the AAD/padding/push-payload shape) so an old PWA + new relay degrades
cleanly until the user relaunches. After an update, the served-bundle hash changes — re-run `andon verify`
and (operationally) publish the new hash so users can confirm it.
