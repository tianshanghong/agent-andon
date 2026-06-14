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
    andon serve [--demo] [--port N] [--host H] [--token T]
        Run the status board. Open the printed URL on your iPad.
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
      console.error(`unknown command: ${cmd}\n${HELP}`);
      process.exit(2);
  }
}

void main();
