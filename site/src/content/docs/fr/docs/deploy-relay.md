---
title: "Déployer un relais Andon"
description: "Auto-hébergez le relais Agent Andon aveugle au contenu — le point d'entrée partagé qui ne transmet que du texte chiffré scellé, pour que votre équipe accède à ses tableaux de bord depuis n'importe où."
---

Ceci est le guide de l'opérateur : exécutez **un seul** relais Andon à **une seule URL HTTPS**, et autant de personnes
que vous le souhaitez le ciblent avec `andon hosted setup <your-url>` — chacune obtient son propre tableau de bord
isolé et aveugle au contenu sous cette même URL. (Côté utilisateurs : [hosted.md](/fr/docs/hosted/).)

Le relais **ne stocke que du texte chiffré** et ne peut lire le contenu de personne — mais c'est un service
multi-locataire exposé à Internet, lisez donc la section [capacité et abus](#6-capacité-et-abus-à-lire-avant-de-rendre-public)
avant de l'exposer largement.

---

## 1. Ce que vous exécutez

`andon relay` est un processus Node unique (bibliothèque standard uniquement, sans dépendances) qui :
- crée des tableaux de bord (`POST /provision`), ingère les événements scellés (`POST /i/<board>`), et sert des
  instantanés, un flux en direct SSE, le Web Push et le bundle du tableau de bord (`/b/<board>`, `/sw.js`, …) ;
- ne persiste **que** des jetons hachés + une paire de clés VAPID + les abonnements push dans un fichier ; **les
  événements scellés résident en RAM avec un TTL de 6 h** ; il ne stocke ni ne voit jamais de texte en clair.

Il écoute en **HTTP simple** — c'est vous qui placez du HTTPS devant (le push et le déchiffrement dans le navigateur exigent un contexte sécurisé).

---

## 2. L'exécuter

```bash
npm i -g agent-andon          # or: git clone … && npm i && npm run build, then use node dist/cli.js

# bind to localhost only and let a reverse proxy terminate TLS (recommended):
ANDON_RELAY_HOST=127.0.0.1 ANDON_RELAY_PORT=8788 ANDON_DATA_DIR=/var/lib/andon andon relay
```

| Réglage | Par défaut | Notes |
|---|---|---|
| `ANDON_RELAY_PORT` / `--port` | `8788` | le port HTTP |
| `ANDON_RELAY_HOST` | `0.0.0.0` | mettez `127.0.0.1` derrière un proxy |
| `ANDON_DATA_DIR` / `--data-dir` | `~/.andon` | **à conserver** — il contient `relay-tenants.json` (jetons hachés + abonnements) et `relay-vapid.json`. Le perdre, et chaque tableau de bord renvoie 404 + le push casse. |
| `ANDON_IDLE_TTL_SEC` | `900` (15 min) | les sessions terminées/inactives sont supprimées après ce délai suivant leur dernier événement (pour qu'une équipe démantelée ne laisse pas un mur de tuiles « prêt ») ; les sessions actives/« besoin de vous » utilisent plutôt le TTL strict de 6 h |

Il gère `SIGINT`/`SIGTERM` proprement (ferme les flux SSE pour que les redémarrages ne se bloquent pas).

### Ou avec Docker

Le relais est distribué sous forme d'image multi-arch sur `ghcr.io/tianshanghong/agent-andon`, construite de façon
reproductible à partir de ce code source par la CI (le même code que vérifie `andon verify` ; provenance + SBOM
jointes). Elle exécute le relais par défaut.

```bash
docker run -d --name andon-relay \
  -v andon_data:/data \                         # persist hashed tokens + VAPID + subscriptions
  -e ANDON_PUSH_SUBJECT=mailto:you@example.com \
  ghcr.io/tianshanghong/agent-andon:latest      # CMD defaults to `relay`
```

Ou un compose minimal (placez votre propre TLS / reverse proxy devant — n'exposez pas 8788 à Internet) :

```yaml
services:
  relay:
    image: ghcr.io/tianshanghong/agent-andon:latest
    restart: unless-stopped
    environment:
      ANDON_PUSH_SUBJECT: mailto:you@example.com   # a real contact for the VAPID JWT
    volumes:
      - andon_data:/data
    # route to it from your reverse proxy on port 8788; it needs OUTBOUND internet for Web Push
volumes:
  andon_data:
```

L'image est non-root, dispose d'un healthcheck `/version`, et conserve tout son état dans le volume `/data`
(`ANDON_DATA_DIR`) — sauvegardez ce volume.

---

## 3. Placer du HTTPS devant

Le relais parle en **HTTP simple sur `:8788`** — quelque chose en façade termine le TLS (les navigateurs exigent du
HTTPS pour le déchiffrement dans le navigateur et le push). Vous n'ajoutez rien de spécifique au relais ; vous faites
pointer ce que vous **exécutez déjà** vers le port 8788. Choisissez la ligne qui vous correspond :

| Votre configuration | Comment le TLS est géré |
|---|---|
| **Docker, avec déjà un reverse proxy / tunnel** *(le plus courant)* | routez `relay.example.com` → le `:8788` du conteneur depuis votre **Traefik / nginx-proxy / Cloudflare Tunnel** existant — exemples ci-dessous |
| **Un hôte nu, rien encore d'installé** | **Caddy** est la solution en une ligne (Let's Encrypt automatique) — voir ci-dessous |
| **Juste vous / votre équipe, sur Tailscale** | `tailscale serve --bg 8788` → `https://<machine>.<tailnet>.ts.net` (tailnet uniquement, pas de certificat public) |

**Docker derrière un reverse proxy / tunnel** — le conteneur reste en HTTP seul ; c'est la façade qui fait le TLS :

```yaml
# Traefik: labels on the relay service (Traefik — or, behind cloudflared, Cloudflare — supplies the cert)
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.relay.rule=Host(`relay.example.com`)"
  - "traefik.http.routers.relay.entrypoints=websecure"
  - "traefik.http.services.relay.loadbalancer.server.port=8788"
```
```
# Cloudflare Tunnel: no open ports — point an ingress hostname at the container
#   relay.example.com  ->  http://andon-relay:8788
```

**Hôte nu — Caddy** (le plus simple si vous n'avez rien d'autre ; Let's Encrypt automatique) :

```
# /etc/caddy/Caddyfile
relay.example.com {
    reverse_proxy 127.0.0.1:8788
}
```
`sudo systemctl reload caddy` → `https://relay.example.com`. (nginx + certbot fonctionne pareil : `proxy_pass http://127.0.0.1:8788;`.)

> ⚠️ **Proxy et limites de débit :** le relais limite le débit selon `req.socket.remoteAddress`. Derrière un proxy qui
> termine le TLS, c'est l'IP du **proxy**, si bien que les limites par IP s'effondrent en un seul seau pour tout le
> monde. Le relais n'analyse **pas** encore `X-Forwarded-For` (falsifiable si on lui fait naïvement confiance). En
> attendant, faites la limitation de débit par client **au niveau du proxy** (Traefik/Caddy/nginx/Cloudflare en sont
> tous capables) si vous l'exposez publiquement.

---

## 4. Le garder en marche (démarrage automatique)

### Linux — systemd
```ini
# /etc/systemd/system/andon-relay.service
[Unit]
Description=Agent Andon relay
After=network.target

[Service]
Environment=ANDON_RELAY_HOST=127.0.0.1
Environment=ANDON_RELAY_PORT=8788
Environment=ANDON_DATA_DIR=/var/lib/andon
ExecStart=/usr/bin/andon relay
Restart=on-failure
User=andon
StateDirectory=andon

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now andon-relay
```

### macOS — launchd
Adaptez `examples/com.agentandon.server.plist` (il est écrit pour `andon serve`) : remplacez les arguments du programme
par `relay`, définissez `ANDON_RELAY_HOST`/`ANDON_DATA_DIR` dans `EnvironmentVariables`, chargez avec `launchctl load`.

---

## 5. Vérifier qu'il sert du code honnête

Depuis n'importe quelle machine où la version correspondante d'`agent-andon` est installée :
```bash
andon verify https://relay.example.com
```
Elle compare le tableau de bord + le service worker que sert votre relais aux octets open source et signale
`✓ match` (ou une non-correspondance). Dites à vos utilisateurs qu'ils peuvent l'exécuter eux aussi — c'est tout l'intérêt du modèle de transparence.

---

## 6. Capacité et abus (à lire avant de rendre public)

Ce qui est **intégré** (MVP à processus unique) :

| Garde-fou | Valeur |
|---|---|
| Tableaux de bord par relais | `MAX_BOARDS = 500` (les tableaux de bord inactifs depuis >90 j sont évincés pour faire de la place) |
| Sessions par tableau de bord | `MAX_SESSIONS = 200` (balayées par TTL à 6 h) |
| Abonnements push par tableau de bord | `MAX_SUBS = 20` |
| Débit de provisionnement | 20 / IP / heure |
| Débit d'ingestion | 600 / min par tableau de bord+IP |
| Lecture (instantané/SSE) | 120 / min par tableau de bord+IP ; ≤8 SSE simultanés / IP, ≤20 / tableau de bord, ≤500 au total |
| Taille du corps | 64 Ko ; plus des délais d'attente anti-slowloris + `maxConnections` |
| Écritures du fichier des locataires | atomiques (tmp + renommage) ; un fichier corrompu est préservé, pas supprimé en silence |

Ce qui n'est **PAS** encore intégré — à ajouter avant d'exploiter un vrai service public :
- **Le provisionnement est ouvert** (n'importe qui peut créer un tableau de bord, avec pour seule limite le débit par
  IP). Pour un service public, ajoutez un verrou **code d'invitation / compte / preuve de travail**, ou placez une
  authentification devant `/provision`.
- **Processus unique** — `MAX_BOARDS=500`, événements en mémoire, une seule machine. Pour passer à l'échelle
  horizontalement, vous devez épingler un tableau de bord à une instance via un hachage de son identifiant (le
  round-robin casse silencieusement les SSE + les plafonds par tableau de bord).
- La gestion de **X-Forwarded-For** (voir la note sur le proxy ci-dessus).
- **`ANDON_DATA_DIR` durable / sauvegardé** — c'est un simple fichier JSON ; sauvegardez-le.

Aucun de ces points n'affecte la garantie aveugle au contenu (le relais ne détient jamais de clés ni de texte en
clair) ; ce sont des préoccupations de disponibilité/abus.

---

## 7. Mettre à jour le relais

Récupérez la nouvelle version, recompilez, redémarrez le service. Les PWA déjà installées **se mettent à jour
automatiquement** au prochain relancement (le tableau de bord + le service worker sont servis en `no-store` et le SW se
remplace lui-même) ; les utilisateurs **n'ont pas à se réappairer** — leur clé réside dans leur propre navigateur, pas
sur votre relais. Gardez les changements de format de transmission additifs (ajoutez des champs optionnels ; ne changez
pas la forme de l'AAD/du padding/de la charge utile push) pour qu'une ancienne PWA + un nouveau relais se dégrade
proprement jusqu'à ce que l'utilisateur relance. Après une mise à jour, l'empreinte du bundle servi change — relancez
`andon verify` et (côté exploitation) publiez la nouvelle empreinte pour que les utilisateurs puissent la confirmer.
