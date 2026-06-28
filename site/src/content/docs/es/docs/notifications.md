---
title: "Notificaciones de Claude Code y Codex: alertas de escritorio y barra de menús"
description: "Configura las alertas de escritorio y el indicador de la barra de menús para tus agentes de Claude Code y Codex, para que se te avise en el momento en que uno te necesita, termina o se atasca."
---

El único trabajo de Andon es **captar tu atención en el momento justo** —cuando un
agente te necesita o se queda bloqueado— y, por lo demás, mantenerse en silencio. El tablero es el
canal universal (funciona en cualquier dispositivo); estos añaden más, cada uno degradándose con
elegancia en macOS / Linux / Windows.

## Alertas de escritorio nativas

Un banner en la máquina que ejecuta el servidor, **activado por defecto**. Con sonido para los estados que te necesitan,
en silencio para la finalización:

- **te necesita (ámbar)** / **atascado (rojo)** → banner + sonido (inmediato).
- **terminado (verde)** → un solo banner *discreto* (sin sonido), con un antirrebote de 4 s para que un
  verde transitorio nunca dispare un falso «listo».

```bash
andon serve                 # alerts on by default
andon serve --say           # also speak needs-you / stuck aloud
andon serve --no-notify     # turn alerts off
```

Usa `osascript`/`say` (macOS), `notify-send`/`spd-say` (Linux), toast de PowerShell/`System.Speech`
(Windows). Si falta la herramienta → se omite en silencio. (Se desactiva automáticamente con
`--demo` para que los agentes falsos que van rotando no te saturen.) Las alertas están
**limitadas** (un enfriamiento por sesión + un cubo de tokens global) para que un cliente de la LAN
ocupado —o malicioso— que publique en `/event` no pueda desencadenar una avalancha de creación de procesos.

## Barra de menús / de estado

Un resumen de un vistazo, sin necesidad de una pantalla aparte:

```bash
curl -s http://127.0.0.1:8787/menubar     # plain-text summary endpoint
```

Conéctalo a SwiftBar/xbar (macOS) o Waybar/polybar (Linux); consulta
`examples/andon-menubar.5s.sh`.

## ¿Menos interrupciones? Configura tú mismo las aprobaciones

Andon **nunca toca tus ajustes de permisos/aprobaciones**: eso es cosa tuya.
Si el ámbar «te necesita» salta más de lo que querrías, preaprueba las operaciones seguras en
la propia configuración de tu agente (así Andon solo se encenderá para el resto):

- **Claude Code** — añade patrones de solo lectura a `permissions.allow` en
  `~/.claude/settings.json`, p. ej. `"Read"`, `"Bash(git status:*)"`,
  `"Bash(npm test:*)"`. Tus reglas `deny`/`ask` siempre tienen prioridad, y el
  comparador de Bash entiende los operadores de shell (así que `Bash(git status:*)` no aprobará
  `git status && rm -rf`). Consulta `/permissions`.
- **Codex** — define `approval_policy` (p. ej. `"untrusted"` ejecuta automáticamente los comandos
  de solo lectura de confianza) y/o `sandbox_mode` en `~/.codex/config.toml`.

Mantener esto en *tus* manos significa que Andon nunca puede debilitar tus reglas de seguridad,
y el tablero sigue siendo un fiel reflejo de cuándo se te necesita de verdad.
