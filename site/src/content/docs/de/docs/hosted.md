---
title: "Hosted Andon: das Board von überall"
description: "Koppele Agent Andon mit dem inhaltsblinden gehosteten Relay, um dein Board zu erreichen und Push aufs Handy zu bekommen — von außerhalb deines Netzwerks, Ende-zu-Ende versiegelt."
---

Andon ist **local-first und für immer kostenlos selbst zu hosten** — das bleibt die Voreinstellung und gibt nichts preis.
Diese Anleitung beschreibt den **optionalen, ausdrücklich zu aktivierenden** gehosteten Modus: sieh dein Board (und erhalte Benachrichtigungen aufs Handy) von überall,
über ein Relay, das **ausschließlich Chiffretext weiterleitet und die Inhalte deiner Agents nicht lesen kann**.

> Du stellst ein Relay bereit, das andere mitnutzen sollen? Siehe **[deploy-relay.md](/de/docs/deploy-relay/)**.

---

## Was es ist (in einer Minute)

- Jedes Status-Event wird **auf deinem Rechner Ende-zu-Ende verschlüsselt**, bevor es ihn verlässt.
- Ein **Relay** speichert und leitet diesen **Chiffretext** weiter und hat niemals den Schlüssel — es sieht nur grobe Routing-Informationen
  (welches Board, eine gehashte Session-ID, working/waiting/done/error/idle, Timing).
- Du öffnest dasselbe **Board** wie beim Self-Hosting; es entschlüsselt in **deinem Browser** mit einem Schlüssel, der im
  `#fragment` des Links mitgeführt wird (wird nie an den Server gesendet). Der Service Worker entschlüsselt Push-Nachrichten aufs Handy auf die gleiche Weise.
- **Kein lokales `andon serve` nötig** — der normale Sendepfad des Hooks leitet zusätzlich eine versiegelte Kopie weiter.

Es gibt zwei Möglichkeiten, es zu nutzen:

| | Wer betreibt das Relay | Wer kann es nutzen |
|---|---|---|
| **A. Dein eigenes Relay** | du (`andon relay` auf einem Rechner, den du kontrollierst) | nur du |
| **B. Ein geteiltes Relay** | ein Betreiber, unter einer öffentlichen HTTPS-URL | viele Personen — jede bekommt ihr eigenes isoliertes Board unter *derselben* URL |

Beide sind derselbe Code; B ist einfach A, öffentlich zugänglich gemacht. Siehe [Mandantenfähig](#mandantenfähig--eine-url-viele-boards).

---

## Schnellstart

```bash
# 1) Run a relay (yours), or skip this and use a shared relay URL someone gives you
andon relay                            # listens on :8788 (see deploy-relay.md for HTTPS/public use)

# 2) Opt in — generates a key that NEVER leaves your machine, prints your board link
andon hosted setup http://127.0.0.1:8788
#   → prints:  http://127.0.0.1:8788/b/<board-id>#k=<key>

# 3) Open that link in a browser. Done — your agents now show up there.
```

`andon hosted setup` zeigt dir zuerst genau, was das Relay sehen kann und was nicht, und fragt `[y/N]`
(Voreinstellung **Nein**). Sobald es aktiv ist, wird auch jeder Claude-Code-/Codex-Status (versiegelt) an das Relay weitergeleitet.

**Behandle den Board-Link wie ein Passwort** — der Teil `#k=…` *ist* dein Entschlüsselungsschlüssel. Mach davon keinen Screenshot
in einen Chat; speichere ihn in einem Passwort-Manager. (Oder scanne den im Terminal angezeigten QR-Code, um ohne Kopieren und Einfügen zu koppeln.)

---

## Das Board öffnen

- **Auf demselben Computer:** öffne `http://127.0.0.1:<port>/b/<board-id>#k=<key>`. `localhost` / `127.0.0.1` ist ein
  sicherer Kontext, daher funktioniert die Entschlüsselung im Browser auch über einfaches HTTP.
- **Auf deinem Handy / einem anderen Gerät:** das Relay muss über **HTTPS** erreichbar sein (Browser verlangen für Entschlüsselung + Push einen
  sicheren Kontext). Zwei einfache Wege:
  - **Tailscale** (hast du bereits): `tailscale serve --bg <relay-port>` → liefert dir eine
    Adresse `https://<machine>.<tailnet>.ts.net`. Öffne `https://…ts.net/b/<board-id>#k=<key>` auf dem Handy.
  - **Eine echte Domain + Zertifikat** (für ein geteiltes Relay) — siehe [deploy-relay.md](/de/docs/deploy-relay/).

### Benachrichtigungen aufs Handy (PWA)
1. Öffne deinen Board-Link auf dem Handy über **HTTPS**.
2. **iPhone:** Teilen → **Zum Home-Bildschirm hinzufügen** (iOS erlaubt Web Push nur aus einer installierten PWA), dann öffne es
   vom Home-Bildschirm aus. **Android/Chrome:** funktioniert aus einem normalen Tab; „Zum Home-Bildschirm hinzufügen" optional.
3. Tippe auf **Mitteilungen aktivieren** → erlaube Benachrichtigungen. Du bekommst eine Vibration, sobald ein Agent dich zum ersten Mal **braucht** oder
   **feststeckt** — selbst wenn das Board geschlossen und das Handy gesperrt ist. Der Benachrichtigungstext wird **auf deinem
   Handy** entschlüsselt; das Relay sieht ihn nie.

---

## Verwalten

```bash
andon hosted status                    # is hosted on? which relay + board id
andon hosted pair                      # re-print your board link — add a device, or recover a lost link
andon hosted off                       # stop forwarding — your agents go back to local-only
andon verify  <relay-url>              # check the relay serves the exact open-source code (see below)
```

Das Hin- und Herwechseln ist kostenlos; `off` löscht einfach die lokale Konfiguration (`~/.andon/hosted.json`).

---

## Was das Relay sehen kann / nicht sehen kann

| | |
|---|---|
| ❌ **Kann nicht lesen** | deine Prompts, deinen Code, Projektnamen, Titel, Nachrichten, Leverage-Zähler |
| • **Kann sehen** | dass du aktiv bist und ungefähr wann (Timing pro Event), wie viele Sessions, deine IP, die Größenklasse des Chiffretexts |
| • **Kann tun** | ein Event verzögern/zurückhalten oder eine deiner **tatsächlich vergangenen** Push-Benachrichtigungen erneut anzeigen (ein veraltetes „braucht dich" für eine bereits erledigte Session) — aber es **kann keine neuen Inhalte erfinden und kann sie nicht lesen** |

Self-Hosting gibt **nichts** preis und bleibt die Voreinstellung. Hosted ist der Kompromiss zwischen Komfort und Metadaten, klar benannt.

---

## „Überprüfbar, nicht bloß vertrauenswürdig" (Transparenz)

Da der Code eines Web-Boards *vom Relay ausgeliefert wird*, gilt die wasserdichte Aussage „selbst bei einem Einbruch nicht lesbar" nur
für eine installierte App. Für das **Web-Board** lautet die ehrliche Aussage: **„wir können dir nicht *heimlich* eine Hintertür einbauen"**:

```bash
andon verify https://relay.example.com
```

Das ruft das Board + den Service Worker ab, die das Relay tatsächlich ausliefert, berechnet deren Hashes und vergleicht sie mit den Bytes in
**deiner eigenen** Open-Source-Kopie. Eine **Übereinstimmung** bedeutet, dass das Relay genau den auditierten Code ausliefert — kein verborgener
Schlüsseldiebstahl. Eine dauerhafte **Abweichung bei gleicher Version** bedeutet, dass es modifizierten Code ausliefert; vertraue ihm deinen
Schlüssel nicht an. Das Relay legt seine Hashes zudem unter `GET /version` offen.

---

## Mandantenfähig — eine URL, viele Boards

Ein Relay ist **von Grund auf mandantenfähig**: ein Prozess bedient viele Boards, und der Einstiegspunkt ist **eine einzige
URL**, keine Subdomain pro Nutzer.

```
            https://relay.example.com        (one URL = the shared entry)
            ├── /b/<A's board-id>#k=<A's key>     only A's key decrypts it
            ├── /b/<B's board-id>#k=<B's key>     only B's key decrypts it
            └── /b/<C's board-id>#k=<C's key>     only C's key decrypts it
            the relay holds only ciphertext for all of them
```

Alle führen `andon hosted setup https://relay.example.com` aus; jede Person erhält unter dieser einen URL eine **256-Bit-große, nicht erratbare**
Board-ID. Die Isolation ist zweischichtig und getestet:
- **Niemand liest bei anderen:** Schlüssel `K` pro Board, das Relay speichert nur Chiffretext (inhaltsblind).
- **Niemand schreibt bei anderen:** die Board-ID ist die Lese-Berechtigung; zum Schreiben braucht es das eigene Ingest-Token des jeweiligen Boards
  (Token von A auf dem Board von B → `401`).

---

## Updates (bereits installierte PWAs)

**Automatisch — kein App Store, kein erneutes Koppeln.**
- Das Board-HTML wird mit `no-store` ausgeliefert und nichts speichert es im Cache, sodass bei jedem Start die neueste Version geladen wird.
- Der Service Worker aktualisiert sich automatisch (der Browser prüft `/sw.js` bei Neustart/Navigation/~24 h erneut; er ruft
  `skipWaiting()` auf, sodass die neue Version sofort übernimmt).
- Dein Schlüssel `K` liegt in der **IndexedDB des Browsers auf deinem Gerät** (nicht auf dem Server) und übersteht Updates →
  du bleibst gekoppelt. **Starte einfach die PWA neu, um die neueste Version zu erhalten.**

(Ein neues *Gerät* muss trotzdem einmal gekoppelt werden — die IndexedDB dieses Geräts hat `K` noch nicht.)

---

## Fehlerbehebung

- **Board-Link verloren (das `#k=…`)?** Er liegt nicht auf dem Relay — das Relay hatte deinen Schlüssel nie. Er befindet sich auf dem
  Rechner, auf dem du `andon hosted setup` ausgeführt hast: führe dort `andon hosted pair` aus, um den vollständigen Link erneut auszugeben (oder lies
  `~/.andon/hosted.json` und setze `relayUrl` + `/b/` + `boardId` + `#k=` + `key` zusammen). Ein Gerät, das *nie*
  gekoppelt wurde, kann den Link nicht vom Relay wiederherstellen — geh zurück zu diesem Rechner, hol dir den Link und öffne ihn einmal auf dem
  neuen Gerät.
- **„NEU KOPPELN — öffne den Board-Link auf diesem Gerät erneut."** Dieses Gerät hat keinen Schlüssel (neues Gerät, geleerter
  Speicher oder ein Start vom Home-Bildschirm, bei dem das `#k` entfernt wurde). Öffne deinen vollständigen Board-Link (mit `#k=…`)
  einmal erneut; er legt den Schlüssel wieder im Cache ab.
- **Board lädt, aber alles ist leer / lässt sich nicht entschlüsseln.** Du hast wahrscheinlich einen Link **ohne** den Teil `#k=…`
  geöffnet (manche Tools schneiden bei `#` ab). Kopiere den *gesamten* Link erneut.
- **Eine veraltete Karte verschwindet nicht.** Karten werden gelöscht, wenn der Agent `done`/`gone` sendet, oder nach einer TTL von 6 Stunden. Eine
  abgeschlossene Session löst sich normalerweise von selbst auf; eine tote/Test-Session bleibt bis zum Ablauf der TTL bestehen.
- **Kein Push aufs Handy.** Push benötigt **HTTPS** (das Board über `127.0.0.1` sendet also kein Push); auf dem iPhone muss das Board
  zuerst **zum Home-Bildschirm hinzugefügt** werden; und du musst auf **Mitteilungen aktivieren** tippen und Benachrichtigungen erlauben.
- **Alles stoppen:** `andon hosted off` (Weiterleitung stoppen) und, falls du dein eigenes Relay betrieben hast,
  `lsof -ti tcp:<port> | xargs kill`.
