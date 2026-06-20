# Running Andon: start, check, stop

Andon has up to three independent pieces you might run. Each starts and stops on its own —
this page is the exact command for each.

| Piece | Port | What it is | When you need it |
|---|---|---|---|
| **`andon serve`** | 8787 | the board server (on your computer) | always — this *is* the board |
| **Tailscale Serve** | — | exposes 8787 over HTTPS to *your* tailnet | reach the board / get phone push, just for you |
| **`andon relay`** | 8788 | the zero-knowledge hosted relay | only if you run your **own** relay — see [deploy-relay.md](deploy-relay.md) |

> Tailscale Serve and the relay are **alternatives** for remote/phone access — you don't run both.
> Most people run only `andon serve`.

---

## 1. The board — `andon serve` (port 8787)

**Start (foreground — `Ctrl-C` to stop):**
```bash
andon serve
```

**Start (background — survives closing the terminal):**
```bash
nohup andon serve > /tmp/andon.log 2>&1 &      # macOS / Linux
```
(Windows: run it in its own terminal window, or `start /b andon serve`.)

**Check whether it's running:**
```bash
lsof -iTCP:8787 -sTCP:LISTEN        # shows the listener if it's up
pgrep -fl "cli.js serve"            # shows the process
```

**Stop:**
- Foreground: **`Ctrl-C`** in its terminal.
- Background / don't know which terminal: `pkill -f "cli.js serve"`

**Auto-start at login (optional):** macOS — adapt `examples/com.agentandon.server.plist` for `launchd`;
Linux — a `systemd --user` unit. Skip this if you'd rather start it by hand.

---

## 2. Phone / remote access via Tailscale Serve (no relay)

This puts your local board (8787) at an **HTTPS** address that only **your own Tailscale devices** can
reach — enough for the board + phone push, without running a relay.

> **Key idea:** `tailscale serve` is a **persistent setting, not a process you keep open.** You set it
> **once**; Tailscale stores it and it survives reboots. It only *forwards* — the board itself still has to
> be running (`andon serve` on 8787), or the HTTPS address returns **502**. They are two separate things.

**Prerequisites:** Tailscale installed + logged in on **both** the computer and the phone (same account);
HTTPS certificates enabled for your tailnet (admin console → **DNS** → enable MagicDNS + HTTPS).

**Set it up (once):**
```bash
tailscale serve --bg 8787
```
Serves `https://<your-machine>.<your-tailnet>.ts.net` → `127.0.0.1:8787`, **tailnet-only**.

**See the current mapping:**
```bash
tailscale serve status
```

**Remove the mapping:**
```bash
tailscale serve reset
```

**On the phone:** open the `https://…ts.net` address (Tailscale app connected) → **Add to Home Screen**
(required for push on iPhone/iPad) → tap **Enable alerts**.

> `tailscale serve` = **private** (your tailnet only). `tailscale funnel` = **public internet** —
> don't use it unless you mean to.

---

## 3. Your own relay — `andon relay` (port 8788)

Only if you host the zero-knowledge relay yourself (most people use the managed relay, or Tailscale,
instead). Full production guide — HTTPS, capacity, auto-start: **[deploy-relay.md](deploy-relay.md)**.

| Action | Command |
|---|---|
| Start (foreground) | `andon relay` |
| Start (background) | `nohup andon relay > /tmp/andon-relay.log 2>&1 &` |
| Check | `lsof -iTCP:8788 -sTCP:LISTEN` |
| Stop | `Ctrl-C` (foreground) · `pkill -f "cli.js relay"` (background) |

---

## Quick reference

```bash
# What's running?
lsof -nP -iTCP:8787 -iTCP:8788 -sTCP:LISTEN     # the board / relay ports
tailscale serve status                           # the Tailscale HTTPS mapping

# Stop everything
pkill -f "dist/cli.js"      # stops andon serve + andon relay
tailscale serve reset       # removes the Tailscale HTTPS mapping
```

**The "phone over Tailscale" path = the Tailscale Serve mapping (set once, persistent) + `andon serve`
running.** Want it live: start `andon serve`. Done for now: `pkill -f "cli.js serve"` — the mapping can
stay; the next `andon serve` is reachable again.
