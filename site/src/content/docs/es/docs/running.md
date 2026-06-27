---
title: "Ejecutar Andon: iniciar, comprobar, detener"
description: "Inicia, comprueba y detén cada componente de Agent Andon: el servidor del tablero, Tailscale Serve para el acceso desde el teléfono y el relay opcional ciego al contenido."
---

Andon tiene hasta tres componentes independientes que podrías ejecutar. Cada uno se inicia y se detiene por su cuenta;
esta página es el comando exacto para cada uno.

| Componente | Puerto | Qué es | Cuándo lo necesitas |
|---|---|---|---|
| **`andon serve`** | 8787 | el servidor del tablero (en tu ordenador) | siempre: esto *es* el tablero |
| **Tailscale Serve** | — | expone el 8787 sobre HTTPS a *tu* tailnet | accede al tablero / recibe push en el teléfono, solo para ti |
| **`andon relay`** | 8788 | el relay alojado ciego al contenido | solo si ejecutas tu **propio** relay; consulta [deploy-relay.md](/es/docs/deploy-relay/) |

> Tailscale Serve y el relay son **alternativas** para el acceso remoto o desde el teléfono; no ejecutas ambos.
> La mayoría de la gente solo ejecuta `andon serve`.

---

## 1. El tablero: `andon serve` (puerto 8787)

**Iniciar (en primer plano; `Ctrl-C` para detener):**
```bash
andon serve
```

**Iniciar (en segundo plano; sobrevive al cierre de la terminal):**
```bash
nohup andon serve > /tmp/andon.log 2>&1 &      # macOS / Linux
```
(Windows: ejecútalo en su propia ventana de terminal, o `start /b andon serve`.)

**Comprobar si está en ejecución:**
```bash
lsof -iTCP:8787 -sTCP:LISTEN        # shows the listener if it's up
pgrep -fl "cli.js serve"            # shows the process
```

**Detener:**
- En primer plano: **`Ctrl-C`** en su terminal.
- En segundo plano / no sabes en qué terminal: `pkill -f "cli.js serve"`

**Inicio automático al iniciar sesión (opcional):** macOS: adapta `examples/com.agentandon.server.plist` para `launchd`;
Linux: una unidad `systemd --user`. Omite esto si prefieres iniciarlo a mano.

---

## 2. Acceso desde el teléfono o remoto mediante Tailscale Serve (sin relay)

Esto coloca tu tablero local (8787) en una dirección **HTTPS** a la que solo pueden acceder **tus propios dispositivos Tailscale**:
suficiente para el tablero y las notificaciones push en el teléfono, sin ejecutar un relay.

> **Idea clave:** `tailscale serve` es una **configuración persistente, no un proceso que mantienes abierto.** La configuras
> **una vez**; Tailscale la almacena y sobrevive a los reinicios. Solo *reenvía*: el tablero en sí todavía tiene que
> estar en ejecución (`andon serve` en el 8787), o la dirección HTTPS devuelve **502**. Son dos cosas distintas.

**Requisitos previos:** Tailscale instalado y con la sesión iniciada tanto en el ordenador como en el teléfono (la misma cuenta);
certificados HTTPS habilitados para tu tailnet (consola de administración → **DNS** → habilita MagicDNS + HTTPS).

**Configúralo (una vez):**
```bash
tailscale serve --bg 8787
```
Sirve `https://<your-machine>.<your-tailnet>.ts.net` → `127.0.0.1:8787`, **solo en el tailnet**.

**Ver la asignación actual:**
```bash
tailscale serve status
```

**Eliminar la asignación:**
```bash
tailscale serve reset
```

**En el teléfono:** abre la dirección `https://…ts.net` (con la app de Tailscale conectada) → **Añadir a pantalla de inicio**
(necesario para las notificaciones push en iPhone/iPad) → toca **Activar alertas**.

> `tailscale serve` = **privado** (solo tu tailnet). `tailscale funnel` = **internet público**:
> no lo uses a menos que sea tu intención.

---

## 3. Tu propio relay: `andon relay` (puerto 8788)

> **¿No quieres ejecutar ningún relay?** No tienes por qué; usa el nuestro. `andon hosted setup https://relay.agentandon.com`
> te apunta a nuestro relay gestionado y ciego al contenido: el tablero desde cualquier lugar, sin configuración, nada que alojar.
> Consulta [Andon alojado](/es/docs/hosted/).

Solo si alojas tú mismo el relay ciego al contenido (la mayoría de la gente usa el relay gestionado, o Tailscale,
en su lugar). Guía completa de producción (HTTPS, capacidad, inicio automático): **[deploy-relay.md](/es/docs/deploy-relay/)**.

| Acción | Comando |
|---|---|
| Iniciar (en primer plano) | `andon relay` |
| Iniciar (en segundo plano) | `nohup andon relay > /tmp/andon-relay.log 2>&1 &` |
| Comprobar | `lsof -iTCP:8788 -sTCP:LISTEN` |
| Detener | `Ctrl-C` (en primer plano) · `pkill -f "cli.js relay"` (en segundo plano) |

---

## Referencia rápida

```bash
# What's running?
lsof -nP -iTCP:8787 -iTCP:8788 -sTCP:LISTEN     # the board / relay ports
tailscale serve status                           # the Tailscale HTTPS mapping

# Stop everything
pkill -f "dist/cli.js"      # stops andon serve + andon relay
tailscale serve reset       # removes the Tailscale HTTPS mapping
```

**La vía del "teléfono a través de Tailscale" = la asignación de Tailscale Serve (configurada una vez, persistente) + `andon serve`
en ejecución.** ¿Lo quieres activo? Inicia `andon serve`. ¿Terminaste por ahora? `pkill -f "cli.js serve"`: la asignación puede
quedarse; el siguiente `andon serve` vuelve a ser accesible.
