# 🚦 Agent Andon

**A traffic-light status board for your AI coding agents.**

Stand an old iPad on your desk. Submit a task to Claude Code or Codex, then go do
something else. One glance at the iPad tells you whether your agent is **working,
needs you, done, or stuck** — no babysitting the terminal, no forgetting to come back.

![Agent Andon board: three tiles — NEEDS YOU, DONE, WORKING — with the screen edge glowing the most-urgent colour](docs/board.png)

> *Andon* (行灯) is the lean-manufacturing signal board: a light that tells the
> whole floor, at a glance, whether a line is running or needs a human. Same idea,
> for your agents.

- **Zero runtime dependencies** — pure Node.js standard library.
- **One command to wire up** — `andon install claude` edits your hooks for you (with a backup).
- **Multi-agent native** — every session is its own tile; the screen edge glows the most-urgent state.
- **Just an iPad + Safari** — no app, no hardware, no account.

<sub>中文用户：把闲置 iPad 立在桌边，变成 Claude Code / Codex 的"安灯"状态看板。提交任务后放心去干别的，一瞥就知道 agent 在跑 / 该你了 / 完成了 / 卡住了。</sub>

---

## How it works

```
Claude Code / Codex  ──(native hook)──▶  andon server (your Mac)  ◀──(polls 1×/s)──  iPad Safari
```

1. **Detect** — each tool's native hook mechanism reports state changes. No change to your workflow.
2. **Relay** — a tiny HTTP server on your Mac receives the events.
3. **Display** — the iPad opens the board and polls once a second. The whole border becomes
   the "tower light," readable from across the room; *needs-you* / *stuck* pulse and chime.

State priority (the border takes the most urgent one):
`stuck (red) > needs-you (amber) > done (green) > working (blue) > idle`.

---

## Install

```bash
npm install -g agent-andon      # or: npx agent-andon serve --demo
```

From source:

```bash
git clone <your-repo> agent-andon && cd agent-andon
npm install && npm run build
node dist/cli.js serve --demo
```

> Requires Node.js ≥ 18.

---

## Quickstart (60 seconds)

**1. Verify the board with fake data:**

```bash
andon serve --demo
```

It prints a `http://<your-mac-ip>:8787` URL. Open it on the iPad — you should see two
tiles cycling colors. Once it looks right, `Ctrl-C` and run for real:

```bash
andon serve
```

**2. Set up the iPad** (same Wi-Fi as the Mac):

- Safari → open the printed URL. **It's `http://`, not `https://`.**
- Tap **"Enable alerts"** to unlock the chime (Safari needs one tap for audio).
- Share → **Add to Home Screen** → launch from the icon for a full-screen, address-bar-free board.
- Belt-and-suspenders against sleep: **Settings → Display & Brightness → Auto-Lock → Never.**
  (The page also requests a Wake Lock.)

**3. Wire up your agents:**

```bash
andon install claude        # edits ~/.claude/settings.json (keeps a .andon-backup)
andon install codex         # edits ~/.codex/config.toml   (keeps a .andon-backup)
andon doctor                # confirm everything's connected; reprints the iPad URL
```

Restart your Claude Code session and it lights up the board automatically. That's it.

---

## Commands

| Command | What it does |
|---|---|
| `andon serve [--demo] [--port N] [--token T]` | Run the board server |
| `andon install claude` | Auto-wire Claude Code hooks (with backup) |
| `andon install codex` | Auto-wire the Codex notify hook (with backup) |
| `andon doctor` | Health check + what's wired + iPad URL |
| `andon post <state> <agent> [title] [msg]` | Push a status by hand |
| `andon hook` / `andon notify` | *(internal — invoked by the hooks)* |

`andon install --dry-run claude` prints the change without writing.

### Event → state mapping (Claude Code)

| Claude Code event | Board state | When |
|---|---|---|
| `UserPromptSubmit` | working (blue) | you just submitted a prompt |
| `Notification` | needs-you (amber, pulses) | waiting on permission / your input |
| `Stop` | done (green) | the turn finished |
| `StopFailure` | stuck (red, pulses) | the turn failed (newer Claude Code only) |
| `SessionEnd` | *removed* | session ended; tile disappears |

Multiple sessions each get their own tile (keyed by `session_id`).

### Codex

`andon install codex` adds the `notify` hook → you get the green **done** signal each turn.
For the blue **working** signal too, source the shipped wrapper from your `~/.zshrc`:

```bash
source /path/to/agent-andon/examples/codex-wrapper.sh
```

Now `codex` turns blue on launch, clears on exit, and goes green each turn.

> **Known Codex limits:** Codex doesn't push approval requests to `notify`, so it can't
> show amber "needs-you" — that prompt stays in the Codex terminal. The red "stuck"
> signal is the least reliable across both tools; don't read "not red" as "no error."

---

## Naming a tile

The default title is the project folder name. Override per-terminal:

```bash
ANDON_LABEL="backend refactor" claude
ANDON_LABEL="landing copy"     codex
```

---

## Run it in the background

```bash
# tmux
tmux new -s andon 'andon serve'

# or nohup
nohup andon serve >/tmp/agent-andon.log 2>&1 &

# or at login: see examples/com.agentandon.server.plist
```

---

## Security

By default the server binds `0.0.0.0` with **no authentication** — anyone on the LAN can
read and post status. Fine on a trusted home Wi-Fi; **don't run it on a public/untrusted
network.** For a shared network, set a token (export it everywhere the hooks run too):

```bash
ANDON_TOKEN=somesecret andon serve
```

With a token set, `/state` and `/event` require it. The hooks and CLI send it as an
`x-andon-token` header automatically (as long as `ANDON_TOKEN` is in their environment);
on the iPad, open the board with `?token=somesecret` and it carries the token through.
`/healthz` stays open so `andon doctor` always works.

The board only ever exposes high-level status (state, project name, a one-line message) —
never code or full logs. Event bodies are capped at 64 KB.

---

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `AGENT_STATUS_URL` | `http://127.0.0.1:8787` | server base URL the hooks post to |
| `ANDON_TOKEN` | *(none)* | shared token required by `/state` and `/event` when set |
| `ANDON_PORT` / `ANDON_HOST` | `8787` / `0.0.0.0` | server bind |
| `ANDON_LABEL` | folder name | tile title (per terminal) |
| `ANDON_SESSION` | — | per-launch session id (set by the codex wrapper) |

---

## Develop

```bash
npm run build     # tsc -> dist/
npm test          # node:test unit tests for the store (Node 22.6+)
npm run dev       # tsc --watch
```

Architecture: `src/store.ts` is the pure, tested state model; `src/server.ts` is the
HTTP layer; `src/commands/*` are the CLI verbs; `assets/dashboard.html` is the
self-contained board.

---

## Troubleshooting

- **iPad can't open the page** — same Wi-Fi? `http` not `https`? Mac firewall allowing
  incoming connections (System Settings → Network → Firewall)? IP copied correctly
  (it's printed at startup, and `andon doctor` reprints it)?
- **Claude hook does nothing** — run `claude --debug` once and watch for hook errors;
  re-run `andon install claude`; `andon doctor` to confirm.
- **Codex stays green, never blue** — that's expected without the wrapper (see Codex above).
- **A "working" tile is stuck** — a process likely died before sending its end event.
  It auto-clears after 6h; for Codex, `andon post gone codex` from that project dir clears it now.

---

## License

MIT
