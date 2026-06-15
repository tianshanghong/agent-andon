#!/usr/bin/env node
/**
 * Agent Andon CLI — one binary, many verbs.
 *
 *   andon serve [--demo] [--port N] [--token T]   run the board
 *   andon hook                                     Claude Code hook (stdin)
 *   andon codexhook                                Codex hook (stdin)
 *   andon post <state> <agent> [title] [message]   manual push
 *   andon install <claude|codex> [--dry-run]       auto-wire the hooks
 *   andon doctor                                   check what's wired
 *   andon help
 *
 * `hook` and `codexhook` MUST never block or crash the agent: they always exit 0.
 */
import { serve } from "./commands/serve";
import { hook } from "./commands/hook";
import { codexhook } from "./commands/codexhook";
import { post } from "./commands/post";
import { sub } from "./commands/sub";
import { statusline } from "./commands/statusline";
import { install } from "./commands/install";
import { uninstall } from "./commands/uninstall";
import { doctor } from "./commands/doctor";

const HELP = `
  🚦 Agent Andon — a traffic-light board for your AI coding agents

  Usage:
    andon serve [--demo] [--port N] [--host H] [--token T] [--no-notify] [--say]
        Run the status board. Open the printed URL on your iPad.
        Desktop alerts are ON by default (needs-you · stuck · done);
        --no-notify disables them, --say also speaks them aloud.
        --demo   inject fake agents so you can verify the board first.

    andon install claude        Wire Claude Code hooks (timestamped backup)
    andon install codex         Wire Codex lifecycle hooks (run /hooks to trust)
    andon uninstall <claude|codex>  Remove only what Andon added (keeps your config)
    andon doctor                Check server + what's wired, print the iPad URL

    andon post <state> <agent> [title] [message]
        Push a status by hand.  state: working|waiting|done|error|idle|gone
        e.g.  andon post done claude "api" "shipped it"

    andon sub <+n|-n> [id]
        Adjust a process's background-task count (id from $ANDON_SESSION).
        A background job runs:  andon sub +1  …then…  andon sub -1
        While the count is >0 the card stays "running", never green.

    andon hook                  (internal) Claude Code hook — reads stdin
    andon codexhook             (internal) Codex hook — reads stdin

  Env:
    AGENT_STATUS_URL   server base (default http://127.0.0.1:8787)
    ANDON_TOKEN        shared token; required by /state and /event when set
    ANDON_LABEL        per-terminal tile title
    ANDON_SESSION      override the tile's session id (for background jobs)

  Quickstart:
    andon serve --demo          # verify on the iPad, then Ctrl-C
    andon serve                 # run for real
    andon install claude        # wire it up, restart your Claude session
`;

const COMMANDS = ["serve", "install", "uninstall", "doctor", "post", "sub", "hook", "codexhook", "help"];

/** Levenshtein distance — for "did you mean?" on a typo'd verb. */
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[a.length];
}

function suggest(cmd: string): string {
  let best = "";
  let bestD = Infinity;
  for (const c of COMMANDS) {
    const d = editDistance(cmd, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return bestD <= 3 ? `  did you mean:  andon ${best} ?\n` : "";
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "serve":
      serve(rest);
      return; // long-running; never returns

    case "hook":
      // Always exit 0 no matter what — see module docstring.
      try {
        await hook();
      } catch {
        /* swallow */
      }
      process.exit(0);
      return;

    case "codexhook":
      // Codex lifecycle hook — like `hook`, must never block/crash Codex.
      try {
        await codexhook();
      } catch {
        /* swallow */
      }
      process.exit(0);
      return;

    case "post":
      process.exit(await post(rest));
      return;

    case "sub":
      process.exit(await sub(rest));
      return;

    case "statusline":
      // statusLine command: never block/crash the agent — always exit 0.
      try {
        await statusline(rest);
      } catch {
        /* swallow */
      }
      process.exit(0);
      return;

    case "install":
      process.exit(install(rest));
      return;

    case "uninstall":
      process.exit(uninstall(rest));
      return;

    case "doctor":
      process.exit(await doctor());
      return;

    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      process.exit(cmd ? 0 : 1);
      return;

    default:
      console.error(`unknown command: ${cmd}\n${suggest(cmd)}${HELP}`);
      process.exit(2);
  }
}

void main();
