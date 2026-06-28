---
title: "Dépannage et FAQ"
description: "Solutions aux problèmes courants d'Agent Andon — le tableau de bord qui ne se met pas à jour, les hooks qui ne se déclenchent pas, les tuiles bloquées et les alertes manquantes sur le bureau ou le téléphone."
---

## Dépannage

- **L'appareil qui affiche le tableau de bord n'arrive pas à ouvrir la page** — même Wi-Fi ? `http` et non `https` ? Le pare-feu de votre ordinateur
  autorise-t-il les connexions entrantes (sur macOS : Réglages Système → Réseau → Pare-feu) ? L'IP a-t-elle été copiée correctement
  (elle est affichée au démarrage, et `andon doctor` la réaffiche) ?
- **Le hook de Claude ne fait rien** — exécutez `claude --debug` une fois et surveillez les erreurs de hook ;
  relancez `andon install claude` ; `andon doctor` pour confirmer.
- **Les tuiles Codex n'apparaissent jamais / ne changent jamais** — exécutez `/hooks` dans Codex une fois pour
  faire confiance aux hooks (Codex ignore les hooks non approuvés) ; `andon doctor` confirme le branchement.
- **Une tuile « travaille » est bloquée** — un processus est probablement mort avant d'envoyer son événement de fin.
  Elle s'efface automatiquement après 6 h ; pour Codex, `andon post gone codex` depuis ce dossier de projet l'efface immédiatement.
- **Aucun carillon sur le tableau de bord** — appuyez sur **Activer les alertes** une fois (les navigateurs coupent le son tant que vous ne l'avez pas fait) ; sur un
  téléphone, le tableau de bord doit être en **HTTPS** pour le push (voir [running.md](/fr/docs/running/)).

## FAQ

**Comment être notifié quand Claude Code a terminé ou demande une approbation ?**
Lancez `andon serve` (les alertes sur le bureau sont activées par défaut) et `andon install claude`. Vous obtenez une bannière sur
le bureau à l'instant même où une session a besoin de vous ou a terminé, ainsi que le tableau de bord en direct sur n'importe quel appareil.

**Puis-je surveiller plusieurs sessions Claude Code / Codex à la fois ?**
Oui — c'est tout l'intérêt. Chaque session a sa propre ligne, et ce qui a besoin de vous remonte en haut.

**Est-ce que ça fonctionne avec OpenAI Codex ?**
Oui. `andon install codex` branche les hooks de cycle de vie de Codex (exécutez `/hooks` une fois pour leur faire confiance).

**Ai-je vraiment besoin d'un iPad ?**
Non. Le tableau de bord est une simple page web — ouvrez-la sur n'importe quel téléphone, tablette ou navigateur. Un iPad d'appoint fait
justement un bel affichage mural toujours allumé. Vous bénéficiez aussi de bannières sur le bureau et d'un résumé dans la barre de menus.

**Mon code ou mes données sont-ils envoyés quelque part ?**
Non — par défaut, rien concernant vos agents ne quitte votre machine. Andon est entièrement auto-hébergé : aucun compte, aucune
télémétrie, aucune analytique, aucun « phone home ». Il ne détient jamais que l'état de haut niveau (l'état, le nom du projet, un
message d'une ligne) — jamais votre code, vos journaux ni vos secrets.

Trois réserves, en toute honnêteté : (1) le tableau de bord charge ses polices web depuis Google Fonts, à moins que vous ne les hébergiez
vous-même — cette requête ne transporte aucune donnée d'agent, juste la récupération de police normale de votre navigateur. (2) Les
fonctionnalités optionnelles (le push sur le téléphone et le relais hébergé) sont **strictement volontaires** et chacune précise exactement
ce qui quitte votre machine — le relais hébergé est conçu pour que *lui-même* ne puisse pas lire les messages de vos agents. Elles ne changent
jamais ce fonctionnement par défaut « priorité au local ». (3) Ce site de documentation lui-même (et non l'outil Andon) utilise la mesure d'audience web
sans cookie de Cloudflare pour compter les visites — aucun cookie, aucun suivi intersites, aucune donnée d'agent ; le tableau de bord que
vous exécutez et le relais ne la chargent jamais.
