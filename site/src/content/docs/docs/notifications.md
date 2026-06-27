---
title: "Claude Code & Codex notifications: desktop alerts & menu bar"
description: "Set up desktop alerts and the menu-bar indicator for your Claude Code and Codex agents, so you are pinged the moment one needs you, finishes, or gets stuck."
---

Andon's whole job is to **grab your attention at the right moment** — when an
agent needs you or gets blocked — and otherwise stay quiet. The board is the
universal channel (works on any device); these add more, each degrading
gracefully across macOS / Linux / Windows.

## Native desktop alerts

A banner on the machine running the server, **on by default**. Loud for the states that need you,
quiet for completion:

- **needs-you (amber)** / **stuck (red)** → banner + sound (immediate).
- **done (green)** → one *quiet* banner (no sound), debounced 4s so a transient
  green never fires a false "ready".

```bash
andon serve                 # alerts on by default
andon serve --say           # also speak needs-you / stuck aloud
andon serve --no-notify     # turn alerts off
```

Uses `osascript`/`say` (macOS), `notify-send`/`spd-say` (Linux), PowerShell
toast/`System.Speech` (Windows). Missing tool → silently skipped. (Auto-off
under `--demo` so the cycling fake agents don't spam you.) Alerts are
**throttled** (per-session cooldown + a global token bucket) so a busy — or
malicious — LAN client posting to `/event` can't drive a process-spawn flood.

## Menu / status bar

A one-glance summary without a separate screen:

```bash
curl -s http://127.0.0.1:8787/menubar     # plain-text summary endpoint
```

Wire it to SwiftBar/xbar (macOS) or Waybar/polybar (Linux); see
`examples/andon-menubar.5s.sh`.

## Fewer interruptions? Configure approvals yourself

Andon **never touches your permission/approval settings** — that's yours to own.
If amber "needs you" fires more than you'd like, pre-approve safe operations in
your agent's own config (Andon will then only light up for the rest):

- **Claude Code** — add read-only patterns to `permissions.allow` in
  `~/.claude/settings.json`, e.g. `"Read"`, `"Bash(git status:*)"`,
  `"Bash(npm test:*)"`. Your `deny`/`ask` rules always take precedence, and the
  Bash matcher is shell-operator-aware (so `Bash(git status:*)` won't approve
  `git status && rm -rf`). See `/permissions`.
- **Codex** — set `approval_policy` (e.g. `"untrusted"` auto-runs trusted
  read-only commands) and/or `sandbox_mode` in `~/.codex/config.toml`.

Keeping this in *your* hands means Andon can never weaken your safety rules —
and the board stays a faithful mirror of when you're genuinely needed.
