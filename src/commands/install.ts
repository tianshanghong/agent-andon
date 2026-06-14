/**
 * `andon install claude|codex [--dry-run]`
 *
 * Auto-wires the hooks so nobody hand-edits config paths (the exact thing that
 * trips people up). Always backs up the original file first.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Absolute `node /abs/dist/cli.js` invocation — works regardless of PATH. */
function andonCommand(sub: string): string {
  const cli = path.join(__dirname, "..", "cli.js");
  return `"${process.execPath}" "${cli}" ${sub}`;
}

function backup(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  const bak = `${file}.andon-backup`;
  fs.copyFileSync(file, bak);
  return bak;
}

const CLAUDE_EVENTS = [
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "StopFailure",
  "SessionEnd",
];

interface HookEntry {
  type: string;
  command: string;
}
interface HookGroup {
  hooks?: HookEntry[];
  [k: string]: unknown;
}

function installClaude(dryRun: boolean): number {
  const file = path.join(os.homedir(), ".claude", "settings.json");
  const cmd = andonCommand("hook");

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try {
      settings = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
    } catch {
      console.error(`✗ ${file} is not valid JSON — fix or move it, then retry.`);
      return 1;
    }
  }

  const hooks = (settings.hooks ??= {}) as Record<string, HookGroup[]>;
  let added = 0;
  for (const ev of CLAUDE_EVENTS) {
    const groups = (hooks[ev] ??= []);
    const already = groups.some((g) =>
      (g.hooks ?? []).some((h) => h.command?.includes("cli.js") && h.command?.includes("hook")),
    );
    if (!already) {
      groups.push({ hooks: [{ type: "command", command: cmd }] });
      added++;
    }
  }

  if (dryRun) {
    console.log(`[dry-run] would write ${file}:\n`);
    console.log(JSON.stringify(settings, null, 2));
    return 0;
  }

  if (added === 0) {
    console.log("✓ Claude Code is already wired to Andon. Nothing to do.");
    return 0;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bak = backup(file);
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");

  console.log(`✓ Wired ${added} Claude Code event(s) into ${file}`);
  if (bak) console.log(`  backup: ${bak}`);
  console.log("\n  → Start a new Claude Code session and it lights up the board.");
  return 0;
}

function installCodex(dryRun: boolean): number {
  const file = path.join(os.homedir(), ".codex", "config.toml");
  const cli = path.join(__dirname, "..", "cli.js");
  const line = `notify = ["${process.execPath}", "${cli}", "notify"]`;

  let body = "";
  if (fs.existsSync(file)) body = fs.readFileSync(file, "utf8");

  if (/^\s*notify\s*=/m.test(body)) {
    console.log("ℹ A `notify = …` line already exists in ~/.codex/config.toml.");
    console.log("  Leaving it untouched. To use Andon, set it to:");
    console.log(`    ${line}`);
    return 0;
  }

  // The notify key must sit ABOVE any [table] or TOML parses it into that table.
  const next = `${line}\n${body.startsWith("\n") ? "" : "\n"}${body}`;

  if (dryRun) {
    console.log(`[dry-run] would prepend to ${file}:\n`);
    console.log(line);
    return 0;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bak = backup(file);
  fs.writeFileSync(file, next);
  console.log(`✓ Added Codex notify hook to ${file}`);
  if (bak) console.log(`  backup: ${bak}`);
  console.log(
    "\n  That gives you the green 'done' signal each turn.\n" +
      "  For the blue 'working' signal too, source the wrapper:\n" +
      "    examples/codex-wrapper.sh  (see README → Codex)\n",
  );
  return 0;
}

export function install(args: string[]): number {
  const dryRun = args.includes("--dry-run");
  const target = args.find((a) => !a.startsWith("--"));
  if (target === "claude") return installClaude(dryRun);
  if (target === "codex") return installCodex(dryRun);
  console.error("usage: andon install <claude|codex> [--dry-run]");
  return 2;
}
