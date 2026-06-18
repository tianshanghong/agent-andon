/**
 * End-to-end content encryption for the hosted ("board from anywhere") relay.
 *
 * The relay routes + stores CIPHERTEXT only and never holds the key `K`. The hook
 * SEALS each event's human-readable fields under `K` before sending; the board (and
 * the push service worker) OPEN them. The relay sees only coarse routing — board-id,
 * session id, coarse state, a sequence number — never titles/messages/tallies.
 *
 * Scheme (the "Wire format (NORMATIVE …)" note below is the spec):
 *   - AES-256-GCM, fresh random 96-bit nonce per event.
 *   - AAD = [board-id, sid, state, seq]  (the cleartext routing fields the CLIENT
 *     knows at seal time). Binding them means the relay can't swap a blob onto a
 *     different session/state/seq, and can't lie about the coarse `state` without
 *     decryption failing. NOTE: ts_srv (server-receipt time) is NOT in the AAD — the
 *     client seals before the relay timestamps, so it can't bind it; ts_srv stays
 *     cleartext + advisory, and `tsClient` (sealed inside, authenticated) is the
 *     trusted time.
 *   - Length-bucketed padding so ciphertext size leaks only a coarse bucket.
 *   - `seq` is bound in the AAD AND sealed inside (cross-checked on open) — a
 *     monotonic per-session counter the board enforces (makeFreshnessGuard) so the
 *     relay can't replay a stale "all good" over a real "needs you".
 *
 * Wire format (NORMATIVE — the board + push SW will re-implement this in browser JS,
 * so blobs must interop byte-for-byte): `nonce`/`ct` are base64url (RFC 4648 url-safe,
 * no padding); the padding length prefix is uint32 LITTLE-endian; AAD bytes =
 * JSON.stringify([boardId, sid, state, seq]) with seq a non-negative safe integer (so
 * it never serializes as "1e+21"). Check a fixed key+nonce+plaintext→ct vector into
 * both codebases when the JS port lands, so CI enforces the contract.
 *
 * stdlib only.
 */
import * as crypto from "crypto";

const b64u = (b: Buffer): string => b.toString("base64url");
const fromB64u = (s: string): Buffer => Buffer.from(s, "base64url");

/** The human-readable content the relay must never see. */
export interface Content {
  title?: string;
  message?: string;
  agent?: string;
  tallies?: unknown; // the leverage "today" object, or null
  pending?: number; // moved inside the ciphertext (done-masking is client-side)
}

/** Cleartext routing context, bound as AAD — identical on seal and open. */
export interface Routing {
  boardId: string;
  sid: string;
  state: string; // working | waiting | done | error | idle
  seq: number; // client monotonic counter per sid
}

/** What the relay stores + relays for one event's content. */
export interface SealedBlob {
  nonce: string; // base64url, 12 bytes
  ct: string; // base64url, ciphertext || 16-byte tag
}

/** What `open` returns: the content plus the authenticated inner seq + client time. */
export interface Opened extends Content {
  seq: number;
  tsClient: number;
}

/** A fresh 256-bit content key K (base64url). Generated client-side, never sent to the relay. */
export function generateKey(): string {
  return b64u(crypto.randomBytes(32));
}

const BUCKETS = [256, 1024, 4096, 16384];

/** Pad to a coarse size bucket (4-byte LE length prefix + zero fill) so the
 *  ciphertext length leaks only the bucket, not the exact message size. */
function pad(plain: Buffer): Buffer {
  const need = 4 + plain.length;
  const bucket = BUCKETS.find((b) => b >= need) ?? Math.ceil(need / 4096) * 4096;
  const out = Buffer.alloc(bucket); // zero-filled
  out.writeUInt32LE(plain.length, 0);
  plain.copy(out, 4);
  return out;
}
function unpad(buf: Buffer): Buffer {
  if (buf.length < 4) throw new Error("e2e: short plaintext");
  const len = buf.readUInt32LE(0);
  if (len > buf.length - 4) throw new Error("e2e: bad length");
  return buf.subarray(4, 4 + len);
}

/** AAD = the cleartext routing fields, length-tagged via JSON so no field can bleed
 *  into another. The client knows all of these at seal time. */
function aad(r: Routing): Buffer {
  return Buffer.from(JSON.stringify([r.boardId, r.sid, r.state, r.seq]), "utf8");
}

/** Seal content under K, binding the routing context. `nonceOverride` is for tests only. */
export function seal(
  key: string,
  content: Content,
  routing: Routing,
  tsClient: number,
  nonceOverride?: Buffer,
): SealedBlob {
  const K = fromB64u(key);
  if (K.length !== 32) throw new Error("e2e: key must be 32 bytes");
  if (!Number.isSafeInteger(routing.seq) || routing.seq < 0) throw new Error("e2e: seq must be a non-negative safe integer");
  const nonce = nonceOverride ?? crypto.randomBytes(12);
  if (nonce.length !== 12) throw new Error("e2e: nonce must be 12 bytes");
  // Authoritative fields go LAST so an attacker-influenced Content field named `seq`
  // or `tsClient` (titles/messages/agent come from agent + tool output) cannot shadow
  // the authenticated seq/time — that would brick the event or silently corrupt time.
  const plain = pad(Buffer.from(JSON.stringify({ ...content, seq: routing.seq, tsClient }), "utf8"));
  const cipher = crypto.createCipheriv("aes-256-gcm", K, nonce);
  cipher.setAAD(aad(routing));
  const enc = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return { nonce: b64u(nonce), ct: b64u(enc) };
}

/** Open a blob under K with the SAME routing context. Throws on any tamper /
 *  wrong key / wrong routing (GCM auth) — never returns wrong-but-plausible data. */
export function open(key: string, blob: SealedBlob, routing: Routing): Opened {
  const K = fromB64u(key);
  if (K.length !== 32) throw new Error("e2e: key must be 32 bytes");
  const nonce = fromB64u(blob.nonce);
  if (nonce.length !== 12) throw new Error("e2e: nonce must be 12 bytes");
  const raw = fromB64u(blob.ct);
  if (raw.length < 16) throw new Error("e2e: short ciphertext");
  const tag = raw.subarray(raw.length - 16);
  const data = raw.subarray(0, raw.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", K, nonce);
  decipher.setAAD(aad(routing));
  decipher.setAuthTag(tag);
  const plain = unpad(Buffer.concat([decipher.update(data), decipher.final()])); // final() throws on auth failure
  const obj = JSON.parse(plain.toString("utf8")) as Opened;
  // Everything below runs ONLY on GCM-authenticated plaintext, so distinct errors
  // here are not a relay-reachable oracle. Shape-check before trusting fields.
  if (typeof obj !== "object" || obj === null || typeof obj.seq !== "number") throw new Error("e2e: malformed plaintext");
  // defense in depth: the authenticated inner seq must equal the routing seq
  if (obj.seq !== routing.seq) throw new Error("e2e: inner seq mismatch");
  return obj;
}

/**
 * Per-session freshness gate (the board uses it). Accepts an event only if its seq
 * is strictly greater than the last accepted for that sid — so the relay can't
 * replay or hold back a stale state over a newer one. `reset(sid)` re-bases a
 * session after a legitimate client counter reset (tied to rotation; see N3a).
 */
export function makeFreshnessGuard() {
  const lastSeq = new Map<string, number>();
  return {
    accept(sid: string, seq: number): boolean {
      const prev = lastSeq.get(sid);
      if (prev !== undefined && seq <= prev) return false;
      lastSeq.set(sid, seq);
      return true;
    },
    reset(sid: string): void {
      lastSeq.delete(sid);
    },
  };
}
