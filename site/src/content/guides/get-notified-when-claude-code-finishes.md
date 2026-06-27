---
title: "How to get notified when Claude Code finishes or needs you"
description: "Claude Code and Codex can run for minutes, then finish or stall waiting on you — silently. Here's how to get a desktop or phone alert the moment an agent needs you, with Agent Andon."
updated: 2026-06-27
howto:
  - name: "Install Agent Andon"
    text: "Install the CLI with `npm i -g agent-andon`. It is zero-dependency and runs entirely on your machine."
  - name: "Wire your agent's hooks"
    text: "Run `andon install claude` (and `andon install codex`) to add lifecycle hooks that report each session's state. No workflow change."
  - name: "Open the board"
    text: "Run `andon serve` and open the board in any browser, phone, or spare iPad to see every session at a glance."
  - name: "Turn on alerts"
    text: "Desktop banners are on by default; wire up the menu-bar summary if you want it, and connect a content-blind relay for phone push from anywhere."
---

You start Claude Code on a task, tab away to something else, and then… wait. Is it done? Is it stuck on a prompt waiting for your "yes"? You alt-tab back to check and find it finished four minutes ago — or worse, stalled the whole time. Multiply that by several agents and the day turns into babysitting terminals.

**Agent Andon** fixes this: it watches your coding agents and pings you the moment one **finishes**, **needs your input**, or **gets stuck** — on a board you can open on any screen, with optional desktop and phone alerts.

## Install Agent Andon

```
npm i -g agent-andon
```

It is a zero-dependency CLI that runs locally — no account, no telemetry.

## Wire your agent's hooks

Andon reads each tool's **native lifecycle hooks** — it does not wrap or proxy your agent.

```
andon install claude
```

That is it: Claude Code now reports its state changes (working → needs you → done → stuck) with no change to how you work. Running OpenAI Codex too? `andon install codex` does the same.

## What each state means

- **Working** — the agent is busy; nothing needed from you.
- **Needs you** — it is waiting on a prompt, a permission, or a decision. This is the one worth catching fast.
- **Done** — the agent finished its turn and handed back to you.
- **Stuck** — it errored or stalled.

## Open the board on any screen

```
andon serve
```

Open the printed URL in any browser, on your phone, or on a wall-mounted iPad. Every session shows as a row, and whichever **needs you** floats to the top — so a glance tells you where to look.

## Get desktop and phone alerts

**Desktop banners** are on by default. A **menu-bar summary** is one wire-up away — Andon serves a plain-text status at `/menubar` that you point SwiftBar, xbar, or Waybar at.

To get **phone push from anywhere** — even away from your machine — connect a **content-blind relay**, which forwards alerts without being able to read your project names or messages. Point Andon at one with:

```
andon hosted setup <relay-url>
```

You can run your own relay, or use the managed one (launching soon). See [Notifications](/docs/notifications/) for the desktop and menu-bar details, and [Hosted Andon](/docs/hosted/) for the relay.

## Works with Codex too

Everything above applies to **OpenAI Codex** as well — `andon install codex`, same board, same alerts. Watch Claude Code and Codex sessions side by side.

---

That is the whole loop: install, wire the hook, open the board, turn on alerts. An agent finishing or needing you becomes a notification — not something you discover ten minutes late.
