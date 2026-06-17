/**
 * `andon hosted <setup|pair|off|status>` — opt into the hosted ("board from
 * anywhere") relay. Hosted needs NO local server: the hook's post path forwards a
 * sealed copy to the relay. Self-host stays the default; this is opt-in.
 */
import * as readline from "readline";
import { provisionHosted, loadHostedConfig, clearHostedConfig, pairingUrl } from "../hosted/forwarder";

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

export async function hosted(args: string[]): Promise<number> {
  const sub = args[0];

  if (sub === "setup") {
    const relayUrl = args[1];
    if (!relayUrl) {
      console.error("usage: andon hosted setup <relay-url>\n  e.g.  andon hosted setup http://localhost:8788");
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
      console.log("  Open your board (treat this link like a password — it IS your board AND its key):\n");
      console.log(`    ${pairingUrl(cfg)}\n`);
      console.log("  (scan-to-pair QR is coming; for now open the link on your phone. `andon hosted off` to stop.)");
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
    console.log(`\n  Open on the new device (treat like a password):\n\n    ${pairingUrl(cfg)}\n`);
    return 0;
  }

  if (sub === "off") {
    console.log(clearHostedConfig() ? "  ✓ hosted off — events stay local only." : "  (was not configured)");
    return 0;
  }

  if (sub === "status") {
    const cfg = loadHostedConfig();
    if (!cfg) {
      console.log("  hosted: off (local only)");
      return 0;
    }
    console.log(`  hosted: on\n    relay:  ${cfg.relayUrl}\n    board:  ${cfg.boardId}`);
    return 0;
  }

  console.error("usage: andon hosted <setup <relay-url> | pair | off | status>");
  return 2;
}
