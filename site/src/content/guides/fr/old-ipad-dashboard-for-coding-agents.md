---
title: "Transformez un vieil iPad en tableau de bord pour vos agents de code"
description: "Fixez au mur un iPad d'appoint comme tableau d'état ambiant et toujours allumé pour vos agents Claude Code et Codex — un coup d'œil suffit à voir lequel a besoin de vous. Voici comment le mettre en place."
updated: 2026-06-27
howto:
  - name: "Lancez le tableau"
    text: "Sur votre machine, lancez `andon serve` et notez l'URL du tableau qu'il affiche."
  - name: "Ouvrez-le sur l'iPad"
    text: "Ouvrez cette URL dans Safari sur l'iPad — même Wi-Fi, ou via Tailscale / un relais que vous exécutez, depuis n'importe où."
  - name: "Gardez l'écran allumé"
    text: "Réglez le Verrouillage auto sur Jamais et utilisez l'Accès guidé pour verrouiller l'iPad sur le tableau."
  - name: "Fixez-le"
    text: "Posez l'iPad sur un support ou fixez-le au mur, là où vous le voyez d'un coup d'œil."
---

Ce vieil iPad qui dort dans un tiroir fait un **tableau d'état ambiant** parfait. Fixé au mur et faisant tourner Agent Andon, il montre chacun de vos agents Claude Code et Codex d'un coup d'œil — vert quand c'est prêt, ambre quand l'un a besoin de vous — pour ne plus jamais basculer de fenêtre juste pour vérifier. Aucune application à installer ; c'est une page web.

## Lancez le tableau

Sur la machine où tournent vos agents :

```
andon serve
```

Il affiche une URL de tableau. (Vous n'avez pas encore branché vos agents ? Lancez d'abord `andon install claude` / `andon install codex`.)

## Ouvrez-le sur l'iPad

Ouvrez cette URL dans **Safari** sur l'iPad :

- **Même Wi-Fi** — utilisez directement l'URL LAN affichée.
- **Depuis n'importe où** — exposez le tableau avec Tailscale Serve, ou appairez un relais aveugle au contenu que vous exécutez (`andon hosted setup <relay-url>`) et ouvrez plutôt cette URL-là. Voir [Andon hébergé](/fr/docs/hosted/).

Ensuite **Partager → Ajouter à l'écran d'accueil** pour une vue plein écran, sans habillage du navigateur.

## Gardez-le toujours allumé

Deux réglages iOS transforment une tablette en écran mural :

- **Réglages → Luminosité et affichage → Verrouillage auto → Jamais**, pour que l'écran reste allumé.
- **L'Accès guidé** (Réglages → Accessibilité → Accès guidé) verrouille l'iPad sur le tableau, pour qu'un appui de passage ne puisse pas en sortir.

## Fixez-le

Un support bon marché sur le bureau, ou une fixation murale dans votre champ de vision. Désormais, un coup d'œil — et non un changement de contexte — vous dit quel agent a besoin de vous.

Le tableau fait remonter en haut la session qui **a besoin de vous** et reste discret le reste du temps : l'iPad est calme jusqu'à ce qu'il ne le soit plus. Voir [Exécuter Andon](/fr/docs/running/) pour le serveur du tableau, et [Notifications](/fr/docs/notifications/) si vous voulez aussi des alertes sur le bureau ou le téléphone.
