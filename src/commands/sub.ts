/**
 * `andon sub <+n|-n> [id]` — adjust a process's in-flight background-task count.
 *
 * A background workflow bumps its parent's pending count (+1 on start, -1 on
 * finish) so the board keeps that process reading "running" until the work
 * actually drains. Without this, the foreground agent ending a turn (green)
 * would falsely look like "everything's done" while children still run.
 *
 *   andon sub +1            # a background task started (id from $ANDON_SESSION)
 *   andon sub -1            # ...and finished
 *   andon sub +1 <id>       # target an explicit process id
 *
 * Like `post`, this is best-effort and silent unless --verbose: a missing
 * server must never break the workflow that called it.
 */
import { postEvent } from "../client";
import { serverBase } from "../net";

export async function sub(args: string[]): Promise<number> {
  const verbose = args.includes("--verbose") || args.includes("-v");
  const show = verbose || Boolean(process.stdout.isTTY); // confirm interactively, quiet when scripted
  // keep positionals, but treat a leading-minus integer (e.g. "-1") as a value
  const pos = args.filter((a) => !a.startsWith("-") || /^-\d+$/.test(a));
  const [deltaRaw, idArg] = pos;

  const delta = Math.trunc(Number(deltaRaw));
  if (!deltaRaw || !Number.isFinite(delta) || delta === 0) {
    console.error("usage: andon sub <+n|-n> [id]   (id defaults to $ANDON_SESSION)");
    return 2;
  }

  const id = idArg || process.env.ANDON_SESSION;
  if (!id) {
    console.error("✗ no session id — pass one as the 2nd arg or set ANDON_SESSION");
    return 2;
  }

  const r = await postEvent({ id, sub: delta });
  if (!r.ok) {
    if (show)
      console.error(
        `✗ andon server unreachable at ${serverBase()} — start it with: andon serve` +
          (verbose ? `  (${r.error ?? "unknown"})` : ""),
      );
    return 1; // non-zero for scripts, but quiet unless interactive / -v
  }
  if (show) console.log(`✓ ${id}: ${delta > 0 ? "+" : ""}${delta} background`);
  return 0;
}
