/**
 * `andon hook` — the Claude Code hook. Reads the hook JSON on stdin, maps the
 * event to a board state, posts it. Wired to 5 events (see `andon install`):
 *
 *   SessionStart     -> idle      session just launched — show the tile right
 *                                 away (slate), before the first prompt
 *   UserPromptSubmit -> working   you just submitted, the agent is off
 *   PostToolUse      -> working   a tool just ran — clears amber the instant you
 *                                 approve a permission and the agent resumes
 *   Notification     -> waiting   needs permission / your input
 *   Stop             -> done      turn handed back to you — your move, NOT
 *                                 "all finished". The board shows this as the
 *                                 green "READY" state, and if the process has
 *                                 background tasks still running (see `andon
 *                                 sub`) it stays "running" until they drain.
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
  SessionStart: "idle", // tile shows up the moment a session launches
  UserPromptSubmit: "working",
  PostToolUse: "working", // fires after each tool runs → clears amber on approval
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

/**
 * `Notification` subtypes that are NOT a call to action: an idle "still waiting
 * for input" reminder (~60s after a turn ends), auth success, etc. These must
 * NOT turn the tile amber — in particular an idle reminder must not flip a
 * finished (green) tile to "needs you". Only real prompts (permission /
 * elicitation / unknown-for-safety) become amber.
 */
const NOTIFICATION_IGNORE = new Set([
  "idle_prompt",
  "auth_success",
  "elicitation_complete",
  "elicitation_response",
]);

const shorten = (t: unknown, n = 140): string =>
  String(t ?? "").split(/\s+/).join(" ").trim().slice(0, n);

/**
 * Build a precise message for a Notification event. The payload tells us whether
 * it's a tool-permission prompt (and which tool/command) vs an idle "your turn"
 * notification, so the board can say "needs approval: Bash(git push)" instead of
 * a generic line.
 */
function notificationMessage(data: Record<string, unknown>): string {
  const details = (data.details ?? {}) as Record<string, unknown>;
  const tool = String(details.tool_name ?? "");
  const ti = (details.tool_input ?? {}) as Record<string, unknown>;
  const arg = String(ti.command ?? ti.file_path ?? ti.path ?? ti.url ?? "");
  if (String(data.notification_type ?? "") === "permission_prompt" && tool) {
    return shorten(`needs approval: ${tool}${arg ? `(${arg})` : ""}`);
  }
  return shorten(data.message ?? "waiting for your input");
}

/**
 * Pure mapping from a Claude Code hook payload to a board event (no I/O).
 * Returns null for events we don't track. Exported for testing.
 */
export function mapClaudeEvent(data: Record<string, unknown>): AndonEvent | null {
  const evName = String(data.hook_event_name ?? "");
  const state = EVENT_TO_STATE[evName];
  if (!state) return null; // unknown event: quietly do nothing

  // an idle/non-actionable Notification shouldn't change the tile (esp. not
  // flip a finished green tile to amber after 60s of you not responding).
  if (evName === "Notification" && NOTIFICATION_IGNORE.has(String(data.notification_type ?? ""))) {
    return null;
  }

  const cwd = String(data.cwd ?? process.cwd());
  const id = String(data.session_id ?? "claude");

  let message = "";
  if (evName === "Notification") message = notificationMessage(data);
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
