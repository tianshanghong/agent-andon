---
title: "Konfiguration & Sicherheit"
description: "Konfiguriere Agent Andon — Ports, Auth-Tokens, das automatische Entfernen inaktiver Kacheln (TTL) und das Sicherheitsmodell für den lokalen Board-Server und das Relay."
---

Umgebungsvariablen, Token-Authentifizierung und das Netzwerk-/Sicherheitsmodell für das selbst gehostete Board.

## Sicherheit

Standardmäßig bindet sich der Server an `0.0.0.0` **ohne Authentifizierung** — jeder im LAN kann
den Status lesen und senden. In einem vertrauenswürdigen Heim-Wi-Fi ist das in Ordnung; **betreib ihn nicht in einem
öffentlichen/nicht vertrauenswürdigen Netzwerk.** Für ein geteiltes Netzwerk setze einen Token (exportiere ihn auch überall dort, wo die Hooks laufen):

```bash
ANDON_TOKEN=somesecret andon serve
```

Ist ein Token gesetzt, verlangen `/state` und `/event` ihn. Hooks und CLI senden ihn automatisch als
`x-andon-token`-Header (solange `ANDON_TOKEN` in ihrer Umgebung liegt);
auf dem Board-Gerät öffnest du es mit `?token=somesecret`, und der Token wird durchgereicht.
`/healthz` bleibt offen, damit `andon doctor` immer funktioniert.

Das Board legt immer nur übergeordnete Statusinformationen offen (Zustand, Projektname, eine einzeilige Nachricht) —
niemals Code oder vollständige Logs. Event-Bodys sind auf 64 KB begrenzt.

> Du willst das Board über dein LAN hinaus zugänglich machen? Richte kein Port-Forwarding ein — nutze die HTTPS-Wege in
> [running.md](/de/docs/running/) (Tailscale Serve) oder ein [Relay](/de/docs/deploy-relay/).

## Umgebungsvariablen

| Umgebungsvariable | Voreinstellung | Bedeutung |
|---|---|---|
| `AGENT_STATUS_URL` | `http://127.0.0.1:8787` | Basis-URL des Servers, an die die Hooks senden |
| `ANDON_TOKEN` | *(keiner)* | geteilter Token, den `/state` und `/event` verlangen, wenn gesetzt |
| `ANDON_PORT` / `ANDON_HOST` | `8787` / `0.0.0.0` | Server-Bindung |
| `ANDON_LABEL` | Ordnername | Kacheltitel (pro Terminal) |
| `ANDON_SESSION` | — | überschreibt die Session-ID einer Kachel (z. B. für eine Hintergrundaufgabe) |
| `ANDON_IDLE_TTL_SEC` | `900` (15 Min.) | wie lange eine fertige/inaktive Kachel verbleibt, bevor sie automatisch entfernt wird, damit beendete Sub-Agenten/Teammates sich nicht anhäufen. Aktive und „braucht dich"-Kacheln nutzen stattdessen die harte TTL von 6 Stunden. |

(Relay-spezifische Umgebungsvariablen — `ANDON_RELAY_PORT`, `ANDON_DATA_DIR`, `ANDON_PUSH_SUBJECT`, … — stehen in
[deploy-relay.md](/de/docs/deploy-relay/).)
