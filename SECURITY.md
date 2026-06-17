# Security Policy

## What Andon is

Agent Andon is a **local-first status board**. It runs on your own machine and renders only high-level
agent status — agent name, project-folder basename, a coarse state, and a short status line. Andon never
reads your code, logs, or files itself — it only relays the one line of status your hook posts (which, by
design, is a status message, not file contents). Request bodies are capped at 64 KB.

## Deployment modes & what to expect

**1. Local (default).** `andon serve` binds `0.0.0.0` so another device on your **trusted Wi-Fi** (an
iPad) can reach it. There is **no authentication by default**, so treat it like any LAN service:

- `POST /event` is **same-origin guarded** (cross-origin browser writes are rejected) and responses carry
  **no CORS headers**, so other sites you visit can't read your board or forge events.
- Request bodies are capped at 64 KB; the session count is capped to bound memory.
- **Don't run it on a public or untrusted network without a token.** On a shared network, set one — then
  `/state` and `/event` require it (`?token=` in the iPad URL, or the `x-andon-token` header for hooks/CLI):

  ```bash
  ANDON_TOKEN=$(openssl rand -hex 16) andon serve
  ```

**2. Self-host + remote access.** To reach the board from another floor or building, put it behind a
private network you control — e.g. **Tailscale** — rather than exposing the port to the public internet.
Tailscale also provides a trusted HTTPS name, which is what an in-browser push (PWA) feature needs.

**3. Hosted (roadmap, optional — not in this release).** If/when an official hosted relay ships, it is
designed to be **zero-knowledge**: your hook encrypts the sensitive fields (title, message, tallies) with
a key the server never holds, so the relay can route events and light the board **without reading your
agents' messages**. It would be strictly opt-in and never the default. **Nothing in this repository sends
data to any such service today.**

## Reporting a vulnerability

Please open a **GitHub security advisory** for this repository (preferred), or email **me@wwang.tech**.
Include a description, the affected version, and a reproduction. Please don't file public issues for
undisclosed vulnerabilities. Expect an initial response within a few days.
