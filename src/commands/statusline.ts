/**
 * `andon statusline` — wired as Claude Code's statusLine command.
 *
 * Claude Code runs the statusLine command continuously (≈ every 300ms, even
 * while idle) and feeds it the session JSON on stdin. We use that as a PRESENCE
 * heartbeat: it surfaces a session that was already running when the board
 * started late, and keeps it alive — without ever changing the tile's state.
 *
 * statusLine output is shown in the terminal only; it is NEVER sent to the
 * model, so this costs zero tokens. Like the hooks, it must never block or
 * crash the agent — every path resolves and the caller exits 0.
 *
 *   --quiet / -q   heartbeat only, print nothing (chain after your own line)
 *
 * Caveat (a Claude Code limit, not ours): the statusLine only runs while that
 * terminal is focused, so a session in a background window won't heartbeat
 * until you look at it.
 */
import { postEvent } from "../client";
import { labelFor } from "./shared";

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
    if (process.stdin.isTTY) return fin(); // no piped input
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", fin);
    process.stdin.on("error", fin);
    setTimeout(fin, 400).unref(); // never hang the status line
  });
}

/** Pure parse of the statusLine JSON into a presence event. Exported for tests. */
export function mapStatusline(raw: string | undefined): {
  agent: string;
  id: string;
  title: string;
  presence: true;
} {
  let d: Record<string, unknown> = {};
  try {
    d = JSON.parse(raw || "{}");
  } catch {
    d = {};
  }
  const ws = (d.workspace ?? {}) as Record<string, unknown>;
  const id = String(d.session_id ?? "claude");
  const cwd = String(d.cwd ?? ws.current_dir ?? process.cwd());
  return { agent: "claude", id, title: labelFor(cwd, "claude"), presence: true };
}

export async function statusline(args: string[] = []): Promise<void> {
  const quiet = args.includes("--quiet") || args.includes("-q");
  const raw = await readStdin();
  const ev = mapStatusline(raw);

  const r = await postEvent(ev);

  if (!quiet) {
    let model = "";
    try {
      const d = JSON.parse(raw || "{}");
      model = String(d?.model?.display_name ?? "");
    } catch {
      /* ignore */
    }
    const dot = r.ok ? "●" : "○"; // ● board sees you · ○ board unreachable
    process.stdout.write(`andon ${dot} ${ev.title}${model ? "  ·  " + model : ""}`);
  }
}
