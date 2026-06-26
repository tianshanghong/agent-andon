/**
 * `andon hosted <setup|pair|off|status>` — opt into the hosted ("board from
 * anywhere") relay. Hosted needs NO local server: the hook's post path forwards a
 * sealed copy to the relay. Self-host stays the default; this is opt-in.
 */
import * as readline from "readline";
import { provisionHosted, loadHostedConfig, clearHostedConfig, pairingUrl } from "../hosted/forwarder";
import { pairingBlock, QrEnv } from "../hosted/qr-terminal";

function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => (rl.close(), res(a.trim()))));
}

const DISCLOSURE = `
  Hosted relay — what it can and can't see:
    ✓ Cannot read: your prompts, code, project names, messages, tallies.
    • Can see:    when each session changes state (timing), how many sessions, your IP.
    Self-host stays the default and shares nothing.
`;

/**
 * Parse `andon hosted` args into the subcommand, positional args (flags stripped), and
 * the --no-qr flag. Stripping flags BEFORE taking the positional is what keeps `--no-qr`
 * from being read as the relay URL (e.g. `andon hosted setup --no-qr <url>`).
 */
export function parseHostedArgs(args: string[]): { sub: string; positionals: string[]; noQr: boolean } {
  const rest = args.slice(1);
  return {
    sub: args[0] ?? "",
    positionals: rest.filter((a) => !a.startsWith("-")),
    noQr: rest.includes("--no-qr"),
  };
}

/** The `status` text — pure and key-free by construction (never includes the #k= secret). */
export function formatStatus(cfg: { relayUrl: string; boardId: string } | null): string {
  if (!cfg) return "  hosted: off (local only)";
  return `  hosted: on\n    relay:  ${cfg.relayUrl}\n    board:  ${cfg.boardId}`;
}

/** Build the QR-gating env from the live process (isTTY/columns/NO_COLOR + the flag). */
function terminalEnv(noQr: boolean): QrEnv {
  return {
    isTTY: process.stdout.isTTY,
    columns: process.stdout.columns,
    noColor: !!process.env.NO_COLOR,
    noQr,
  };
}

export async function hosted(args: string[]): Promise<number> {
  const { sub, positionals, noQr } = parseHostedArgs(args);

  if (sub === "setup") {
    const relayUrl = positionals[0];
    if (!relayUrl) {
      console.error("usage: andon hosted setup <relay-url> [--no-qr]\n  e.g.  andon hosted setup http://localhost:8788");
      return 2;
    }
    console.log(DISCLOSURE);
    const a = (await ask("  Turn on hosted? [y/N] ")).toLowerCase();
    if (a !== "y" && a !== "yes") {
      console.log("  cancelled — still local only.");
      return 0;
    }
    try {
      const cfg = await provisionHosted(relayUrl);
      console.log("\n  ✓ hosted board created. Every agent status now also forwards (sealed) to the relay —");
      console.log("    no local server needed.\n");
      console.log("  Open your board:\n");
      console.log(pairingBlock(pairingUrl(cfg), terminalEnv(noQr)));
      console.log("\n  `andon hosted off` to stop.");
      return 0;
    } catch (e) {
      console.error(`  ✗ setup failed: ${(e as Error).message}`);
      return 1;
    }
  }

  if (sub === "pair") {
    const cfg = loadHostedConfig();
    if (!cfg) {
      console.error("  not set up — run:  andon hosted setup <relay-url>");
      return 1;
    }
    console.log("\n  Open on the new device:\n");
    console.log(pairingBlock(pairingUrl(cfg), terminalEnv(noQr)));
    console.log();
    return 0;
  }

  if (sub === "off") {
    console.log(clearHostedConfig() ? "  ✓ hosted off — events stay local only." : "  (was not configured)");
    return 0;
  }

  if (sub === "status") {
    console.log(formatStatus(loadHostedConfig()));
    return 0;
  }

  console.error("usage: andon hosted <setup <relay-url> [--no-qr] | pair [--no-qr] | off | status>");
  return 2;
}
