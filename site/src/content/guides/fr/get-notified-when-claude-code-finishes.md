---
title: "Comment être notifié quand Claude Code termine ou a besoin de vous"
description: "Claude Code et Codex peuvent tourner plusieurs minutes, puis finir ou se bloquer en vous attendant — en silence. Voici comment recevoir une alerte sur votre bureau ou votre téléphone dès qu'un agent a besoin de vous, avec Agent Andon."
updated: 2026-06-27
howto:
  - name: "Installer Agent Andon"
    text: "Installez le CLI avec `npm i -g agent-andon`. Il est zéro dépendance et tourne entièrement sur votre machine."
  - name: "Branchez les hooks de votre agent"
    text: "Lancez `andon install claude` (et `andon install codex`) pour ajouter les hooks de cycle de vie qui signalent l'état de chaque session. Aucun changement dans votre flux de travail."
  - name: "Ouvrez le tableau"
    text: "Lancez `andon serve` et ouvrez le tableau dans n'importe quel navigateur, téléphone ou iPad d'appoint pour voir chaque session d'un coup d'œil."
  - name: "Activez les alertes"
    text: "Les bannières sur le bureau sont activées par défaut ; branchez le résumé en barre de menus si vous le souhaitez, et connectez un relais aveugle au contenu pour le push mobile depuis n'importe où."
---

Vous lancez Claude Code sur une tâche, vous passez à autre chose, et puis… vous attendez. C'est terminé ? Est-il bloqué sur une question, à attendre votre « oui » ? Vous revenez vérifier et découvrez qu'il a fini il y a quatre minutes — ou pire, qu'il est resté en plan tout ce temps. Multipliez ça par plusieurs agents et la journée se transforme en surveillance de terminaux.

**Agent Andon** règle le problème : il surveille vos agents de code et vous prévient dès que l'un **termine**, **a besoin de vous** ou **se bloque** — sur un tableau que vous pouvez ouvrir sur n'importe quel écran, avec des alertes optionnelles sur le bureau et le téléphone.

## Installer Agent Andon

```
npm i -g agent-andon
```

C'est un CLI zéro dépendance qui tourne en local — aucun compte, aucune télémétrie.

## Branchez les hooks de votre agent

Andon lit les **hooks de cycle de vie natifs** de chaque outil — il n'encapsule pas votre agent et ne lui sert pas de proxy.

```
andon install claude
```

Et voilà : Claude Code signale désormais ses changements d'état (travaille → vous demande → prêt → bloqué) sans rien changer à votre façon de travailler. Vous utilisez aussi OpenAI Codex ? `andon install codex` fait la même chose.

## Ce que signifie chaque état

- **Travaille** — l'agent est occupé ; il n'a besoin de rien de votre part.
- **Vous demande** — il attend votre saisie, une autorisation ou une décision. C'est l'état qu'il vaut la peine de repérer vite.
- **Prêt** — l'agent a terminé son tour et vous rend la main.
- **Bloqué** — il a planté ou calé.

## Ouvrez le tableau sur n'importe quel écran

```
andon serve
```

Ouvrez l'URL affichée dans n'importe quel navigateur, sur votre téléphone ou sur un iPad fixé au mur. Chaque session apparaît sur une ligne, et celle qui **vous demande** remonte en haut — un coup d'œil suffit pour savoir où regarder.

## Recevez des alertes sur le bureau et le téléphone

Les **bannières sur le bureau** sont activées par défaut. Un **résumé en barre de menus** n'est qu'à un branchement — Andon expose un état en texte brut sur `/menubar` que vous pointez avec SwiftBar, xbar ou Waybar.

Pour recevoir le **push mobile depuis n'importe où** — même loin de votre machine — connectez un **relais aveugle au contenu**, qui transmet les alertes sans pouvoir lire les noms de vos projets ni vos messages. Pointez Andon vers l'un d'eux avec :

```
andon hosted setup <relay-url>
```

Vous pouvez faire tourner votre propre relais, ou utiliser le relais géré (bientôt disponible). Voir [Notifications](/fr/docs/notifications/) pour les détails sur le bureau et la barre de menus, et [Andon hébergé](/fr/docs/hosted/) pour le relais.

## Fonctionne aussi avec Codex

Tout ce qui précède s'applique aussi à **OpenAI Codex** — `andon install codex`, même tableau, mêmes alertes. Surveillez vos sessions Claude Code et Codex côte à côte.

---

Voilà toute la boucle : installer, brancher le hook, ouvrir le tableau, activer les alertes. Un agent qui termine ou qui a besoin de vous devient une notification — plus quelque chose que vous découvrez dix minutes trop tard.
