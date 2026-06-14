/**
 * `andon statusline` — DEPRECATED no-op.
 *
 * The statusLine "presence heartbeat" was removed: for marginal benefit (only
 * surfacing already-running sessions when the board starts late) it ran a network
 * POST on every ~300ms status render and risked corrupting the terminal's status
 * redraw. New installs no longer wire it, and `andon uninstall claude` removes any
 * existing wiring. This stub stays only so a config that STILL references
 * `andon statusline` prints nothing (a clean, empty status line) instead of the
 * CLI's unknown-command help — which would itself garble the status bar.
 */
export async function statusline(_args: string[] = []): Promise<void> {
  // drain stdin so the caller isn't left hanging, then print nothing at all
  if (process.stdin.isTTY) return;
  await new Promise<void>((resolve) => {
    process.stdin.on("data", () => {});
    process.stdin.on("end", resolve);
    process.stdin.on("error", () => resolve());
    setTimeout(resolve, 200).unref();
  });
}
