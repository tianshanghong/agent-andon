---
title: "Andon entwickeln"
description: "Baue, betreibe und teste Agent Andon aus dem Quellcode — das Setup für Mitwirkende."
---

```bash
npm run build     # tsc -> dist/ (and marks the bin executable)
npm test          # node:test unit + integration tests
npm run dev       # tsc --watch
```

Architektur:
- `src/store.ts` — das reine, getestete Zustandsmodell.
- `src/server.ts` — die Self-Host-HTTP-Schicht; `src/commands/*` sind die CLI-Verben.
- `assets/dashboard.html` — das in sich geschlossene Board (eine Datei; Self-Host **und** Hosted liefern sie unverändert aus).
- `src/hosted/*` — das optionale inhaltsblinde Relay (sauber vom lokalen Produkt abgegrenzt); `src/sounds.ts` — die ausgelieferten Klänge.

Siehe [CONTRIBUTING.md](https://github.com/tianshanghong/agent-andon/blob/main/CONTRIBUTING.md) für den Ablauf von Beiträgen und
[deploy-relay.md](/de/docs/deploy-relay/) zum Betrieb des Relays.
