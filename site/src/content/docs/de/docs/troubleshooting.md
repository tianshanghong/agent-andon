---
title: "Fehlerbehebung & FAQ"
description: "Lösungen für häufige Probleme mit Agent Andon — das Board aktualisiert sich nicht, Hooks lösen nicht aus, festhängende Kacheln und fehlende Desktop- oder Handy-Alerts."
---

## Fehlerbehebung

- **Das Board-Gerät kann die Seite nicht öffnen** — gleiches Wi-Fi? `http` statt `https`? Lässt die Firewall
  deines Computers eingehende Verbindungen zu (unter macOS: Systemeinstellungen → Netzwerk → Firewall)? IP korrekt
  kopiert (sie wird beim Start ausgegeben, und `andon doctor` gibt sie erneut aus)?
- **Der Claude-Hook tut nichts** — führe einmal `claude --debug` aus und achte auf Hook-Fehler;
  führe `andon install claude` erneut aus; `andon doctor` zur Bestätigung.
- **Codex-Kacheln erscheinen nie / ändern sich nie** — führe einmal `/hooks` in Codex aus, um den Hooks zu
  vertrauen (Codex überspringt nicht vertrauenswürdige Hooks); `andon doctor` bestätigt die Verdrahtung.
- **Eine „arbeitet"-Kachel hängt fest** — wahrscheinlich ist ein Prozess abgestürzt, bevor er sein Endereignis
  gesendet hat. Sie wird nach 6 h automatisch gelöscht; bei Codex löscht `andon post gone codex` aus dem jeweiligen Projektverzeichnis sie sofort.
- **Kein Ton auf dem Board** — tippe einmal auf **Mitteilungen aktivieren** (Browser schalten den Ton stumm, bis du das
  tust); auf dem Handy muss das Board für Push über **HTTPS** laufen (siehe [running.md](/de/docs/running/)).

## FAQ

**Wie werde ich benachrichtigt, wenn Claude Code fertig ist oder eine Freigabe braucht?**
Führe `andon serve` aus (Desktop-Alerts sind standardmäßig an) und `andon install claude`. Du bekommst sofort ein
Desktop-Banner, sobald eine Session dich braucht oder fertig wird, dazu das Live-Board auf jedem Gerät.

**Kann ich mehrere Claude-Code-/Codex-Sessions gleichzeitig überwachen?**
Ja — genau darum geht es. Jede Session ist eine eigene Zeile, und was dich braucht, wandert nach oben.

**Funktioniert es mit OpenAI Codex?**
Ja. `andon install codex` verdrahtet die Lifecycle-Hooks von Codex (führe einmal `/hooks` aus, um ihnen zu vertrauen).

**Brauche ich wirklich ein iPad?**
Nein. Das Board ist eine ganz normale Webseite — öffne es auf einem beliebigen Handy, Tablet oder im Browser. Ein
übriges iPad gibt einfach ein schönes, dauerhaft eingeschaltetes Wand-Display ab. Dazu bekommst du Desktop-Banner und
eine Menüleisten-Zusammenfassung.

**Werden mein Code oder meine Daten irgendwohin gesendet?**
Nein — standardmäßig verlässt nichts über deine Agenten deinen Rechner. Andon ist vollständig selbst gehostet: kein
Konto, keine Telemetrie, keine Analytics, kein „Nach-Hause-Telefonieren". Es hält immer nur grobe Statusangaben
(Zustand, Projektname, eine einzeilige Nachricht) — niemals deinen Code, deine Logs oder Secrets.

Drei ehrliche Vorbehalte: (1) Das Board lädt seine Web-Fonts von Google Fonts, sofern du sie nicht selbst hostest —
diese Anfrage trägt keine Agent-Daten, nur den ganz normalen Font-Abruf deines Browsers. (2) Optionale Funktionen
(Handy-Push und das gehostete Relay) sind **strikt opt-in** und jede legt genau dar, was deinen
Rechner verlässt — das gehostete Relay ist so gestaltet, dass sogar *es* die Nachrichten deiner Agenten nicht lesen
kann. Sie ändern diese local-first-Voreinstellung niemals. (3) Diese Dokumentationsseite selbst (nicht Andon als
Tool) nutzt das cookielose Web Analytics von Cloudflare, um Besuche zu zählen — keine Cookies, kein
Cross-Site-Tracking, keine Agent-Daten; das Board, das du betreibst, und das Relay laden es nie.
