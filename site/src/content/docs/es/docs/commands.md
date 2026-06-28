---
title: "Comandos, hooks de ciclo de vida y mapeo de eventos de Claude Code y Codex"
description: "Cada comando de la CLI de Agent Andon, y cómo los hooks de ciclo de vida y los eventos de Claude Code / Codex se asignan a los estados del tablero: install, serve, doctor, hosted y más."
---

La referencia completa de la CLI, cómo los eventos de los agentes se convierten en estados del tablero, el recuento de
tareas en segundo plano, las particularidades de Codex y el nombrado de las tarjetas. (El inicio rápido y los comandos
habituales están en el [README](https://github.com/tianshanghong/agent-andon/blob/main/README.md).)

## Comandos

| Comando | Qué hace |
|---|---|
| `andon serve [--demo] [--port N] [--token T] [--no-notify] [--say]` | Ejecuta el servidor del tablero; alertas de escritorio activadas por defecto (`--no-notify` las desactiva, `--say` añade voz) |
| `andon install claude` | Conecta los hooks de estado de Claude Code (copia de seguridad con marca de tiempo) |
| `andon install codex` | Conecta los hooks de ciclo de vida de Codex (ejecuta `/hooks` para confiar en ellos) |
| `andon uninstall <claude\|codex>` | Elimina solo lo que Andon añadió; deja intacto el resto de tu configuración |
| `andon doctor` | Comprobación de estado + qué está conectado + la URL del tablero |
| `andon post <state> <agent> [title] [msg]` | Envía un estado a mano |
| `andon sub <+n\|-n> [id]` | Ajusta el recuento de tareas en segundo plano de un proceso |
| `andon relay` / `andon hosted` / `andon verify` | El relay alojado opcional: consulta [hosted.md](/es/docs/hosted/) |
| `andon hook` / `andon codexhook` | *(interno: lo invocan los hooks)* |

`andon install --dry-run claude` imprime el cambio sin escribirlo.

## Mapeo de evento → estado (Claude Code)

| Evento de Claude Code | Estado en el tablero | Cuándo |
|---|---|---|
| `SessionStart` | inactivo (pizarra) | sesión iniciada: la tarjeta aparece de inmediato |
| `UserPromptSubmit` | trabajando (azul) | acabas de enviar un prompt |
| `PostToolUse` | trabajando (azul) | una herramienta acaba de ejecutarse: borra el ámbar en cuanto apruebas |
| `Notification` | te necesita (ámbar, parpadea) | esperando permiso / tu intervención |
| `Stop` | **listo** (verde) | te devuelve el turno: te toca a ti, *no* «todo terminado» |
| `StopFailure` | atascado (rojo, parpadea) | el turno falló (solo en versiones recientes de Claude Code) |
| `SessionEnd` | *eliminada* | la sesión terminó; la tarjeta desaparece |

Cada sesión recibe su propia tarjeta (indexada por `session_id`). Un proceso =
una tarjeta; sus subagentes se agrupan en ella en lugar de generar la suya propia. Una sesión
que *ya estaba en ejecución* antes de que arrancara el tablero aparece en su siguiente evento
(prompt, herramienta, fin de turno): Andon se mantiene completamente al margen de tu statusLine.

## Trabajo en segundo plano: mantén una tarjeta honesta más allá de «terminado»

`Stop` significa que el agente en primer plano te devolvió el turno; **no** significa que el
trabajo en segundo plano haya terminado. Si un proceso lanza flujos de trabajo en segundo plano, haz
que informen para que la tarjeta siga «trabajando» (azul) hasta que se vacíen, en lugar de pasar a
verde de forma engañosa:

```bash
export ANDON_SESSION="<this process's tile id>"   # the session_id of the parent tile
andon sub +1     # a background task started
#   ...do the work...
andon sub -1     # it finished
```

Mientras el recuento sea `> 0`, la tarjeta muestra `WORKING ⋯N background` y solo se pone en verde
cuando cada tarea ha informado `-1`.

## Codex

El Codex moderno (≈ 0.117+) tiene un sistema de **hooks** totalmente compatible con Claude, así que
Andon obtiene el mismo ciclo de vida que Claude Code, incluido el ámbar **te necesita**:

```bash
andon install codex      # wires lifecycle hooks → ~/.codex/hooks.json
```

| Evento de hook de Codex | Estado en el tablero |
|---|---|
| `SessionStart` | inactivo (la tarjeta aparece al iniciarse) |
| `UserPromptSubmit` / `PostToolUse` | trabajando (azul) |
| `PermissionRequest` | **te necesita (ámbar)** |
| `Stop` | listo (verde) |
| `SessionEnd` | *eliminada* |

> **Un paso extra que Codex requiere:** los hooks nuevos deben ser **de confianza** antes de
> ejecutarse: ejecuta `/hooks` dentro de Codex una vez (o inicia `codex
> --dangerously-bypass-hook-trust`). `andon uninstall codex` vuelve a eliminar limpiamente los
> hooks, con una copia de seguridad con marca de tiempo.

Salvedad residual: el rojo «atascado» sigue basándose en la inactividad (no hay un hook específico
para turnos fallidos). (Las sesiones que ya están en ejecución aparecen en su siguiente evento, igual que en Claude.)

## Nombrar una tarjeta

El título predeterminado es el nombre de la carpeta del proyecto. Cámbialo en cada terminal:

```bash
ANDON_LABEL="backend refactor" claude
ANDON_LABEL="landing copy"     codex
```
