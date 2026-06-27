---
title: "Exécuter Andon : démarrer, vérifier, arrêter"
description: "Démarrez, vérifiez et arrêtez chaque composant d'Agent Andon — le serveur de tableau de bord, Tailscale Serve pour l'accès depuis le téléphone, et le relais optionnel aveugle au contenu."
---

Andon comporte jusqu'à trois composants indépendants que vous pouvez exécuter. Chacun démarre et s'arrête de façon autonome —
cette page donne la commande exacte pour chacun.

| Composant | Port | Rôle | Quand l'utiliser |
|---|---|---|---|
| **`andon serve`** | 8787 | le serveur de tableau de bord (sur votre ordinateur) | toujours — c'est *lui*, le tableau de bord |
| **Tailscale Serve** | — | expose 8787 en HTTPS sur *votre* tailnet | accéder au tableau de bord / recevoir le push sur le téléphone, juste pour vous |
| **`andon relay`** | 8788 | le relais hébergé aveugle au contenu | uniquement si vous exécutez votre **propre** relais — voir [deploy-relay.md](/fr/docs/deploy-relay/) |

> Tailscale Serve et le relais sont des **alternatives** pour l'accès à distance ou depuis le téléphone — vous n'exécutez pas les deux.
> La plupart des gens n'exécutent que `andon serve`.

---

## 1. Le tableau de bord — `andon serve` (port 8787)

**Démarrer (premier plan — `Ctrl-C` pour arrêter) :**
```bash
andon serve
```

**Démarrer (arrière-plan — survit à la fermeture du terminal) :**
```bash
nohup andon serve > /tmp/andon.log 2>&1 &      # macOS / Linux
```
(Windows : lancez-le dans sa propre fenêtre de terminal, ou `start /b andon serve`.)

**Vérifier s'il est en cours d'exécution :**
```bash
lsof -iTCP:8787 -sTCP:LISTEN        # shows the listener if it's up
pgrep -fl "cli.js serve"            # shows the process
```

**Arrêter :**
- Premier plan : **`Ctrl-C`** dans son terminal.
- Arrière-plan / vous ne savez pas dans quel terminal : `pkill -f "cli.js serve"`

**Démarrage automatique à l'ouverture de session (optionnel) :** macOS — adaptez `examples/com.agentandon.server.plist` pour `launchd` ;
Linux — une unité `systemd --user`. Ignorez cette étape si vous préférez le démarrer à la main.

---

## 2. Accès depuis le téléphone / à distance via Tailscale Serve (sans relais)

Cela place votre tableau de bord local (8787) à une adresse **HTTPS** que seuls **vos propres appareils Tailscale** peuvent
atteindre — suffisant pour le tableau de bord et le push sur le téléphone, sans exécuter de relais.

> **Idée clé :** `tailscale serve` est un **réglage persistant, pas un processus que vous gardez ouvert.** Vous le configurez
> **une seule fois** ; Tailscale le mémorise et il survit aux redémarrages. Il ne fait que *transmettre* — le tableau de bord lui-même doit
> toujours être en cours d'exécution (`andon serve` sur 8787), sinon l'adresse HTTPS renvoie **502**. Ce sont deux choses distinctes.

**Prérequis :** Tailscale installé et connecté **à la fois** sur l'ordinateur et le téléphone (même compte) ;
certificats HTTPS activés pour votre tailnet (console d'administration → **DNS** → activer MagicDNS + HTTPS).

**Configuration (une seule fois) :**
```bash
tailscale serve --bg 8787
```
Expose `https://<your-machine>.<your-tailnet>.ts.net` → `127.0.0.1:8787`, **tailnet uniquement**.

**Voir le mappage actuel :**
```bash
tailscale serve status
```

**Supprimer le mappage :**
```bash
tailscale serve reset
```

**Sur le téléphone :** ouvrez l'adresse `https://…ts.net` (application Tailscale connectée) → **Ajouter à l'écran d'accueil**
(requis pour le push sur iPhone/iPad) → appuyez sur **Activer les alertes**.

> `tailscale serve` = **privé** (votre tailnet uniquement). `tailscale funnel` = **Internet public** —
> ne l'utilisez pas sauf si c'est votre intention.

---

## 3. Votre propre relais — `andon relay` (port 8788)

> **Vous ne voulez pas exécuter de relais du tout ?** Ce n'est pas obligatoire — utilisez le nôtre. `andon hosted setup https://relay.agentandon.com`
> vous dirige vers notre relais géré aveugle au contenu : le tableau de bord depuis n'importe où, zéro configuration, rien à héberger.
> Voir [Andon hébergé](/fr/docs/hosted/).

Uniquement si vous hébergez vous-même le relais aveugle au contenu (la plupart des gens utilisent plutôt le relais géré, ou Tailscale).
Guide de production complet — HTTPS, capacité, démarrage automatique : **[deploy-relay.md](/fr/docs/deploy-relay/)**.

| Action | Commande |
|---|---|
| Démarrer (premier plan) | `andon relay` |
| Démarrer (arrière-plan) | `nohup andon relay > /tmp/andon-relay.log 2>&1 &` |
| Vérifier | `lsof -iTCP:8788 -sTCP:LISTEN` |
| Arrêter | `Ctrl-C` (premier plan) · `pkill -f "cli.js relay"` (arrière-plan) |

---

## Référence rapide

```bash
# What's running?
lsof -nP -iTCP:8787 -iTCP:8788 -sTCP:LISTEN     # the board / relay ports
tailscale serve status                           # the Tailscale HTTPS mapping

# Stop everything
pkill -f "dist/cli.js"      # stops andon serve + andon relay
tailscale serve reset       # removes the Tailscale HTTPS mapping
```

**L'approche « téléphone via Tailscale » = le mappage Tailscale Serve (configuré une fois, persistant) + `andon serve`
en cours d'exécution.** Pour l'activer : démarrez `andon serve`. Terminé pour l'instant : `pkill -f "cli.js serve"` — le mappage peut
rester ; le prochain `andon serve` sera de nouveau accessible.
