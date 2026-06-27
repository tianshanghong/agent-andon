---
title: "Andon hébergé : le tableau de bord depuis n'importe où"
description: "Associez Agent Andon au relais hébergé aveugle au contenu pour accéder à votre tableau de bord et recevoir le push sur votre téléphone depuis l'extérieur de votre réseau — scellé de bout en bout."
---

Andon est **local d'abord et gratuit à auto-héberger pour toujours** — c'est le mode par défaut, et il ne partage rien.
Ce guide décrit le mode hébergé **optionnel et volontaire** : consultez votre tableau de bord (et recevez des alertes sur votre téléphone) depuis n'importe où,
via un relais qui **ne route que du texte chiffré et ne peut pas lire le contenu de vos agents**.

> Vous déployez un relais à partager avec d'autres ? Voir **[deploy-relay.md](/fr/docs/deploy-relay/)**.

---

## Le principe (en une minute)

- Chaque événement d'état est **chiffré de bout en bout sur votre machine** avant de partir.
- Un **relais** stocke et transmet ce **texte chiffré** et ne possède jamais la clé — il ne voit qu'un routage grossier
  (quel tableau de bord, un identifiant de session haché, working/waiting/done/error/idle, le minutage).
- Vous ouvrez le **même tableau de bord** qu'en auto-hébergement ; le déchiffrement se fait dans **votre navigateur**, avec une clé transportée dans le
  `#fragment` du lien (jamais envoyée au serveur). Le service worker déchiffre les push du téléphone de la même façon.
- **Aucun `andon serve` local nécessaire** — le chemin d'envoi normal du hook transmet aussi une copie scellée.

Il y a deux façons de l'utiliser :

| | Qui exécute le relais | Qui peut l'utiliser |
|---|---|---|
| **A. Votre propre relais** | vous (`andon relay` sur une machine que vous contrôlez) | vous seul |
| **B. Un relais partagé** | un opérateur, à une seule URL HTTPS publique | de nombreuses personnes — chacune obtient son propre tableau de bord isolé sous la *même* URL |

Les deux reposent sur le même code ; B n'est que A exposé publiquement. Voir [Multi-locataire](#multi-locataire--une-url-plusieurs-tableaux-de-bord).

---

## Démarrage rapide

```bash
# 1) Run a relay (yours), or skip this and use a shared relay URL someone gives you
andon relay                            # listens on :8788 (see deploy-relay.md for HTTPS/public use)

# 2) Opt in — generates a key that NEVER leaves your machine, prints your board link
andon hosted setup http://127.0.0.1:8788
#   → prints:  http://127.0.0.1:8788/b/<board-id>#k=<key>

# 3) Open that link in a browser. Done — your agents now show up there.
```

`andon hosted setup` commence par vous montrer exactement ce que le relais peut et ne peut pas voir, et demande `[y/N]`
(par défaut **Non**). Une fois activé, chaque statut de Claude Code / Codex est aussi transmis (scellé) au relais.

**Traitez le lien du tableau de bord comme un mot de passe** — la partie `#k=…` *est* votre clé de déchiffrement. Ne la partagez pas
en capture d'écran dans une conversation ; enregistrez-la dans un gestionnaire de mots de passe. (Ou scannez le QR affiché dans le terminal pour appairer sans copier-coller.)

---

## Ouvrir le tableau de bord

- **Sur le même ordinateur :** ouvrez `http://127.0.0.1:<port>/b/<board-id>#k=<key>`. `localhost` / `127.0.0.1` est un
  contexte sécurisé, donc le déchiffrement dans le navigateur fonctionne en HTTP simple.
- **Sur votre téléphone / un autre appareil :** le relais doit être accessible en **HTTPS** (les navigateurs exigent un contexte
  sécurisé pour le déchiffrement et le push). Deux méthodes simples :
  - **Tailscale** (vous l'avez déjà) : `tailscale serve --bg <relay-port>` → vous donne une
    adresse `https://<machine>.<tailnet>.ts.net`. Ouvrez `https://…ts.net/b/<board-id>#k=<key>` sur le téléphone.
  - **Un vrai domaine + certificat** (pour un relais partagé) — voir [deploy-relay.md](/fr/docs/deploy-relay/).

### Alertes sur le téléphone (PWA)
1. Ouvrez le lien de votre tableau de bord sur le téléphone en **HTTPS**.
2. **iPhone :** Partager → **Ajouter à l'écran d'accueil** (iOS n'autorise le Web Push que depuis une PWA installée), puis ouvrez-la
   depuis l'écran d'accueil. **Android/Chrome :** fonctionne depuis un onglet normal ; « Ajouter à l'écran d'accueil » optionnel.
3. Appuyez sur **ACTIVER LES ALERTES** → autorisez les notifications. Vous recevrez une vibration lorsqu'un agent a **besoin de vous** pour la première fois ou se retrouve
   **bloqué** — même avec le tableau de bord fermé et le téléphone verrouillé. Le texte de la notification est déchiffré **sur votre
   téléphone** ; le relais ne le voit jamais.

---

## Gestion

```bash
andon hosted status                    # is hosted on? which relay + board id
andon hosted pair                      # re-print your board link — add a device, or recover a lost link
andon hosted off                       # stop forwarding — your agents go back to local-only
andon verify  <relay-url>              # check the relay serves the exact open-source code (see below)
```

Vous pouvez basculer librement dans un sens ou dans l'autre ; `off` se contente de supprimer la configuration locale (`~/.andon/hosted.json`).

---

## Ce que le relais peut / ne peut pas voir

| | |
|---|---|
| ❌ **Ne peut pas lire** | vos prompts, votre code, les noms de projets, les titres, les messages, les décomptes d'activité |
| • **Peut voir** | que vous êtes actif et à peu près à quel moment (minutage par événement), combien de sessions, votre IP, la tranche de taille du texte chiffré |
| • **Peut faire** | retarder/retenir un événement, ou réafficher l'une de vos **véritables anciennes** notifications push (un « besoin de vous » périmé pour une session déjà résolue) — mais il **ne peut pas inventer de nouveau contenu, ni le lire** |

L'auto-hébergement ne partage **rien** et reste le mode par défaut. Le mode hébergé représente le compromis entre commodité et métadonnées, présenté sans détour.

---

## « Vérifiable, pas seulement sur parole » (transparence)

Comme le code d'un tableau de bord web est *servi par le relais*, la garantie hermétique « même en cas de compromission, illisible » ne
vaut que pour une application installée. Pour le **tableau de bord web**, l'affirmation honnête est **« nous ne pouvons pas *secrètement* vous installer de porte dérobée »** :

```bash
andon verify https://relay.example.com
```

Cette commande récupère le tableau de bord et le service worker que le relais sert réellement, en calcule les empreintes, et les compare aux octets de
**votre propre** copie open source. Une **correspondance** signifie que le relais sert exactement le code audité — aucun vol de clé caché. Une **non-correspondance persistante à la même version** signifie qu'il sert du code modifié ; ne lui confiez pas votre clé. Le relais déclare aussi ses empreintes via `GET /version`.

---

## Multi-locataire — une URL, plusieurs tableaux de bord

Un relais est **multi-locataire par conception** : un seul processus sert de nombreux tableaux de bord, et le point d'entrée est **une
URL unique**, pas un sous-domaine par utilisateur.

```
            https://relay.example.com        (one URL = the shared entry)
            ├── /b/<A's board-id>#k=<A's key>     only A's key decrypts it
            ├── /b/<B's board-id>#k=<B's key>     only B's key decrypts it
            └── /b/<C's board-id>#k=<C's key>     only C's key decrypts it
            the relay holds only ciphertext for all of them
```

Tout le monde exécute `andon hosted setup https://relay.example.com` ; chacun obtient un identifiant de tableau de bord **imprévisible de 256 bits**
sous cette URL unique. L'isolation est à deux niveaux et testée :
- **Personne ne lit personne :** clé `K` par tableau de bord, le relais ne stocke que du texte chiffré (aveugle au contenu).
- **Personne n'écrit chez personne :** l'identifiant de tableau de bord est la capacité de lecture ; l'écriture nécessite le jeton d'ingestion propre à ce tableau de bord
  (le jeton de A sur le tableau de B → `401`).

---

## Mises à jour (PWA déjà installées)

**Automatiques — pas d'app store, pas de réappairage.**
- Le HTML du tableau de bord est servi en `no-store` et rien ne le met en cache, donc chaque lancement charge la dernière version.
- Le service worker se met à jour automatiquement (le navigateur revérifie `/sw.js` au relancement, à la navigation ou toutes les ~24 h ; il
  appelle `skipWaiting()` pour que la nouvelle version prenne le relais immédiatement).
- Votre clé `K` réside dans l'IndexedDB du navigateur, **sur votre appareil** (pas sur le serveur), et survit aux mises à jour →
  vous restez appairé. **Relancez simplement la PWA pour obtenir la dernière version.**

(Un nouvel *appareil* doit tout de même être appairé une fois — l'IndexedDB de cet appareil ne contient pas encore `K`.)

---

## Dépannage

- **Vous avez perdu le lien de votre tableau de bord (la partie `#k=…`) ?** Il n'est pas sur le relais — le relais n'a jamais eu votre clé. Il se trouve sur la
  machine où vous avez exécuté `andon hosted setup` : lancez-y `andon hosted pair` pour réafficher le lien complet (ou lisez
  `~/.andon/hosted.json` et assemblez `relayUrl` + `/b/` + `boardId` + `#k=` + `key`). Un appareil qui n'a *jamais* été
  appairé ne peut pas récupérer le lien depuis le relais — retournez sur cette machine, récupérez le lien, et ouvrez-le une fois sur le
  nouvel appareil.
- **« RÉ-APPAIRER — rouvre le lien de ton tableau sur cet appareil. »** Cet appareil n'a pas de clé (nouvel appareil, stockage effacé,
  ou lancement depuis l'écran d'accueil où le `#k` a été supprimé). Rouvrez une fois votre lien complet (avec `#k=…`) ; il remet la clé en cache.
- **Le tableau de bord se charge mais tout est vide / refuse de se déchiffrer.** Vous avez probablement ouvert un lien **sans** la partie `#k=…`
  (certains outils tronquent au niveau du `#`). Recopiez le lien *en entier*.
- **Une carte périmée ne disparaît pas.** Les cartes s'effacent lorsque l'agent envoie `done`/`gone`, ou après un TTL de 6 h. Une
  session terminée se résout normalement d'elle-même ; une session morte ou de test persiste jusqu'au TTL.
- **Aucun push sur le téléphone.** Le push nécessite **HTTPS** (le tableau de bord en `127.0.0.1` n'enverra donc pas de push) ; sur iPhone, le tableau de bord
  doit d'abord être **ajouté à l'écran d'accueil** ; et vous devez appuyer sur **ACTIVER LES ALERTES** et autoriser les notifications.
- **Tout arrêter :** `andon hosted off` (arrêter la transmission) et, si vous avez exécuté votre propre relais,
  `lsof -ti tcp:<port> | xargs kill`.
