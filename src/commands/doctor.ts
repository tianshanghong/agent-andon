/** `andon doctor` — quick "is everything wired?" check. */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { serverBase, lanIp } from "../net";

function getJson(url: string, timeoutMs = 1200): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

export async function doctor(): Promise<number> {
  const base = serverBase();
  console.log("\n  Agent Andon — doctor\n  ─────────────────────");

  // 1. server reachable?
  let serverOk = false;
  try {
    const h = (await getJson(`${base}/healthz`)) as { ok?: boolean; sessions?: number };
    serverOk = !!h.ok;
    console.log(`  ✓ server up at ${base}  (${h.sessions ?? 0} session(s))`);
    const m = base.match(/:(\d+)/);
    const port = m ? m[1] : "8787";
    console.log(`  → iPad: http://${lanIp()}:${port}`);
  } catch {
    console.log(`  ✗ server NOT reachable at ${base}`);
    console.log("    start it with:  andon serve");
  }

  // 2. claude wired?
  const claudeCfg = path.join(os.homedir(), ".claude", "settings.json");
  if (fs.existsSync(claudeCfg)) {
    const txt = fs.readFileSync(claudeCfg, "utf8");
    const wired = txt.includes("cli.js") && txt.includes("hook");
    console.log(
      wired
        ? "  ✓ Claude Code hooks wired"
        : "  ○ Claude Code not wired — run:  andon install claude",
    );
  } else {
    console.log("  ○ no ~/.claude/settings.json — run:  andon install claude");
  }

  // 3. codex wired? (lifecycle hooks live in ~/.codex/hooks.json)
  const codexHooks = path.join(os.homedir(), ".codex", "hooks.json");
  if (fs.existsSync(codexHooks)) {
    const txt = fs.readFileSync(codexHooks, "utf8");
    const wired = txt.includes("cli.js") && txt.includes("codexhook");
    console.log(
      wired
        ? "  ✓ Codex hooks wired  (run /hooks in Codex to trust them)"
        : "  ○ Codex not wired — run:  andon install codex",
    );
  } else {
    console.log("  ○ Codex not wired — run:  andon install codex (if you use Codex)");
  }

  console.log("");
  return serverOk ? 0 : 1;
}
