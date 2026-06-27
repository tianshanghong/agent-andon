---
title: "Turn an old iPad into a dashboard for your coding agents"
description: "Mount a spare iPad on the wall as an always-on, ambient status board for your Claude Code and Codex agents — one glance shows which one needs you. Here is the setup."
updated: 2026-06-27
howto:
  - name: "Run the board"
    text: "On your machine, run `andon serve` and note the board URL it prints."
  - name: "Open it on the iPad"
    text: "Open that URL in Safari on the iPad — same Wi-Fi, or via Tailscale / a relay you run, from anywhere."
  - name: "Keep the screen on"
    text: "Set Auto-Lock to Never and use Guided Access to lock the iPad to the board."
  - name: "Mount it"
    text: "Stand or wall-mount the iPad where you can see it at a glance."
---

That old iPad in a drawer makes a perfect **ambient status board**. Mounted on the wall running Agent Andon, it shows every Claude Code and Codex agent at a glance — green when done, amber when one needs you — so you never alt-tab just to check. There is no app to install; it is a web page.

## Run the board

On the machine where your agents run:

```
andon serve
```

It prints a board URL. (Haven't wired your agents yet? Run `andon install claude` / `andon install codex` first.)

## Open it on the iPad

Open that URL in **Safari** on the iPad:

- **Same Wi-Fi** — use the printed LAN URL directly.
- **From anywhere** — expose the board with Tailscale Serve, or pair a content-blind relay you run (`andon hosted setup <relay-url>`) and open that URL instead. See [Hosted Andon](/docs/hosted/).

Then **Share → Add to Home Screen** for a full-screen, chrome-free view.

## Keep it always-on

Two iOS settings turn a tablet into a wall display:

- **Settings → Display & Brightness → Auto-Lock → Never**, so the screen stays awake.
- **Guided Access** (Settings → Accessibility → Guided Access) locks the iPad to the board, so a passing tap can't wander off it.

## Mount it

A cheap stand on the desk, or a wall mount in your eyeline. Now a glance — not a context switch — tells you which agent needs you.

The board floats whichever session **needs you** to the top and stays quiet otherwise, so the iPad is calm until it isn't. See [Running Andon](/docs/running/) for the board server, and [Notifications](/docs/notifications/) if you also want desktop or phone alerts.
