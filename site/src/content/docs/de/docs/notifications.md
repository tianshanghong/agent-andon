---
title: "Claude-Code- & Codex-Benachrichtigungen: Desktop-Alerts & Menüleiste"
description: "Richte Desktop-Alerts und die Menüleisten-Anzeige für deine Claude-Code- und Codex-Agenten ein, damit du in dem Moment benachrichtigt wirst, in dem einer dich braucht, fertig ist oder hängt."
---

Andons einzige Aufgabe ist es, **im richtigen Moment deine Aufmerksamkeit auf
sich zu ziehen** — wenn ein Agent dich braucht oder blockiert ist — und ansonsten ruhig
zu bleiben. Das Board ist der universelle Kanal (funktioniert auf jedem Gerät);
diese ergänzen ihn, jede mit elegantem Fallback unter macOS / Linux / Windows.

## Native Desktop-Alerts

Ein Banner auf dem Computer, der den Server ausführt, **standardmäßig an**. Laut bei den Status, die dich brauchen,
leise beim Abschluss:

- **„braucht dich" (bernsteinfarben)** / **„hängt" (rot)** → Banner + Ton (sofort).
- **„fertig" (grün)** → ein *leises* Banner (kein Ton), um 4 s entprellt, damit ein kurzzeitiges
  Grün nie ein falsches „bereit" auslöst.

```bash
andon serve                 # alerts on by default
andon serve --say           # also speak needs-you / stuck aloud
andon serve --no-notify     # turn alerts off
```

Nutzt `osascript`/`say` (macOS), `notify-send`/`spd-say` (Linux), PowerShell-Toast/`System.Speech`
(Windows). Fehlt das Tool → wird stillschweigend übersprungen. (Unter `--demo` automatisch aus, damit die
durchlaufenden Fake-Agenten dich nicht zuspammen.) Alerts werden **gedrosselt** (ein Cooldown pro Session +
ein globaler Token-Bucket), damit ein vielbeschäftigter — oder bösartiger — LAN-Client, der an `/event`
sendet, keine Flut von Prozessstarts auslösen kann.

## Menü-/Statusleiste

Eine Zusammenfassung auf einen Blick, ohne separaten Bildschirm:

```bash
curl -s http://127.0.0.1:8787/menubar     # plain-text summary endpoint
```

Binde es in SwiftBar/xbar (macOS) oder Waybar/polybar (Linux) ein; siehe
`examples/andon-menubar.5s.sh`.

## Weniger Unterbrechungen? Freigaben selbst konfigurieren

Andon **rührt deine Berechtigungs-/Freigabe-Einstellungen niemals an** — die gehören dir.
Wenn das bernsteinfarbene „braucht dich" öfter auslöst, als dir lieb ist, gib sichere Operationen vorab in
der eigenen Konfiguration deines Agents frei (Andon leuchtet dann nur noch für den Rest auf):

- **Claude Code** — füge in `~/.claude/settings.json` unter `permissions.allow` Nur-Lese-Muster hinzu,
  z. B. `"Read"`, `"Bash(git status:*)"`, `"Bash(npm test:*)"`. Deine `deny`-/`ask`-Regeln haben immer
  Vorrang, und der Bash-Matcher kennt Shell-Operatoren (sodass `Bash(git status:*)` nicht
  `git status && rm -rf` freigibt). Siehe `/permissions`.
- **Codex** — setze `approval_policy` (z. B. führt `"untrusted"` vertrauenswürdige Nur-Lese-Befehle
  automatisch aus) und/oder `sandbox_mode` in `~/.codex/config.toml`.

Dass das in *deinen* Händen bleibt, bedeutet: Andon kann deine Sicherheitsregeln niemals schwächen —
und das Board bleibt ein getreues Abbild davon, wann du wirklich gebraucht wirst.
