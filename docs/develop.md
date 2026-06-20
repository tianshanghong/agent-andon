# Developing Andon

```bash
npm run build     # tsc -> dist/ (and marks the bin executable)
npm test          # node:test unit + integration tests
npm run dev       # tsc --watch
```

Architecture:
- `src/store.ts` — the pure, tested state model.
- `src/server.ts` — the self-host HTTP layer; `src/commands/*` are the CLI verbs.
- `assets/dashboard.html` — the self-contained board (one file; self-host **and** hosted serve it verbatim).
- `src/hosted/*` — the optional zero-knowledge relay (clean boundary from the local product); `src/sounds.ts` — the served chimes.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the contribution process, and
[deploy-relay.md](deploy-relay.md) for running the relay.
