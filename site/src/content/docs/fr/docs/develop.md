---
title: "Développer Andon"
description: "Compilez, exécutez et testez Agent Andon depuis les sources — la configuration pour les contributeurs."
---

```bash
npm run build     # tsc -> dist/ (and marks the bin executable)
npm test          # node:test unit + integration tests
npm run dev       # tsc --watch
```

Architecture :
- `src/store.ts` — le modèle d'état pur et testé.
- `src/server.ts` — la couche HTTP d'auto-hébergement ; `src/commands/*` sont les verbes de la CLI.
- `assets/dashboard.html` — le tableau de bord autonome (un seul fichier ; l'auto-hébergement **et** le mode hébergé le servent tel quel).
- `src/hosted/*` — le relais optionnel aveugle au contenu (frontière nette avec le produit local) ; `src/sounds.ts` — les carillons servis.

Consultez [CONTRIBUTING.md](https://github.com/tianshanghong/agent-andon/blob/main/CONTRIBUTING.md) pour le processus de contribution, et
[deploy-relay.md](/docs/deploy-relay/) pour exécuter le relais.
