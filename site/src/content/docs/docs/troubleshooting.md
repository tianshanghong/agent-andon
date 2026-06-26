---
title: "Troubleshooting & FAQ"
description: "Fixes for common Agent Andon issues — the board not updating, hooks not firing, stuck tiles, and missing desktop or phone alerts."
---

## Troubleshooting

- **The board device can't open the page** — same Wi-Fi? `http` not `https`? Your computer's firewall
  allowing incoming connections (on macOS: System Settings → Network → Firewall)? IP copied correctly
  (it's printed at startup, and `andon doctor` reprints it)?
- **Claude hook does nothing** — run `claude --debug` once and watch for hook errors;
  re-run `andon install claude`; `andon doctor` to confirm.
- **Codex tiles never appear / never change** — run `/hooks` inside Codex once to
  trust the hooks (Codex skips untrusted hooks); `andon doctor` confirms wiring.
- **A "working" tile is stuck** — a process likely died before sending its end event.
  It auto-clears after 6h; for Codex, `andon post gone codex` from that project dir clears it now.
- **No chime on the board** — tap **Enable alerts** once (browsers mute audio until you do); on a
  phone, the board must be over **HTTPS** for push (see [running.md](/docs/running/)).

## FAQ

**How do I get notified when Claude Code finishes or needs approval?**
Run `andon serve` (desktop alerts are on by default) and `andon install claude`. You get a desktop
banner the instant a session needs you or finishes, plus the live board on any device.

**Can I monitor multiple Claude Code / Codex sessions at once?**
Yes — that's the point. Every session is its own row, and whatever needs you floats to the top.

**Does it work with OpenAI Codex?**
Yes. `andon install codex` wires Codex's lifecycle hooks (run `/hooks` once to trust them).

**Do I actually need an iPad?**
No. The board is a plain web page — open it on any phone, tablet, or browser. A spare iPad just
makes a nice always-on wall display. You also get desktop banners and a menu-bar summary.

**Is my code or data sent anywhere?**
No — by default nothing about your agents leaves your machine. Andon is fully self-hosted: no account, no
telemetry, no analytics, no "phone home." It only ever holds high-level status (state, project name, a
one-line message) — never your code, logs, or secrets.

Two honest caveats: (1) the board loads its web fonts from Google Fonts unless you self-host them — that
request carries no agent data, just your browser's normal font fetch. (2) Optional features (phone push,
and the hosted relay) are **strictly opt-in** and each spells out exactly what leaves your machine
— the hosted relay is designed so even *it* can't read your agents' messages. They never change this
local-first default.
