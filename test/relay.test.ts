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
import { createRelay, RelayStore, validateEvent, RelayError, type RelayEvent } from "../src/hosted/relay";
import { seal, open, generateKey } from "../src/hosted/e2e";

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

/** A structurally real push subscription (a genuine P-256 point so encryptPayload works). */
function realSub(): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const ec = crypto.createECDH("prime256v1");
  ec.generateKeys();
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/" + crypto.randomBytes(6).toString("hex"),
    keys: { p256dh: ec.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") },
  };
}

async function start(dataDir?: string): Promise<{ store: RelayStore; base: string; close: () => Promise<void> }> {
  const dir = dataDir ?? TMP(); // NEVER fall back to the real ~/.andon (would pollute it + hit MAX_BOARDS)
  const { server, store } = createRelay({ dataDir: dir });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  const close = () =>
    new Promise<void>((r) =>
      server.close(() => {
        if (!dataDir) fs.rmSync(dir, { recursive: true, force: true }); // clean the temp dir we made
        r();
      }),
    );
  return { store, base: `http://127.0.0.1:${port}`, close };
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
  const dir = TMP();
  const { server } = createRelay({ now: () => t, dataDir: dir });
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
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("relay store: ingest flags a push ONLY on a transition into needs-you/error", () => {
  const store = new RelayStore();
  const { token, tokenHash } = mkToken();
  const boardId = store.provision(tokenHash);
  const key = generateKey();
  const ing = (state: string, seq: number) => store.ingest(boardId, token, mkEvent(key, boardId, "s1", state, seq)).alert;
  assert.equal(ing("working", 1), false); // calm
  assert.equal(ing("waiting", 2), true); // calm → needs you: push
  assert.equal(ing("waiting", 3), false); // still waiting: no repeat buzz
  assert.equal(ing("error", 4), false); // waiting → error: already alerting, no re-buzz (anti-spam)
  assert.equal(ing("done", 5), false); // error → done: calm again (the board is the all-clear)
  assert.equal(ing("error", 6), true); // done → error: calm → needs you, push
  // a brand-new session whose FIRST event already needs you fires immediately
  assert.equal(store.ingest(boardId, token, mkEvent(key, boardId, "fresh", "error", 1)).alert, true);
  assert.equal(ing("idle", 7), false); // idle is calm
});

test("relay: a calm→needs-you transition encrypts + sends a push; non-transitions don't; 410 prunes", async () => {
  const dir = TMP();
  const calls: Buffer[] = [];
  let nextStatus = 201;
  const mockSend = async (_sub: unknown, body: Buffer) => {
    calls.push(body);
    return { status: nextStatus };
  };
  const { server, store } = createRelay({ dataDir: path.join(dir, "relay"), sendPush: mockSend as never });
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", () => res()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const { token, tokenHash } = mkToken();
    const { boardId } = (await (await fetch(base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash }) })).json()) as { boardId: string };
    await fetch(`${base}/p/${boardId}/subscribe`, { method: "POST", body: JSON.stringify(realSub()) });
    const key = generateKey();
    const ingest = (state: string, seq: number) => fetch(`${base}/i/${boardId}`, { method: "POST", headers: { authorization: "Bearer " + token }, body: JSON.stringify(mkEvent(key, boardId, "s1", state, seq)) });

    await ingest("working", 1); // calm
    await ingest("waiting", 2); // transition → push
    await new Promise((r) => setTimeout(r, 60)); // let the fire-and-forget push run
    assert.equal(calls.length, 1, "exactly one push on the calm→waiting transition");
    assert.ok(calls[0].length > 0, "an encrypted aes128gcm body");

    nextStatus = 410; // the push service says this subscription is gone
    await ingest("done", 3);
    await ingest("waiting", 4); // calm→waiting again → push (now 410)
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(store.subsOf(boardId).length, 0, "a 410 prunes the dead subscription");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("relay: one IP cannot hoard SSE streams (per-IP cap); a disconnect frees a slot", async () => {
  const r = await start();
  const acs: AbortController[] = [];
  try {
    const { tokenHash } = mkToken();
    const { boardId } = (await (await fetch(r.base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash }) })).json()) as { boardId: string };
    const open = async (): Promise<number> => {
      const ac = new AbortController();
      acs.push(ac);
      return (await fetch(`${r.base}/e/${boardId}`, { signal: ac.signal })).status;
    };
    for (let i = 0; i < 8; i++) assert.equal(await open(), 200); // MAX_SSE_PER_IP = 8
    assert.equal((await fetch(`${r.base}/e/${boardId}`)).status, 503); // 9th from the same IP refused
    acs[0].abort(); // free one
    await new Promise((res) => setTimeout(res, 60));
    assert.equal(await open(), 200); // a slot opened up
  } finally {
    for (const ac of acs) ac.abort();
    await r.close();
  }
});

test("relay: serves the board (CSP), SW, a per-board manifest, favicon; stays disjoint from self-host routes", async () => {
  const r = await start();
  try {
    const b = await fetch(`${r.base}/b/anyboard`);
    assert.equal(b.status, 200);
    assert.match(b.headers.get("content-type") || "", /text\/html/);
    assert.match(b.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
    assert.ok((await b.text()).includes("HOSTED")); // the same dashboard, with hosted-mode detection

    const sw = await fetch(`${r.base}/sw.js`);
    assert.equal(sw.status, 200);
    assert.match(sw.headers.get("content-type") || "", /javascript/);
    assert.ok((await sw.text()).includes("push")); // the decrypting service worker

    // per-board manifest: start_url MUST be the board path so a home-screen launch lands on /b/<board>, not "/"
    const mani = (await (await fetch(`${r.base}/b/anyboard/manifest.webmanifest`)).json()) as { start_url: string };
    assert.equal(mani.start_url, "/b/anyboard");
    assert.equal((await fetch(`${r.base}/favicon.svg`)).status, 200);

    // the relay and the self-host server stay disjoint — no "/" or "/state" on the relay
    assert.equal((await fetch(`${r.base}/`)).status, 404);
    assert.equal((await fetch(`${r.base}/state`)).status, 404);
  } finally {
    await r.close();
  }
});

test("relay: /version declares the exact board + SW hashes it serves (transparency)", async () => {
  const r = await start();
  try {
    const v = (await (await fetch(`${r.base}/version`)).json()) as { board_sha256: string; sw_sha256: string };
    assert.match(v.board_sha256, /^[0-9a-f]{64}$/);
    assert.match(v.sw_sha256, /^[0-9a-f]{64}$/);
    const board = Buffer.from(await (await fetch(`${r.base}/b/x`)).arrayBuffer());
    const sw = Buffer.from(await (await fetch(`${r.base}/sw.js`)).arrayBuffer());
    // it must not misreport its own bytes
    assert.equal(crypto.createHash("sha256").update(board).digest("hex"), v.board_sha256);
    assert.equal(crypto.createHash("sha256").update(sw).digest("hex"), v.sw_sha256);
  } finally {
    await r.close();
  }
});

test("verify: an honest relay (serving this package's own board) passes the transparency check", async () => {
  const r = await start();
  try {
    const { verify } = await import("../src/commands/verify");
    assert.equal(await verify([r.base]), 0); // served bytes == this package's open-source bytes → match
  } finally {
    await r.close();
  }
});

test("relay: a disk fault during unsubscribe is contained — the relay does NOT crash", async () => {
  const dir = TMP();
  const r = await start(dir);
  try {
    const { tokenHash } = mkToken();
    const { boardId } = (await (await fetch(r.base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash }) })).json()) as { boardId: string };
    const sub = realSub();
    await fetch(`${r.base}/p/${boardId}/subscribe`, { method: "POST", body: JSON.stringify(sub) });

    fs.chmodSync(dir, 0o500); // make the tenant dir unwritable → the next save() (in unsubscribe) throws
    const resp = await fetch(`${r.base}/p/${boardId}/unsubscribe`, { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) });
    fs.chmodSync(dir, 0o700); // restore for cleanup
    assert.ok(resp.status >= 400); // surfaced as an error, not a crash
    assert.equal((await fetch(`${r.base}/version`)).status, 200); // …and the relay is still serving every other tenant
  } finally {
    await r.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("relay store: caps push subscriptions per board at MAX_SUBS", () => {
  const store = new RelayStore();
  const { tokenHash } = mkToken();
  const boardId = store.provision(tokenHash);
  for (let i = 0; i < 20; i++) store.subscribe(boardId, realSub());
  assert.throws(() => store.subscribe(boardId, realSub()), /too many subscriptions/);
});

test("relay: VAPID key + subscribe/unsubscribe — validated, persisted, SSRF-guarded", async () => {
  const dir = TMP();
  const r = await start(dir);
  try {
    const { tokenHash } = mkToken();
    const { boardId } = (await (await fetch(r.base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash }) })).json()) as { boardId: string };
    const vk = (await (await fetch(r.base + "/vapid")).json()) as { publicKey: string };
    assert.equal(Buffer.from(vk.publicKey, "base64url").length, 65); // P-256 public point

    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: Buffer.alloc(65).toString("base64url"), auth: Buffer.alloc(16).toString("base64url") } };
    assert.equal((await fetch(`${r.base}/p/${boardId}/subscribe`, { method: "POST", body: JSON.stringify(sub) })).status, 204);
    // an internal/SSRF endpoint is rejected
    assert.equal((await fetch(`${r.base}/p/${boardId}/subscribe`, { method: "POST", body: JSON.stringify({ endpoint: "https://169.254.169.254/x", keys: sub.keys }) })).status, 400);

    // it persisted across a restart
    assert.equal(new RelayStore(Date.now, dir).subsOf(boardId).length, 1);
    // unsubscribe removes it
    assert.equal((await fetch(`${r.base}/p/${boardId}/unsubscribe`, { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) })).status, 204);
    assert.equal(new RelayStore(Date.now, dir).subsOf(boardId).length, 0);
  } finally {
    await r.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("relay: SSE streams the snapshot frame then live ingested events", async () => {
  const r = await start();
  const ac = new AbortController();
  try {
    const { token, tokenHash } = mkToken();
    const { boardId } = (await (await fetch(r.base + "/provision", { method: "POST", body: JSON.stringify({ tokenHash }) })).json()) as { boardId: string };
    const resp = await fetch(`${r.base}/e/${boardId}`, { signal: ac.signal });
    const reader = (resp.body as ReadableStream<Uint8Array>).getReader();
    const dec = new TextDecoder();
    const first = dec.decode((await reader.read()).value); // first frame is the snapshot
    assert.ok(first.includes('"snapshot"'));

    await fetch(`${r.base}/i/${boardId}`, { method: "POST", headers: { authorization: "Bearer " + token }, body: JSON.stringify(mkEvent(generateKey(), boardId, "s1", "waiting", 1)) });

    let buf = "";
    for (let i = 0; i < 20 && !buf.includes('"s1"'); i++) buf += dec.decode((await reader.read()).value); // skip heartbeats, find the event
    assert.ok(buf.includes('"s1"') && buf.includes("waiting")); // the live event arrived over SSE
  } finally {
    ac.abort();
    await r.close();
  }
});
