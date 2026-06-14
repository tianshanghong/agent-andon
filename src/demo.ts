/** Injects two fake agents that cycle states, for verifying the board first. */
import type { SessionStore } from "./store";

export function startDemo(store: SessionStore): NodeJS.Timeout {
  const seq: Array<[string, string, string[]]> = [
    ["claude", "/Users/you/dev/checkout-api",
      ["working", "working", "waiting", "working", "done", "done"]],
    ["codex", "/Users/you/dev/landing-page",
      ["working", "working", "working", "error", "working", "done"]],
  ];
  const msgs: Record<string, string> = {
    waiting: "needs permission: Bash(git push origin main)",
    error: "command failed: exit 1 — tsc: 3 errors",
  };

  let i = 0;
  const tick = () => {
    for (const [agent, cwd, states] of seq) {
      const st = states[i % states.length]!;
      store.apply({
        agent,
        id: cwd,
        state: st,
        title: cwd.split("/").pop() || agent,
        message: msgs[st] ?? "",
      });
    }
    i++;
  };
  tick(); // seed immediately
  const t = setInterval(tick, 3000);
  t.unref?.();
  return t;
}
