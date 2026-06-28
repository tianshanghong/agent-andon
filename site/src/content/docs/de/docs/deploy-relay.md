---
title: "Ein Andon-Relay bereitstellen"
description: "Hoste das inhaltsblinde Agent-Andon-Relay selbst — den geteilten Einstiegspunkt, der nur versiegelten Chiffretext weiterleitet, damit dein Team seine Boards von überall erreicht."
---

Dies ist der Betreiber-Leitfaden: Betreibe **ein** Andon-Relay unter **einer HTTPS-URL**, und beliebig viele Personen
richten sich mit `andon hosted setup <your-url>` darauf aus — jede bekommt ihr eigenes isoliertes, inhaltsblindes Board
unter derselben URL. (Nutzerseite: [hosted.md](/de/docs/hosted/).)

Das Relay **speichert ausschließlich Chiffretext** und kann niemandes Inhalte lesen — aber es ist ein zum Internet hin
offener mandantenfähiger Dienst, lies also den Abschnitt
[Kapazität & Missbrauch](#6-kapazität--missbrauch-vor-dem-öffentlichen-betrieb-lesen), bevor du es breit zugänglich machst.

---

## 1. Was du betreibst

`andon relay` ist ein einzelner Node-Prozess (nur Standardbibliothek, keine Abhängigkeiten), der:
- Boards erzeugt (`POST /provision`), versiegelte Events entgegennimmt (`POST /i/<board>`) und Snapshots, einen
  SSE-Livestream, Web Push sowie das Board-Bundle ausliefert (`/b/<board>`, `/sw.js`, …);
- **nur** gehashte Tokens + ein VAPID-Schlüsselpaar + Push-Abonnements in einer Datei persistiert; **versiegelte Events
  liegen im RAM mit einer TTL von 6 h**; er speichert oder sieht niemals Klartext.

Er lauscht auf **einfachem HTTP** — du setzt HTTPS davor (Push + Entschlüsselung im Browser erfordern einen sicheren Kontext).

---

## 2. Starten

```bash
npm i -g agent-andon          # or: git clone … && npm i && npm run build, then use node dist/cli.js

# bind to localhost only and let a reverse proxy terminate TLS (recommended):
ANDON_RELAY_HOST=127.0.0.1 ANDON_RELAY_PORT=8788 ANDON_DATA_DIR=/var/lib/andon andon relay
```

| Einstellung | Standard | Hinweise |
|---|---|---|
| `ANDON_RELAY_PORT` / `--port` | `8788` | der HTTP-Port |
| `ANDON_RELAY_HOST` | `0.0.0.0` | `127.0.0.1` setzen, wenn hinter einem Proxy |
| `ANDON_DATA_DIR` / `--data-dir` | `~/.andon` | **dauerhaft sichern** — enthält `relay-tenants.json` (gehashte Tokens + Abonnements) und `relay-vapid.json`. Geht es verloren, liefert jedes Board 404 + Push ist kaputt. |
| `ANDON_IDLE_TTL_SEC` | `900` (15 Min.) | fertige/inaktive Sessions werden diese Zeitspanne nach ihrem letzten Event verworfen (damit ein abgebautes Team keine Wand aus „fertig"-Kacheln hinterlässt); aktive/„braucht dich"-Sessions nutzen stattdessen die harte TTL von 6 h |

Er behandelt `SIGINT`/`SIGTERM` sauber (schließt SSE-Streams, damit Neustarts nicht hängen).

### Oder mit Docker

Das Relay wird als Multi-Arch-Image unter `ghcr.io/tianshanghong/agent-andon` ausgeliefert, von CI reproduzierbar aus
diesem Quellcode gebaut (genau der Code, den `andon verify` prüft; Provenance + SBOM beigefügt). Es startet standardmäßig
das Relay.

```bash
docker run -d --name andon-relay \
  -v andon_data:/data \                         # persist hashed tokens + VAPID + subscriptions
  -e ANDON_PUSH_SUBJECT=mailto:you@example.com \
  ghcr.io/tianshanghong/agent-andon:latest      # CMD defaults to `relay`
```

Oder ein minimales Compose (setze deine eigene TLS-/Reverse-Proxy-Schicht davor — gib 8788 nicht ins Internet frei):

```yaml
services:
  relay:
    image: ghcr.io/tianshanghong/agent-andon:latest
    restart: unless-stopped
    environment:
      ANDON_PUSH_SUBJECT: mailto:you@example.com   # a real contact for the VAPID JWT
    volumes:
      - andon_data:/data
    # route to it from your reverse proxy on port 8788; it needs OUTBOUND internet for Web Push
volumes:
  andon_data:
```

Das Image läuft als Non-Root, hat einen `/version`-Healthcheck und hält den gesamten Zustand im `/data`-Volume
(`ANDON_DATA_DIR`) — sichere dieses Volume.

---

## 3. HTTPS davorsetzen

Das Relay spricht einfaches **HTTP auf `:8788`** — etwas davor terminiert TLS (Browser verlangen HTTPS für die
Entschlüsselung im Browser + Push). Du fügst nichts Relay-Spezifisches hinzu; du richtest das, was du **ohnehin schon
betreibst**, auf Port 8788 aus. Wähle die Zeile, die zu dir passt:

| Dein Setup | Wie TLS gehandhabt wird |
|---|---|
| **Docker, schon mit Reverse-Proxy / Tunnel** *(am häufigsten)* | leite `relay.example.com` → das `:8788` des Containers über dein bestehendes **Traefik / nginx-proxy / Cloudflare Tunnel** — Beispiele unten |
| **Ein nackter Host, noch nichts installiert** | **Caddy** ist der Einzeiler (automatisch Let's Encrypt) — siehe unten |
| **Nur du / dein Team, über Tailscale** | `tailscale serve --bg 8788` → `https://<machine>.<tailnet>.ts.net` (nur im Tailnet, kein öffentliches Zertifikat) |

**Docker hinter einem Reverse-Proxy / Tunnel** — der Container bleibt reines HTTP; die Front macht TLS:

```yaml
# Traefik: labels on the relay service (Traefik — or, behind cloudflared, Cloudflare — supplies the cert)
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.relay.rule=Host(`relay.example.com`)"
  - "traefik.http.routers.relay.entrypoints=websecure"
  - "traefik.http.services.relay.loadbalancer.server.port=8788"
```
```
# Cloudflare Tunnel: no open ports — point an ingress hostname at the container
#   relay.example.com  ->  http://andon-relay:8788
```

**Nackter Host — Caddy** (am einfachsten, wenn du nichts anderes hast; automatisch Let's Encrypt):

```
# /etc/caddy/Caddyfile
relay.example.com {
    reverse_proxy 127.0.0.1:8788
}
```
`sudo systemctl reload caddy` → `https://relay.example.com`. (nginx + certbot funktioniert genauso: `proxy_pass http://127.0.0.1:8788;`.)

> ⚠️ **Proxy + Rate-Limits:** Das Relay drosselt nach `req.socket.remoteAddress`. Hinter einem TLS-terminierenden Proxy
> ist das die IP des **Proxys**, sodass die Per-IP-Limits zu einem einzigen Bucket für alle zusammenfallen. Das Relay
> wertet `X-Forwarded-For` **noch nicht** aus (es ist fälschbar, wenn man ihm naiv vertraut). Bis es das tut, drossle
> pro Client **am Proxy** (Traefik/Caddy/nginx/Cloudflare können das alle), wenn du es öffentlich freigibst.

---

## 4. Am Laufen halten (Autostart)

### Linux — systemd
```ini
# /etc/systemd/system/andon-relay.service
[Unit]
Description=Agent Andon relay
After=network.target

[Service]
Environment=ANDON_RELAY_HOST=127.0.0.1
Environment=ANDON_RELAY_PORT=8788
Environment=ANDON_DATA_DIR=/var/lib/andon
ExecStart=/usr/bin/andon relay
Restart=on-failure
User=andon
StateDirectory=andon

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now andon-relay
```

### macOS — launchd
Passe `examples/com.agentandon.server.plist` an (es ist für `andon serve` geschrieben): ändere die Programmargumente auf
`relay`, setze `ANDON_RELAY_HOST`/`ANDON_DATA_DIR` in `EnvironmentVariables` und lade es mit `launchctl load`.

---

## 5. Prüfen, dass es ehrlichen Code ausliefert

Von einem beliebigen Rechner mit der passenden installierten `agent-andon`-Version:
```bash
andon verify https://relay.example.com
```
Es vergleicht das Board + den Service Worker, die dein Relay ausliefert, mit den Open-Source-Bytes und meldet
`✓ match` (oder eine Abweichung). Sag deinen Nutzern, dass sie das ebenfalls ausführen können — genau darum geht es beim Transparenzmodell.

---

## 6. Kapazität & Missbrauch (vor dem öffentlichen Betrieb lesen)

Was **eingebaut** ist (Single-Process-MVP):

| Schutz | Wert |
|---|---|
| Boards pro Relay | `MAX_BOARDS = 500` (inaktive Boards >90 Tage werden verdrängt, um Platz zu schaffen) |
| Sessions pro Board | `MAX_SESSIONS = 200` (TTL-Bereinigung bei 6 h) |
| Push-Abonnements pro Board | `MAX_SUBS = 20` |
| Provisionierungsrate | 20 / IP / Stunde |
| Ingest-Rate | 600 / Min. pro Board+IP |
| Lesen (Snapshot/SSE) | 120 / Min. pro Board+IP; ≤8 gleichzeitige SSE / IP, ≤20 / Board, ≤500 insgesamt |
| Body-Größe | 64 KB; plus Slowloris-Timeouts + `maxConnections` |
| Schreibvorgänge der Mandantendatei | atomar (tmp + rename); eine beschädigte Datei wird erhalten, nicht stillschweigend verworfen |

Was **noch nicht** eingebaut ist — vor dem Betrieb eines echten öffentlichen Dienstes ergänzen:
- **Provisionierung ist offen** (jeder kann ein Board erzeugen, nur per IP gedrosselt). Für einen öffentlichen Dienst
  ergänze eine Schranke aus **Einladungscode / Konto / Proof-of-Work** oder stelle `/provision` eine Authentifizierung voran.
- **Single-Process** — `MAX_BOARDS=500`, Events im Speicher, eine Maschine. Zum horizontalen Skalieren musst du ein
  Board per Hash seiner ID an eine Instanz binden (Round-Robin bricht stillschweigend SSE + die Per-Board-Limits).
- **X-Forwarded-For**-Behandlung (siehe Proxy-Hinweis oben).
- **Dauerhaftes/gesichertes `ANDON_DATA_DIR`** — es ist eine flache JSON-Datei; sichere sie.

Keiner dieser Punkte berührt die Inhaltsblindheits-Garantie (das Relay hält niemals Schlüssel oder Klartext); es geht um
Verfügbarkeit/Missbrauch.

---

## 7. Das Relay aktualisieren

Hol die neue Version, baue neu, starte den Dienst neu. Bereits installierte PWAs **aktualisieren sich automatisch** beim
nächsten Neustart (Board + Service Worker werden mit `no-store` ausgeliefert und der SW ersetzt sich selbst); Nutzer
**koppeln nicht erneut** — ihr Schlüssel liegt im eigenen Browser, nicht auf deinem Relay. Halte Änderungen am
Wire-Format additiv (optionale Felder anhängen; die Form von AAD/Padding/Push-Payload nicht ändern), damit eine alte PWA
+ neues Relay sauber degradiert, bis der Nutzer neu startet. Nach einem Update ändert sich der Hash des ausgelieferten
Bundles — führe `andon verify` erneut aus und veröffentliche (betrieblich) den neuen Hash, damit Nutzer ihn bestätigen können.
