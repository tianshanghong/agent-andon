#!/usr/bin/env node
/**
 * Agent Andon CLI — one binary, many verbs.
 *
 *   andon serve [--demo] [--port N] [--token T]   run the board
 *   andon hook                                     Claude Code hook (stdin)
 *   andon notify <json>                            Codex notify (argv)
 *   andon post <state> <agent> [title] [message]   manual / wrapper push
 *   andon install <claude|codex> [--dry-run]       auto-wire the hooks
 *   andon doctor                                   check what's wired
 *   andon help
 *
 * `hook` and `notify` MUST never block or crash the agent: they always exit 0.
 */
import { serve } from "./commands/serve";
import { hook } from "./commands/hook";
import { notify } from "./commands/notify";
import { post } from "./commands/post";
import { install } from "./commands/install";
import { doctor } from "./commands/doctor";

const HELP = `
  🚦 Agent Andon — a traffic-light board for your AI coding agents

  Usage:
    andon serve [--demo] [--port N] [--host H] [--token T]
        Run the status board. Open the printed URL on your iPad.
        --demo   inject fake agents so you can verify the board first.

    andon install claude        Wire Claude Code hooks (backs up settings.json)
    andon install codex         Wire the Codex notify hook
    andon doctor                Check server + what's wired, print the iPad URL

    andon post <state> <agent> [title] [message]
        Push a status by hand.  state: working|waiting|done|error|idle|gone
        e.g.  andon post done claude "api" "shipped it"

    andon hook                  (internal) Claude Code hook — reads stdin
    andon notify <json>         (internal) Codex notifier — reads argv

  Env:
    AGENT_STATUS_URL   server base (default http://127.0.0.1:8787)
    ANDON_TOKEN        shared token; required by /state and /event when set
    ANDON_LABEL        per-terminal tile title
    ANDON_SESSION      per-launch session id (set by the codex wrapper)

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

    case "notify":
      try {
        await notify(rest[0]);
      } catch {
        /* swallow */
      }
      process.exit(0);
      return;

    case "post":
      process.exit(await post(rest));
      return;

    case "install":
      process.exit(install(rest));
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
