/**
 * `andon codexhook` — the Codex CLI lifecycle hook (the Codex counterpart of
 * `andon hook`). Codex's hook system uses the SAME stdin JSON schema as Claude
 * Code, so this mirrors hook.ts with a Codex-specific event→state map.
 *
 *   SessionStart     -> idle      session launched — show the tile right away
 *   UserPromptSubmit -> working   you just submitted
 *   PostToolUse      -> working   a tool ran — clears amber after approval
 *   PermissionRequest-> waiting   needs your approval (amber) — NEW for Codex
 *   Stop             -> done       turn handed back to you ("READY")
 *   SessionEnd       -> gone       session ended, drop the tile
 *
 * Discipline (same as the Claude hook): print nothing to stdout, swallow every
 * error, always exit 0 — never block or crash Codex.
 */
import { postEvent } from "../client";
import { labelFor } from "./shared";
import type { AndonEvent } from "../types";

/**
 * Keyed by a normalized event name so we accept BOTH casings — Codex's trust
 * state uses snake_case (`session_start`), while docs/Claude use CamelCase
 * (`SessionStart`). Normalizing (strip `_`, lowercase) covers either.
 */
const STATE_BY_EVENT: Record<string, string> = {
  sessionstart: "idle",
  userpromptsubmit: "working",
  posttooluse: "working",
  permissionrequest: "waiting",
  notification: "waiting",
  stop: "done",
  sessionend: "gone",
};
const normEvent = (name: unknown): string => String(name ?? "").replace(/_/g, "").toLowerCase();

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    let done = false;
    const fin = () => {
      if (!done) {
        done = true;
        resolve(data);
      }
    };
    if (process.stdin.isTTY) return fin();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", fin);
    process.stdin.on("error", fin);
    setTimeout(fin, 800).unref();
  });
}

const shorten = (t: unknown, n = 140): string =>
  String(t ?? "").split(/\s+/).join(" ").trim().slice(0, n);

/**
 * Pure mapping from a Codex hook payload to a board event (no I/O). Keyed by
 * `session_id` so one Codex session is one stable tile. Exported for testing.
 */
export function mapCodexHookEvent(data: Record<string, unknown>): AndonEvent | null {
  const ev = normEvent(data.hook_event_name);
  const state = STATE_BY_EVENT[ev];
  if (!state) return null; // event we don't track

  const cwd = String(data.cwd ?? process.cwd());
  const id = process.env.ANDON_SESSION || String(data.session_id ?? "codex");

  let message = "";
  if (ev === "permissionrequest" || ev === "notification") {
    const ti = (data.tool_input ?? {}) as Record<string, unknown>;
    const arg = String(ti.command ?? ti.file_path ?? ti.path ?? "");
    message = shorten(`needs approval: ${data.tool_name ?? ""}${arg ? `(${arg})` : ""}`.trim());
  } else if (ev === "stop") {
    message = shorten(data.last_assistant_message);
  }

  return { agent: "codex", id, state, title: labelFor(cwd, "codex"), message };
}

export async function codexhook(): Promise<void> {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse((await readStdin()) || "{}");
  } catch {
    data = {};
  }
  const ev = mapCodexHookEvent(data);
  if (ev) await postEvent(ev);
}
