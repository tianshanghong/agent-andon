---
title: "Configuración y seguridad"
description: "Configura Agent Andon: puertos, tokens de autenticación, caducidad por inactividad (TTL) y el modelo de seguridad del servidor del tablero local y del relay."
---

Variables de entorno, autenticación por token y el modelo de red/seguridad del tablero autoalojado.

## Seguridad

Por defecto, el servidor escucha en `0.0.0.0` **sin autenticación**: cualquiera en la LAN puede
leer y publicar el estado. Está bien en un Wi-Fi doméstico de confianza; **no lo ejecutes en una red
pública o no confiable.** Para una red compartida, define un token (expórtalo también en todos los
sitios donde se ejecutan los hooks):

```bash
ANDON_TOKEN=somesecret andon serve
```

Con un token definido, `/state` y `/event` lo requieren. Los hooks y la CLI lo envían automáticamente
como cabecera `x-andon-token` (siempre que `ANDON_TOKEN` esté en su entorno); en el dispositivo del
tablero, ábrelo con `?token=somesecret` y lo conserva en las peticiones siguientes. `/healthz`
permanece abierto para que `andon doctor` siempre funcione.

El tablero nunca expone más que estado de alto nivel (el estado, el nombre del proyecto, un
mensaje de una línea); nunca código ni registros completos. El cuerpo de los eventos está limitado a 64 KB.

> ¿Vas a exponer el tablero más allá de tu LAN? No uses port-forwarding: usa las vías HTTPS de
> [running.md](/es/docs/running/) (Tailscale Serve) o un [relay](/es/docs/deploy-relay/).

## Variables de entorno

| Variable de entorno | Valor por defecto | Significado |
|---|---|---|
| `AGENT_STATUS_URL` | `http://127.0.0.1:8787` | URL base del servidor a la que publican los hooks |
| `ANDON_TOKEN` | *(ninguno)* | token compartido que requieren `/state` y `/event` cuando está definido |
| `ANDON_PORT` / `ANDON_HOST` | `8787` / `0.0.0.0` | puerto / host en los que escucha el servidor |
| `ANDON_LABEL` | nombre de la carpeta | título de la tarjeta (por terminal) |
| `ANDON_SESSION` | — | sobrescribe el id de sesión de una tarjeta (p. ej. para un trabajo en segundo plano) |
| `ANDON_IDLE_TTL_SEC` | `900` (15 min) | cuánto tiempo permanece una tarjeta terminada/inactiva antes de su eliminación automática, para que los subagentes/compañeros de equipo que han salido no se acumulen. Las tarjetas activas y las de «te necesita» usan en su lugar el TTL estricto de 6 h. |

(Las variables de entorno específicas del relay —`ANDON_RELAY_PORT`, `ANDON_DATA_DIR`, `ANDON_PUSH_SUBJECT`, …— están en
[deploy-relay.md](/es/docs/deploy-relay/).)
