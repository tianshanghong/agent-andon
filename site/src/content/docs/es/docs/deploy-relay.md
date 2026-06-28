---
title: "Desplegar un relay Andon"
description: "Autoaloja el relay ciego al contenido de Agent Andon: el punto de entrada compartido que solo reenvía texto cifrado sellado para que tu equipo pueda acceder a sus tableros desde cualquier lugar."
---

Esta es la guía del operador: ejecuta **un** relay Andon en **una URL HTTPS**, y cualquier persona puede apuntar a él
con `andon hosted setup <your-url>` — cada una obtiene su propio tablero aislado y ciego al contenido
bajo esa misma URL. (El lado de los usuarios: [hosted.md](/es/docs/hosted/).)

El relay **almacena solo texto cifrado** y no puede leer el contenido de nadie, pero es un servicio
multiinquilino expuesto a internet, así que lee la sección [capacidad y abuso](#6-capacidad-y-abuso-léelo-antes-de-hacerlo-público)
antes de exponerlo ampliamente.

---

## 1. Qué estás ejecutando

`andon relay` es un único proceso de Node (solo biblioteca estándar, sin dependencias) que:
- genera tableros (`POST /provision`), recibe los eventos sellados (`POST /i/<board>`) y sirve instantáneas, una
  transmisión en vivo SSE, Web Push y el paquete del tablero (`/b/<board>`, `/sw.js`, …);
- persiste **solo** tokens con hash + un par de claves VAPID + las suscripciones push en un archivo; **los eventos
  sellados viven en RAM con un TTL de 6 h**; nunca almacena ni ve texto plano.

Escucha en **HTTP simple**: tú pones HTTPS por delante (las notificaciones push y el descifrado en el navegador requieren un contexto seguro).

---

## 2. Ejecutarlo

```bash
npm i -g agent-andon          # or: git clone … && npm i && npm run build, then use node dist/cli.js

# bind to localhost only and let a reverse proxy terminate TLS (recommended):
ANDON_RELAY_HOST=127.0.0.1 ANDON_RELAY_PORT=8788 ANDON_DATA_DIR=/var/lib/andon andon relay
```

| Ajuste | Predeterminado | Notas |
|---|---|---|
| `ANDON_RELAY_PORT` / `--port` | `8788` | el puerto HTTP |
| `ANDON_RELAY_HOST` | `0.0.0.0` | ponlo en `127.0.0.1` cuando esté detrás de un proxy |
| `ANDON_DATA_DIR` / `--data-dir` | `~/.andon` | **persiste esto** — contiene `relay-tenants.json` (tokens con hash + suscripciones) y `relay-vapid.json`. Si lo pierdes, cada tablero da 404 y las notificaciones push se rompen. |
| `ANDON_IDLE_TTL_SEC` | `900` (15 min) | las sesiones terminadas/inactivas se descartan este tiempo después de su último evento (para que un equipo ya desmontado no deje una pared de tarjetas «listo»); las sesiones activas o que te necesitan usan el TTL estricto de 6 h en su lugar |

Gestiona `SIGINT`/`SIGTERM` con elegancia (cierra las transmisiones SSE para que los reinicios no se queden colgados).

### O con Docker

El relay se distribuye como una imagen multiarquitectura en `ghcr.io/tianshanghong/agent-andon`, compilada de forma
reproducible desde este código fuente por CI (el mismo código que comprueba `andon verify`; con procedencia y SBOM
adjuntos). Ejecuta el relay de forma predeterminada.

```bash
docker run -d --name andon-relay \
  -v andon_data:/data \                         # persist hashed tokens + VAPID + subscriptions
  -e ANDON_PUSH_SUBJECT=mailto:you@example.com \
  ghcr.io/tianshanghong/agent-andon:latest      # CMD defaults to `relay`
```

O un compose mínimo (pon tu propio TLS / proxy inverso por delante — no expongas el 8788 a internet):

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

La imagen no se ejecuta como root, tiene un healthcheck en `/version` y mantiene todo el estado en el volumen `/data`
(`ANDON_DATA_DIR`): haz copia de seguridad de ese volumen.

---

## 3. Pon HTTPS por delante

El relay habla **HTTP simple en `:8788`** — algo por delante termina el TLS (los navegadores requieren HTTPS para el
descifrado en el navegador y las notificaciones push). No añades nada específico del relay; apuntas lo que **ya
ejecutas** al puerto 8788. Elige la fila que se ajuste a tu caso:

| Tu configuración | Cómo se gestiona el TLS |
|---|---|
| **Docker, con un proxy inverso / túnel ya instalado** *(lo más común)* | enruta `relay.example.com` → el `:8788` del contenedor desde tu **Traefik / nginx-proxy / Cloudflare Tunnel** existente — ejemplos abajo |
| **Una máquina vacía, sin nada instalado todavía** | **Caddy** es la opción de una sola línea (Let's Encrypt automático) — ver abajo |
| **Solo tú / tu equipo, en Tailscale** | `tailscale serve --bg 8788` → `https://<machine>.<tailnet>.ts.net` (solo en el tailnet, sin certificado público) |

**Docker detrás de un proxy inverso / túnel** — el contenedor se queda solo en HTTP; el frente hace el TLS:

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

**Máquina vacía — Caddy** (lo más sencillo si no tienes nada más; Let's Encrypt automático):

```
# /etc/caddy/Caddyfile
relay.example.com {
    reverse_proxy 127.0.0.1:8788
}
```
`sudo systemctl reload caddy` → `https://relay.example.com`. (nginx + certbot funciona igual: `proxy_pass http://127.0.0.1:8788;`.)

> ⚠️ **Proxy + límites de tasa:** el relay limita la tasa por `req.socket.remoteAddress`. Detrás de un proxy que
> termina el TLS, esa es la IP del **proxy**, así que los límites por IP se colapsan en un único cubo para todo el
> mundo. El relay **todavía no** analiza `X-Forwarded-For` (es falsificable si se confía en él ingenuamente). Hasta
> que lo haga, aplica la limitación de tasa por cliente **en el proxy** (Traefik/Caddy/nginx/Cloudflare pueden
> hacerlo) si lo expones públicamente.

---

## 4. Mantenerlo en marcha (inicio automático)

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
Adapta `examples/com.agentandon.server.plist` (está escrito para `andon serve`): cambia los argumentos del programa a
`relay`, define `ANDON_RELAY_HOST`/`ANDON_DATA_DIR` en `EnvironmentVariables` y cárgalo con `launchctl load`.

---

## 5. Verifica que sirve código honesto

Desde cualquier máquina que tenga instalada la versión correspondiente de `agent-andon`:
```bash
andon verify https://relay.example.com
```
Compara el tablero y el service worker que sirve tu relay con los bytes de código abierto e informa de `✓ match` (o de
una discrepancia). Diles a tus usuarios que ellos también pueden ejecutarlo: ese es todo el sentido del modelo de transparencia.

---

## 6. Capacidad y abuso (léelo antes de hacerlo público)

Lo que está **integrado** (MVP de un solo proceso):

| Protección | Valor |
|---|---|
| Tableros por relay | `MAX_BOARDS = 500` (los tableros inactivos de >90 d se expulsan para hacer sitio) |
| Sesiones por tablero | `MAX_SESSIONS = 200` (barrido por TTL a las 6 h) |
| Suscripciones push por tablero | `MAX_SUBS = 20` |
| Tasa de aprovisionamiento | 20 / IP / hora |
| Tasa de ingesta | 600 / min por tablero+IP |
| Lectura (instantánea/SSE) | 120 / min por tablero+IP; ≤8 SSE concurrentes / IP, ≤20 / tablero, ≤500 en total |
| Tamaño del cuerpo | 64 KB; más timeouts anti-slowloris + `maxConnections` |
| Escrituras del archivo de inquilinos | atómicas (tmp + rename); un archivo corrupto se conserva, no se descarta en silencio |

Lo que **NO** está construido todavía — añádelo antes de ejecutar un servicio público de verdad:
- **El aprovisionamiento es abierto** (cualquiera puede generar un tablero, solo está limitado por IP). Para un
  servicio público, añade una barrera de **código de invitación / cuenta / prueba de trabajo**, o pon autenticación
  por delante de `/provision`.
- **Proceso único** — `MAX_BOARDS=500`, eventos en memoria, una sola máquina. Para escalar horizontalmente debes
  fijar cada tablero a una única instancia mediante un hash de su id (el round-robin rompe en silencio el SSE y los
  límites por tablero).
- Gestión de **X-Forwarded-For** (consulta la nota sobre el proxy más arriba).
- Un `ANDON_DATA_DIR` **duradero y con copia de seguridad** — es un archivo JSON plano; haz copia de seguridad.

Ninguno de estos afecta a la garantía de ceguera al contenido (el relay nunca guarda claves ni texto plano); son
cuestiones de disponibilidad/abuso.

---

## 7. Actualizar el relay

Descarga la nueva versión, recompila y reinicia el servicio. Las PWA ya instaladas **se actualizan solas** en su
siguiente reinicio (el tablero y el service worker se sirven con `no-store` y el SW se reemplaza a sí mismo); los
usuarios **no vuelven a emparejarse** — su clave reside en su propio navegador, no en tu relay. Mantén los cambios del
formato de transmisión como aditivos (añade campos opcionales; no cambies la forma del AAD/relleno/carga útil de push)
para que una PWA antigua con un relay nuevo se degrade limpiamente hasta que el usuario reinicie. Tras una
actualización, el hash del paquete servido cambia — vuelve a ejecutar `andon verify` y (operativamente) publica el
nuevo hash para que los usuarios puedan confirmarlo.
