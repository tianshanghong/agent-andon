/**
 * The Agent Andon board server.
 *
 *   GET  /                    full-screen dashboard (served from assets/)
 *   GET  /state               JSON snapshot (poll fallback)
 *   GET  /events              Server-Sent Events stream; pushed on every change
 *   GET  /healthz             liveness + session count
 *   GET  /manifest.webmanifest, /favicon.svg   PWA polish
 *   POST /event               a hook / the CLI pushes one status event
 *
 * Hardening over the prototype: request-body size cap, guarded body read,
 * optional shared-token auth (ANDON_TOKEN), no CORS (the board is same-origin),
 * and a same-origin guard that blocks cross-origin POST /event (CSRF).
 */
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { SessionStore } from "./store";
import { MANIFEST, FAVICON_SVG } from "./assets";
import { makeAlerter, type AlertConfig } from "./alerts";
import { menubarText } from "./menubar";
import type { AndonEvent } from "./types";

/** Reject event bodies larger than this (plenty for a status line). */
const MAX_BODY = 64 * 1024;

/** dist/server.js -> ../assets/dashboard.html (also correct once installed). */
const DASHBOARD_PATH = path.join(__dirname, "..", "assets", "dashboard.html");

export interface ServerOptions {
  port: number;
  host: string;
  /** When set, /state and /event require ?token=… or an x-andon-token header. */
  token?: string;
  /** Native desktop alerts on the machine running the server (opt-in). */
  alert?: AlertConfig;
  /** Inject a store (tests); a fresh one is created otherwise. */
  store?: SessionStore;
}

export interface AndonServer {
  server: http.Server;
  store: SessionStore;
}

export function createServer(opts: ServerOptions): AndonServer {
  const store = opts.store ?? new SessionStore();

  // SSE push: every open board holds a /events stream and we send the snapshot
  // on any change, so the iPad reflects a state change in well under a second
  // instead of waiting for its next poll. /state polling stays as a fallback.
  const clients = new Set<http.ServerResponse>();
  const broadcast = (): void => {
    const frame = `data: ${JSON.stringify(store.snapshot())}\n\n`;
    for (const c of clients) {
      try {
        c.write(frame);
      } catch {
        clients.delete(c);
      }
    }
  };
  // A comment heartbeat keeps Safari / proxies from dropping an idle stream.
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      try {
        c.write(": ping\n\n");
      } catch {
        clients.delete(c);
      }
    }
  }, 25_000);
  heartbeat.unref?.();

  const sweeper = setInterval(() => {
    if (store.sweep() > 0) broadcast();
  }, 30_000);
  sweeper.unref?.();

  // Native desktop alerts (opt-in): fire on a transition into a needs-you state.
  const alerter =
    opts.alert && (opts.alert.notify || opts.alert.say) ? makeAlerter(opts.alert) : null;

  let dashboard: Buffer | null = null;
  try {
    dashboard = fs.readFileSync(DASHBOARD_PATH);
  } catch {
    dashboard = null;
  }

  // Accept the token either as ?token=… (the dashboard reads it from its own
  // URL) or as an x-andon-token header (hooks/CLI use this, keeping the secret
  // out of URLs and access logs).
  const authorized = (url: URL, req: http.IncomingMessage): boolean => {
    if (!opts.token) return true;
    return (
      url.searchParams.get("token") === opts.token ||
      req.headers["x-andon-token"] === opts.token
    );
  };

  // CSRF guard: reject cross-origin browser writes. The board is same-origin
  // with the server, and CLI/hooks (curl, Node http) send no Origin header —
  // both pass. Only a request from a *different* web origin is blocked.
  const sameOriginOrNone = (req: http.IncomingMessage): boolean => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  };

  const server = http.createServer((req, res) => {
    const send = (
      code: number,
      body: string | Buffer,
      ctype = "application/json",
    ) => {
      const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
      // No CORS headers: the board is same-origin with the server, so it needs
      // none, and withholding them stops any other website from reading /state.
      res.writeHead(code, {
        "Content-Type": ctype,
        "Content-Length": buf.length,
        "Cache-Control": "no-store",
      });
      res.end(buf);
    };

    const url = new URL(req.url || "/", "http://localhost");
    const p = url.pathname;

    if (req.method === "OPTIONS") {
      // No CORS is offered (same-origin board only); answer preflights plainly.
      res.writeHead(204, { Allow: "GET, POST, OPTIONS" });
      res.end();
      return;
    }

    if (req.method === "GET") {
      if (p === "/" || p === "/index.html") {
        if (dashboard) send(200, dashboard, "text/html; charset=utf-8");
        else
          send(
            500,
            "dashboard.html is missing from the package assets/.",
            "text/plain; charset=utf-8",
          );
      } else if (p === "/state") {
        if (!authorized(url, req)) return send(401, JSON.stringify({ error: "unauthorized" }));
        send(200, JSON.stringify(store.snapshot()));
      } else if (p === "/events") {
        // Server-Sent Events: hold the connection open and push on every change.
        if (!authorized(url, req)) return send(401, JSON.stringify({ error: "unauthorized" }));
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write("retry: 2000\n\n");
        res.write(`data: ${JSON.stringify(store.snapshot())}\n\n`);
        clients.add(res);
        req.on("close", () => clients.delete(res));
      } else if (p === "/menubar") {
        // Plain-text one-glance summary for a desktop status bar (SwiftBar /
        // xbar / Waybar / polybar). Platform-neutral; the consumer differs.
        if (!authorized(url, req)) return send(401, "unauthorized", "text/plain; charset=utf-8");
        send(200, menubarText(store.snapshot(), opts.port), "text/plain; charset=utf-8");
      } else if (p === "/healthz") {
        send(200, JSON.stringify({ ok: true, sessions: store.size }));
      } else if (p === "/manifest.webmanifest") {
        send(200, JSON.stringify(MANIFEST), "application/manifest+json");
      } else if (p === "/favicon.svg") {
        send(200, FAVICON_SVG, "image/svg+xml");
      } else {
        send(404, JSON.stringify({ error: "not found" }));
      }
      return;
    }

    if (req.method === "POST" && p === "/event") {
      if (!sameOriginOrNone(req)) return send(403, JSON.stringify({ error: "cross-origin forbidden" }));
      if (!authorized(url, req)) return send(401, JSON.stringify({ error: "unauthorized" }));
      const chunks: Buffer[] = [];
      let size = 0;
      let aborted = false;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY && !aborted) {
          aborted = true;
          send(413, JSON.stringify({ error: "payload too large" }));
          req.destroy();
        } else if (!aborted) {
          chunks.push(c);
        }
      });
      req.on("end", () => {
        if (aborted || res.writableEnded) return;
        let ev: AndonEvent;
        try {
          ev = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          return send(400, JSON.stringify({ error: "bad json" }));
        }
        const r = store.apply(ev);
        // push to every open board immediately — except a silent presence
        // refresh, where only liveness moved and the board already shows it.
        if (r.ok && !r.silent) broadcast();
        if (r.ok && alerter) alerter(store.snapshot().sessions);
        send(r.ok ? 200 : 400, JSON.stringify(r));
      });
      req.on("error", () => {
        if (!res.writableEnded) send(400, JSON.stringify({ error: "read error" }));
      });
      return;
    }

    send(404, JSON.stringify({ error: "not found" }));
  });

  server.on("close", () => {
    clearInterval(sweeper);
    clearInterval(heartbeat);
    for (const c of clients) {
      try {
        c.end();
      } catch {
        /* ignore */
      }
    }
    clients.clear();
  });

  return { server, store };
}
