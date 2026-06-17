/**
 * First-party Web Push — Node stdlib only, no dependencies.
 *
 * Lets a SELF-HOSTED Andon (served over HTTPS, e.g. behind Tailscale) push a
 * "needs you / stuck" alert to a subscribed phone even when the board is closed
 * and the phone is locked. The only thing that leaves your box is an ENCRYPTED
 * payload (RFC 8291) relayed by the push service (Apple/Mozilla/Google) — they
 * relay ciphertext they can't read, and there is no third-party Andon account.
 *
 * Implements:
 *   - VAPID (RFC 8292): an ES256 JWT identifying this server to the push service.
 *   - aes128gcm payload encryption (RFC 8291 + RFC 8188).
 *
 * Privacy posture:
 *   - The push body is minimal — a coarse state + the project title — NEVER the
 *     agent's message text, code, or paths.
 *   - Subscriptions live in memory; the board re-registers them on load. The only
 *     thing persisted to disk is this server's own VAPID identity keypair (like an
 *     SSH host key), so subscriptions stay valid across a restart — and only once
 *     you actually enable phone alerts. No agent data is ever written.
 */
import * as crypto from "crypto";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Session } from "./types";
import { makeTransitionWatcher } from "./alerts";

const b64u = (b: Buffer): string => b.toString("base64url");
const fromB64u = (s: string): Buffer => Buffer.from(s, "base64url");

/** A W3C PushSubscription as posted by the board (endpoint + the UA's keys). */
export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** This server's VAPID identity (a P-256 keypair, base64url). */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export function generateVapidKeys(): VapidKeys {
  const ec = crypto.createECDH("prime256v1");
  ec.generateKeys();
  return { publicKey: b64u(ec.getPublicKey()), privateKey: b64u(ec.getPrivateKey()) };
}

/** Turn the raw VAPID keypair into a KeyObject for ES256 signing (via JWK). */
function vapidPrivateKeyObject(keys: VapidKeys): crypto.KeyObject {
  const pub = fromB64u(keys.publicKey); // 65-byte uncompressed point: 0x04 || x || y
  return crypto.createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: b64u(pub.subarray(1, 33)),
      y: b64u(pub.subarray(33, 65)),
    },
  });
}

/**
 * The `Authorization: vapid t=…, k=…` header (RFC 8292) for one push. The JWT is
 * signed ES256 (ECDSA P-256 / SHA-256) with a raw r||s signature.
 */
export function vapidAuthHeader(endpoint: string, subject: string, keys: VapidKeys, nowSec?: number): string {
  const aud = new URL(endpoint).origin;
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64u(Buffer.from(JSON.stringify({ aud, exp: now + 12 * 3600, sub: subject })));
  const signingInput = `${header}.${payload}`;
  const sig = crypto.sign("sha256", Buffer.from(signingInput), {
    key: vapidPrivateKeyObject(keys),
    dsaEncoding: "ieee-p1363", // raw r||s (64 bytes), not DER
  });
  return `vapid t=${signingInput}.${b64u(sig)}, k=${keys.publicKey}`;
}

/** HKDF (RFC 5869): extract(salt, ikm) then expand(info, length). */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, length));
}

/**
 * Encrypt one push message for a subscription using aes128gcm (RFC 8291 + 8188).
 * Returns the full request body (salt | rs | idlen | as_public | ciphertext).
 *
 * `testHook` injects the ephemeral keypair + salt so the output is deterministic
 * and can be checked against the RFC 8291 §5 vector (and round-tripped). In
 * production all three are freshly random.
 */
export function encryptPayload(
  sub: PushSubscription,
  plaintext: Buffer,
  testHook?: { asPrivate: Buffer; asPublic: Buffer; salt: Buffer },
): Buffer {
  const uaPublic = fromB64u(sub.keys.p256dh); // 65 bytes
  const authSecret = fromB64u(sub.keys.auth); // 16 bytes

  const as = crypto.createECDH("prime256v1");
  let asPublic: Buffer;
  if (testHook) {
    as.setPrivateKey(testHook.asPrivate);
    asPublic = testHook.asPublic;
  } else {
    as.generateKeys();
    asPublic = as.getPublicKey();
  }
  const ecdhSecret = as.computeSecret(uaPublic); // 32 bytes
  const salt = testHook ? testHook.salt : crypto.randomBytes(16);

  // Combine the auth secret into the key material (RFC 8291 §3.4).
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);

  // Content-encryption key + nonce (RFC 8188 §2.1).
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);

  // Single record: plaintext || 0x02 (last-record delimiter), then AES-128-GCM.
  const padded = Buffer.concat([plaintext, Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0); // record size
  const header = Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic]);
  return Buffer.concat([header, body]);
}

export interface SendResult {
  status: number;
}

/** POST one encrypted message to a push endpoint. Never throws; status 0 = network error. */
export function sendPush(
  sub: PushSubscription,
  body: Buffer,
  vapid: VapidKeys,
  subject: string,
  opts?: { ttlSec?: number; urgency?: string; timeoutMs?: number },
): Promise<SendResult> {
  const u = new URL(sub.endpoint);
  if (u.protocol !== "https:") return Promise.resolve({ status: 0 }); // defense in depth: never POST to a non-https endpoint
  const headers: Record<string, string | number> = {
    TTL: String(opts?.ttlSec ?? 2592000),
    "Content-Length": body.length,
    "Content-Encoding": "aes128gcm",
    Urgency: opts?.urgency ?? "high",
    Authorization: vapidAuthHeader(sub.endpoint, subject, vapid),
  };
  return new Promise((resolve) => {
    const req = https.request(u, { method: "POST", headers, timeout: opts?.timeoutMs ?? 5000 }, (res) => {
      res.on("data", () => {});
      res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
    });
    req.on("error", () => resolve({ status: 0 }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0 });
    });
    req.write(body);
    req.end();
  });
}

/**
 * The push services real browsers actually subscribe to. We only ever store (and
 * later POST to) endpoints on these hosts — an SSRF guard so a submitted endpoint
 * can't aim the server at an arbitrary/internal URL. (Low-risk in self-host where
 * /push/subscribe is token-gated to you, but essential once it's internet-facing.)
 */
const PUSH_HOSTS: RegExp[] = [
  /(^|\.)googleapis\.com$/, // Chrome / Edge / Samsung (FCM)
  /(^|\.)push\.apple\.com$/, // Safari / iOS / macOS
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)notify\.windows\.com$/, // Windows (legacy WNS)
  /(^|\.)push\.microsoft\.com$/, // Edge / Windows
];

/** True for a structurally valid W3C subscription on a real push host (defensive: it arrives over HTTP). */
export function isValidSubscription(x: unknown): x is PushSubscription {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  if (typeof s.endpoint !== "string") return false;
  let u: URL;
  try {
    u = new URL(s.endpoint);
  } catch {
    return false;
  }
  // Always https (a real push endpoint is) and only on a known push-service host.
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!PUSH_HOSTS.some((re) => re.test(host))) return false;
  const k = s.keys as Record<string, unknown> | undefined;
  if (!k || typeof k.p256dh !== "string" || typeof k.auth !== "string") return false;
  // sanity: the UA public key is a 65-byte point, auth is 16 bytes
  try {
    return fromB64u(k.p256dh).length === 65 && fromB64u(k.auth).length === 16;
  } catch {
    return false;
  }
}

function defaultVapidPath(dataDir?: string): string {
  return path.join(dataDir || path.join(os.homedir(), ".andon"), "vapid.json");
}

/** Load the persisted VAPID identity, or mint + persist one (0600) on first use. */
function loadOrCreateVapid(dataDir?: string): VapidKeys {
  const p = defaultVapidPath(dataDir);
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    if (typeof j?.publicKey === "string" && typeof j?.privateKey === "string") return j;
  } catch {
    /* not yet created / unreadable — mint a fresh one below */
  }
  const keys = generateVapidKeys();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(keys), { mode: 0o600 });
  } catch {
    /* read-only fs — keep the in-memory keypair for this run */
  }
  return keys;
}

/**
 * Holds the live push subscriptions and this server's VAPID identity, and turns
 * agent state transitions into minimal, honest pushes. Constructed lazily (only
 * when a device first subscribes), so a user who never enables phone alerts has
 * zero push footprint — no VAPID file, nothing sent anywhere.
 */
export class PushHub {
  private subs = new Map<string, PushSubscription>(); // keyed by endpoint
  private readonly vapid: VapidKeys;
  private readonly subject: string;
  /** Override the network send (tests). */
  send: typeof sendPush = sendPush;

  constructor(opts?: { dataDir?: string; subject?: string }) {
    this.subject = opts?.subject || "mailto:agent-andon@localhost";
    this.vapid = loadOrCreateVapid(opts?.dataDir);
  }

  get publicKey(): string {
    return this.vapid.publicKey;
  }
  get size(): number {
    return this.subs.size;
  }

  add(sub: PushSubscription): void {
    this.subs.set(sub.endpoint, sub);
  }
  remove(endpoint: string): void {
    this.subs.delete(endpoint);
  }

  /** Encrypt + send one notification to every subscription; prune dead ones. */
  async pushAll(title: string, body: string, url?: string): Promise<void> {
    if (this.subs.size === 0) return;
    const payload = Buffer.from(JSON.stringify({ title, body, url }), "utf8");
    for (const sub of [...this.subs.values()]) {
      let enc: Buffer;
      try {
        enc = encryptPayload(sub, payload);
      } catch {
        continue; // a malformed stored subscription can't poison the loop
      }
      const { status } = await this.send(sub, enc, this.vapid, this.subject);
      if (status === 404 || status === 410) this.subs.delete(sub.endpoint); // gone for good
    }
  }

  /**
   * A snapshot consumer (fed like the desktop alerter) that pushes ONLY on a
   * needs-you / stuck transition — one push per event, no done/working noise.
   * Tighter throttle than the desktop banner (a phone buzz costs more attention).
   */
  notifier(boardUrl?: string): (sessions: Session[]) => void {
    return makeTransitionWatcher({
      cooldownMs: 3000,
      bucketCap: 4,
      refillPerSec: 0.5,
      onAlert: (s) => {
        const stuck = s.state === "error";
        const tag = stuck ? "STUCK" : "NEEDS YOU";
        const body = stuck ? `${s.title} is stuck` : `${s.title} needs you`;
        void this.pushAll(`Andon · ${tag}`, body, boardUrl);
      },
      // no onDone: phones fire only on needs-you/stuck (the board is the all-clear)
    });
  }
}
