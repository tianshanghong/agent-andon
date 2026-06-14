/**
 * `andon hook` — the Claude Code hook. Reads the hook JSON on stdin, maps the
 * event to a board state, posts it. Wired to 5 events (see `andon install`):
 *
 *   UserPromptSubmit -> working   you just submitted, the agent is off
 *   Notification     -> waiting   needs permission / your input
 *   Stop             -> done      this turn finished
 *   StopFailure      -> error     this turn failed (newer Claude Code only)
 *   SessionEnd       -> gone      session ended, drop the tile
 *
 * Discipline: print nothing to stdout (UserPromptSubmit stdout is fed to the
 * model as context), swallow every error, and let the caller always exit 0.
 */
import { postEvent } from "../client";
import { labelFor } from "./shared";
import type { AndonEvent } from "../types";

const EVENT_TO_STATE: Record<string, string> = {
  UserPromptSubmit: "working",
  Notification: "waiting",
  Stop: "done",
  StopFailure: "error",
  SessionEnd: "gone",
};

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve(data);
      }
    };
    if (process.stdin.isTTY) return done(); // no piped input
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", done);
    process.stdin.on("error", done);
    setTimeout(done, 800).unref(); // never hang the hook
  });
}

const shorten = (t: unknown, n = 140): string =>
  String(t ?? "").split(/\s+/).join(" ").trim().slice(0, n);

/**
 * Pure mapping from a Claude Code hook payload to a board event (no I/O).
 * Returns null for events we don't track. Exported for testing.
 */
export function mapClaudeEvent(data: Record<string, unknown>): AndonEvent | null {
  const evName = String(data.hook_event_name ?? "");
  const state = EVENT_TO_STATE[evName];
  if (!state) return null; // unknown event: quietly do nothing

  const cwd = String(data.cwd ?? process.cwd());
  const id = String(data.session_id ?? "claude");

  let message = "";
  if (evName === "Notification") message = shorten(data.message);
  else if (evName === "Stop" || evName === "StopFailure")
    message = shorten(data.last_assistant_message);

  return { agent: "claude", id, state, title: labelFor(cwd, "claude"), message };
}

export async function hook(): Promise<void> {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse((await readStdin()) || "{}");
  } catch {
    data = {};
  }
  const ev = mapClaudeEvent(data);
  if (ev) await postEvent(ev);
}
