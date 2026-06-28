---
title: "Configuration et sécurité"
description: "Configurez Agent Andon — ports, jetons d'authentification, expiration des tuiles inactives (TTL) et le modèle de sécurité du serveur de tableau de bord local et du relais."
---

Variables d'environnement, authentification par jeton, et le modèle réseau/sécurité du tableau de bord auto-hébergé.

## Sécurité

Par défaut, le serveur écoute sur `0.0.0.0` **sans authentification** — n'importe qui sur le réseau local
peut lire et publier l'état. Très bien sur un Wi-Fi domestique de confiance ; **ne l'exécutez pas sur un
réseau public/non fiable.** Sur un réseau partagé, définissez un jeton (exportez-le aussi partout où s'exécutent les hooks) :

```bash
ANDON_TOKEN=somesecret andon serve
```

Lorsqu'un jeton est défini, `/state` et `/event` l'exigent. Les hooks et le CLI l'envoient automatiquement
dans un en-tête `x-andon-token` (tant que `ANDON_TOKEN` est présent dans leur environnement) ; sur l'appareil
qui affiche le tableau de bord, ouvrez-le avec `?token=somesecret` et le jeton est transmis de bout en bout.
`/healthz` reste ouvert pour que `andon doctor` fonctionne toujours.

Le tableau de bord n'expose jamais que l'état de haut niveau (état, nom du projet, un message d'une ligne) —
jamais le code ni les journaux complets. Le corps des événements est plafonné à 64 Ko.

> Vous exposez le tableau de bord au-delà de votre réseau local ? N'utilisez pas la redirection de port — passez par les voies HTTPS de
> [running.md](/fr/docs/running/) (Tailscale Serve) ou un [relais](/fr/docs/deploy-relay/).

## Variables d'environnement

| Variable d'environnement | Valeur par défaut | Signification |
|---|---|---|
| `AGENT_STATUS_URL` | `http://127.0.0.1:8787` | URL de base du serveur vers laquelle les hooks publient |
| `ANDON_TOKEN` | *(aucun)* | jeton partagé exigé par `/state` et `/event` lorsqu'il est défini |
| `ANDON_PORT` / `ANDON_HOST` | `8787` / `0.0.0.0` | adresse d'écoute du serveur |
| `ANDON_LABEL` | nom du dossier | titre de la tuile (par terminal) |
| `ANDON_SESSION` | — | remplacer l'identifiant de session d'une tuile (par ex. pour une tâche en arrière-plan) |
| `ANDON_IDLE_TTL_SEC` | `900` (15 min) | durée pendant laquelle une tuile terminée/inactive persiste avant son retrait automatique, pour éviter que les sous-agents/coéquipiers terminés ne s'accumulent. Les tuiles actives et « besoin de vous » utilisent plutôt le TTL strict de 6 h. |

(Les variables d'environnement propres au relais — `ANDON_RELAY_PORT`, `ANDON_DATA_DIR`, `ANDON_PUSH_SUBJECT`, … — se trouvent dans
[deploy-relay.md](/fr/docs/deploy-relay/).)
