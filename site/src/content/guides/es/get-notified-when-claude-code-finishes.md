---
title: "Cómo recibir un aviso cuando Claude Code termina o te necesita"
description: "Claude Code y Codex pueden ejecutarse durante minutos y luego terminar o atascarse esperándote — en silencio. Aquí te explicamos cómo recibir una alerta en el escritorio o el móvil en el momento en que un agente te necesita, con Agent Andon."
updated: 2026-06-27
howto:
  - name: "Instala Agent Andon"
    text: "Instala el CLI con `npm i -g agent-andon`. No tiene dependencias y se ejecuta por completo en tu máquina."
  - name: "Conecta los hooks de tu agente"
    text: "Ejecuta `andon install claude` (y `andon install codex`) para añadir hooks de ciclo de vida que informan el estado de cada sesión. Sin cambiar tu flujo de trabajo."
  - name: "Abre el tablero"
    text: "Ejecuta `andon serve` y abre el tablero en cualquier navegador, móvil o iPad que tengas libre para ver todas las sesiones de un vistazo."
  - name: "Activa los avisos"
    text: "Los banners de escritorio están activados por defecto; conecta el resumen de la barra de menús si lo quieres, y vincula un relay ciego al contenido para recibir push en el móvil desde cualquier lugar."
---

Pones a Claude Code a trabajar en una tarea, cambias de pestaña para hacer otra cosa y entonces… esperas. ¿Habrá terminado? ¿Estará atascado en un mensaje esperando tu «sí»? Vuelves con alt-tab para comprobar y descubres que terminó hace cuatro minutos — o peor, que estuvo bloqueado todo el rato. Multiplica eso por varios agentes y el día se convierte en vigilar terminales.

**Agent Andon** resuelve esto: vigila tus agentes de programación y te avisa en el momento en que uno **termina**, **necesita tu intervención** o **se atasca** — en un tablero que puedes abrir en cualquier pantalla, con avisos opcionales en el escritorio y el móvil.

## Instala Agent Andon

```
npm i -g agent-andon
```

Es un CLI sin dependencias que se ejecuta en local — sin cuenta, sin telemetría.

## Conecta los hooks de tu agente

Andon lee los **hooks de ciclo de vida nativos** de cada herramienta — no envuelve ni hace de proxy de tu agente.

```
andon install claude
```

Eso es todo: Claude Code ahora informa sus cambios de estado (trabajando → te necesita → listo → atascado) sin cambiar tu forma de trabajar. ¿También usas OpenAI Codex? `andon install codex` hace lo mismo.

## Qué significa cada estado

- **Trabajando** — el agente está ocupado; no necesita nada de ti.
- **Te necesita** — está esperando un mensaje, un permiso o una decisión. Este es el que conviene captar rápido.
- **Listo** — el agente terminó su turno y te lo devolvió.
- **Atascado** — dio un error o se quedó bloqueado.

## Abre el tablero en cualquier pantalla

```
andon serve
```

Abre la URL que aparece en cualquier navegador, en tu móvil o en un iPad montado en la pared. Cada sesión aparece como una fila, y la que **te necesita** sube al principio — así, de un vistazo, sabes dónde mirar.

## Recibe avisos en el escritorio y el móvil

Los **banners de escritorio** están activados por defecto. Un **resumen en la barra de menús** está a un solo paso — Andon sirve un estado en texto plano en `/menubar` al que apuntas SwiftBar, xbar o Waybar.

Para recibir **push en el móvil desde cualquier lugar** — incluso lejos de tu máquina — vincula un **relay ciego al contenido**, que reenvía los avisos sin poder leer los nombres de tus proyectos ni tus mensajes. Apunta Andon a uno con:

```
andon hosted setup <relay-url>
```

Puedes ejecutar tu propio relay o usar el gestionado (próximamente). Consulta [Notificaciones](/es/docs/notifications/) para los detalles del escritorio y la barra de menús, y [Andon alojado](/es/docs/hosted/) para el relay.

## También funciona con Codex

Todo lo anterior se aplica también a **OpenAI Codex** — `andon install codex`, el mismo tablero, los mismos avisos. Observa las sesiones de Claude Code y Codex lado a lado.

---

Ese es todo el ciclo: instalar, conectar el hook, abrir el tablero, activar los avisos. Que un agente termine o te necesite se convierte en una notificación — y no en algo que descubres diez minutos tarde.
