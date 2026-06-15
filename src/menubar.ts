/**
 * Plain-text board summary for a desktop status bar — SwiftBar/xbar on macOS,
 * Waybar/polybar/argos on Linux, etc. Platform-neutral output in the SwiftBar
 * convention: first line = the bar text; lines after `---` = the dropdown.
 *
 * A consumer is a one-liner: `curl -s http://127.0.0.1:8787/menubar`.
 */
import { PRIORITY, type Snapshot, type State } from "./types";

const EMOJI: Record<string, string> = {
  working: "🔵",
  waiting: "🟠",
  done: "🟢",
  error: "🔴",
  idle: "⚪️",
};

/** `|` is the SwiftBar param separator — keep it out of free text. */
const clean = (s: string): string => String(s).replace(/\|/g, "¦").replace(/\n/g, " ");

export function menubarText(snap: Snapshot, port: number): string {
  const list = snap.sessions;
  const c: Partial<Record<State, number>> = {};
  for (const s of list) c[s.state] = (c[s.state] ?? 0) + 1;
  const need = (c.error ?? 0) + (c.waiting ?? 0);

  let head: string;
  if (c.error) head = `🔴 ${need} need you`;
  else if (c.waiting) head = `🟠 ${need} need you`;
  else if (c.working) head = `🔵 running`;
  else if (c.done) head = `🟢 ready`;
  else head = `🚦 idle`;

  const lines = [head, "---"];
  if (list.length === 0) {
    lines.push("no agents running");
  } else {
    // the store keeps arrival order; the dropdown wants most-urgent first
    const ranked = [...list].sort(
      (a, b) => (PRIORITY[a.state] ?? 9) - (PRIORITY[b.state] ?? 9) || b.updated_at - a.updated_at,
    );
    for (const s of ranked) {
      const msg = s.message ? " — " + s.message : "";
      lines.push(clean(`${EMOJI[s.state] ?? "•"} ${s.agent} · ${s.title}${msg}`));
    }
  }
  lines.push("---");
  lines.push(`Open board | href=http://127.0.0.1:${port}`);
  return lines.join("\n");
}
