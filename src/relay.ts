/**
 * The hosted relay (T2 "board from anywhere") — multi-tenant, ciphertext-only.
 *
 * It routes + stores SEALED events (see src/e2e.ts) and NEVER holds the key K, so it
 * cannot read titles/messages/tallies — only coarse routing (board-id, sid, state,
 * seq). The board's freshness guard + the AAD binding are what keep an untrusted
 * relay honest; here we just store the latest sealed blob per session and serve it.
 *
 * This module MUST live in the OSS repo: T2's guarantee is "reproducible +
 * publicly-logged code", so the relay a user trusts has to be auditable.
 *
 * Increment 2 (this file): the data path — POST /provision, POST /i/<board>,
 * GET /s/<board> — the multi-tenant store, a file-backed tenant KV (hashed tokens
 * only; events stay in RAM with a TTL), and abuse caps. SSE, push, and the board
 * bundle land in later increments. stdlib only.
 */
import * as http from "http";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { SealedBlob } from "./e2e";

/** What the hook POSTs (the relay stamps tsSrv on receipt). */
export interface RelayEvent {
  sid: string; // opaque session id
  state: string; // working | waiting | done | error | idle
  seq: number; // client monotonic counter per sid (board enforces freshness)
  enc: SealedBlob; // sealed {title,message,agent,tallies,pending,seq,tsClient}
}
export interface StoredEvent extends RelayEvent {
  tsSrv: number; // server-receipt time (advisory; the trusted time is sealed inside enc)
}

const STATES = new Set(["working", "waiting", "done", "error", "idle"]);
const MAX_SESSIONS = 200; // per board
const MAX_BOARDS = 500; // total tenants (single-process MVP)
const IDLE_BOARD_MS = 90 * 24 * 60 * 60 * 1000; // evict boards unused for 90d (beta capacity guard)
const EVENT_TTL_MS = 6 * 60 * 60 * 1000; // 6h, matches the local board's sweep
export const MAX_BODY = 64 * 1024;
const MAX_SID = 200;
const MAX_CT = 64 * 1024; // bounds per-event storage (body cap also applies)

const sha256 = (s: string | Buffer): Buffer => crypto.createHash("sha256").update(s).digest();
const ctEq = (a: Buffer, b: Buffer): boolean => a.length === b.length && crypto.timingSafeEqual(a, b);

/** An error carrying the HTTP status the relay should return. */
export class RelayError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

const isB64u = (s: unknown, maxLen: number): s is string =>
  typeof s === "string" && s.length > 0 && s.length <= maxLen && /^[A-Za-z0-9_-]+$/.test(s);

/** Validate an untrusted ingest payload (shape only — the relay can't read content). */
export function validateEvent(x: unknown): asserts x is RelayEvent {
  if (typeof x !== "object" || x === null) throw new RelayError(400, "bad event");
  const e = x as Record<string, unknown>;
  if (typeof e.sid !== "string" || e.sid.length === 0 || e.sid.length > MAX_SID) throw new RelayError(400, "bad sid");
  if (typeof e.state !== "string" || !STATES.has(e.state)) throw new RelayError(400, "bad state");
  if (!Number.isSafeInteger(e.seq) || (e.seq as number) < 0) throw new RelayError(400, "bad seq");
  const enc = e.enc as Record<string, unknown> | undefined;
  if (!enc || !isB64u(enc.nonce, 32) || !isB64u(enc.ct, MAX_CT * 2)) throw new RelayError(400, "bad enc");
}

interface Board {
  hashedToken: Buffer; // SHA-256(ingest-token); the cleartext token is never stored
  createdAt: number;
  lastSeen: number;
  events: Map<string, StoredEvent>; // RAM only, swept by TTL
}

/** Multi-tenant store. Tenant secrets (hashed token) persist to a file; the sealed
 *  events are RAM-only and ephemeral. */
export class RelayStore {
  private boards = new Map<string, Board>();
  private file?: string;

  constructor(private now: () => number = Date.now, dataDir?: string) {
    if (dataDir) {
      this.file = path.join(dataDir, "relay-tenants.json");
      this.load();
    }
  }

  /** Create a board from a client-supplied token HASH (the relay never sees the
   *  cleartext token at provision time). Returns a 256-bit unguessable board-id. */
  provision(tokenHashB64u: string): string {
    if (!isB64u(tokenHashB64u, 64) || Buffer.from(tokenHashB64u, "base64url").length !== 32)
      throw new RelayError(400, "bad token hash");
    if (this.boards.size >= MAX_BOARDS) this.evictIdle(); // free abandoned boards before refusing
    if (this.boards.size >= MAX_BOARDS) throw new RelayError(503, "relay at capacity");
    const boardId = crypto.randomBytes(32).toString("base64url"); // 256-bit
    const t = this.now();
    this.boards.set(boardId, { hashedToken: Buffer.from(tokenHashB64u, "base64url"), createdAt: t, lastSeen: t, events: new Map() });
    this.save();
    return boardId;
  }

  /** Store one sealed event. Authenticates the bearer ingest-token against the stored
   *  hash (constant-time). Throws RelayError on any failure. */
  ingest(boardId: string, token: string, ev: unknown): void {
    const b = this.boards.get(boardId);
    if (!b) throw new RelayError(404, "no such board");
    if (typeof token !== "string" || !ctEq(sha256(token), b.hashedToken)) throw new RelayError(401, "bad token");
    validateEvent(ev);
    this.sweep(b); // drop TTL-dead sessions BEFORE the cap, so an unread/push-only board can't fill with ghosts and 429 real events
    if (!b.events.has(ev.sid) && b.events.size >= MAX_SESSIONS) throw new RelayError(429, "too many sessions");
    // store only the known enc fields (validateEvent doesn't reject extra keys)
    b.events.set(ev.sid, { sid: ev.sid, state: ev.state, seq: ev.seq, enc: { nonce: ev.enc.nonce, ct: ev.enc.ct }, tsSrv: this.now() });
    b.lastSeen = this.now();
  }

  /** The current sealed snapshot (board-id is the read capability in the MVP). */
  snapshot(boardId: string): StoredEvent[] {
    const b = this.boards.get(boardId);
    if (!b) throw new RelayError(404, "no such board");
    this.sweep(b);
    b.lastSeen = this.now();
    return [...b.events.values()];
  }

  boardCount(): number {
    return this.boards.size;
  }

  private sweep(b: Board): void {
    const cutoff = this.now() - EVENT_TTL_MS;
    for (const [sid, ev] of b.events) if (ev.tsSrv < cutoff) b.events.delete(sid);
  }

  /** Evict boards no one has ingested-to or read in IDLE_BOARD_MS — so a flood of
   *  provisions can't permanently watermark MAX_BOARDS (a cross-tenant DoS). */
  private evictIdle(): void {
    const cutoff = this.now() - IDLE_BOARD_MS;
    let removed = false;
    for (const [id, b] of this.boards) if (b.lastSeen < cutoff) (this.boards.delete(id), (removed = true));
    if (removed) this.save();
  }

  // ---- persistence: only {boardId -> hashedToken, createdAt}, never events ----
  private load(): void {
    if (!this.file || !fs.existsSync(this.file)) return;
    let data: { boards?: Record<string, { tokenHash: string; createdAt: number }> };
    try {
      data = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      // A corrupt tenant file would silently drop EVERY board's token. Preserve it for
      // recovery (so the next save can't overwrite it) and start empty + loud.
      try {
        fs.renameSync(this.file, `${this.file}.corrupt-${this.now()}`);
      } catch {
        /* best effort */
      }
      console.error(`relay: ${this.file} was unreadable — preserved as .corrupt-*, started with 0 boards`);
      return;
    }
    for (const [id, rec] of Object.entries(data.boards || {})) {
      const hashed = Buffer.from(rec.tokenHash, "base64url");
      if (hashed.length === 32) this.boards.set(id, { hashedToken: hashed, createdAt: rec.createdAt || 0, lastSeen: rec.createdAt || 0, events: new Map() });
    }
  }

  private save(): void {
    if (!this.file) return;
    const out: Record<string, { tokenHash: string; createdAt: number }> = {};
    for (const [id, b] of this.boards) out[id] = { tokenHash: b.hashedToken.toString("base64url"), createdAt: b.createdAt };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // Atomic: write a temp file then rename over the target, so a crash mid-write can't
    // truncate the tenant file (which would brick every board with 404).
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ boards: out }), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}

/** A tiny per-key fixed-window rate limiter (provisioning abuse, by IP). */
function makeRateLimit(max: number, windowMs: number, now: () => number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string): boolean => {
    const t = now();
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (t >= v.reset) hits.delete(k); // drop expired
      if (hits.size > 5000) hits.clear(); // hard ceiling under a distinct-key (IPv6) flood — brief fail-open, bounded memory
    }
    const cur = hits.get(key);
    if (!cur || t >= cur.reset) {
      hits.set(key, { n: 1, reset: t + windowMs });
      return true;
    }
    if (cur.n >= max) return false;
    cur.n++;
    return true;
  };
}

export interface RelayOptions {
  dataDir?: string;
  now?: () => number;
}

/** Build the relay HTTP server (increment 2: provision / ingest / snapshot). */
export function createRelay(opts: RelayOptions = {}): { server: http.Server; store: RelayStore } {
  const now = opts.now ?? Date.now;
  const dataDir = opts.dataDir ?? path.join(os.homedir(), ".andon");
  const store = new RelayStore(now, dataDir);
  const provisionLimit = makeRateLimit(20, 60 * 60 * 1000, now); // 20 new boards / IP / hour
  const ingestLimit = makeRateLimit(600, 60 * 1000, now); // 10/s sustained per board+IP
  const snapshotLimit = makeRateLimit(120, 60 * 1000, now); // 2/s per IP

  const send = (res: http.ServerResponse, code: number, body: unknown): void => {
    const buf = Buffer.from(JSON.stringify(body ?? {}), "utf8");
    res.writeHead(code, {
      "Content-Type": "application/json",
      "Content-Length": buf.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    res.end(buf);
  };

  const readBody = (req: http.IncomingMessage, cb: (body: unknown) => void, onErr: () => void): void => {
    let size = 0;
    let done = false; // guard: req.destroy() emits "error", so onErr must fire at most once
    const chunks: Buffer[] = [];
    const finishErr = (): void => {
      if (!done) {
        done = true;
        onErr();
      }
    };
    req.on("data", (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > MAX_BODY) {
        finishErr();
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        onErr();
        return;
      }
      cb(parsed); // cb owns its own error handling — kept outside the parse try
    });
    req.on("error", finishErr);
  };

  // Direct-exposure correct. Behind a TLS-terminating proxy every request collapses to
  // one rate-limit bucket; a future RelayOptions.trustProxy must parse X-Forwarded-For
  // by configured hop count (never trust the client-controlled left end — it's spoofable).
  const clientIp = (req: http.IncomingMessage): string => req.socket.remoteAddress || "?";

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    const fail = (e: unknown) => {
      const status = e instanceof RelayError ? e.status : 400;
      send(res, status, { error: e instanceof Error ? e.message : "bad request" });
    };

    try {
      // POST /provision  { tokenHash }
      if (req.method === "POST" && parts.length === 1 && parts[0] === "provision") {
        if (!provisionLimit(clientIp(req))) return send(res, 429, { error: "rate limited" });
        return readBody(
          req,
          (body) => {
            try {
              const hash = (body as { tokenHash?: unknown })?.tokenHash;
              if (typeof hash !== "string") throw new RelayError(400, "tokenHash required");
              send(res, 200, { boardId: store.provision(hash) });
            } catch (e) {
              fail(e);
            }
          },
          () => send(res, 400, { error: "bad body" }),
        );
      }

      // POST /i/<board>   (Authorization: Bearer <ingest-token>)  body = event
      if (req.method === "POST" && parts.length === 2 && parts[0] === "i") {
        const boardId = decodeURIComponent(parts[1]);
        if (!ingestLimit(boardId + ":" + clientIp(req))) return send(res, 429, { error: "rate limited" });
        const auth = req.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        return readBody(
          req,
          (body) => {
            try {
              store.ingest(boardId, token, body);
              send(res, 204, {});
            } catch (e) {
              fail(e);
            }
          },
          () => send(res, 400, { error: "bad body" }),
        );
      }

      // GET /s/<board>    snapshot (board-id is the read capability in the MVP)
      if (req.method === "GET" && parts.length === 2 && parts[0] === "s") {
        if (!snapshotLimit(clientIp(req))) return send(res, 429, { error: "rate limited" });
        const boardId = decodeURIComponent(parts[1]);
        return send(res, 200, { events: store.snapshot(boardId) });
      }

      send(res, 404, { error: "not found" });
    } catch (e) {
      fail(e);
    }
  });

  // Bound slow-client / half-open connections (slowloris) — legit bodies are <=64KB.
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.timeout = 30_000;
  server.maxConnections = 1000;

  return { server, store };
}
