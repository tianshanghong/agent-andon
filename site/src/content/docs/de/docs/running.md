---
title: "Andon betreiben: starten, prüfen, stoppen"
description: "Starte, prüfe und stoppe jede Komponente von Agent Andon — den Board-Server, Tailscale Serve für den Handy-Zugriff und das optionale inhaltsblinde Relay."
---

Andon besteht aus bis zu drei unabhängigen Komponenten, die du betreiben kannst. Jede startet und stoppt für sich —
diese Seite nennt den genauen Befehl für jede.

| Komponente | Port | Was es ist | Wann du es brauchst |
|---|---|---|---|
| **`andon serve`** | 8787 | der Board-Server (auf deinem Computer) | immer — das *ist* das Board |
| **Tailscale Serve** | — | stellt 8787 per HTTPS für *dein* Tailnet bereit | das Board erreichen / Push aufs Handy bekommen, nur für dich |
| **`andon relay`** | 8788 | das inhaltsblinde gehostete Relay | nur, wenn du dein **eigenes** Relay betreibst — siehe [deploy-relay.md](/de/docs/deploy-relay/) |

> Tailscale Serve und das Relay sind **Alternativen** für den Remote-/Handy-Zugriff — du betreibst nicht beide.
> Die meisten betreiben nur `andon serve`.

---

## 1. Das Board — `andon serve` (Port 8787)

**Starten (Vordergrund — `Ctrl-C` zum Stoppen):**
```bash
andon serve
```

**Starten (Hintergrund — übersteht das Schließen des Terminals):**
```bash
nohup andon serve > /tmp/andon.log 2>&1 &      # macOS / Linux
```
(Windows: in einem eigenen Terminalfenster ausführen oder `start /b andon serve`.)

**Prüfen, ob es läuft:**
```bash
lsof -iTCP:8787 -sTCP:LISTEN        # shows the listener if it's up
pgrep -fl "cli.js serve"            # shows the process
```

**Stoppen:**
- Vordergrund: **`Ctrl-C`** im zugehörigen Terminal.
- Hintergrund / du weißt nicht, in welchem Terminal: `pkill -f "cli.js serve"`

**Automatischer Start bei der Anmeldung (optional):** macOS — passe `examples/com.agentandon.server.plist` für `launchd` an;
Linux — eine `systemd --user`-Unit. Überspringe das, wenn du es lieber von Hand startest.

---

## 2. Handy-/Remote-Zugriff über Tailscale Serve (ohne Relay)

Damit liegt dein lokales Board (8787) unter einer **HTTPS**-Adresse, die nur **deine eigenen Tailscale-Geräte**
erreichen können — genug für das Board + Push aufs Handy, ohne ein Relay zu betreiben.

> **Kerngedanke:** `tailscale serve` ist eine **dauerhafte Einstellung, kein Prozess, den du offen hältst.** Du richtest es
> **einmal** ein; Tailscale speichert es und es übersteht Neustarts. Es *leitet* nur weiter — das Board selbst muss weiterhin
> laufen (`andon serve` auf 8787), sonst gibt die HTTPS-Adresse **502** zurück. Das sind zwei getrennte Dinge.

**Voraussetzungen:** Tailscale installiert + angemeldet auf **beiden** Geräten, Computer und Handy (gleiches Konto);
HTTPS-Zertifikate für dein Tailnet aktiviert (Admin-Konsole → **DNS** → MagicDNS + HTTPS aktivieren).

**Einrichten (einmalig):**
```bash
tailscale serve --bg 8787
```
Stellt `https://<your-machine>.<your-tailnet>.ts.net` → `127.0.0.1:8787` bereit, **nur im Tailnet**.

**Aktuelle Zuordnung anzeigen:**
```bash
tailscale serve status
```

**Zuordnung entfernen:**
```bash
tailscale serve reset
```

**Auf dem Handy:** öffne die Adresse `https://…ts.net` (Tailscale-App verbunden) → **Zum Home-Bildschirm hinzufügen**
(für Push auf iPhone/iPad erforderlich) → tippe auf **Mitteilungen aktivieren**.

> `tailscale serve` = **privat** (nur dein Tailnet). `tailscale funnel` = **öffentliches Internet** —
> nutze es nur, wenn du das wirklich willst.

---

## 3. Dein eigenes Relay — `andon relay` (Port 8788)

> **Du willst gar kein Relay betreiben?** Musst du nicht — nimm unseres. `andon hosted setup https://relay.agentandon.com`
> verbindet dich mit unserem verwalteten, inhaltsblinden Relay: das Board von überall, kein Setup, nichts zu hosten.
> Siehe [Hosted Andon](/de/docs/hosted/).

Nur, wenn du das inhaltsblinde Relay selbst hostest (die meisten nutzen stattdessen das verwaltete Relay oder Tailscale).
Vollständige Produktivanleitung — HTTPS, Kapazität, automatischer Start: **[deploy-relay.md](/de/docs/deploy-relay/)**.

| Aktion | Befehl |
|---|---|
| Starten (Vordergrund) | `andon relay` |
| Starten (Hintergrund) | `nohup andon relay > /tmp/andon-relay.log 2>&1 &` |
| Prüfen | `lsof -iTCP:8788 -sTCP:LISTEN` |
| Stoppen | `Ctrl-C` (Vordergrund) · `pkill -f "cli.js relay"` (Hintergrund) |

---

## Kurzreferenz

```bash
# What's running?
lsof -nP -iTCP:8787 -iTCP:8788 -sTCP:LISTEN     # the board / relay ports
tailscale serve status                           # the Tailscale HTTPS mapping

# Stop everything
pkill -f "dist/cli.js"      # stops andon serve + andon relay
tailscale serve reset       # removes the Tailscale HTTPS mapping
```

**Der Weg „Handy über Tailscale" = die Tailscale-Serve-Zuordnung (einmal gesetzt, dauerhaft) + laufendes `andon serve`.**
Du willst es live: starte `andon serve`. Für jetzt fertig: `pkill -f "cli.js serve"` — die Zuordnung kann
bleiben; das nächste `andon serve` ist wieder erreichbar.
