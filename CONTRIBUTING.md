# Contributing to Agent Andon

Thanks for helping! This is a small, dependency-free project — easy to hack on.

## Setup

```bash
npm install        # dev deps only (typescript, @types/node) — no runtime deps
npm run build      # tsc -> dist/
npm test           # unit + HTTP integration tests
```

## Requirements

- **Runtime:** Node.js ≥ 18 (the compiled `dist/` runs anywhere Node 18+ runs).
- **Tests:** Node.js ≥ 22.6 — `npm test` compiles the suite and runs it with the
  built-in `node --test` runner. Older Node can still build and run the app; only
  the test command needs 22.6+.

## Layout

| Path | What |
|---|---|
| `src/store.ts` | pure, tested state model (no I/O) |
| `src/server.ts` | HTTP layer: routes, body cap, token auth |
| `src/client.ts` | the single status poster used by all hooks/commands |
| `src/commands/*` | CLI verbs; `hook.ts`/`notify.ts` expose pure `map*Event` fns |
| `assets/dashboard.html` | the self-contained board (no build step) |
| `test/*.test.ts` | `node:test` — store unit, command mappers, HTTP integration |

## Conventions

- **Keep runtime dependencies at zero.** Node stdlib only. Dev-only deps are fine.
- **Hooks must never block or crash an agent** — `andon hook` / `andon notify`
  swallow all errors and exit 0. Don't add throwing code to those paths.
- **Render agent-supplied text with `textContent`** in the dashboard; use `innerHTML` only for static,
  code-controlled templates — never a session title/message/agent string (XSS safety on a shared board).
- Put new pure logic where it can be unit-tested without a network or stdin.

## Contributor License Agreement (CLA)

Agent Andon is licensed **AGPL-3.0-or-later**, and the maintainer also offers it under separate terms
(e.g. for an optional hosted/commercial service). To keep that — and the freedom to evolve the license
later — possible, contributions are accepted under a **Contributor License Agreement**: see
**[CLA.md](CLA.md)**.

**You keep the copyright to your contribution.** The CLA grants the maintainer a broad license,
including the right to license / re-license your contribution under AGPL-3.0-or-later, another
open-source license (e.g. Apache-2.0), and/or commercial terms.

**How to sign (one-time):** open your pull request, then comment **exactly**:

> I have read and agree to the CLA

A bot records your signature in [`signatures/version1/cla.json`](signatures/version1/cla.json) — part
of the repo's git history — and turns the PR's **CLA** status check green. You sign once; it covers
all your future contributions. PRs can't be merged until the CLA check passes. (The maintainer and
bots are exempt.)

## Before opening a PR

```bash
npm run build && npm test
```

Both must pass. Add a test for any behavior change.
