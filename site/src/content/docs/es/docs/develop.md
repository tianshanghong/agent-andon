---
title: "Desarrollar Andon"
description: "Compila, ejecuta y prueba Agent Andon desde el código fuente: la configuración para contribuir."
---

```bash
npm run build     # tsc -> dist/ (and marks the bin executable)
npm test          # node:test unit + integration tests
npm run dev       # tsc --watch
```

Arquitectura:
- `src/store.ts` — el modelo de estado puro y probado.
- `src/server.ts` — la capa HTTP de autoalojamiento; `src/commands/*` son los verbos del CLI.
- `assets/dashboard.html` — el tablero autónomo (un solo archivo; tanto el autoalojamiento **como** el modo alojado lo sirven tal cual).
- `src/hosted/*` — el relay opcional ciego al contenido (con una frontera limpia respecto al producto local); `src/sounds.ts` — los sonidos que se sirven.

Consulta [CONTRIBUTING.md](https://github.com/tianshanghong/agent-andon/blob/main/CONTRIBUTING.md) para el proceso de contribución y
[deploy-relay.md](/es/docs/deploy-relay/) para ejecutar el relay.
