---
title: "Befehle, Hooks & Event-Zuordnung für Claude Code und Codex"
description: "Jeder Agent-Andon-CLI-Befehl und wie die Lifecycle-Hooks und Events von Claude Code / Codex auf Board-Status abgebildet werden — install, serve, doctor, hosted und mehr."
---

Die vollständige CLI-Referenz, wie Agent-Events zu Board-Status werden, die Zählung von Hintergrundaufgaben, Codex-Besonderheiten
und das Benennen von Kacheln. (Schnellstart + die gängigen Befehle stehen in der [README](https://github.com/tianshanghong/agent-andon/blob/main/README.md).)

## Befehle

| Befehl | Was es tut |
|---|---|
| `andon serve [--demo] [--port N] [--token T] [--no-notify] [--say]` | Startet den Board-Server; Desktop-Alerts standardmäßig an (`--no-notify` schaltet sie ab, `--say` ergänzt Sprachausgabe) |
| `andon install claude` | Claude-Code-Status-Hooks einrichten (Backup mit Zeitstempel) |
| `andon install codex` | Codex-Lifecycle-Hooks einrichten (`/hooks` ausführen, um sie als vertrauenswürdig zu markieren) |
| `andon uninstall <claude\|codex>` | Entfernt nur, was Andon hinzugefügt hat; lässt den Rest deiner Konfiguration unberührt |
| `andon doctor` | Health-Check + was eingerichtet ist + die Board-URL |
| `andon post <state> <agent> [title] [msg]` | Einen Status von Hand senden |
| `andon sub <+n\|-n> [id]` | Den Hintergrundaufgaben-Zähler eines Prozesses anpassen |
| `andon relay` / `andon hosted` / `andon verify` | Das optionale gehostete Relay — siehe [hosted.md](/de/docs/hosted/) |
| `andon hook` / `andon codexhook` | *(intern — von den Hooks aufgerufen)* |

`andon install --dry-run claude` gibt die Änderung aus, ohne zu schreiben.

## Event → Status-Zuordnung (Claude Code)

| Claude-Code-Event | Board-Status | Wann |
|---|---|---|
| `SessionStart` | inaktiv (schiefergrau) | Session gestartet — die Kachel erscheint sofort |
| `UserPromptSubmit` | arbeitet (blau) | du hast gerade einen Prompt abgeschickt |
| `PostToolUse` | arbeitet (blau) | ein Tool ist gerade gelaufen — hebt den bernsteinfarbenen Zustand auf, sobald du freigibst |
| `Notification` | braucht dich (bernsteinfarben, pulsiert) | wartet auf Freigabe / deine Eingabe |
| `Stop` | **bereit** (grün) | Runde an dich zurückgegeben — du bist dran, *nicht* „alles erledigt" |
| `StopFailure` | hängt (rot, pulsiert) | die Runde ist fehlgeschlagen (nur in neuerem Claude Code) |
| `SessionEnd` | *entfernt* | Session beendet; die Kachel verschwindet |

Jede Session bekommt ihre eigene Kachel (zugeordnet über `session_id`). Ein Prozess =
eine Kachel; seine Sub-Agenten fließen darin zusammen, statt eigene zu erzeugen. Eine Session,
die *bereits lief*, bevor das Board gestartet wurde, erscheint bei ihrem nächsten Event
(Prompt, Tool, Rundenende) — Andon hält sich vollständig aus deiner statusLine heraus.

## Hintergrundarbeit: eine Karte über „fertig" hinaus ehrlich halten

`Stop` bedeutet, dass der Vordergrund-Agent die Runde zurückgegeben hat — es bedeutet **nicht**,
dass die Hintergrundarbeit abgeschlossen ist. Stößt ein Prozess Hintergrund-Workflows an, lass sie
melden, damit die Karte „arbeitet" (blau) bleibt, bis sie abgearbeitet sind, statt fälschlich auf
Grün zu springen:

```bash
export ANDON_SESSION="<this process's tile id>"   # the session_id of the parent tile
andon sub +1     # a background task started
#   ...do the work...
andon sub -1     # it finished
```

Solange der Zähler `> 0` ist, zeigt die Karte `WORKING ⋯N background` und wird erst grün,
sobald jede Aufgabe `-1` gemeldet hat.

## Codex

Modernes Codex (≈ 0.117+) hat ein vollständig Claude-kompatibles **Hooks**-System, sodass Andon
denselben Lifecycle wie Claude Code erhält — inklusive bernsteinfarbenem **braucht dich**:

```bash
andon install codex      # wires lifecycle hooks → ~/.codex/hooks.json
```

| Codex-Hook-Event | Board-Status |
|---|---|
| `SessionStart` | inaktiv (Kachel erscheint beim Start) |
| `UserPromptSubmit` / `PostToolUse` | arbeitet (blau) |
| `PermissionRequest` | **braucht dich (bernsteinfarben)** |
| `Stop` | bereit (grün) |
| `SessionEnd` | *entfernt* |

> **Ein zusätzlicher Schritt, den Codex verlangt:** Neue Hooks müssen erst **als vertrauenswürdig
> markiert** werden, bevor sie laufen — führe einmal `/hooks` in Codex aus (oder starte `codex
> --dangerously-bypass-hook-trust`). `andon uninstall codex` entfernt die Hooks wieder sauber, mit
> einem Backup mit Zeitstempel.

Restliche Einschränkung: Rotes „hängt" beruht weiterhin auf Veralten (kein eigener Hook für
eine fehlgeschlagene Runde). (Bereits laufende Sessions erscheinen bei ihrem nächsten Event, genauso
wie bei Claude.)

## Eine Kachel benennen

Der Standardtitel ist der Name des Projektordners. Pro Terminal überschreiben:

```bash
ANDON_LABEL="backend refactor" claude
ANDON_LABEL="landing copy"     codex
```
