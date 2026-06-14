/** Tiny helpers shared by the client-side commands. */
import * as path from "path";

/**
 * The tile title. `ANDON_LABEL` (set per-terminal) wins so you can name a run
 * "backend refactor" instead of leaning on the directory basename.
 */
export function labelFor(cwd: string, fallback: string): string {
  const env = process.env.ANDON_LABEL;
  if (env && env.trim()) return env.trim();
  const base = path.basename(cwd.replace(/\/+$/, ""));
  return base || fallback;
}

/**
 * Session id rules, shared by `post` and `notify` so the same project shows as
 * ONE tile across "working/done/gone":
 *   ANDON_SESSION (injected by the codex wrapper, unique per launch)  ->
 *   else codex falls back to cwd, other agents to the agent name.
 */
export function sessionId(agent: string, cwd: string): string {
  return (
    process.env.ANDON_SESSION ||
    (agent === "codex" ? cwd : agent)
  );
}
