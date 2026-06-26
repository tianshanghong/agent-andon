---
title: "Commands & event mapping"
description: "Every Agent Andon CLI command and how Claude Code / Codex lifecycle events map to board states — install, serve, doctor, hosted, and more."
---

The full CLI reference, how agent events become board states, background-task counting, Codex
specifics, and naming tiles. (Quickstart + the common commands are in the [README](https://github.com/tianshanghong/agent-andon/blob/main/README.md).)

## Commands

| Command | What it does |
|---|---|
| `andon serve [--demo] [--port N] [--token T] [--no-notify] [--say]` | Run the board server; desktop alerts on by default (`--no-notify` off, `--say` adds speech) |
| `andon install claude` | Wire Claude Code status hooks (timestamped backup) |
| `andon install codex` | Wire Codex lifecycle hooks (run `/hooks` to trust) |
| `andon uninstall <claude\|codex>` | Remove only what Andon added; leaves the rest of your config intact |
| `andon doctor` | Health check + what's wired + the board URL |
| `andon post <state> <agent> [title] [msg]` | Push a status by hand |
| `andon sub <+n\|-n> [id]` | Bump a process's background-task count |
| `andon relay` / `andon hosted` / `andon verify` | The optional hosted relay — see [hosted.md](/docs/hosted/) |
| `andon hook` / `andon codexhook` | *(internal — invoked by the hooks)* |

`andon install --dry-run claude` prints the change without writing.

## Event → state mapping (Claude Code)

| Claude Code event | Board state | When |
|---|---|---|
| `SessionStart` | idle (slate) | session launched — the tile appears right away |
| `UserPromptSubmit` | working (blue) | you just submitted a prompt |
| `PostToolUse` | working (blue) | a tool just ran — clears amber the moment you approve |
| `Notification` | needs-you (amber, pulses) | waiting on permission / your input |
| `Stop` | **ready** (green) | turn handed back to you — your move, *not* "all done" |
| `StopFailure` | stuck (red, pulses) | the turn failed (newer Claude Code only) |
| `SessionEnd` | *removed* | session ended; tile disappears |

Multiple sessions each get their own tile (keyed by `session_id`). One process =
one tile; its sub-agents roll up into it rather than spawning their own. A session
that was *already running* before the board started appears on its next event
(prompt, tool, turn end) — Andon stays out of your statusLine entirely.

## Background work: keep a card honest past "done"

`Stop` means the foreground agent handed the turn back — it does **not** mean
background work finished. If a process kicks off background workflows, have them
report so the card stays "running" (blue) until they drain instead of falsely
going green:

```bash
export ANDON_SESSION="<this process's tile id>"   # the session_id of the parent tile
andon sub +1     # a background task started
#   ...do the work...
andon sub -1     # it finished
```

While the count is `> 0` the card reads `WORKING ⋯N background` and only turns
green once every task has reported `-1`.

## Codex

Modern Codex (≈ 0.117+) has a full Claude-compatible **hooks** system, so Andon
gets the same lifecycle as Claude Code — including amber **needs-you**:

```bash
andon install codex      # wires lifecycle hooks → ~/.codex/hooks.json
```

| Codex hook event | Board state |
|---|---|
| `SessionStart` | idle (tile appears at launch) |
| `UserPromptSubmit` / `PostToolUse` | working (blue) |
| `PermissionRequest` | **needs-you (amber)** |
| `Stop` | ready (green) |
| `SessionEnd` | *removed* |

> **One extra step Codex requires:** new hooks must be **trusted** before they
> run — run `/hooks` inside Codex once (or launch `codex
> --dangerously-bypass-hook-trust`). `andon uninstall codex` cleanly removes the
> hooks again, with a timestamped backup.

Residual caveat: red "stuck" stays staleness-based (no dedicated failed-turn
hook). (Already-running sessions appear on their next event, same as Claude.)

## Naming a tile

The default title is the project folder name. Override per-terminal:

```bash
ANDON_LABEL="backend refactor" claude
ANDON_LABEL="landing copy"     codex
```
