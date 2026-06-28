---
title: "Claude Code Stop-Hook: Beispiel für eine Benachrichtigung"
description: "Ein Claude-Code-Stop-Hook zum Kopieren und Einfügen, der eine Desktop-Benachrichtigung auslöst, sobald der Agent den Zug an dich zurückgibt — dazu, was das Stop-Event wirklich bedeutet, und ein umfassenderes Setup mit Agent Andon."
updated: 2026-06-27
howto:
  - name: "Deine Claude-Code-Einstellungen öffnen"
    text: "Bearbeite ~/.claude/settings.json (lege die Datei an, falls sie noch nicht existiert)."
  - name: "Einen Stop-Hook hinzufügen"
    text: "Füge unter hooks.Stop einen Command-Hook hinzu, der deinen Benachrichtigungsbefehl ausführt."
  - name: "Speichern und testen"
    text: "Speichere die Datei und beende einen Claude-Code-Zug — die Benachrichtigung wird ausgelöst."
---

Claude Code löst jedes Mal einen **`Stop`**-Hook aus, wenn der Agent seinen Zug beendet und die Kontrolle an dich zurückgibt. Das ist der perfekte Moment, um benachrichtigt zu werden — statt per Alt-Tab zu einem Terminal zurückzuwechseln, das schon vor zehn Minuten still geworden ist. Hier ist ein minimaler Stop-Hook zum Einfügen, was das Event wirklich bedeutet und wann du zu etwas Umfassenderem greifen solltest.

## Der minimale Stop-Hook

Claude Code liest Hooks aus **`~/.claude/settings.json`**. Füge einen `Stop`-Hook hinzu, der einen Benachrichtigungsbefehl ausführt:

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

Speichere die Datei, beende einen Zug in Claude Code, und eine Desktop-Benachrichtigung erscheint. Unter Linux ersetzt du den Befehl durch `notify-send "Agent done" "Claude Code handed the turn back"`.

## Was `Stop` wirklich bedeutet

`Stop` wird ausgelöst, wenn Claude **den Zug an dich zurückgibt** — es ist *keine* Zusage, dass die ganze Aufgabe erledigt ist; der Agent wartet vielleicht nur auf deine nächste Anweisung. Zwei verwandte Events solltest du kennen:

- **`Notification`** — Claude wartet *mitten in der Aufgabe* auf eine Freigabe oder deine Eingabe (der Moment „braucht dich"). Oft genau der, den du am liebsten mitbekommen willst.
- **`StopFailure`** — der Zug endete mit einem Fehler (neuere Claude-Code-Versionen).

Ein einzeiliger `Stop`-Hook fängt den ersten Fall ab, verpasst diese aber — und er benachrichtigt nur die eine Maschine, auf der er läuft.

## Ein Stop-Hook, der mehr kann

Wenn du mehr als einen Agenten betreibst oder den Alert aufs Handy willst, wird der rohe Hook schnell fummelig — ein Notifier pro Maschine, nichts für `Notification`, keine Möglichkeit, mehrere Sitzungen auf einmal zu sehen.

**Agent Andon** verdrahtet das alles für dich:

```
npm i -g agent-andon
andon install claude
```

Das installiert die Hooks `Stop`, `Notification` und `StopFailure` gemeinsam und bildet sie auf ein **Board** ab, das du auf jedem Bildschirm öffnen kannst — arbeitet, braucht dich, fertig, hängt — mit Desktop-Bannern und optionalem Handy-Push. `andon install --dry-run claude` gibt die resultierende `settings.json` aus, ohne sie zu schreiben; `andon uninstall claude` entfernt nur, was es hinzugefügt hat.

Siehe [Befehle & Events](/de/docs/commands/) für die vollständige Zuordnung Event→Status und [Benachrichtigungen](/de/docs/notifications/) für die Alert-Kanäle.
