/**
 * Client side of the hosted ("board from anywhere") relay (T2).
 *
 * If the user runs `andon hosted setup`, every status event is SEALED with the
 * board's key K (src/e2e.ts) and forwarded to the relay — so a hosted user needs
 * NO local server: the hook's normal post path (postEvent) just fans out to the
 * relay too. K + the ingest token live only on this machine; the relay gets
 * ciphertext + coarse routing.
 *
 * Secrets at rest: ~/.andon/hosted.json (0600). The OS keychain is the intended
 * home (design §5) and a follow-up; for now warn against syncing ~/.andon.
 * stdlib only.
 */
import * as http from "http";
import * as https from "https";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { URL } from "url";
import { generateKey, seal } from "./e2e";
import { VALID_STATES, type AndonEvent } from "./types";
import type { PostResult } from "./client";

export interface HostedConfig {
  relayUrl: string; // e.g. https://relay.andon.dev (no trailing slash)
  boardId: string;
  ingestToken: string; // bearer write token — this machine only
  key: string; // 256-bit content key K — this machine only
}

const dataDir = (): string => process.env.ANDON_DATA_DIR || path.join(os.homedir(), ".andon");
const configPath = (): string => path.join(dataDir(), "hosted.json");

export function loadHostedConfig(): HostedConfig | null {
  try {
    const c = JSON.parse(fs.readFileSync(configPath(), "utf8")) as HostedConfig;
    if (c && c.relayUrl && c.boardId && c.ingestToken && c.key) {
      c.relayUrl = c.relayUrl.replace(/\/+$/, ""); // canonical, so every consumer avoids "//i/<board>"
      return c;
    }
  } catch {
    /* not configured */
  }
  return null;
}

export function saveHostedConfig(c: HostedConfig): void {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(c, null, 2), { mode: 0o600 });
}

export function clearHostedConfig(): boolean {
  try {
    fs.rmSync(configPath());
    return true;
  } catch {
    return false;
  }
}

/** The pairing URL — the board reads K from the #fragment (never sent to the relay).
 *  Printed as a link today (the CLI warns "treat like a password"); a scan-to-pair QR
 *  so the user never copy-pastes the secret is a follow-up. */
export function pairingUrl(c: HostedConfig): string {
  return `${c.relayUrl}/b/${c.boardId}#k=${c.key}`;
}

const b64u = (b: Buffer): string => b.toString("base64url");
const stripSlash = (u: string): string => u.replace(/\/+$/, "");
let lastSeq = 0; // strictly-monotonic seq across events in THIS process (clock-tie / backwards-step safe)

/** Provision a new hosted board: generate K + ingest token locally, send only the
 *  token HASH to the relay, store the config. Throws on failure (the CLI shows it). */
export async function provisionHosted(relayUrl: string): Promise<HostedConfig> {
  const base = stripSlash(relayUrl);
  const key = generateKey();
  const ingestToken = b64u(crypto.randomBytes(32));
  const tokenHash = b64u(crypto.createHash("sha256").update(ingestToken).digest());
  const res = await postJson(`${base}/provision`, { tokenHash }, undefined, 8000);
  if (!res.ok) throw new Error(`relay /provision failed (HTTP ${res.status ?? "unreachable"})`);
  if (typeof res.boardId !== "string") throw new Error("relay did not return a board id");
  const cfg: HostedConfig = { relayUrl: base, boardId: res.boardId, ingestToken, key };
  saveHostedConfig(cfg);
  return cfg;
}

/**
 * Seal an event and forward it to the relay IF hosted is configured. Never throws,
 * never blocks long — same contract as postEvent. Returns {ok:false} when not
 * configured or for non-forwardable events (sub-only / gone / no id), so it never
 * affects the local result for a non-hosted user.
 */
export async function forwardHosted(ev: AndonEvent, timeoutMs = 1500): Promise<PostResult> {
  const cfg = loadHostedConfig();
  if (!cfg) return { ok: false };
  if (!ev.id || !ev.state || !VALID_STATES.has(ev.state)) return { ok: false }; // skip gone / sub-only / no id
  try {
    // The raw id can be a filesystem path (codex uses the cwd!), so NEVER send it to
    // the relay. Hash it into an opaque, per-board, stable session id instead.
    const sid = crypto.createHash("sha256").update(`${cfg.boardId}|${ev.id}`).digest("base64url").slice(0, 22);
    // time-based but STRICTLY increasing — a same-ms tie or a backwards clock step can't
    // produce seq <= prev (which the board's freshness guard would silently reject).
    const seq = (lastSeq = Math.max(Date.now(), lastSeq + 1));
    const enc = seal(cfg.key, { title: ev.title, message: ev.message, agent: ev.agent }, { boardId: cfg.boardId, sid, state: ev.state, seq }, seq);
    return await postJson(`${cfg.relayUrl}/i/${encodeURIComponent(cfg.boardId)}`, { sid, state: ev.state, seq, enc }, cfg.ingestToken, timeoutMs);
  } catch {
    return { ok: false };
  }
}

/** Minimal JSON POST that never rejects (resolves {ok:false} on any failure). */
function postJson(urlStr: string, body: unknown, bearer: string | undefined, timeoutMs: number): Promise<{ ok: boolean; status?: number; boardId?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: { ok: boolean; status?: number; boardId?: string }): void => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    try {
      const u = new URL(urlStr);
      const lib = u.protocol === "https:" ? https : http;
      const buf = Buffer.from(JSON.stringify(body), "utf8");
      const headers: Record<string, string | number> = { "Content-Type": "application/json", "Content-Length": buf.length };
      if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
      const req = lib.request({ hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80), path: u.pathname, method: "POST", headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          if (chunks.length < 64) chunks.push(c);
        });
        res.on("end", () => {
          let boardId: string | undefined;
          try {
            boardId = (JSON.parse(Buffer.concat(chunks).toString("utf8")) as { boardId?: string }).boardId;
          } catch {
            /* no/!json body (e.g. 204) */
          }
          done({ ok: (res.statusCode ?? 0) < 400, status: res.statusCode, boardId });
        });
      });
      req.on("error", () => done({ ok: false }));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        done({ ok: false });
      });
      req.write(buf);
      req.end();
    } catch {
      done({ ok: false });
    }
  });
}
