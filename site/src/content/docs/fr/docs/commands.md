---
title: "Commandes, hooks de cycle de vie et correspondance des événements (Claude Code et Codex)"
description: "Chaque commande CLI d'Agent Andon, et comment les hooks de cycle de vie et les événements de Claude Code / Codex correspondent aux états du tableau de bord — install, serve, doctor, hosted, et plus encore."
---

La référence CLI complète : comment les événements des agents deviennent des états du tableau de bord, le comptage des
tâches en arrière-plan, les spécificités de Codex et le nommage des tuiles. (Le démarrage rapide et les commandes courantes se trouvent dans le [README](https://github.com/tianshanghong/agent-andon/blob/main/README.md).)

## Commandes

| Commande | Ce que ça fait |
|---|---|
| `andon serve [--demo] [--port N] [--token T] [--no-notify] [--say]` | Lancer le serveur du tableau de bord ; alertes sur le bureau activées par défaut (`--no-notify` les désactive, `--say` ajoute la synthèse vocale) |
| `andon install claude` | Brancher les hooks d'état de Claude Code (sauvegarde horodatée) |
| `andon install codex` | Brancher les hooks de cycle de vie de Codex (lancez `/hooks` pour les approuver) |
| `andon uninstall <claude\|codex>` | Retirer uniquement ce qu'Andon a ajouté ; laisse le reste de votre configuration intact |
| `andon doctor` | Bilan de santé + ce qui est branché + l'URL du tableau de bord |
| `andon post <state> <agent> [title] [msg]` | Pousser un état à la main |
| `andon sub <+n\|-n> [id]` | Ajuster le décompte des tâches en arrière-plan d'un processus |
| `andon relay` / `andon hosted` / `andon verify` | Le relais hébergé optionnel — voir [hosted.md](/fr/docs/hosted/) |
| `andon hook` / `andon codexhook` | *(interne — appelé par les hooks)* |

`andon install --dry-run claude` affiche le changement sans rien écrire.

## Correspondance événement → état (Claude Code)

| Événement Claude Code | État du tableau de bord | Quand |
|---|---|---|
| `SessionStart` | inactif (ardoise) | session lancée — la tuile apparaît immédiatement |
| `UserPromptSubmit` | travaille (bleu) | vous venez de soumettre un prompt |
| `PostToolUse` | travaille (bleu) | un outil vient de s'exécuter — efface l'ambre dès que vous approuvez |
| `Notification` | a besoin de vous (ambre, pulse) | en attente d'une autorisation / de votre saisie |
| `Stop` | **prêt** (vert) | le tour vous est rendu — à vous de jouer, *pas* « tout est terminé » |
| `StopFailure` | bloqué (rouge, pulse) | le tour a échoué (uniquement les versions récentes de Claude Code) |
| `SessionEnd` | *retiré* | session terminée ; la tuile disparaît |

Chaque session obtient sa propre tuile (indexée par `session_id`). Un processus =
une tuile ; ses sous-agents y sont regroupés au lieu d'en créer chacun la sienne. Une session
qui tournait *déjà* avant le démarrage du tableau de bord apparaît à son prochain événement
(prompt, outil, fin de tour) — Andon ne touche pas du tout à votre statusLine.

## Travail en arrière-plan : garder une carte honnête au-delà de « terminé »

`Stop` signifie que l'agent au premier plan a rendu le tour — cela ne veut **pas** dire
que le travail en arrière-plan est terminé. Si un processus lance des workflows en arrière-plan, faites-les
rapporter leur état pour que la carte reste sur « travaille » (bleu) jusqu'à ce qu'ils se terminent tous, au lieu de
passer faussement au vert :

```bash
export ANDON_SESSION="<this process's tile id>"   # the session_id of the parent tile
andon sub +1     # a background task started
#   ...do the work...
andon sub -1     # it finished
```

Tant que le décompte est `> 0`, la carte affiche `WORKING ⋯N background` et ne passe au vert
qu'une fois que chaque tâche a signalé `-1`.

## Codex

Codex récent (≈ 0.117+) dispose d'un système de **hooks** complet, compatible avec Claude, de sorte qu'Andon
bénéficie du même cycle de vie que Claude Code — y compris l'ambre **a besoin de vous** :

```bash
andon install codex      # wires lifecycle hooks → ~/.codex/hooks.json
```

| Événement de hook Codex | État du tableau de bord |
|---|---|
| `SessionStart` | inactif (la tuile apparaît au lancement) |
| `UserPromptSubmit` / `PostToolUse` | travaille (bleu) |
| `PermissionRequest` | **a besoin de vous (ambre)** |
| `Stop` | prêt (vert) |
| `SessionEnd` | *retiré* |

> **Une étape supplémentaire requise par Codex :** les nouveaux hooks doivent être **approuvés**
> avant de s'exécuter — lancez une fois `/hooks` dans Codex (ou démarrez `codex
> --dangerously-bypass-hook-trust`). `andon uninstall codex` retire proprement les
> hooks, avec une sauvegarde horodatée.

Réserve résiduelle : le rouge « bloqué » reste déterminé par la péremption (pas de hook dédié pour les tours
échoués). (Les sessions déjà en cours apparaissent à leur prochain événement, comme avec Claude.)

## Nommer une tuile

Le titre par défaut est le nom du dossier de projet. Pour le remplacer par terminal :

```bash
ANDON_LABEL="backend refactor" claude
ANDON_LABEL="landing copy"     codex
```
