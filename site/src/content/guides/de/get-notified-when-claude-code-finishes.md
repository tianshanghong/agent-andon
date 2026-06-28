---
title: "So wirst du benachrichtigt, wenn Claude Code fertig ist oder dich braucht"
description: "Claude Code und Codex können minutenlang laufen, dann fertig werden oder still wartend an dir hängen. So bekommst du mit Agent Andon einen Desktop- oder Handy-Alert in dem Moment, in dem ein Agent dich braucht."
updated: 2026-06-27
howto:
  - name: "Agent Andon installieren"
    text: "Installiere die CLI mit `npm i -g agent-andon`. Sie hat null Abhängigkeiten und läuft vollständig auf deinem Rechner."
  - name: "Die Hooks deines Agents verbinden"
    text: "Führe `andon install claude` (und `andon install codex`) aus, um Lifecycle-Hooks hinzuzufügen, die den Status jeder Sitzung melden. Keine Workflow-Änderung."
  - name: "Das Board öffnen"
    text: "Führe `andon serve` aus und öffne das Board in einem beliebigen Browser, am Handy oder auf einem alten iPad, um jede Sitzung auf einen Blick zu sehen."
  - name: "Alerts einschalten"
    text: "Desktop-Banner sind standardmäßig an; binde bei Bedarf die Menüleisten-Zusammenfassung ein und verbinde ein inhaltsblindes Relay für Handy-Push von überall."
---

Du startest Claude Code mit einer Aufgabe, wechselst zu etwas anderem und dann… wartest du. Ist es fertig? Hängt es an einer Rückfrage und wartet auf dein „Ja"? Du wechselst zurück, um nachzusehen, und stellst fest: vor vier Minuten fertig geworden — oder schlimmer, die ganze Zeit blockiert. Multipliziere das mit mehreren Agenten, und der Tag wird zum Babysitten von Terminals.

**Agent Andon** löst das: Es beobachtet deine Coding-Agenten und meldet sich in dem Moment, in dem einer **fertig wird**, **deine Eingabe braucht** oder **hängen bleibt** — auf einem Board, das du auf jedem Bildschirm öffnen kannst, mit optionalen Desktop- und Handy-Alerts.

## Agent Andon installieren

```
npm i -g agent-andon
```

Eine CLI mit null Abhängigkeiten, die lokal läuft — kein Konto, keine Telemetrie.

## Die Hooks deines Agents verbinden

Andon liest die **nativen Lifecycle-Hooks** jedes Tools — es umhüllt deinen Agenten nicht und schaltet sich auch nicht als Proxy dazwischen.

```
andon install claude
```

Das war's: Claude Code meldet jetzt seine Statusänderungen (arbeitet → braucht dich → fertig → hängt), ohne dass sich an deiner Arbeitsweise etwas ändert. Läuft bei dir auch OpenAI Codex? `andon install codex` macht dasselbe.

## Was die einzelnen Status bedeuten

- **Arbeitet** — der Agent ist beschäftigt; von dir ist nichts nötig.
- **Braucht dich** — er wartet auf eine Eingabe, eine Freigabe oder eine Entscheidung. Das ist der Status, den du schnell mitbekommen willst.
- **Fertig** — der Agent hat seinen Zug beendet und an dich zurückgegeben.
- **Hängt** — er hatte einen Fehler oder ist stehengeblieben.

## Das Board auf jedem Bildschirm öffnen

```
andon serve
```

Öffne die ausgegebene URL in einem beliebigen Browser, am Handy oder auf einem an die Wand montierten iPad. Jede Sitzung erscheint als Zeile, und was immer **dich braucht**, rutscht nach oben — ein Blick genügt, um zu wissen, wo du hinschauen musst.

## Desktop- und Handy-Alerts bekommen

**Desktop-Banner** sind standardmäßig an. Eine **Menüleisten-Zusammenfassung** ist nur einen Handgriff entfernt — Andon liefert unter `/menubar` einen Status als reinen Text, auf den du SwiftBar, xbar oder Waybar richtest.

Für **Handy-Push von überall** — auch fernab deines Rechners — verbinde ein **inhaltsblindes Relay**, das Alerts weiterleitet, ohne deine Projektnamen oder Nachrichten lesen zu können. Richte Andon mit folgendem Befehl darauf:

```
andon hosted setup <relay-url>
```

Du kannst dein eigenes Relay betreiben oder das verwaltete nutzen (Start in Kürze). Details zu Desktop und Menüleiste findest du unter [Benachrichtigungen](/de/docs/notifications/), und zum Relay unter [Hosted Andon](/de/docs/hosted/).

## Funktioniert auch mit Codex

Alles oben Genannte gilt auch für **OpenAI Codex** — `andon install codex`, dasselbe Board, dieselben Alerts. Beobachte Claude-Code- und Codex-Sitzungen nebeneinander.

---

Das ist der ganze Ablauf: installieren, den Hook verbinden, das Board öffnen, Alerts einschalten. Wenn ein Agent fertig wird oder dich braucht, wird daraus eine Benachrichtigung — und nicht etwas, das du zehn Minuten zu spät entdeckst.
