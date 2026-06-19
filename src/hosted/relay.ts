/**
 * The hosted relay (T2 "board from anywhere") — multi-tenant, ciphertext-only.
 *
 * It routes + stores SEALED events (see src/hosted/e2e.ts) and NEVER holds the key K, so it
 * cannot read titles/messages/tallies — only coarse routing (board-id, sid, state,
 * seq). The board's freshness guard + the AAD binding are what keep an untrusted
 * relay honest; here we just store the latest sealed blob per session and serve it.
 *
 * This module MUST live in the OSS repo: T2's guarantee is "reproducible +
 * publicly-logged code", so the relay a user trusts has to be auditable.
 *
 * Endpoints: POST /provision · POST /i/<board> (ingest) · GET /s/<board> (snapshot)
 * · GET /e/<board> (SSE live stream) · GET /vapid · POST /p/<board>/{subscribe,
 * unsubscribe}. Multi-tenant store + file-backed tenant KV (hashed tokens + push
 * subscriptions; sealed events stay in RAM with a TTL) + abuse caps. The relay
 * decides WHEN to push from the cleartext state, but the push body is the sealed
 * blob — the service worker decrypts it; the relay never can. The board bundle +
 * transparency log land in later increments. stdlib only.
 */
import * as http from "http";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { SealedBlob } from "./e2e";
import { encryptPayload, sendPush, isValidSubscription, type PushSubscription, type VapidKeys, generateVapidKeys } from "../push";
import { boardHtml, BOARD_CSP, HOSTED_SW, boardSha, swSha, bundleVersion } from "./board-assets";
import { FAVICON_SVG } from "../assets";
import { soundName, serveSound, SOUNDS } from "../sounds";

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
const ALERT_STATES = new Set(["waiting", "error"]); // fire a push on transition INTO these
const MAX_SUBS = 20; // push subscriptions per board
const PUSH_SUBJECT = process.env.ANDON_PUSH_SUBJECT || "mailto:agent-andon@localhost";

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
  subs: Map<string, PushSubscription>; // push subscriptions, by endpoint
}

/** Multi-tenant store. Tenant secrets (hashed token) persist to a file; the sealed
 *  events are RAM-only and ephemeral. */
export class RelayStore {
  private boards = new Map<string, Board>();
  private file?: string;
  private vapidFile?: string;
  private vapidKeys?: VapidKeys;

  constructor(private now: () => number = Date.now, dataDir?: string) {
    if (dataDir) {
      this.file = path.join(dataDir, "relay-tenants.json");
      this.vapidFile = path.join(dataDir, "relay-vapid.json");
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
    this.boards.set(boardId, { hashedToken: Buffer.from(tokenHashB64u, "base64url"), createdAt: t, lastSeen: t, events: new Map(), subs: new Map() });
    this.save();
    return boardId;
  }

  /** Store one sealed event. Authenticates the bearer ingest-token against the stored
   *  hash (constant-time). Throws RelayError on any failure. */
  ingest(boardId: string, token: string, ev: unknown): { event: StoredEvent; alert: boolean } {
    const b = this.boards.get(boardId);
    if (!b) throw new RelayError(404, "no such board");
    if (typeof token !== "string" || !ctEq(sha256(token), b.hashedToken)) throw new RelayError(401, "bad token");
    validateEvent(ev);
    this.sweep(b); // drop TTL-dead sessions BEFORE the cap, so an unread/push-only board can't fill with ghosts and 429 real events
    if (!b.events.has(ev.sid) && b.events.size >= MAX_SESSIONS) throw new RelayError(429, "too many sessions");
    const prev = b.events.get(ev.sid);
    // push only on a TRANSITION into needs-you/error (not every event, not staying-stuck)
    const alert = ALERT_STATES.has(ev.state) && !(prev !== undefined && ALERT_STATES.has(prev.state));
    // store only the known enc fields (validateEvent doesn't reject extra keys)
    const event: StoredEvent = { sid: ev.sid, state: ev.state, seq: ev.seq, enc: { nonce: ev.enc.nonce, ct: ev.enc.ct }, tsSrv: this.now() };
    b.events.set(ev.sid, event);
    b.lastSeen = this.now();
    return { event, alert };
  }

  /** The current sealed snapshot (board-id is the read capability in the MVP). */
  snapshot(boardId: string): StoredEvent[] {
    const b = this.boards.get(boardId);
    if (!b) throw new RelayError(404, "no such board");
    this.sweep(b);
    b.lastSeen = this.now();
    return [...b.events.values()];
  }

  /** Store a push subscription for a board (validated against real push hosts, capped). */
  subscribe(boardId: string, sub: unknown): void {
    const b = this.boards.get(boardId);
    if (!b) throw new RelayError(404, "no such board");
    if (!isValidSubscription(sub)) throw new RelayError(400, "bad subscription");
    if (!b.subs.has(sub.endpoint) && b.subs.size >= MAX_SUBS) throw new RelayError(429, "too many subscriptions");
    b.subs.set(sub.endpoint, sub);
    b.lastSeen = this.now();
    this.save();
  }

  unsubscribe(boardId: string, endpoint: unknown): void {
    const b = this.boards.get(boardId);
    if (b && typeof endpoint === "string" && b.subs.delete(endpoint)) this.save();
  }

  subsOf(boardId: string): PushSubscription[] {
    const b = this.boards.get(boardId);
    return b ? [...b.subs.values()] : [];
  }

  /** The relay's VAPID public key (boards subscribe with it). Lazily minted on first use. */
  vapidPublicKey(): string {
    return this.ensureVapid().publicKey;
  }
  /** The relay's VAPID keypair, for signing outgoing pushes (internal to the module). */
  vapid(): VapidKeys {
    return this.ensureVapid();
  }
  private ensureVapid(): VapidKeys {
    if (this.vapidKeys) return this.vapidKeys;
    if (this.vapidFile) {
      try {
        const j = JSON.parse(fs.readFileSync(this.vapidFile, "utf8"));
        if (typeof j?.publicKey === "string" && typeof j?.privateKey === "string") return (this.vapidKeys = j);
      } catch {
        /* not yet created */
      }
    }
    const keys = generateVapidKeys();
    if (this.vapidFile) {
      try {
        fs.mkdirSync(path.dirname(this.vapidFile), { recursive: true });
        fs.writeFileSync(this.vapidFile, JSON.stringify(keys), { mode: 0o600 });
      } catch {
        /* read-only fs — keep the in-memory keypair for this run */
      }
    }
    return (this.vapidKeys = keys);
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
    let data: { boards?: Record<string, { tokenHash: string; createdAt: number; subs?: PushSubscription[] }> };
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
      if (hashed.length !== 32) continue;
      const subs = new Map<string, PushSubscription>();
      for (const s of rec.subs || []) if (isValidSubscription(s)) subs.set(s.endpoint, s);
      this.boards.set(id, { hashedToken: hashed, createdAt: rec.createdAt || 0, lastSeen: rec.createdAt || 0, events: new Map(), subs });
    }
  }

  private save(): void {
    if (!this.file) return;
    const out: Record<string, { tokenHash: string; createdAt: number; subs: PushSubscription[] }> = {};
    for (const [id, b] of this.boards) out[id] = { tokenHash: b.hashedToken.toString("base64url"), createdAt: b.createdAt, subs: [...b.subs.values()] };
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
  sendPush?: typeof sendPush; // injection seam for tests; defaults to the real push sender
}

/** Build the relay HTTP server (increment 2: provision / ingest / snapshot). */
export function createRelay(opts: RelayOptions = {}): { server: http.Server; store: RelayStore; stop: (cb?: () => void) => void } {
  const now = opts.now ?? Date.now;
  const dataDir = opts.dataDir ?? path.join(os.homedir(), ".andon");
  const store = new RelayStore(now, dataDir);
  const provisionLimit = makeRateLimit(20, 60 * 60 * 1000, now); // 20 new boards / IP / hour
  const ingestLimit = makeRateLimit(600, 60 * 1000, now); // 10/s sustained per board+IP
  const snapshotLimit = makeRateLimit(120, 60 * 1000, now); // 2/s per IP
  const subscribeLimit = makeRateLimit(30, 60 * 60 * 1000, now); // 30 subscribes / IP / hour

  // --- live delivery (SSE + push), both over ciphertext only ---
  const doSendPush = opts.sendPush ?? sendPush; // injectable for tests
  const sse = new Map<string, Set<http.ServerResponse>>(); // board -> open SSE responses
  const sseByIp = new Map<string, number>(); // concurrent streams per IP — anti-DoS
  let sseTotal = 0;
  const MAX_SSE_PER_BOARD = 20;
  const MAX_SSE_PER_IP = 8; // one IP can't hoard the global pool (cross-tenant DoS)
  const MAX_SSE_TOTAL = 500;

  const broadcast = (boardId: string, event: StoredEvent): void => {
    const set = sse.get(boardId);
    if (!set) return;
    const line = `data: ${JSON.stringify({ type: "event", event })}\n\n`;
    for (const r of set) {
      try {
        r.write(line);
      } catch {
        /* a half-dead socket: its "close" handler cleans it up; don't break the loop */
      }
    }
  };

  // Push the SEALED blob; the service worker decrypts it with K (the relay never can).
  const pushNotify = async (boardId: string, event: StoredEvent): Promise<void> => {
    const subs = store.subsOf(boardId);
    if (subs.length === 0) return;
    const payload = Buffer.from(JSON.stringify({ boardId, sid: event.sid, state: event.state, seq: event.seq, enc: event.enc }), "utf8");
    const vapid = store.vapid();
    await Promise.allSettled(
      subs.map(async (sub) => {
        let body: Buffer;
        try {
          body = encryptPayload(sub, payload);
        } catch {
          return; // a malformed stored subscription can't poison the batch
        }
        const { status } = await doSendPush(sub, body, vapid, PUSH_SUBJECT);
        if (status === 404 || status === 410) store.unsubscribe(boardId, sub.endpoint); // gone for good
      }),
    );
  };

  // Keep SSE connections alive through proxies; unref so it never blocks process exit.
  const heartbeat = setInterval(() => {
    for (const set of sse.values())
      for (const r of set) {
        try {
          r.write(": ping\n\n");
        } catch {
          /* dead socket; close handler will prune */
        }
      }
  }, 25_000);
  heartbeat.unref();

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

  // Non-JSON assets (the board bundle, the SW, the manifest).
  const sendRaw = (res: http.ServerResponse, body: string | Buffer, ctype: string, extra?: Record<string, string>): void => {
    const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
    res.writeHead(200, {
      "Content-Type": ctype,
      "Content-Length": buf.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...(extra || {}),
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
      if (e instanceof RelayError) return send(res, e.status, { error: e.message });
      send(res, 400, { error: "bad request" }); // never echo a raw internal error message to callers
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
              const { event, alert } = store.ingest(boardId, token, body);
              broadcast(boardId, event); // live-update any open boards
              if (alert) void pushNotify(boardId, event); // and buzz phones on a needs-you transition
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
        const boardId = decodeURIComponent(parts[1]);
        if (!snapshotLimit(boardId + ":" + clientIp(req))) return send(res, 429, { error: "rate limited" });
        return send(res, 200, { events: store.snapshot(boardId) });
      }

      // GET /e/<board>    SSE live stream (board-id is the read capability)
      if (req.method === "GET" && parts.length === 2 && parts[0] === "e") {
        const boardId = decodeURIComponent(parts[1]);
        if (!snapshotLimit(boardId + ":" + clientIp(req))) return send(res, 429, { error: "rate limited" });
        let initial: StoredEvent[];
        try {
          initial = store.snapshot(boardId); // validates the board exists (404) + gives current state
        } catch (e) {
          return fail(e);
        }
        const ip = clientIp(req);
        const set = sse.get(boardId) ?? new Set<http.ServerResponse>();
        if (sseTotal >= MAX_SSE_TOTAL || set.size >= MAX_SSE_PER_BOARD || (sseByIp.get(ip) ?? 0) >= MAX_SSE_PER_IP)
          return send(res, 503, { error: "too many streams" });
        res.setTimeout(0); // long-lived stream — don't let the 30s socket idle timeout drop a healthy SSE
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        });
        res.write(`data: ${JSON.stringify({ type: "snapshot", events: initial })}\n\n`); // first frame = full state
        set.add(res);
        sse.set(boardId, set);
        sseTotal++;
        sseByIp.set(ip, (sseByIp.get(ip) ?? 0) + 1);
        req.on("close", () => {
          set.delete(res);
          sseTotal--;
          const n = (sseByIp.get(ip) ?? 1) - 1;
          if (n <= 0) sseByIp.delete(ip);
          else sseByIp.set(ip, n);
          if (set.size === 0) sse.delete(boardId);
        });
        return;
      }

      // GET /b/<board>   the board bundle (self-detects hosted mode from path + #k)
      if (req.method === "GET" && parts.length === 2 && parts[0] === "b") {
        return sendRaw(res, boardHtml(), "text/html; charset=utf-8", { "Content-Security-Policy": BOARD_CSP });
      }

      // GET /b/<board>/manifest.webmanifest   per-board PWA manifest — start_url MUST be
      // the board path, so a home-screen launch lands on /b/<board> (not "/", which 404s).
      if (req.method === "GET" && parts.length === 3 && parts[0] === "b" && parts[2] === "manifest.webmanifest") {
        const start = "/b/" + encodeURIComponent(decodeURIComponent(parts[1]));
        return sendRaw(res, JSON.stringify({ name: "Agent Andon", short_name: "Andon", display: "standalone", background_color: "#0b0b0c", theme_color: "#0b0b0c", start_url: start, scope: start, icons: [{ src: "/favicon.svg", type: "image/svg+xml", sizes: "any" }] }), "application/manifest+json");
      }

      // GET /sw.js   the hosted service worker (decrypts pushes with K)
      if (req.method === "GET" && parts.length === 1 && parts[0] === "sw.js") {
        return sendRaw(res, HOSTED_SW, "text/javascript; charset=utf-8");
      }

      // GET /favicon.svg   so the board + home-screen icon don't 404 (shared with self-host)
      if (req.method === "GET" && parts.length === 1 && parts[0] === "favicon.svg") {
        return sendRaw(res, FAVICON_SVG, "image/svg+xml");
      }

      // GET /snd/<name>.wav   alert chimes — range-capable (iOS <audio> can't play data: URIs)
      if (req.method === "GET" && parts.length === 2 && parts[0] === "snd") {
        const snd = soundName(url.pathname);
        if (snd) return serveSound(req, res, SOUNDS[snd]);
      }

      // GET /version   T2 transparency: the SHA-256 of the EXACT board + SW this relay
      // serves, so anyone can reproduce them from the open-source release and verify
      // the relay isn't serving backdoored code (`andon verify <url>`).
      if (req.method === "GET" && parts.length === 1 && parts[0] === "version") {
        return send(res, 200, { version: bundleVersion(), board_sha256: boardSha(), sw_sha256: swSha() });
      }

      // GET /vapid    the relay's VAPID public key (a board subscribes with it)
      if (req.method === "GET" && parts.length === 1 && parts[0] === "vapid") {
        return send(res, 200, { publicKey: store.vapidPublicKey() });
      }

      // POST /p/<board>/{subscribe,unsubscribe} — board-id IS the capability to manage
      // a board's own subscriptions (same secret that lets you read it). No bearer auth
      // by design: the board page subscribes with only board-id + K. MAX_SUBS + the SSRF
      // host allowlist (isValidSubscription) are what bound abuse here.
      if (req.method === "POST" && parts.length === 3 && parts[0] === "p" && parts[2] === "subscribe") {
        if (!subscribeLimit(clientIp(req))) return send(res, 429, { error: "rate limited" });
        const boardId = decodeURIComponent(parts[1]);
        return readBody(
          req,
          (body) => {
            try {
              store.subscribe(boardId, body);
              send(res, 204, {});
            } catch (e) {
              fail(e);
            }
          },
          () => send(res, 400, { error: "bad body" }),
        );
      }

      // POST /p/<board>/unsubscribe
      if (req.method === "POST" && parts.length === 3 && parts[0] === "p" && parts[2] === "unsubscribe") {
        if (!subscribeLimit(clientIp(req))) return send(res, 429, { error: "rate limited" });
        const boardId = decodeURIComponent(parts[1]);
        return readBody(
          req,
          (body) => {
            try {
              // store.unsubscribe -> save() can throw on a disk fault; without this try/catch
              // the throw escapes the req "end" callback and crashes the whole multi-tenant relay.
              store.unsubscribe(boardId, (body as { endpoint?: unknown })?.endpoint);
              send(res, 204, {});
            } catch (e) {
              fail(e);
            }
          },
          () => send(res, 400, { error: "bad body" }),
        );
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

  // Graceful shutdown: long-lived SSE responses would otherwise block server.close()
  // forever (the heartbeat keeps resetting the idle timeout). Destroy them explicitly.
  const stop = (cb?: () => void): void => {
    clearInterval(heartbeat);
    for (const set of sse.values()) for (const r of set) r.destroy();
    server.close(() => cb?.());
  };

  return { server, store, stop };
}
