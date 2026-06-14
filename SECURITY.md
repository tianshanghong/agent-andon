# Security Policy

## Threat model

Agent Andon is a **LAN status board**. The server is meant to run on your own
machine and be viewed from another device (an iPad) on the **same trusted Wi-Fi**.

- By default it binds `0.0.0.0` so the iPad can reach it, with **no authentication**.
- It exposes only **high-level status**: agent name, project folder basename, the
  current state, and a short (≤140-char) status line. It never serves code, full
  logs, secrets, or file contents.
- `POST /event` is **same-origin guarded** (cross-origin browser writes are
  rejected) and responses carry **no CORS headers**, so other websites you visit
  cannot read your board or forge events.
- Request bodies are capped at 64 KB.

**Do not run it on a public or untrusted network.** On a shared network, set a
token — `/state` and `/event` then require it (via `?token=` for the iPad URL, or
the `x-andon-token` header for hooks/CLI):

```bash
ANDON_TOKEN=$(openssl rand -hex 16) andon serve
```

## Reporting a vulnerability

Please open a GitHub security advisory (preferred) or a private issue. Include a
description, affected version, and a reproduction. We aim to respond within a few
days. Please don't file public issues for undisclosed vulnerabilities.
