/**
 * `andon install claude|codex [--dry-run]`
 *
 * Auto-wires the status hooks so nobody hand-edits config paths (the exact thing
 * that trips people up). Always backs up the original file first. It only ever
 * adds Andon's own status reporting — it never touches your permission/approval
 * settings; configuring approvals is yours to do (see README).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Absolute `node /abs/dist/cli.js` invocation — works regardless of PATH. */
function andonCommand(sub: string): string {
  const cli = path.join(__dirname, "..", "cli.js");
  return `"${process.execPath}" "${cli}" ${sub}`;
}

/**
 * Back up to a TIMESTAMPED path so repeated installs never clobber an earlier
 * backup — your true original is always the earliest `*.andon-backup-*` file.
 * Exported so `uninstall` reuses the exact same scheme.
 */
export function backup(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = `${file}.andon-backup-${stamp}`;
  fs.copyFileSync(file, bak);
  return bak;
}

const CLAUDE_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PostToolUse",
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

  // statusLine presence heartbeat — lets the board pick up sessions that were
  // already running when it started. Only set it if absent: never clobber a
  // custom statusLine (it's a single command, so we can't merge non-destructively).
  let statusLine: "added" | "kept" = "kept";
  if (settings.statusLine == null) {
    settings.statusLine = { type: "command", command: andonCommand("statusline"), padding: 0 };
    statusLine = "added";
  }

  if (dryRun) {
    console.log(`[dry-run] would write ${file}:\n`);
    console.log(JSON.stringify(settings, null, 2));
    return 0;
  }

  if (added === 0 && statusLine === "kept") {
    console.log("✓ Claude Code is already wired to Andon. Nothing to do.");
    return 0;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bak = backup(file);
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");

  if (added > 0) console.log(`✓ Wired ${added} Claude Code event(s) into ${file}`);
  if (statusLine === "added") {
    console.log("✓ Set the statusLine heartbeat (board picks up already-running sessions)");
  } else {
    console.log(
      "ℹ Kept your existing statusLine. To also heartbeat, append a quiet ping:\n" +
        `    ${andonCommand("statusline")} -q   (reads the same stdin)`,
    );
  }
  if (bak) console.log(`  backup: ${bak}`);
  console.log("\n  → Start a new Claude Code session and it lights up the board.");
  return 0;
}

/** Codex lifecycle events (CamelCase per the docs) → `andon codexhook`. Tool
 *  events take a match-all matcher; lifecycle events take none. */
const CODEX_EVENTS: Array<{ event: string; matcher?: string }> = [
  { event: "SessionStart" },
  { event: "UserPromptSubmit" },
  { event: "PostToolUse", matcher: ".*" },
  { event: "PermissionRequest", matcher: ".*" },
  { event: "Stop" },
  { event: "SessionEnd" },
];

function installCodex(dryRun: boolean): number {
  const dir = path.join(os.homedir(), ".codex");
  const hooksFile = path.join(dir, "hooks.json");
  const cmd = andonCommand("codexhook");

  // lifecycle hooks → ~/.codex/hooks.json (JSON; same shape as Claude's hooks)
  let hj: Record<string, unknown> = {};
  if (fs.existsSync(hooksFile)) {
    try {
      hj = JSON.parse(fs.readFileSync(hooksFile, "utf8") || "{}");
    } catch {
      console.error(`✗ ${hooksFile} is not valid JSON — fix or move it, then retry.`);
      return 1;
    }
  }
  const hooks = (hj.hooks ??= {}) as Record<string, HookGroup[]>;
  let added = 0;
  for (const { event, matcher } of CODEX_EVENTS) {
    const groups = (hooks[event] ??= []);
    const already = groups.some((g) =>
      (g.hooks ?? []).some((h) => h.command?.includes("cli.js") && h.command?.includes("codexhook")),
    );
    if (!already) {
      groups.push(
        matcher
          ? { matcher, hooks: [{ type: "command", command: cmd }] }
          : { hooks: [{ type: "command", command: cmd }] },
      );
      added++;
    }
  }

  if (dryRun) {
    console.log(`[dry-run] would write ${hooksFile}:\n`);
    console.log(JSON.stringify(hj, null, 2));
    return 0;
  }
  if (added === 0) {
    console.log("✓ Codex is already wired to Andon. Nothing to do.");
    return 0;
  }

  fs.mkdirSync(dir, { recursive: true });
  const bak = backup(hooksFile);
  fs.writeFileSync(hooksFile, JSON.stringify(hj, null, 2) + "\n");

  console.log(`✓ Wired ${added} Codex lifecycle hook(s) into ${hooksFile}`);
  if (bak) console.log(`  backup: ${bak}`);
  console.log(
    "\n  ⚠ Codex requires you to TRUST new hooks once: run `/hooks` inside Codex\n" +
      "    (or launch `codex --dangerously-bypass-hook-trust`). Then a Codex session\n" +
      "    lights up the board — including amber “needs you” on approval prompts.",
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
