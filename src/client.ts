/**
 * The one and only status poster. Hooks, the Codex notifier and the manual
 * `post` command all funnel through here — no more copy-pasted request code.
 *
 * Contract for callers in a hook path: this NEVER throws and NEVER blocks for
 * long. A missing server, refused connection or timeout all resolve to `false`
 * so the calling hook can exit 0 without ever stalling the agent.
 */
import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { serverBase } from "./net";
import type { AndonEvent } from "./types";

export interface PostResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export function postEvent(ev: AndonEvent, timeoutMs = 1500): Promise<PostResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: PostResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };

    try {
      const token = process.env.ANDON_TOKEN;
      const u = new URL(serverBase() + "/event");
      const body = Buffer.from(JSON.stringify(ev), "utf8");
      const lib = u.protocol === "https:" ? https : http;

      const headers: Record<string, string | number> = {
        "Content-Type": "application/json",
        "Content-Length": body.length,
      };
      // Send the token as a header, not a query param — keeps it out of URLs/logs.
      if (token) headers["x-andon-token"] = token;

      const req = lib.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname + u.search,
          method: "POST",
          headers,
        },
        (res) => {
          res.resume(); // drain
          res.on("end", () =>
            finish({ ok: (res.statusCode ?? 0) < 400, status: res.statusCode }),
          );
        },
      );

      req.on("error", (e) => finish({ ok: false, error: String(e?.message ?? e) }));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        finish({ ok: false, error: "timeout" });
      });
      req.write(body);
      req.end();
    } catch (e) {
      finish({ ok: false, error: String((e as Error)?.message ?? e) });
    }
  });
}
