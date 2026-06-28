---
title: "Convierte un iPad viejo en un tablero para tus agentes de programación"
description: "Monta en la pared un iPad que tengas libre como tablero de estado ambiental y siempre encendido para tus agentes de Claude Code y Codex: de un vistazo ves cuál te necesita. Aquí tienes la configuración."
updated: 2026-06-27
howto:
  - name: "Ejecuta el tablero"
    text: "En tu máquina, ejecuta `andon serve` y anota la URL del tablero que muestra."
  - name: "Ábrelo en el iPad"
    text: "Abre esa URL en Safari en el iPad: en la misma Wi-Fi, o a través de Tailscale / un relay que ejecutes, desde cualquier lugar."
  - name: "Mantén la pantalla encendida"
    text: "Configura el Bloqueo automático en Nunca y usa el Acceso guiado para fijar el iPad al tablero."
  - name: "Móntalo"
    text: "Coloca el iPad en un soporte o móntalo en la pared donde puedas verlo de un vistazo."
---

Ese iPad viejo que tienes guardado en un cajón es perfecto como **tablero de estado ambiental**. Montado en la pared con Agent Andon, muestra de un vistazo cada agente de Claude Code y Codex —verde cuando termina, ámbar cuando alguno te necesita— para que nunca tengas que hacer alt-tab solo para comprobarlo. No hay ninguna app que instalar; es una página web.

## Ejecuta el tablero

En la máquina donde se ejecutan tus agentes:

```
andon serve
```

Muestra la URL de un tablero. (¿Aún no has conectado tus agentes? Ejecuta primero `andon install claude` / `andon install codex`.)

## Ábrelo en el iPad

Abre esa URL en **Safari** en el iPad:

- **La misma Wi-Fi** — usa directamente la URL de la red local que aparece.
- **Desde cualquier lugar** — expón el tablero con Tailscale Serve, o empareja un relay ciego al contenido que ejecutes (`andon hosted setup <relay-url>`) y abre esa URL en su lugar. Consulta [Andon alojado](/es/docs/hosted/).

Después, **Compartir → Añadir a pantalla de inicio** para una vista a pantalla completa, sin la interfaz del navegador.

## Mantenlo siempre encendido

Dos ajustes de iOS convierten una tableta en una pantalla de pared:

- **Ajustes → Pantalla y brillo → Bloqueo automático → Nunca**, para que la pantalla no se apague.
- El **Acceso guiado** (Ajustes → Accesibilidad → Acceso guiado) fija el iPad al tablero, para que un toque de pasada no se salga de él.

## Móntalo

Un soporte barato en el escritorio, o un montaje de pared a la altura de los ojos. Ahora un vistazo —no un cambio de contexto— te dice qué agente te necesita.

El tablero sube al principio la sesión que **te necesita** y se mantiene en silencio el resto del tiempo, así que el iPad está tranquilo hasta que deja de estarlo. Consulta [Ejecutar Andon](/es/docs/running/) para el servidor del tablero, y [Notificaciones](/es/docs/notifications/) si además quieres avisos en el escritorio o el móvil.
