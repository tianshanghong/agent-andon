---
title: "Andon alojado: el tablero desde cualquier lugar"
description: "Empareja Agent Andon con el relay alojado ciego al contenido para acceder a tu tablero y recibir notificaciones push en el teléfono desde fuera de tu red, sellado de extremo a extremo."
---

Andon es **local primero y de autoalojamiento gratuito para siempre**: eso sigue siendo lo predeterminado y no comparte nada.
Esta guía trata sobre el modo alojado **opcional y voluntario**: ve tu tablero (y recibe alertas en el teléfono) desde cualquier lugar,
a través de un relay que **solo enruta texto cifrado y no puede leer el contenido de tus agentes**.

> ¿Vas a desplegar un relay para que otros lo compartan? Consulta **[deploy-relay.md](/es/docs/deploy-relay/)**.

---

## Qué es (en un minuto)

- Cada evento de estado se **cifra de extremo a extremo en tu máquina** antes de salir.
- Un **relay** almacena y reenvía ese **texto cifrado** y nunca tiene la clave: solo ve un enrutamiento aproximado
  (qué tablero, un id de sesión con hash, working/waiting/done/error/idle, la temporización).
- Abres el **mismo tablero** que en el autoalojamiento; se descifra en **tu navegador** con una clave incluida en el
  `#fragment` del enlace (nunca se envía al servidor). El service worker descifra de la misma manera las notificaciones push del teléfono.
- **No se necesita `andon serve` local**: la ruta de publicación normal del hook también reenvía una copia sellada.

Hay dos formas de usarlo:

| | Quién ejecuta el relay | Quién puede usarlo |
|---|---|---|
| **A. Tu propio relay** | tú (`andon relay` en una máquina que controlas) | solo tú |
| **B. Un relay compartido** | un operador, en una única URL HTTPS pública | muchas personas: cada una obtiene su propio tablero aislado bajo la *misma* URL |

Ambos son el mismo código; B es simplemente A expuesto públicamente. Consulta [Multiinquilino](#multiinquilino--una-url-muchos-tableros).

---

## Inicio rápido

```bash
# 1) Run a relay (yours), or skip this and use a shared relay URL someone gives you
andon relay                            # listens on :8788 (see deploy-relay.md for HTTPS/public use)

# 2) Opt in — generates a key that NEVER leaves your machine, prints your board link
andon hosted setup http://127.0.0.1:8788
#   → prints:  http://127.0.0.1:8788/b/<board-id>#k=<key>

# 3) Open that link in a browser. Done — your agents now show up there.
```

`andon hosted setup` primero te muestra exactamente lo que el relay puede y no puede ver, y pregunta `[y/N]`
(predeterminado **No**). Una vez activado, cada estado de Claude Code / Codex también se reenvía (sellado) al relay.

**Trata el enlace del tablero como una contraseña**: la parte `#k=…` *es* tu clave de descifrado. No lo subas como captura de
pantalla a un chat; guárdalo en un gestor de contraseñas. (O escanea el QR que se muestra en la terminal para emparejar sin copiar y pegar.)

---

## Abrir el tablero

- **En el mismo ordenador:** abre `http://127.0.0.1:<port>/b/<board-id>#k=<key>`. `localhost` / `127.0.0.1` es un
  contexto seguro, por lo que el descifrado en el navegador funciona sobre HTTP simple.
- **En tu teléfono u otro dispositivo:** el relay debe ser accesible sobre **HTTPS** (los navegadores requieren un contexto
  seguro para el descifrado y las notificaciones push). Dos vías sencillas:
  - **Tailscale** (ya lo tienes): `tailscale serve --bg <relay-port>` → te da una dirección
    `https://<machine>.<tailnet>.ts.net`. Abre `https://…ts.net/b/<board-id>#k=<key>` en el teléfono.
  - **Un dominio real + certificado** (para un relay compartido): consulta [deploy-relay.md](/es/docs/deploy-relay/).

### Alertas en el teléfono (PWA)
1. Abre el enlace de tu tablero en el teléfono sobre **HTTPS**.
2. **iPhone:** Compartir → **Añadir a pantalla de inicio** (iOS solo permite Web Push desde una PWA instalada), luego ábrela
   desde la pantalla de inicio. **Android/Chrome:** funciona desde una pestaña normal; "Añadir a pantalla de inicio" es opcional.
3. Toca **Activar alertas** → permite las notificaciones. Recibirás un aviso cuando un agente **te necesite** por primera vez o se quede
   **atascado**, incluso con el tablero cerrado y el teléfono bloqueado. El texto de la notificación se descifra **en tu
   teléfono**; el relay nunca lo ve.

---

## Gestionarlo

```bash
andon hosted status                    # is hosted on? which relay + board id
andon hosted pair                      # re-print your board link — add a device, or recover a lost link
andon hosted off                       # stop forwarding — your agents go back to local-only
andon verify  <relay-url>              # check the relay serves the exact open-source code (see below)
```

Cambiar de un lado a otro es gratis; `off` simplemente elimina la configuración local (`~/.andon/hosted.json`).

---

## Qué puede / no puede ver el relay

| | |
|---|---|
| ❌ **No puede leer** | tus prompts, código, nombres de proyectos, títulos, mensajes, los recuentos de actividad |
| • **Puede ver** | que estás activo y aproximadamente cuándo (temporización por evento), cuántas sesiones, tu IP, el rango de tamaño del texto cifrado |
| • **Puede hacer** | retrasar/retener un evento, o volver a mostrar una de tus notificaciones push **reales y anteriores** (un "te necesita" obsoleto para una sesión ya resuelta), pero **no puede inventar contenido nuevo ni leerlo** |

El autoalojamiento no comparte **nada** y sigue siendo lo predeterminado. El modo alojado es el equilibrio entre comodidad y metadatos, dicho claramente.

---

## "Verificable, no solo de confianza" (transparencia)

Como el código de un tablero web lo *sirve el relay*, la garantía hermética de "aunque lo vulneren, no pueden leerlo" solo
se cumple para una app instalada. Para el **tablero web**, la afirmación honesta es **"no podemos ponerte una puerta trasera *en secreto*"**:

```bash
andon verify https://relay.example.com
```

Esto obtiene el tablero y el service worker que el relay sirve realmente, los hashea y los compara con los bytes de
**tu propia** copia de código abierto. Una **coincidencia** significa que el relay está sirviendo exactamente el código auditado: sin
robo de claves oculto. Una **discrepancia persistente en la misma versión** significa que está sirviendo código modificado; no le confíes
tu clave. El relay también declara sus hashes en `GET /version`.

---

## Multiinquilino — una URL, muchos tableros

Un relay es **multiinquilino por diseño**: un proceso sirve muchos tableros, y el punto de entrada es **una única
URL**, no un subdominio por usuario.

```
            https://relay.example.com        (one URL = the shared entry)
            ├── /b/<A's board-id>#k=<A's key>     only A's key decrypts it
            ├── /b/<B's board-id>#k=<B's key>     only B's key decrypts it
            └── /b/<C's board-id>#k=<C's key>     only C's key decrypts it
            the relay holds only ciphertext for all of them
```

Todos ejecutan `andon hosted setup https://relay.example.com`; cada uno obtiene un id de tablero **imposible de adivinar, de 256 bits**
bajo esa única URL. El aislamiento tiene dos capas y está probado:
- **Nadie lee a nadie:** clave por tablero `K`, el relay almacena solo texto cifrado (ciego al contenido).
- **Nadie escribe a nadie:** el id del tablero es la capacidad de lectura; escribir requiere el token de ingesta propio de ese tablero
  (el token de A en el tablero de B → `401`).

---

## Actualizaciones (PWA ya instaladas)

**Automáticas: sin tienda de apps, sin volver a emparejar.**
- El HTML del tablero se sirve con `no-store` y nada lo almacena en caché, por lo que cada inicio carga la versión más reciente.
- El service worker se actualiza automáticamente (el navegador vuelve a comprobar `/sw.js` al reiniciar, al navegar o cada ~24 h;
  hace `skipWaiting()` para que la nueva versión tome el control de inmediato).
- Tu clave `K` reside en la **IndexedDB del navegador, en tu dispositivo** (no en el servidor) y sobrevive a las actualizaciones →
  sigues emparejado. **Simplemente reinicia la PWA para obtener la versión más reciente.**

(Un *dispositivo* nuevo todavía necesita emparejarse una vez: la IndexedDB de ese dispositivo aún no tiene `K`.)

---

## Resolución de problemas

- **¿Perdiste el enlace de tu tablero (el `#k=…`)?** No está en el relay; el relay nunca tuvo tu clave. Reside en la
  máquina donde ejecutaste `andon hosted setup`: ejecuta `andon hosted pair` allí para volver a imprimir el enlace completo (o lee
  `~/.andon/hosted.json` y une `relayUrl` + `/b/` + `boardId` + `#k=` + `key`). Un dispositivo que *nunca* se
  emparejó no puede recuperar el enlace desde el relay: vuelve a esa máquina, obtén el enlace y ábrelo una vez en el
  dispositivo nuevo.
- **"VINCULAR DE NUEVO: vuelve a abrir el enlace de tu tablero en este dispositivo."** Este dispositivo no tiene clave (dispositivo
  nuevo, almacenamiento borrado, o un inicio desde la pantalla de inicio donde se eliminó el `#k`). Vuelve a abrir una vez el enlace
  completo de tu tablero (con `#k=…`); vuelve a almacenar la clave en caché.
- **El tablero carga pero todo está en blanco / no se descifra.** Probablemente abriste un enlace **sin** la parte `#k=…`
  (algunas herramientas truncan en `#`). Vuelve a copiar el enlace *completo*.
- **Una tarjeta obsoleta no desaparece.** Las tarjetas se borran cuando el agente publica `done`/`gone`, o tras un TTL de 6 h. Una
  sesión finalizada normalmente se resuelve sola; una sesión muerta o de prueba permanece hasta el TTL.
- **No hay notificaciones push en el teléfono.** Las notificaciones push necesitan **HTTPS** (así que el tablero sobre `127.0.0.1` no
  enviará push); en iPhone el tablero debe **añadirse primero a la pantalla de inicio**; y debes tocar **Activar alertas** y permitir
  las notificaciones.
- **Detener todo:** `andon hosted off` (detiene el reenvío) y, si ejecutaste tu propio relay,
  `lsof -ti tcp:<port> | xargs kill`.
