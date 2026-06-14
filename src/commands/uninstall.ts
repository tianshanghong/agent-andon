/**
 * `andon uninstall <claude|codex> [--dry-run]`
 *
 * The clean undo: removes ONLY the entries Andon added (its status hooks and the
 * andon statusLine), leaving everything else — including your permission/approval
 * settings — untouched. Backs up first (timestamped).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { backup } from "./install";

/** A hook command we installed: runs our cli.js with a status verb. (`approve`
 *  is matched too, to clean up the deprecated auto-approve hook from old installs.) */
function isAndonHookCommand(cmd: unknown): boolean {
  return typeof cmd === "string" && cmd.includes("cli.js") && /\b(hook|codexhook|approve)\b/.test(cmd);
}

interface HookEntry {
  command?: string;
  [k: string]: unknown;
}
interface HookGroup {
  hooks?: HookEntry[];
  [k: string]: unknown;
}

export interface StripResult {
  settings: Record<string, unknown>;
  removedHooks: number;
  removedStatusLine: boolean;
}

/** Pure: strip Andon's hooks + statusLine from a settings object. Testable. */
export function stripAndonFromSettings(input: Record<string, unknown>): StripResult {
  const settings: Record<string, unknown> = { ...input };
  let removedHooks = 0;

  const hooks = settings.hooks as Record<string, HookGroup[]> | undefined;
  if (hooks && typeof hooks === "object") {
    for (const ev of Object.keys(hooks)) {
      const groups = hooks[ev];
      if (!Array.isArray(groups)) continue;
      const keptGroups: HookGroup[] = [];
      for (const g of groups) {
        if (!Array.isArray(g.hooks)) {
          keptGroups.push(g);
          continue;
        }
        const keptHooks = g.hooks.filter((h) => {
          const drop = isAndonHookCommand(h.command);
          if (drop) removedHooks++;
          return !drop;
        });
        if (keptHooks.length > 0) keptGroups.push({ ...g, hooks: keptHooks });
      }
      if (keptGroups.length > 0) hooks[ev] = keptGroups;
      else delete hooks[ev];
    }
    if (Object.keys(hooks).length === 0) delete settings.hooks;
  }

  let removedStatusLine = false;
  const sl = settings.statusLine as { command?: string } | undefined;
  if (sl?.command && sl.command.includes("cli.js") && /\bstatusline\b/.test(sl.command)) {
    delete settings.statusLine;
    removedStatusLine = true;
  }

  return { settings, removedHooks, removedStatusLine };
}

function uninstallClaude(dryRun: boolean): number {
  const file = path.join(os.homedir(), ".claude", "settings.json");
  if (!fs.existsSync(file)) {
    console.log("✓ No ~/.claude/settings.json — nothing to remove.");
    return 0;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
  } catch {
    console.error(`✗ ${file} is not valid JSON — fix it first.`);
    return 1;
  }

  const { settings, removedHooks, removedStatusLine } = stripAndonFromSettings(parsed);

  if (dryRun) {
    console.log(`[dry-run] would write ${file}:\n`);
    console.log(JSON.stringify(settings, null, 2));
    return 0;
  }
  if (removedHooks === 0 && !removedStatusLine) {
    console.log("✓ No Andon entries found in Claude Code settings. Nothing to remove.");
    return 0;
  }

  const bak = backup(file);
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
  const bits = [];
  if (removedHooks) bits.push(`${removedHooks} hook(s)`);
  if (removedStatusLine) bits.push("the statusLine");
  console.log(`✓ Removed ${bits.join(" + ")} from ${file}`);
  if (bak) console.log(`  backup: ${bak}`);
  return 0;
}

function uninstallCodex(dryRun: boolean): number {
  const dir = path.join(os.homedir(), ".codex");
  const hooksFile = path.join(dir, "hooks.json");
  const cfgFile = path.join(dir, "config.toml");
  let removedHooks = 0;

  // 1) remove our codexhook entries from hooks.json
  let hj: Record<string, unknown> | null = null;
  if (fs.existsSync(hooksFile)) {
    try {
      hj = JSON.parse(fs.readFileSync(hooksFile, "utf8") || "{}");
    } catch {
      hj = null;
    }
  }
  if (hj) {
    const hooks = hj.hooks as Record<string, HookGroup[]> | undefined;
    if (hooks) {
      for (const ev of Object.keys(hooks)) {
        const groups = hooks[ev];
        if (!Array.isArray(groups)) continue;
        const kept: HookGroup[] = [];
        for (const g of groups) {
          if (!Array.isArray(g.hooks)) {
            kept.push(g);
            continue;
          }
          const keptHooks = g.hooks.filter((h) => {
            const drop = typeof h.command === "string" && h.command.includes("cli.js") && h.command.includes("codexhook");
            if (drop) removedHooks++;
            return !drop;
          });
          if (keptHooks.length > 0) kept.push({ ...g, hooks: keptHooks });
        }
        if (kept.length > 0) hooks[ev] = kept;
        else delete hooks[ev];
      }
      if (Object.keys(hooks).length === 0) delete hj.hooks;
    }
  }

  // 2) drop a legacy Andon notify line (cli.js + notify) from old installs; keep
  //    the user's own notify untouched.
  let cfgLines = fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile, "utf8").split("\n") : [];
  let removedNotify = 0;
  if (cfgLines.length) {
    const before = cfgLines.length;
    cfgLines = cfgLines.filter((l) => !(/^\s*notify\s*=/.test(l) && l.includes("cli.js") && l.includes("notify")));
    removedNotify = before - cfgLines.length;
  }

  if (removedHooks === 0 && removedNotify === 0) {
    console.log("✓ No Andon entries found in Codex config. Nothing to remove.");
    return 0;
  }
  if (dryRun) {
    console.log(`[dry-run] would remove ${removedHooks} hook(s)` + (removedNotify ? ", drop the notify line" : ""));
    return 0;
  }

  const bits: string[] = [];
  if (removedHooks > 0) {
    const hbak = backup(hooksFile);
    fs.writeFileSync(hooksFile, JSON.stringify(hj, null, 2) + "\n");
    bits.push(`${removedHooks} hook(s)`);
    if (hbak) console.log(`  backup: ${hbak}`);
  }
  if (removedNotify > 0) {
    const cbak = backup(cfgFile);
    fs.writeFileSync(cfgFile, cfgLines.join("\n"));
    bits.push("the notify line");
    if (cbak) console.log(`  backup: ${cbak}`);
  }
  console.log(`✓ Removed ${bits.join(" + ")} from ~/.codex`);
  return 0;
}

export function uninstall(args: string[]): number {
  const dryRun = args.includes("--dry-run");
  const target = args.find((a) => !a.startsWith("--"));
  if (target === "claude") return uninstallClaude(dryRun);
  if (target === "codex") return uninstallCodex(dryRun);
  console.error("usage: andon uninstall <claude|codex> [--dry-run]");
  return 2;
}
