---
title: "Ejemplo de notificación con el hook Stop de Claude Code"
description: "Un hook Stop de Claude Code listo para copiar y pegar que lanza una notificación de escritorio cuando el agente te devuelve el turno — además de qué significa de verdad el evento Stop y una configuración más completa con Agent Andon."
updated: 2026-06-27
howto:
  - name: "Abre la configuración de Claude Code"
    text: "Edita ~/.claude/settings.json (créalo si no existe)."
  - name: "Añade un hook Stop"
    text: "En hooks.Stop, añade un hook de tipo command que ejecute tu comando de notificación."
  - name: "Guarda y prueba"
    text: "Guarda el archivo y termina un turno de Claude Code: salta la notificación."
---

Claude Code dispara un hook **`Stop`** cada vez que el agente termina su turno y te devuelve el control. Ese es el momento perfecto para recibir un aviso, en lugar de volver con alt-tab a una terminal que se quedó en silencio hace diez minutos. Aquí tienes un hook Stop mínimo que puedes pegar, qué significa de verdad el evento y cuándo conviene algo más completo.

## El hook Stop mínimo

Claude Code lee los hooks desde **`~/.claude/settings.json`**. Añade un hook `Stop` que ejecute un comando de notificación:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code handed the turn back\" with title \"Agent done\"'"
          }
        ]
      }
    ]
  }
}
```

Guárdalo, termina un turno en Claude Code y saltará una notificación de escritorio. En Linux, cambia el comando por `notify-send "Agent done" "Claude Code handed the turn back"`.

## Qué significa de verdad `Stop`

`Stop` se dispara cuando Claude **te devuelve el turno**; *no* es una promesa de que toda la tarea esté terminada: puede que el agente solo esté esperando tu siguiente instrucción. Conviene conocer dos eventos relacionados:

- **`Notification`**: Claude está esperando un permiso o tu intervención *a mitad de la tarea* (el momento «te necesita»). A menudo es el que más te interesa captar.
- **`StopFailure`**: el turno terminó en error (en versiones más recientes de Claude Code).

Un hook `Stop` de una sola línea capta el primer caso pero se pierde estos, y solo avisa en la única máquina en la que se ejecuta.

## Un hook Stop que hace más

Si ejecutas más de un agente, o quieres el aviso en el móvil, el hook a pelo se vuelve engorroso enseguida: un notificador por máquina, nada para `Notification`, ninguna forma de ver varias sesiones a la vez.

**Agent Andon** te conecta todo eso:

```
npm i -g agent-andon
andon install claude
```

Eso instala juntos los hooks `Stop`, `Notification` y `StopFailure` y los asigna a un **tablero** que puedes abrir en cualquier pantalla —trabajando, te necesita, listo, atascado— con avisos de escritorio y push opcional en el móvil. `andon install --dry-run claude` imprime el `settings.json` resultante sin escribirlo; `andon uninstall claude` elimina solo lo que añadió.

Consulta [Comandos y eventos](/es/docs/commands/) para ver la asignación completa de evento→estado, y [Notificaciones](/es/docs/notifications/) para los canales de aviso.
