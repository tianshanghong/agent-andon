---
title: "Hosted Andon: the board from anywhere"
description: "Pair Agent Andon with the content-blind hosted relay to reach your board and get phone push from outside your network — sealed end-to-end."
---

Andon is **local-first and free to self-host forever** — that stays the default and shares nothing.
This guide is the **optional, opt-in** hosted mode: see your board (and get phone alerts) from anywhere,
through a relay that **routes ciphertext only and can't read your agents' content**.

> Deploying a relay for others to share? See **[deploy-relay.md](/docs/deploy-relay/)**.

---

## What it is (in one minute)

- Every status event is **end-to-end encrypted on your machine** before it leaves.
- A **relay** stores + forwards that **ciphertext** and never has the key — it sees only coarse routing
  (which board, a hashed session id, working/waiting/done/error/idle, timing).
- You open the **same board** as self-host; it decrypts in **your browser** with a key carried in the
  link's `#fragment` (never sent to the server). The service worker decrypts phone pushes the same way.
- **No local `andon serve` needed** — the hook's normal post path also forwards a sealed copy.

There are two ways to use it:

| | Who runs the relay | Who can use it |
|---|---|---|
| **A. Your own relay** | you (`andon relay` on a box you control) | just you |
| **B. A shared relay** | an operator, at one public HTTPS URL | many people — each gets their own isolated board under the *same* URL |

Both are the same code; B is just A exposed publicly. See [Multi-tenant](#multi-tenant--one-url-many-boards).

---

## Quick start

```bash
# 1) Run a relay (yours), or skip this and use a shared relay URL someone gives you
andon relay                            # listens on :8788 (see deploy-relay.md for HTTPS/public use)

# 2) Opt in — generates a key that NEVER leaves your machine, prints your board link
andon hosted setup http://127.0.0.1:8788
#   → prints:  http://127.0.0.1:8788/b/<board-id>#k=<key>

# 3) Open that link in a browser. Done — your agents now show up there.
```

`andon hosted setup` first shows you exactly what the relay can and can't see, and asks `[y/N]`
(default **No**). After it's on, every Claude Code / Codex status also forwards (sealed) to the relay.

**Treat the board link like a password** — the `#k=…` part *is* your decryption key. Don't screenshot it
into chat; save it in a password manager. (Or scan the QR shown in the terminal to pair without copy-pasting.)

---

## Opening the board

- **On the same computer:** open `http://127.0.0.1:<port>/b/<board-id>#k=<key>`. `localhost` / `127.0.0.1` is a
  secure context, so in-browser decryption works over plain HTTP.
- **On your phone / another device:** the relay must be reachable over **HTTPS** (browsers require a secure
  context for decryption + push). Two easy paths:
  - **Tailscale** (you already have it): `tailscale serve --bg <relay-port>` → gives you an
    `https://<machine>.<tailnet>.ts.net` address. Open `https://…ts.net/b/<board-id>#k=<key>` on the phone.
  - **A real domain + cert** (for a shared relay) — see [deploy-relay.md](/docs/deploy-relay/).

### Phone alerts (PWA)
1. Open your board link on the phone over **HTTPS**.
2. **iPhone:** Share → **Add to Home Screen** (iOS only allows Web Push from an installed PWA), then open it
   from the home screen. **Android/Chrome:** works from a normal tab; "Add to Home Screen" optional.
3. Tap **ENABLE ALERTS** → allow notifications. You'll get a buzz when an agent first **needs you** or gets
   **stuck** — even with the board closed and the phone locked. The notification text is decrypted **on your
   phone**; the relay never sees it.

---

## Managing it

```bash
andon hosted status                    # is hosted on? which relay + board id
andon hosted pair                      # re-print your board link — add a device, or recover a lost link
andon hosted off                       # stop forwarding — your agents go back to local-only
andon verify  <relay-url>              # check the relay serves the exact open-source code (see below)
```

Switching back and forth is free; `off` just deletes the local config (`~/.andon/hosted.json`).

---

## What the relay can / can't see

| | |
|---|---|
| ❌ **Cannot read** | your prompts, code, project names, titles, messages, leverage tallies |
| • **Can see** | that you're active and roughly when (per-event timing), how many sessions, your IP, ciphertext size bucket |
| • **Can do** | delay/withhold an event, or re-show one of your **real past** push notifications (a stale "needs you" for an already-resolved session) — but it **cannot invent new content, and cannot read it** |

Self-host shares **nothing** and stays the default. Hosted is the convenience-vs-metadata tradeoff, stated plainly.

---

## "Verifiable, not just trusted" (transparency)

Because a web board's code is *served by the relay*, the airtight "even if breached, can't read it" only
holds for an installed app. For the **web board**, the honest claim is **"we can't *secretly* backdoor you"**:

```bash
andon verify https://relay.example.com
```

This fetches the board + service worker the relay actually serves, hashes them, and compares to the bytes in
**your own** open-source copy. A **match** means the relay is serving the exact audited code — no hidden
key-stealing. A persistent **mismatch at the same version** means it's serving modified code; don't trust it
with your key. The relay also declares its hashes at `GET /version`.

---

## Multi-tenant — one URL, many boards

A relay is **multi-tenant by design**: one process serves many boards, and the entry point is **a single
URL**, not a subdomain per user.

```
            https://relay.example.com        (one URL = the shared entry)
            ├── /b/<A's board-id>#k=<A's key>     only A's key decrypts it
            ├── /b/<B's board-id>#k=<B's key>     only B's key decrypts it
            └── /b/<C's board-id>#k=<C's key>     only C's key decrypts it
            the relay holds only ciphertext for all of them
```

Everyone runs `andon hosted setup https://relay.example.com`; each gets a **256-bit unguessable** board id
under that one URL. Isolation is two-layer and tested:
- **Nobody reads anybody:** per-board key `K`, relay stores ciphertext only (content-blind).
- **Nobody writes anybody:** the board id is the read capability; writing needs that board's own ingest token
  (A's token on B's board → `401`).

---

## Upgrades (already-installed PWAs)

**Automatic — no app store, no re-pairing.**
- The board HTML is served `no-store` and nothing caches it, so each launch loads the latest.
- The service worker auto-updates (the browser re-checks `/sw.js` on relaunch/navigation/~24h; it
  `skipWaiting()`s so the new version takes over immediately).
- Your key `K` lives in the browser's **IndexedDB on your device** (not the server) and survives updates →
  you stay paired. **Just relaunch the PWA to get the latest.**

(A new *device* still needs to be paired once — that device's IndexedDB doesn't have `K` yet.)

---

## Troubleshooting

- **Lost your board link (the `#k=…`)?** It isn't on the relay — the relay never had your key. It lives on the
  machine where you ran `andon hosted setup`: run `andon hosted pair` there to re-print the full link (or read
  `~/.andon/hosted.json` and join `relayUrl` + `/b/` + `boardId` + `#k=` + `key`). A device that was *never*
  paired can't recover the link from the relay — go back to that machine, get the link, and open it once on the
  new device.
- **"RE-PAIR — open your board link again on this device."** This device has no key (new device, cleared
  storage, or a home-screen launch where the `#k` was stripped). Re-open your full board link (with `#k=…`)
  once; it re-caches the key.
- **Board loads but everything is blank / won't decrypt.** You likely opened a link **without** the `#k=…`
  part (some tools truncate at `#`). Re-copy the *whole* link.
- **A stale card won't go away.** Cards clear when the agent posts `done`/`gone`, or after a 6h TTL. A
  finished session normally resolves itself; a dead/test session lingers until the TTL.
- **No phone push.** Push needs **HTTPS** (so the board over `127.0.0.1` won't push); on iPhone the board
  must be **added to the home screen** first; and you must tap **ENABLE ALERTS** and allow notifications.
- **Stop everything:** `andon hosted off` (stop forwarding) and, if you ran your own relay,
  `lsof -ti tcp:<port> | xargs kill`.
