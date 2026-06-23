# Configuration & security

Environment variables, token auth, and the network/security model for the self-hosted board.

## Security

By default the server binds `0.0.0.0` with **no authentication** — anyone on the LAN can
read and post status. Fine on a trusted home Wi-Fi; **don't run it on a public/untrusted
network.** For a shared network, set a token (export it everywhere the hooks run too):

```bash
ANDON_TOKEN=somesecret andon serve
```

With a token set, `/state` and `/event` require it. The hooks and CLI send it as an
`x-andon-token` header automatically (as long as `ANDON_TOKEN` is in their environment);
on the board device, open it with `?token=somesecret` and it carries the token through.
`/healthz` stays open so `andon doctor` always works.

The board only ever exposes high-level status (state, project name, a one-line message) —
never code or full logs. Event bodies are capped at 64 KB.

> Exposing the board beyond your LAN? Don't port-forward it — use the HTTPS paths in
> [running.md](running.md) (Tailscale Serve) or a [relay](deploy-relay.md).

## Environment variables

| Env var | Default | Meaning |
|---|---|---|
| `AGENT_STATUS_URL` | `http://127.0.0.1:8787` | server base URL the hooks post to |
| `ANDON_TOKEN` | *(none)* | shared token required by `/state` and `/event` when set |
| `ANDON_PORT` / `ANDON_HOST` | `8787` / `0.0.0.0` | server bind |
| `ANDON_LABEL` | folder name | tile title (per terminal) |
| `ANDON_SESSION` | — | override a tile's session id (e.g. for a background job) |
| `ANDON_IDLE_TTL_SEC` | `900` (15 min) | how long a finished/idle tile lingers before it's auto-removed, so exited sub-agents/teammates don't pile up (set it ≥ the 6h hard TTL, `21600`, to disable early age-out) |

(Relay-specific env vars — `ANDON_RELAY_PORT`, `ANDON_DATA_DIR`, `ANDON_PUSH_SUBJECT`, … — are in
[deploy-relay.md](deploy-relay.md).)
