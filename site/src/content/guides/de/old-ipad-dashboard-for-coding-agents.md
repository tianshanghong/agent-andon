---
title: "Ein altes iPad in ein Dashboard für deine Coding-Agenten verwandeln"
description: "Häng ein übriges iPad an die Wand — als dauerhaft eingeschaltetes, dezentes Statusboard für deine Claude-Code- und Codex-Agenten: Ein Blick zeigt, welcher dich braucht. So richtest du es ein."
updated: 2026-06-27
howto:
  - name: "Das Board starten"
    text: "Führe auf deinem Rechner `andon serve` aus und merk dir die Board-URL, die ausgegeben wird."
  - name: "Auf dem iPad öffnen"
    text: "Öffne diese URL in Safari auf dem iPad — im selben WLAN oder über Tailscale / ein Relay, das du betreibst, von überall."
  - name: "Den Bildschirm anlassen"
    text: "Stell die Automatische Sperre (Auto-Lock) auf Nie und nutze den Geführten Zugriff (Guided Access), um das iPad aufs Board zu sperren."
  - name: "Befestigen"
    text: "Stell das iPad auf einen Ständer oder häng es an die Wand, wo du es auf einen Blick siehst."
---

Das alte iPad in der Schublade gibt ein perfektes **dezentes Statusboard** ab. An die Wand gehängt und mit Agent Andon bestückt, zeigt es jeden Claude-Code- und Codex-Agenten auf einen Blick — grün, wenn fertig, gelb, wenn einer dich braucht — sodass du nie nur zum Nachsehen das Fenster wechseln musst. Es gibt keine App zu installieren; es ist eine Webseite.

## Das Board starten

Auf dem Rechner, auf dem deine Agenten laufen:

```
andon serve
```

Es gibt eine Board-URL aus. (Deine Agenten noch nicht verbunden? Führe zuerst `andon install claude` / `andon install codex` aus.)

## Auf dem iPad öffnen

Öffne diese URL in **Safari** auf dem iPad:

- **Gleiches WLAN** — nutze direkt die ausgegebene LAN-URL.
- **Von überall** — stell das Board per Tailscale Serve bereit oder koppel ein inhaltsblindes Relay, das du betreibst (`andon hosted setup <relay-url>`), und öffne stattdessen dessen URL. Siehe [Hosted Andon](/de/docs/hosted/).

Dann **Teilen → Zum Home-Bildschirm**, für eine bildschirmfüllende Ansicht ohne Browser-Leisten.

## Dauerhaft eingeschaltet lassen

Zwei iOS-Einstellungen machen aus einem Tablet ein Wand-Display:

- **Einstellungen → Anzeige & Helligkeit → Automatische Sperre (Auto-Lock) → Nie**, damit der Bildschirm wach bleibt.
- **Geführter Zugriff (Guided Access)** (Einstellungen → Bedienungshilfen → Geführter Zugriff) sperrt das iPad aufs Board, sodass ein zufälliger Fingertipp nicht davon wegführen kann.

## Befestigen

Ein günstiger Ständer auf dem Schreibtisch oder eine Wandhalterung in deinem Blickfeld. Jetzt sagt dir ein Blick — kein Kontextwechsel — welcher Agent dich braucht.

Das Board hebt jede Sitzung, die **dich braucht**, nach oben und bleibt ansonsten ruhig — so ist das iPad ruhig, bis es das nicht mehr ist. Mehr zum Board-Server unter [Andon betreiben](/de/docs/running/), und unter [Benachrichtigungen](/de/docs/notifications/), wenn du zusätzlich Desktop- oder Handy-Alerts möchtest.
