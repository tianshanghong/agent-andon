/**
 * Hosted-client tests (the "board from anywhere" forwarder). Verifies that with
 * hosted configured, a status is SEALED + forwarded to the relay — recoverable only
 * with the key — and that it works with NO local server running.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import { createRelay } from "../src/relay";
import { open, generateKey } from "../src/e2e";
import { provisionHosted, forwardHosted, loadHostedConfig, saveHostedConfig, clearHostedConfig } from "../src/hosted";
import { postEvent } from "../src/client";

const TMP = (): string => path.join(os.tmpdir(), "andon-hosted-test-" + crypto.randomBytes(6).toString("hex"));
const listen = (s: http.Server): Promise<void> => new Promise((r) => s.listen(0, "127.0.0.1", () => r()));
const close = (s: http.Server): Promise<void> => new Promise((r) => s.close(() => r()));
const portOf = (s: http.Server): number => (s.address() as { port: number }).port;

async function withRelay(dir: string, fn: (relayUrl: string) => Promise<void>): Promise<void> {
  const { server } = createRelay({ dataDir: path.join(dir, "relay") });
  await listen(server);
  try {
    await fn(`http://127.0.0.1:${portOf(server)}`);
  } finally {
    await close(server);
  }
}

test("hosted: provision → forward sealed event → relay snapshot has ciphertext only → board opens it", async () => {
  const dir = TMP();
  process.env.ANDON_DATA_DIR = dir;
  try {
    await withRelay(dir, async (relayUrl) => {
      const cfg = await provisionHosted(relayUrl);
      assert.ok(cfg.boardId && cfg.key && cfg.ingestToken);

      const r = await forwardHosted({ id: "sess1", state: "waiting", agent: "claude", title: "checkout-api", message: "SECRET" });
      assert.equal(r.ok, true);

      const snapText = await (await fetch(`${relayUrl}/s/${cfg.boardId}`)).text();
      assert.equal(snapText.includes("SECRET"), false); // relay sees ciphertext only
      assert.equal(snapText.includes("checkout-api"), false);
      const snap = JSON.parse(snapText) as { events: Array<{ sid: string; state: string; seq: number; enc: { nonce: string; ct: string } }> };
      assert.equal(snap.events.length, 1);
      const e0 = snap.events[0];
      assert.equal(e0.state, "waiting");
      assert.notEqual(e0.sid, "sess1"); // the sid is hashed, not the raw id

      const opened = open(cfg.key, e0.enc, { boardId: cfg.boardId, sid: e0.sid, state: "waiting", seq: e0.seq });
      assert.equal(opened.title, "checkout-api");
      assert.equal(opened.message, "SECRET");
    });
  } finally {
    delete process.env.ANDON_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hosted: postEvent succeeds via the relay with NO local server (no `andon serve` needed)", async () => {
  const dir = TMP();
  process.env.ANDON_DATA_DIR = dir;
  const savedBase = process.env.AGENT_STATUS_URL;
  process.env.AGENT_STATUS_URL = "http://127.0.0.1:1"; // nothing local is listening here
  try {
    await withRelay(dir, async (relayUrl) => {
      const cfg = await provisionHosted(relayUrl);
      const r = await postEvent({ id: "s1", state: "waiting", agent: "claude", title: "x", message: "y" });
      assert.equal(r.ok, true); // local leg failed, hosted leg succeeded → overall ok
      assert.equal((await (await fetch(`${relayUrl}/s/${cfg.boardId}`)).json() as { events: unknown[] }).events.length, 1);
    });
  } finally {
    process.env.AGENT_STATUS_URL = savedBase;
    delete process.env.ANDON_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hosted: a path-shaped session id (codex uses the cwd) never reaches the relay", async () => {
  const dir = TMP();
  process.env.ANDON_DATA_DIR = dir;
  try {
    await withRelay(dir, async (relayUrl) => {
      const cfg = await provisionHosted(relayUrl);
      await forwardHosted({ id: "/Users/me/src/secret-project", state: "working", agent: "codex", title: "x" });
      const snapText = await (await fetch(`${relayUrl}/s/${cfg.boardId}`)).text();
      assert.equal(snapText.includes("secret-project"), false);
      assert.equal(snapText.includes("/Users/me"), false);
    });
  } finally {
    delete process.env.ANDON_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hosted: not configured → forward is a no-op; sub-only / gone / no-id are skipped", async () => {
  const dir = TMP();
  process.env.ANDON_DATA_DIR = dir;
  try {
    assert.equal((await forwardHosted({ id: "s", state: "waiting" })).ok, false); // no config yet
    await withRelay(dir, async (relayUrl) => {
      await provisionHosted(relayUrl);
      assert.equal((await forwardHosted({ id: "s", sub: 1 })).ok, false); // sub-only (no state)
      assert.equal((await forwardHosted({ id: "s", state: "gone" })).ok, false); // gone is not forwarded
      assert.equal((await forwardHosted({ state: "waiting" })).ok, false); // no session id
    });
  } finally {
    delete process.env.ANDON_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hosted: config load / save / clear roundtrip (0600, ANDON_DATA_DIR honored)", () => {
  const dir = TMP();
  process.env.ANDON_DATA_DIR = dir;
  try {
    assert.equal(loadHostedConfig(), null);
    saveHostedConfig({ relayUrl: "http://x", boardId: "b", ingestToken: "t", key: "k" });
    assert.equal(loadHostedConfig()?.boardId, "b");
    assert.equal((fs.statSync(path.join(dir, "hosted.json")).mode & 0o777).toString(8), "600");
    assert.equal(clearHostedConfig(), true);
    assert.equal(loadHostedConfig(), null);
  } finally {
    delete process.env.ANDON_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hosted: same-session events get strictly-increasing seq + a stable sid", async () => {
  const dir = TMP();
  process.env.ANDON_DATA_DIR = dir;
  try {
    await withRelay(dir, async (relayUrl) => {
      const cfg = await provisionHosted(relayUrl);
      const snap = async () => ((await (await fetch(`${relayUrl}/s/${cfg.boardId}`)).json()) as { events: Array<{ sid: string; seq: number }> }).events[0];
      await forwardHosted({ id: "sess", state: "working", title: "a" });
      const e1 = await snap();
      await forwardHosted({ id: "sess", state: "waiting", title: "b" });
      const e2 = await snap();
      assert.equal(e2.sid, e1.sid); // stable across a session's events
      assert.ok(e2.seq > e1.seq); // strictly increasing even on a same-ms tie
    });
  } finally {
    delete process.env.ANDON_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hosted: a malformed relay url is handled without throwing", async () => {
  const dir = TMP();
  process.env.ANDON_DATA_DIR = dir;
  try {
    saveHostedConfig({ relayUrl: "not a url", boardId: "b", ingestToken: "t", key: generateKey() });
    assert.equal((await forwardHosted({ id: "s", state: "waiting", title: "x" })).ok, false);
  } finally {
    delete process.env.ANDON_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hosted: a hung relay resolves ok:false within the timeout (never blocks)", async () => {
  const dir = TMP();
  process.env.ANDON_DATA_DIR = dir;
  const hung = http.createServer(() => {
    /* accept the connection but never respond */
  });
  await listen(hung);
  try {
    saveHostedConfig({ relayUrl: `http://127.0.0.1:${portOf(hung)}`, boardId: "b", ingestToken: "t", key: generateKey() });
    const r = await forwardHosted({ id: "s", state: "waiting", title: "x" }, 200);
    assert.equal(r.ok, false); // timed out cleanly, no throw, no hang
  } finally {
    await close(hung);
    delete process.env.ANDON_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
