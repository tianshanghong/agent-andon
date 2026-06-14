/**
 * `andon notify` — the Codex CLI notifier. Codex passes its event as a single
 * JSON string argument (not stdin). Today Codex only emits
 * `agent-turn-complete`, so this maps that to "done".
 *
 * Field names are read tolerantly (both `last-assistant-message` and
 * `last_assistant_message`, etc.) because Codex's notify schema has used
 * hyphenated keys and may vary by version — the prototype assumed one spelling
 * and would silently miss the message otherwise.
 */
import { postEvent } from "../client";
import { labelFor, sessionId } from "./shared";
import type { AndonEvent } from "../types";

const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] != null) return o[k];
  return undefined;
};

/**
 * Pure mapping from a Codex notify payload to a board event (no I/O).
 * Returns null for anything other than agent-turn-complete. Exported for testing.
 */
export function mapCodexEvent(payloadArg: string | undefined): AndonEvent | null {
  if (!payloadArg) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(payloadArg);
  } catch {
    return null;
  }

  const type = String(pick(data, "type") ?? "");
  if (type !== "agent-turn-complete") return null; // only event Codex sends today

  const cwd = String(pick(data, "cwd") ?? process.cwd());
  const id =
    process.env.ANDON_SESSION ||
    (pick(data, "thread-id", "thread_id", "turn-id") as string | undefined) ||
    sessionId("codex", cwd);

  const message = String(
    pick(data, "last-assistant-message", "last_assistant_message", "message") ?? "",
  )
    .split(/\s+/)
    .join(" ")
    .trim()
    .slice(0, 200);

  return { agent: "codex", id, state: "done", title: labelFor(cwd, "codex"), message };
}

export async function notify(payloadArg: string | undefined): Promise<void> {
  const ev = mapCodexEvent(payloadArg);
  if (ev) await postEvent(ev);
}
