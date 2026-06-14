/**
 * `andon post <state> <agent> [title] [message]` — manual / wrapper pusher.
 *
 *   andon post working codex                 # codex wrapper: on launch
 *   andon post gone    codex                 # codex wrapper: on exit
 *   andon post done    claude "api" "shipped" # manual board test
 */
import { postEvent } from "../client";
import { labelFor, sessionId } from "./shared";

const STATES = ["working", "waiting", "done", "error", "idle", "gone"];

export async function post(args: string[]): Promise<number> {
  // The codex wrapper calls `andon post` in the foreground on every launch, so
  // pushing status is best-effort and SILENT by default — a missing server must
  // not spam the terminal. Pass --verbose (-v) to see why a push failed.
  const verbose = args.includes("--verbose") || args.includes("-v");
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
  const r = await postEvent({
    agent,
    id: sessionId(agent, cwd),
    state,
    title: title || labelFor(cwd, agent),
    message: message || "",
  });

  if (!r.ok) {
    if (verbose) {
      console.error(`✗ could not reach the andon server (${r.error ?? "unknown"})`);
    }
    return 1; // non-zero for scripts, but quiet
  }
  return 0;
}
