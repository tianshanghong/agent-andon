/**
 * `andon post <state> <agent> [title] [message]` — manual status pusher (for
 * scripts and board testing).
 *
 *   andon post working codex "api"            # mark a tile working
 *   andon post gone    codex "api"            # remove a tile
 *   andon post done    claude "api" "shipped" # manual board test
 */
import { postEvent } from "../client";
import { serverBase } from "../net";
import { labelFor, sessionId } from "./shared";

const STATES = ["working", "waiting", "done", "error", "idle", "gone"];

export async function post(args: string[]): Promise<number> {
  // Run by hand in a terminal, this confirms the push (or says the server's down)
  // so a manual test isn't a silent guess. Piped/scripted (not a TTY) it stays
  // quiet unless -v, so it never spams automation. Hooks post via the client
  // directly, not this verb, so they're unaffected either way.
  const verbose = args.includes("--verbose") || args.includes("-v");
  const show = verbose || Boolean(process.stdout.isTTY);
  const [state, agent, title, message] = args.filter((a) => !a.startsWith("-"));

  if (!state || !agent) {
    console.error(
      "usage: andon post <state> <agent> [title] [message]\n" +
        `  state: ${STATES.join("|")}`,
    );
    return 2;
  }
  if (!STATES.includes(state)) {
    console.error(`✗ unknown state "${state}" (expected: ${STATES.join("|")})`);
    return 2;
  }

  const cwd = process.cwd();
  const finalTitle = title || labelFor(cwd, agent);
  const r = await postEvent({
    agent,
    id: sessionId(agent, cwd),
    state,
    title: finalTitle,
    message: message || "",
  });

  if (!r.ok) {
    if (show) {
      console.error(
        `✗ andon server unreachable at ${serverBase()} — start it with: andon serve` +
          (verbose ? `  (${r.error ?? "unknown"})` : ""),
      );
    }
    return 1; // non-zero for scripts, but quiet unless interactive / -v
  }
  if (show) console.log(`✓ ${state} · ${agent} · ${finalTitle}`);
  return 0;
}
