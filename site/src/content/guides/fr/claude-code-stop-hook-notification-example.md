---
title: "Exemple de notification avec un hook Stop de Claude Code"
description: "Un hook Stop de Claude Code prêt à copier-coller qui déclenche une notification sur le bureau quand l'agent vous rend la main — plus ce que l'événement Stop signifie vraiment, et une configuration plus complète avec Agent Andon."
updated: 2026-06-27
howto:
  - name: "Ouvrez les réglages de Claude Code"
    text: "Modifiez ~/.claude/settings.json (créez-le s'il n'existe pas)."
  - name: "Ajoutez un hook Stop"
    text: "Sous hooks.Stop, ajoutez un hook de type command qui exécute votre commande de notification."
  - name: "Enregistrez et testez"
    text: "Enregistrez le fichier et terminez un tour de Claude Code — la notification se déclenche."
---

Claude Code déclenche un hook **`Stop`** chaque fois que l'agent termine son tour et vous rend la main. C'est le moment idéal pour recevoir une alerte — au lieu de revenir sur un terminal devenu silencieux il y a dix minutes. Voici un hook Stop minimal que vous pouvez coller tel quel, ce que l'événement signifie réellement, et quand opter pour quelque chose de plus complet.

## Le hook Stop minimal

Claude Code lit ses hooks depuis **`~/.claude/settings.json`**. Ajoutez un hook `Stop` qui exécute une commande de notification :

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code handed the turn back\" with title \"Agent done\"'"
          }
        ]
      }
    ]
  }
}
```

Enregistrez, terminez un tour dans Claude Code, et une notification sur le bureau se déclenche. Sous Linux, remplacez la commande par `notify-send "Agent done" "Claude Code handed the turn back"`.

## Ce que `Stop` signifie réellement

`Stop` se déclenche quand Claude **vous rend la main** — ce n'est *pas* la promesse que toute la tâche est terminée ; l'agent attend peut-être simplement votre prochaine instruction. Deux événements voisins méritent d'être connus :

- **`Notification`** — Claude attend une autorisation ou votre saisie *en cours de tâche* (le moment « vous demande »). Souvent celui que vous tenez le plus à attraper.
- **`StopFailure`** — le tour s'est terminé sur une erreur (versions récentes de Claude Code).

Un hook `Stop` d'une ligne couvre le premier cas mais rate ceux-ci, et il n'alerte que la seule machine sur laquelle il tourne.

## Un hook Stop qui en fait plus

Si vous lancez plus d'un agent, ou que vous voulez l'alerte sur votre téléphone, le hook brut devient vite délicat à manier — un notificateur par machine, rien pour `Notification`, aucun moyen de voir plusieurs sessions à la fois.

**Agent Andon** branche tout cela pour vous :

```
npm i -g agent-andon
andon install claude
```

Cela installe les hooks `Stop`, `Notification` et `StopFailure` d'un coup et les mappe vers un **tableau** que vous pouvez ouvrir sur n'importe quel écran — travaille, vous demande, prêt, bloqué — avec des bannières sur le bureau et du push mobile optionnel. `andon install --dry-run claude` affiche le `settings.json` résultant sans l'écrire ; `andon uninstall claude` ne retire que ce qu'il a ajouté.

Consultez [Commandes et événements](/fr/docs/commands/) pour le mappage complet événement→état, et [Notifications](/fr/docs/notifications/) pour les canaux d'alerte.
