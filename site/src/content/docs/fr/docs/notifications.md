---
title: "Notifications Claude Code et Codex : alertes sur le bureau et barre de menus"
description: "Configurez les alertes sur le bureau et l'indicateur de la barre de menus pour vos agents Claude Code et Codex, afin d'être prévenu dès qu'un agent a besoin de vous, termine ou se retrouve bloqué."
---

La seule mission d'Andon est de **capter votre attention au bon moment** — quand
un agent a besoin de vous ou se retrouve bloqué — et de rester discret le reste
du temps. Le tableau de bord est le canal universel (il fonctionne sur n'importe
quel appareil) ; les options ci-dessous viennent s'y ajouter, chacune avec une
dégradation élégante sur macOS / Linux / Windows.

## Alertes natives sur le bureau

Une bannière sur l'ordinateur qui exécute le serveur, **activée par défaut**. Sonore pour les états qui ont besoin de vous,
discrète à la fin :

- **a besoin de vous (ambre)** / **bloqué (rouge)** → bannière + son (immédiat).
- **prêt (vert)** → une bannière *discrète* (sans son), avec un anti-rebond de 4 s pour qu'un
  vert transitoire ne déclenche jamais un faux « prêt ».

```bash
andon serve                 # alerts on by default
andon serve --say           # also speak needs-you / stuck aloud
andon serve --no-notify     # turn alerts off
```

Utilise `osascript`/`say` (macOS), `notify-send`/`spd-say` (Linux), les toasts
PowerShell/`System.Speech` (Windows). Outil absent → ignoré silencieusement. (Désactivé
automatiquement sous `--demo` pour que les faux agents en boucle ne vous spamment pas.) Les alertes sont
**limitées** (temporisation par session + un seau à jetons global) afin qu'un client du réseau local — très actif ou
malveillant — qui envoie des requêtes à `/event` ne puisse pas provoquer une avalanche de créations de processus.

## Barre de menus / barre d'état

Un résumé d'un coup d'œil, sans écran dédié :

```bash
curl -s http://127.0.0.1:8787/menubar     # plain-text summary endpoint
```

Branchez-le à SwiftBar/xbar (macOS) ou Waybar/polybar (Linux) ; voir
`examples/andon-menubar.5s.sh`.

## Moins d'interruptions ? Configurez vous-même les approbations

Andon **ne touche jamais à vos réglages de permissions/approbations** — c'est à vous de les maîtriser.
Si l'ambre « a besoin de vous » se déclenche plus souvent que vous ne le voudriez, pré-approuvez les opérations sûres dans
la configuration de votre propre agent (Andon ne s'allumera alors que pour le reste) :

- **Claude Code** — ajoutez des motifs en lecture seule à `permissions.allow` dans
  `~/.claude/settings.json`, par exemple `"Read"`, `"Bash(git status:*)"`,
  `"Bash(npm test:*)"`. Vos règles `deny`/`ask` ont toujours la priorité, et le
  filtre Bash tient compte des opérateurs du shell (ainsi `Bash(git status:*)` n'approuvera pas
  `git status && rm -rf`). Voir `/permissions`.
- **Codex** — définissez `approval_policy` (par exemple, `"untrusted"` exécute automatiquement les commandes
  en lecture seule de confiance) et/ou `sandbox_mode` dans `~/.codex/config.toml`.

En gardant cela entre *vos* mains, Andon ne peut jamais affaiblir vos règles de sécurité —
et le tableau de bord reste le reflet fidèle des moments où l'on a vraiment besoin de vous.
