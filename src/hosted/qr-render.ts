/**
 * Render a QR Code (from the vendored Nayuki encoder, src/vendor/qrcodegen.ts) into a
 * scannable terminal string. CLI-only — never served to a browser.
 *
 * Contract (pinned by test/qr-render.test.ts):
 *  - A 4-module LIGHT quiet zone on all sides; rendered width = size + 8 columns.
 *  - Two vertical modules per text row, packed into `▀` (upper half block): the glyph's
 *    foreground paints the TOP module, the cell background the BOTTOM module.
 *  - dark module → SGR 30 fg / 40 bg (black); light → 97 fg / 107 bg (bright white).
 *    Forcing bright black-on-white makes it scan regardless of terminal theme.
 *  - Each line ends with a reset (\x1b[0m). When the total side (size + 8) is ODD, the
 *    final text row's missing bottom module renders LIGHT — never dark, never OOB.
 */

export interface QrLike {
  readonly size: number;
  getModule(x: number, y: number): boolean;
}

/** Light modules around the symbol (QR spec recommends 4). */
export const QUIET = 4;

// Forced 16-colour SGR so the code is dark-on-light regardless of terminal theme.
const DARK_FG = 30, LIGHT_FG = 97, DARK_BG = 40, LIGHT_BG = 107;
const UPPER = "▀"; // ▀ upper half block: fg paints the top module, bg the bottom
const RESET = "\x1b[0m";

export function renderQr(qr: QrLike, opts?: { quiet?: number }): string {
  const quiet = opts?.quiet ?? QUIET;
  const total = qr.size + 2 * quiet;
  // Dark module at grid coords (including the quiet zone); outside the symbol = light.
  const isDark = (x: number, y: number): boolean => {
    const mx = x - quiet, my = y - quiet;
    return mx >= 0 && mx < qr.size && my >= 0 && my < qr.size && qr.getModule(mx, my);
  };
  const lines: string[] = [];
  for (let top = 0; top < total; top += 2) {
    let line = "";
    for (let x = 0; x < total; x++) {
      const fg = isDark(x, top) ? DARK_FG : LIGHT_FG;
      // Bottom module; the final row of an odd-height symbol has none → light.
      const bottom = top + 1 < total ? isDark(x, top + 1) : false;
      const bg = bottom ? DARK_BG : LIGHT_BG;
      line += `\x1b[${fg};${bg}m${UPPER}`;
    }
    lines.push(line + RESET);
  }
  return lines.join("\n") + "\n";
}
