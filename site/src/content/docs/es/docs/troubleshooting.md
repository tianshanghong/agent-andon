---
title: "Resolución de problemas y preguntas frecuentes"
description: "Soluciones a los problemas más comunes de Agent Andon: el tablero que no se actualiza, los hooks que no se disparan, las tarjetas atascadas y las alertas de escritorio o de móvil que no llegan."
---

## Resolución de problemas

- **El dispositivo del tablero no puede abrir la página** — ¿el mismo Wi-Fi? ¿`http`, no `https`? ¿El firewall
  de tu ordenador permite las conexiones entrantes (en macOS: Ajustes del Sistema → Red → Firewall)? ¿Copiaste bien
  la IP (se imprime al arrancar, y `andon doctor` la reimprime)?
- **El hook de Claude no hace nada** — ejecuta `claude --debug` una vez y vigila si hay errores en los hooks;
  vuelve a ejecutar `andon install claude`; `andon doctor` para confirmar.
- **Las tarjetas de Codex no aparecen nunca / no cambian nunca** — ejecuta `/hooks` dentro de Codex una vez para
  confiar en los hooks (Codex omite los hooks que no son de confianza); `andon doctor` confirma la conexión.
- **Una tarjeta «trabajando» está atascada** — es probable que un proceso muriera antes de enviar su evento de fin.
  Se borra sola tras 6 h; en Codex, `andon post gone codex` desde el directorio de ese proyecto la borra ahora mismo.
- **No suena el aviso en el tablero** — toca **Activar alertas** una vez (los navegadores silencian el audio hasta que
  lo haces); en el móvil, el tablero debe estar sobre **HTTPS** para las notificaciones push (consulta [running.md](/es/docs/running/)).

## Preguntas frecuentes

**¿Cómo recibo un aviso cuando Claude Code termina o necesita aprobación?**
Ejecuta `andon serve` (las alertas de escritorio vienen activadas por defecto) y `andon install claude`. Recibes un banner de
escritorio en el instante en que una sesión te necesita o termina, además del tablero en vivo en cualquier dispositivo.

**¿Puedo vigilar varias sesiones de Claude Code / Codex a la vez?**
Sí, de eso se trata. Cada sesión es su propia fila, y lo que te necesita sube arriba del todo.

**¿Funciona con OpenAI Codex?**
Sí. `andon install codex` conecta los hooks de ciclo de vida de Codex (ejecuta `/hooks` una vez para confiar en ellos).

**¿De verdad necesito un iPad?**
No. El tablero es una simple página web: ábrela en cualquier teléfono, tablet o navegador. Un iPad que tengas de sobra solo
sirve como una bonita pantalla de pared siempre encendida. También recibes banners de escritorio y un resumen en la barra de menús.

**¿Se envía mi código o mis datos a algún sitio?**
No: por defecto, nada sobre tus agentes sale de tu máquina. Andon es totalmente autoalojado: sin cuenta, sin telemetría, sin
analítica, sin «llamar a casa». Lo único que llega a guardar es información de estado general (el estado, el nombre del proyecto, un
mensaje de una línea), nunca tu código, tus registros ni tus secretos.

Tres salvedades honestas: (1) el tablero carga sus fuentes web desde Google Fonts a menos que las autoalojes; esa petición no lleva
ningún dato de los agentes, solo la descarga de fuentes normal de tu navegador. (2) Las funciones opcionales (las notificaciones push
al móvil y el relay alojado) son **estrictamente voluntarias** y cada una detalla exactamente qué sale de tu máquina; el relay alojado
está diseñado de modo que ni *él mismo* pueda leer los mensajes de tus agentes. Ninguna de ellas cambia este enfoque
local por defecto. (3) Este sitio de documentación en sí (no Andon, la herramienta) usa Web Analytics sin cookies de
Cloudflare para contar las visitas: sin cookies, sin seguimiento entre sitios, sin datos de los agentes; el tablero que ejecutas y el
relay nunca lo cargan.
