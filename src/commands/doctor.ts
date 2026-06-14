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

  // 3. codex wired?
  const codexCfg = path.join(os.homedir(), ".codex", "config.toml");
  if (fs.existsSync(codexCfg)) {
    const txt = fs.readFileSync(codexCfg, "utf8");
    const wired = /notify\s*=.*cli\.js/.test(txt);
    console.log(
      wired
        ? "  ✓ Codex notify wired"
        : "  ○ Codex notify not wired — run:  andon install codex",
    );
  } else {
    console.log("  ○ no ~/.codex/config.toml — run:  andon install codex (if you use Codex)");
  }

  console.log("");
  return serverOk ? 0 : 1;
}
