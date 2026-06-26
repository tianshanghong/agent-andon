/**
 * Wiring between the vendored encoder and our renderer for CLI use. Pure and testable:
 * the gate takes an explicit `env` (no direct process/terminal reads) so every skip path
 * is unit-testable. The caller prints the text link FIRST, then prints this if non-null —
 * so a skip (or any failure) never costs the user the link.
 */
import { qrcodegen } from "../vendor/qrcodegen";
import { renderQr, QUIET } from "./qr-render";

export interface QrEnv {
  isTTY?: boolean; // process.stdout.isTTY
  columns?: number; // process.stdout.columns (undefined = unknown)
  noColor?: boolean; // !!process.env.NO_COLOR
  noQr?: boolean; // the --no-qr flag
}

/**
 * The rendered QR string, or null when it should be skipped. Pure — the caller passes `env`
 * (no process/IO reads). Returning null means "no QR", NEVER "no link": callers MUST print the
 * text link themselves (see pairingBlock); a skip/failure here is strictly additive-only.
 */
export function qrForTerminal(url: string, env: QrEnv): string | null {
  if (env.noQr) return null; // explicitly suppressed
  if (!env.isTTY) return null; // piped/redirected/non-interactive (isTTY is undefined off a TTY)
  if (env.noColor) return null; // our renderer is colour-only; without colour it'd be contrast-less/unscannable
  try {
    const qr = qrcodegen.QrCode.encodeText(url, qrcodegen.QrCode.Ecc.MEDIUM);
    const width = qr.size + 2 * QUIET;
    // Too narrow → it would wrap and be unscannable. Unknown width (undefined) renders anyway:
    // rare off a real TTY, most terminals are wide, and the link is always the fallback.
    if (typeof env.columns === "number" && env.columns < width) return null;
    return renderQr(qr);
  } catch {
    // Defense-in-depth: a short pairing URL always encodes at MEDIUM, so reaching here means a
    // malformed/oversized URL (a bug). Skip the QR rather than crash — the link already printed.
    return null;
  }
}

/**
 * The block printed under "open your board": the text link ALWAYS, a one-line "treat like a
 * password" caution ALWAYS (the link IS the secret, and it now sits in scrollback), and the QR
 * + scan note only when a QR renders. The link is the higher-exposure artifact (plaintext,
 * greppable), so the caution rides the link — present on every path, not just when a QR shows.
 */
export function pairingBlock(url: string, env: QrEnv): string {
  const out = [
    `    ${url}`,
    "    ↑ treat like a password — it's your board AND its key, now in your scrollback. Don't screenshot or screen-share it.",
  ];
  const qr = qrForTerminal(url, env);
  if (qr) out.push("", qr.replace(/\n+$/, ""), "    (or scan it on your phone — same key.)");
  return out.join("\n");
}

// Re-exported so callers can size the quiet zone consistently if needed.
export { QUIET, renderQr, qrcodegen };
