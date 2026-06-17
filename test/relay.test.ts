/**
 * Relay tests (the multi-tenant, ciphertext-only hosted core). Verifies the relay
 * stores + serves sealed blobs without ever seeing plaintext, authenticates writes,
 * enforces caps + TTL, and persists only tenant secrets (not content).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { createRelay, RelayStore, validateEvent, RelayError, type RelayEvent } from "../src/relay";
import { seal, open, generateKey } from "../src/e2e";

const TMP = (): string => path.join(os.tmpdir(), "andon-relay-test-" + crypto.randomBytes(6).toString("hex"));

function mkToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest().toString("base64url");
  return { token, tokenHash };
}

function mkEvent(key: string, boardId: string, sid = "s1", state = "waiting", seq = 1, content: Record<string, unknown> = { title: "checkout-api", message: "SECRET-MSG" }): RelayEvent {
  const enc = seal(key, content, { boardId, sid, state, seq }, 1000);
  return { sid, state, seq, enc };
}

async function start(dataDir?: string): Promise<{ store: RelayStore; base: string; close: () => Promise<void> }> {
  const { server, store } = createRelay({ dataDir });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  return { store, base: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) };
}

test("relay: provision → ingest → snapshot round-trip; relay stores only ciphertext", async () => {
  const dir = TMP();
  const r = await start(dir);
  try {
    const { token, tokenHash } = mkToken();
    const pr = (await (await fetch(r.base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash }) })).json()) as { boardId: string };
    assert.equal(Buffer.from(pr.boardId, "base64url").length, 32); // 256-bit board id

    const key = generateKey();
    const ing = await fetch(r.base + "/i/" + pr.boardId, { method: "POST", headers: { authorization: "Bearer " + token }, body: JSON.stringify(mkEvent(key, pr.boardId)) });
    assert.equal(ing.status, 204);

    const snapResp = await fetch(r.base + "/s/" + pr.boardId);
    const snapText = await snapResp.text();
    assert.equal(snapResp.status, 200);
    assert.equal(snapText.includes("SECRET-MSG"), false); // ciphertext only — no plaintext leak
    assert.equal(snapText.includes("checkout-api"), false);

    const snap = JSON.parse(snapText) as { events: Array<{ state: string; sid: string; enc: { nonce: string; ct: string } }> };
    assert.equal(snap.events.length, 1);
    assert.equal(snap.events[0].state, "waiting"); // coarse routing IS visible (disclosed)
    assert.equal(snap.events[0].sid, "s1");
    // a board holding the key opens it; the relay never could
    const opened = open(key, snap.events[0].enc, { boardId: pr.boardId, sid: "s1", state: "waiting", seq: 1 });
    assert.equal(opened.message, "SECRET-MSG");
  } finally {
    await r.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("relay: wrong ingest token → 401; unknown board → 404", async () => {
  const r = await start();
  try {
    const { token, tokenHash } = mkToken();
    const { boardId } = (await (await fetch(r.base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash }) })).json()) as { boardId: string };
    const ev = mkEvent(generateKey(), boardId);
    assert.equal((await fetch(r.base + "/i/" + boardId, { method: "POST", headers: { authorization: "Bearer wrong" }, body: JSON.stringify(ev) })).status, 401);
    const other = crypto.randomBytes(32).toString("base64url");
    assert.equal((await fetch(r.base + "/i/" + other, { method: "POST", headers: { authorization: "Bearer " + token }, body: JSON.stringify(ev) })).status, 404);
    assert.equal((await fetch(r.base + "/s/" + other)).status, 404);
  } finally {
    await r.close();
  }
});

test("relay: validateEvent rejects malformed events", () => {
  const ok: RelayEvent = { sid: "s", state: "waiting", seq: 1, enc: { nonce: "AAAA", ct: "AAAAAAAAAAAAAAAAAAAAAA" } };
  assert.doesNotThrow(() => validateEvent(ok));
  const bads: unknown[] = [
    { ...ok, state: "bogus" },
    { ...ok, sid: "" },
    { ...ok, seq: -1 },
    { ...ok, seq: 1.5 },
    { ...ok, enc: { nonce: "AAAA" } }, // missing ct
    { ...ok, enc: { nonce: "!!", ct: "AAAA" } }, // non-base64url nonce
    "not an object",
    null,
  ];
  for (const b of bads) assert.throws(() => validateEvent(b), RelayError);
});

test("relay store: caps sessions per board, but updating an existing one still works", () => {
  const store = new RelayStore();
  const { token, tokenHash } = mkToken();
  const boardId = store.provision(tokenHash);
  const key = generateKey();
  for (let i = 0; i < 200; i++) store.ingest(boardId, token, mkEvent(key, boardId, "s" + i, "waiting", 1));
  assert.throws(() => store.ingest(boardId, token, mkEvent(key, boardId, "s200", "waiting", 1)), /too many sessions/);
  assert.doesNotThrow(() => store.ingest(boardId, token, mkEvent(key, boardId, "s5", "done", 2))); // existing sid ok
});

test("relay store: tenant hashed-tokens persist across restart; events do not", () => {
  const dir = TMP();
  try {
    const { token, tokenHash } = mkToken();
    const s1 = new RelayStore(Date.now, dir);
    const boardId = s1.provision(tokenHash);
    s1.ingest(boardId, token, mkEvent(generateKey(), boardId));
    assert.equal(s1.snapshot(boardId).length, 1);

    const s2 = new RelayStore(Date.now, dir); // "restart"
    assert.doesNotThrow(() => s2.ingest(boardId, token, mkEvent(generateKey(), boardId, "s9"))); // token survived
    assert.equal(s2.snapshot(boardId).length, 1); // only the new event — old content was RAM-only
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("relay store: events older than the TTL are swept", () => {
  let t = 1000;
  const store = new RelayStore(() => t);
  const { token, tokenHash } = mkToken();
  const boardId = store.provision(tokenHash);
  store.ingest(boardId, token, mkEvent(generateKey(), boardId));
  assert.equal(store.snapshot(boardId).length, 1);
  t += 7 * 60 * 60 * 1000; // > 6h
  assert.equal(store.snapshot(boardId).length, 0);
});

test("relay: oversized body is rejected (not stored)", async () => {
  const r = await start();
  try {
    const { tokenHash } = mkToken();
    const { boardId } = (await (await fetch(r.base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash }) })).json()) as { boardId: string };
    const huge = JSON.stringify({ sid: "s", state: "waiting", seq: 1, enc: { nonce: "AAAA", ct: "A".repeat(100 * 1024) } });
    assert.equal((await fetch(r.base + "/i/" + boardId, { method: "POST", headers: { authorization: "Bearer x" }, body: huge })).status, 400);
  } finally {
    await r.close();
  }
});

test("relay: provisioning is rate-limited per IP", async () => {
  const r = await start();
  try {
    const { tokenHash } = mkToken();
    let limited = false;
    for (let i = 0; i < 22 && !limited; i++) {
      limited = (await fetch(r.base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash }) })).status === 429;
    }
    assert.ok(limited, "expected a 429 after the per-IP provision limit");
  } finally {
    await r.close();
  }
});

test("relay: a token for board A cannot write board B (cross-tenant write isolation)", async () => {
  const r = await start();
  try {
    const a = mkToken();
    const b = mkToken();
    const idA = ((await (await fetch(r.base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash: a.tokenHash }) })).json()) as { boardId: string }).boardId;
    const idB = ((await (await fetch(r.base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash: b.tokenHash }) })).json()) as { boardId: string }).boardId;
    // A's token against B's board → rejected, B stays empty
    const resp = await fetch(r.base + "/i/" + idB, { method: "POST", headers: { authorization: "Bearer " + a.token }, body: JSON.stringify(mkEvent(generateKey(), idB)) });
    assert.equal(resp.status, 401);
    const snapB = (await (await fetch(r.base + "/s/" + idB)).json()) as { events: unknown[] };
    assert.equal(snapB.events.length, 0);
  } finally {
    await r.close();
  }
});

test("relay store: an unread board at the session cap recovers after TTL (ingest sweeps first)", () => {
  let t = 1000;
  const store = new RelayStore(() => t);
  const { token, tokenHash } = mkToken();
  const boardId = store.provision(tokenHash);
  const key = generateKey();
  for (let i = 0; i < 200; i++) store.ingest(boardId, token, mkEvent(key, boardId, "s" + i, "waiting", 1));
  assert.throws(() => store.ingest(boardId, token, mkEvent(key, boardId, "new")), /too many sessions/);
  t += 7 * 60 * 60 * 1000; // all 200 now TTL-dead
  assert.doesNotThrow(() => store.ingest(boardId, token, mkEvent(key, boardId, "new"))); // sweep frees them before the cap
});

test("relay store: idle boards are evicted at capacity (no permanent watermark)", () => {
  let t = 1000;
  const store = new RelayStore(() => t); // no dataDir → save() is a no-op
  const hash = (s: string) => crypto.createHash("sha256").update(s).digest().toString("base64url");
  for (let i = 0; i < 500; i++) store.provision(hash("t" + i));
  assert.equal(store.boardCount(), 500);
  assert.throws(() => store.provision(hash("over")), /capacity/);
  t += 91 * 24 * 60 * 60 * 1000; // all 500 now idle > 90d
  assert.doesNotThrow(() => store.provision(hash("fresh")));
  assert.ok(store.boardCount() < 500);
});

test("relay store: provision rejects a malformed token hash", () => {
  const store = new RelayStore();
  assert.throws(() => store.provision("tooshort"), RelayError);
  assert.throws(() => store.provision(crypto.randomBytes(16).toString("base64url")), RelayError); // 16 bytes ≠ 32
});

test("relay store: a corrupt tenant file is preserved, not silently lost, and doesn't crash", () => {
  const dir = TMP();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "relay-tenants.json"), "{ this is not json");
    const store = new RelayStore(() => 5000, dir);
    assert.equal(store.boardCount(), 0);
    assert.equal(fs.readdirSync(dir).filter((f) => f.includes(".corrupt-")).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("relay: rate-limit window resets after it elapses (not a permanent ban)", async () => {
  let t = 1000;
  const { server } = createRelay({ now: () => t });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const { tokenHash } = mkToken();
    const prov = async () => (await fetch(base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash }) })).status;
    for (let i = 0; i < 20; i++) assert.equal(await prov(), 200);
    assert.equal(await prov(), 429); // 21st blocked
    t += 61 * 60 * 1000; // past the 1h window
    assert.equal(await prov(), 200); // allowed again
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
