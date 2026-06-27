---
title: "Claude Code Stop-hook notification example"
description: "A copy-pasteable Claude Code Stop hook that fires a desktop notification when the agent hands the turn back — plus what the Stop event really means, and a fuller setup with Agent Andon."
updated: 2026-06-27
howto:
  - name: "Open your Claude Code settings"
    text: "Edit ~/.claude/settings.json (create it if it does not exist)."
  - name: "Add a Stop hook"
    text: "Under hooks.Stop, add a command hook that runs your notification command."
  - name: "Save and test"
    text: "Save the file and end a Claude Code turn — the notification fires."
---

Claude Code fires a **`Stop`** hook every time the agent finishes its turn and hands control back to you. That is the perfect moment to get pinged — instead of alt-tabbing back to a terminal that went quiet ten minutes ago. Here is a minimal Stop hook you can paste in, what the event actually means, and when to reach for something fuller.

## The minimal Stop hook

Claude Code reads hooks from **`~/.claude/settings.json`**. Add a `Stop` hook that runs a notification command:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code handed the turn back\" with title \"Agent done\"'"
          }
        ]
      }
    ]
  }
}
```

Save it, finish a turn in Claude Code, and a desktop notification fires. On Linux, swap the command for `notify-send "Agent done" "Claude Code handed the turn back"`.

## What `Stop` actually means

`Stop` fires when Claude **hands the turn back to you** — it is *not* a promise the whole task is finished; the agent may just be waiting for your next instruction. Two related events are worth knowing:

- **`Notification`** — Claude is waiting on a permission or your input *mid-task* (the "needs you" moment). Often the one you most want to catch.
- **`StopFailure`** — the turn ended in an error (newer Claude Code).

A one-line `Stop` hook catches the first case but misses these, and it only pings the one machine it runs on.

## A Stop hook that does more

If you run more than one agent, or want the alert on your phone, the raw hook gets fiddly fast — one notifier per machine, nothing for `Notification`, no way to see several sessions at once.

**Agent Andon** wires all of it for you:

```
npm i -g agent-andon
andon install claude
```

That installs the `Stop`, `Notification`, and `StopFailure` hooks together and maps them to a **board** you can open on any screen — working, needs-you, done, stuck — with desktop banners and optional phone push. `andon install --dry-run claude` prints the resulting `settings.json` without writing it; `andon uninstall claude` removes only what it added.

See [Commands & events](/docs/commands/) for the full event→state mapping, and [Notifications](/docs/notifications/) for the alert channels.
