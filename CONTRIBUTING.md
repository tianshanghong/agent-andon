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

## Licensing of contributions (DCO)

Agent Andon is licensed **AGPL-3.0-or-later**, and the maintainer also offers it under separate
commercial terms (e.g. for an optional hosted service). To keep both possible, contributions are accepted
under the **[Developer Certificate of Origin](https://developercertificate.org/)**:

- **Sign off every commit** — add a `Signed-off-by: Your Name <you@example.com>` line with `git commit -s`.
  That certifies you wrote the change (or have the right to submit it) under the project's license.
- By contributing, you grant the maintainer (wwang) a perpetual, irrevocable right to license your
  contribution under **AGPL-3.0-or-later and other terms (including proprietary/commercial)**, so an
  official hosted/commercial build remains possible. **You keep the copyright to your contribution.**

There's no separate CLA to sign — the `Signed-off-by` line plus this section is the agreement.

## Before opening a PR

```bash
npm run build && npm test
```

Both must pass. Add a test for any behavior change.
