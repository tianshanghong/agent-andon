/**
 * End-to-end content-encryption tests (the hosted zero-knowledge core). Verifies the
 * relay can NEVER read content and can NEVER tamper without detection: round-trip,
 * AAD binding on every routing field, the inner-seq defense, size-hiding padding,
 * the "no plaintext in the blob" property, and the freshness guard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { generateKey, seal, open, makeFreshnessGuard, type Routing, type Content } from "../src/hosted/e2e";

const KEY = generateKey();
const R: Routing = { boardId: "board-abc", sid: "s1", state: "waiting", seq: 1 };
const CONTENT: Content = { title: "checkout-api", message: "needs approval: Bash(git push)", agent: "claude", pending: 0, tallies: { agents: 3 } };
const TS = 1_700_000_000_000;

test("e2e: seal → open round-trips content + seq + tsClient", () => {
  const blob = seal(KEY, CONTENT, R, TS);
  const got = open(KEY, blob, R);
  assert.equal(got.title, "checkout-api");
  assert.equal(got.message, "needs approval: Bash(git push)");
  assert.equal(got.agent, "claude");
  assert.equal(got.pending, 0);
  assert.deepEqual(got.tallies, { agents: 3 });
  assert.equal(got.seq, 1);
  assert.equal(got.tsClient, TS);
});

test("e2e: empty content and a >16KB message both round-trip", () => {
  assert.deepEqual(open(KEY, seal(KEY, {}, R, TS), R), { seq: 1, tsClient: TS });
  const big = { message: "x".repeat(20_000) };
  assert.equal(open(KEY, seal(KEY, big, R, TS), R).message!.length, 20_000);
});

test("e2e: AAD binds every routing field — a tampered field fails to open", () => {
  const blob = seal(KEY, CONTENT, R, TS);
  for (const bad of [
    { ...R, boardId: "board-evil" }, // relay can't move a blob to another board
    { ...R, sid: "s2" }, // …or another session
    { ...R, state: "done" }, // …or lie about the coarse state
    { ...R, seq: 2 }, // …or replay it as a different seq
  ]) {
    assert.throws(() => open(KEY, blob, bad), /unable to authenticate|auth/i, `expected auth failure for ${JSON.stringify(bad)}`);
  }
  // and the correct routing still opens
  assert.equal(open(KEY, blob, R).title, "checkout-api");
});

test("e2e: a tampered ciphertext, nonce, or wrong key all fail (no silent accept)", () => {
  const blob = seal(KEY, CONTENT, R, TS);
  const flip = (s: string) => {
    const b = Buffer.from(s, "base64url");
    b[b.length - 1] ^= 0xff;
    return b.toString("base64url");
  };
  assert.throws(() => open(KEY, { ...blob, ct: flip(blob.ct) }, R)); // tag/ct flip
  assert.throws(() => open(KEY, { ...blob, nonce: flip(blob.nonce) }, R)); // nonce flip
  assert.throws(() => open(generateKey(), blob, R)); // wrong key
});

test("e2e: inner-seq defense — a blob whose sealed seq ≠ routing seq is rejected", () => {
  // forge a blob (we hold the key) where the AAD seq is 1 but the SEALED inner seq is 99
  const K = Buffer.from(KEY, "base64url");
  const padLocal = (p: Buffer) => {
    const need = 4 + p.length;
    const bucket = [256, 1024, 4096, 16384].find((b) => b >= need)!;
    const out = Buffer.alloc(bucket);
    out.writeUInt32LE(p.length, 0);
    p.copy(out, 4);
    return out;
  };
  const nonce = crypto.randomBytes(12);
  const plain = padLocal(Buffer.from(JSON.stringify({ seq: 99, tsClient: TS, title: "x" })));
  const c = crypto.createCipheriv("aes-256-gcm", K, nonce);
  c.setAAD(Buffer.from(JSON.stringify([R.boardId, R.sid, R.state, 1]))); // AAD seq = 1
  const enc = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  const forged = { nonce: nonce.toString("base64url"), ct: enc.toString("base64url") };
  // AAD (seq 1) authenticates, but the inner seq (99) ≠ routing seq (1) → rejected
  assert.throws(() => open(KEY, forged, { ...R, seq: 1 }), /inner seq/);
});

test("e2e: padding hides message size within a bucket; the blob leaks no plaintext", () => {
  const a = seal(KEY, { message: "short" }, R, TS);
  const b = seal(KEY, { message: "a much longer status line but still under 256 bytes" }, R, TS);
  // same bucket → identical ciphertext length (size hidden)
  assert.equal(Buffer.from(a.ct, "base64url").length, Buffer.from(b.ct, "base64url").length);
  // crossing the 256 bucket → strictly larger
  const big = seal(KEY, { message: "y".repeat(400) }, R, TS);
  assert.ok(Buffer.from(big.ct, "base64url").length > Buffer.from(a.ct, "base64url").length);
  // the secret never appears in the wire blob
  const wire = JSON.stringify(seal(KEY, { title: "TOP-SECRET-PROJECT", message: "rm -rf /prod" }, R, TS));
  assert.equal(wire.includes("TOP-SECRET-PROJECT"), false);
  assert.equal(wire.includes("rm -rf"), false);
});

test("e2e: a fresh random nonce per seal (no nonce reuse)", () => {
  const n = new Set<string>();
  for (let i = 0; i < 200; i++) n.add(seal(KEY, CONTENT, R, TS).nonce);
  assert.equal(n.size, 200);
});

test("e2e: freshness guard accepts strictly-increasing seq, rejects replay/stale, resets cleanly", () => {
  const g = makeFreshnessGuard();
  assert.equal(g.accept("s1", 1), true);
  assert.equal(g.accept("s1", 2), true);
  assert.equal(g.accept("s1", 2), false); // replay
  assert.equal(g.accept("s1", 1), false); // stale (relay can't push an old "all good")
  assert.equal(g.accept("s1", 3), true);
  assert.equal(g.accept("s2", 1), true); // independent per session
  g.reset("s1"); // legitimate client counter reset (rotation)
  assert.equal(g.accept("s1", 1), true);
});

test("e2e: a Content field named seq/tsClient cannot shadow the authenticated values", () => {
  // titles/messages/agent come from agent + tool output, so a crafted key is realistic
  const blob = seal(KEY, { seq: 5, tsClient: 42, title: "x" } as Content, R, TS);
  const got = open(KEY, blob, R);
  assert.equal(got.seq, R.seq); // authoritative seq wins (not the content's 5)
  assert.equal(got.tsClient, TS); // authoritative time wins (not the content's 42)
  assert.equal(got.title, "x");
});

test("e2e: malformed wire blobs all throw, never leak (the untrusted-relay surface)", () => {
  const good = seal(KEY, CONTENT, R, TS);
  const bad = [
    { nonce: "@@@@", ct: good.ct }, // non-base64url nonce
    { nonce: good.nonce, ct: "!!!!" }, // non-base64url ct
    { nonce: "", ct: good.ct }, // empty nonce
    { nonce: good.nonce, ct: "AAAA" }, // ct shorter than the 16-byte tag
    { nonce: Buffer.alloc(8).toString("base64url"), ct: good.ct }, // 8-byte nonce
    { nonce: Buffer.alloc(16).toString("base64url"), ct: good.ct }, // 16-byte nonce
  ];
  for (const b of bad) assert.throws(() => open(KEY, b, R));
});

test("e2e: ct length collapses to a few discrete buckets across many sizes (size hidden)", () => {
  const lens = new Set<number>();
  for (let n = 0; n <= 1200; n += 7) lens.add(Buffer.from(seal(KEY, { message: "z".repeat(n) }, R, TS).ct, "base64url").length);
  assert.ok(lens.size <= 3, `expected ≤3 bucket sizes, got ${[...lens].sort((a, b) => a - b).join(",")}`);
});

test("e2e: unicode title/message round-trips intact", () => {
  const u = { title: "支付-API 🚀", message: "需要你确认: Bash(git push) — naïve café" };
  const got = open(KEY, seal(KEY, u, R, TS), R);
  assert.equal(got.title, u.title);
  assert.equal(got.message, u.message);
});

test("e2e: a node-sealed blob decrypts via WebCrypto (the browser/SW path) — cross-impl wire format", async () => {
  // Replicate EXACTLY what the dashboard + service worker do (src/hosted/board-assets.ts
  // openSealed), proving the NORMATIVE wire format interops byte-for-byte across engines.
  const k = generateKey();
  const routing: Routing = { boardId: "board-xyz", sid: "s1", state: "waiting", seq: 7 };
  const blob = seal(k, { title: "checkout-api", message: "需要审批 🚀", agent: "claude" }, routing, 1_700_000_000_000);

  const b = (s: string) => Buffer.from(s, "base64url");
  const ckey = await crypto.webcrypto.subtle.importKey("raw", b(k), "AES-GCM", false, ["decrypt"]);
  const aad = new TextEncoder().encode(JSON.stringify([routing.boardId, routing.sid, routing.state, routing.seq]));
  const ptBuf = await crypto.webcrypto.subtle.decrypt({ name: "AES-GCM", iv: b(blob.nonce), additionalData: aad, tagLength: 128 }, ckey, b(blob.ct));
  const pt = new Uint8Array(ptBuf);
  const len = pt[0] | (pt[1] << 8) | (pt[2] << 16) | (pt[3] << 24);
  const o = JSON.parse(new TextDecoder().decode(pt.subarray(4, 4 + len)));
  assert.equal(o.title, "checkout-api");
  assert.equal(o.message, "需要审批 🚀");
  assert.equal(o.seq, 7);
});

test("e2e: a forged oversized length-prefix is rejected by unpad (post-auth bound check)", () => {
  const K = Buffer.from(KEY, "base64url");
  const nonce = crypto.randomBytes(12);
  const plain = Buffer.alloc(256);
  plain.writeUInt32LE(0xffffffff, 0); // claim a 4GB inner length inside a 256-byte buffer
  const c = crypto.createCipheriv("aes-256-gcm", K, nonce);
  c.setAAD(Buffer.from(JSON.stringify([R.boardId, R.sid, R.state, R.seq])));
  const enc = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  assert.throws(() => open(KEY, { nonce: nonce.toString("base64url"), ct: enc.toString("base64url") }, R), /bad length/);
});
