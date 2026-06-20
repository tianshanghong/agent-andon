/** HTTP integration tests for the board server. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { createServer } from "../src/server";
import { SessionStore } from "../src/store";

const PUSH_DIR = path.join(os.tmpdir(), "andon-srv-push-test");
// A structurally valid W3C subscription (RFC 8291 §5 receiver keys).
const SUB = {
  endpoint: "https://web.push.apple.com/q/abc",
  keys: {
    p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    auth: "BTBZMqHH6r4Tts7J_aSIgg",
  },
};

interface Reply {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

function request(
  port: number,
  method: string,
  path: string,
  opts: { body?: string; headers?: Record<string, string> } = {},
): Promise<Reply> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers: opts.headers },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body, headers: res.headers }),
        );
      },
    );
    // An oversized body gets the connection destroyed by the server; treat that
    // as a rejection rather than a thrown test.
    req.on("error", () => resolve({ status: -1, body: "", headers: {} }));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function start(token?: string, extra?: { push?: { enabled?: boolean; subject?: string; dataDir?: string } }) {
  const { server, store } = createServer({
    port: 0,
    host: "127.0.0.1",
    token,
    store: new SessionStore(() => 1000),
    ...extra,
  });
  return new Promise<{ port: number; store: SessionStore; close: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const port = (server.address() as AddressInfo).port;
        resolve({
          port,
          store,
          close: () => new Promise<void>((r) => server.close(() => r())),
        });
      });
    },
  );
}

test("GET /healthz reports liveness", async () => {
  const s = await start();
  try {
    const r = await request(s.port, "GET", "/healthz");
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.body).ok, true);
  } finally {
    await s.close();
  }
});

test("POST /event then GET /state round-trips", async () => {
  const s = await start();
  try {
    const post = await request(s.port, "POST", "/event", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "claude", id: "a", state: "working", title: "proj" }),
    });
    assert.equal(post.status, 200);
    const state = await request(s.port, "GET", "/state");
    assert.equal(state.status, 200);
    const snap = JSON.parse(state.body);
    assert.equal(snap.sessions.length, 1);
    assert.equal(snap.sessions[0].title, "proj");
  } finally {
    await s.close();
  }
});

test("POST /event with invalid state -> 400", async () => {
  const s = await start();
  try {
    const r = await request(s.port, "POST", "/event", {
      body: JSON.stringify({ id: "a", state: "banana" }),
    });
    assert.equal(r.status, 400);
    assert.equal(JSON.parse(r.body).ok, false);
  } finally {
    await s.close();
  }
});

test("POST /event over 64KB is rejected", async () => {
  const s = await start();
  try {
    const big = "x".repeat(70 * 1024);
    const r = await request(s.port, "POST", "/event", { body: big });
    // 413 if the response makes it back, -1 if the connection was reset mid-send.
    assert.ok(r.status === 413 || r.status === -1, `expected rejection, got ${r.status}`);
    // and nothing was stored
    assert.equal(s.store.size, 0);
  } finally {
    await s.close();
  }
});

test("token mode: 401 without token, 200 with query or header", async () => {
  const s = await start("sekret");
  try {
    assert.equal((await request(s.port, "GET", "/state")).status, 401);
    assert.equal((await request(s.port, "GET", "/state?token=sekret")).status, 200);
    assert.equal(
      (await request(s.port, "GET", "/state", { headers: { "x-andon-token": "sekret" } })).status,
      200,
    );
    // healthz stays open (no token needed) so `andon doctor` always works
    assert.equal((await request(s.port, "GET", "/healthz")).status, 200);
  } finally {
    await s.close();
  }
});

test("unknown route -> 404", async () => {
  const s = await start();
  try {
    assert.equal((await request(s.port, "GET", "/nope")).status, 404);
  } finally {
    await s.close();
  }
});

test("push: sw.js served, VAPID key issued, subscribe validates the body", async () => {
  const s = await start(undefined, { push: { dataDir: PUSH_DIR } });
  try {
    const sw = await request(s.port, "GET", "/sw.js");
    assert.equal(sw.status, 200);
    assert.match(String(sw.headers["content-type"]), /javascript/);
    assert.match(sw.body, /push/);

    const vapid = await request(s.port, "GET", "/push/vapid");
    assert.equal(vapid.status, 200);
    const pk = JSON.parse(vapid.body).publicKey;
    assert.equal(Buffer.from(pk, "base64url").length, 65); // uncompressed P-256 point

    const good = await request(s.port, "POST", "/push/subscribe", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SUB),
    });
    assert.equal(good.status, 200);
    assert.equal(JSON.parse(good.body).ok, true);

    const bad = await request(s.port, "POST", "/push/subscribe", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "not-a-url", keys: {} }),
    });
    assert.equal(bad.status, 400);

    // SSRF guard: an endpoint that isn't a real push host is rejected, never stored
    const ssrf = await request(s.port, "POST", "/push/subscribe", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://169.254.169.254/x", keys: SUB.keys }),
    });
    assert.equal(ssrf.status, 400);
  } finally {
    await s.close();
  }
});

test("push: disabled -> sw.js / vapid / subscribe all 404", async () => {
  const s = await start(undefined, { push: { enabled: false, dataDir: PUSH_DIR } });
  try {
    assert.equal((await request(s.port, "GET", "/sw.js")).status, 404);
    assert.equal((await request(s.port, "GET", "/push/vapid")).status, 404);
    assert.equal(
      (await request(s.port, "POST", "/push/subscribe", { body: JSON.stringify(SUB) })).status,
      404,
    );
  } finally {
    await s.close();
  }
});

test("push: vapid + subscribe respect the token; sw.js stays open", async () => {
  const s = await start("sekret", { push: { dataDir: PUSH_DIR } });
  try {
    assert.equal((await request(s.port, "GET", "/push/vapid")).status, 401);
    assert.equal((await request(s.port, "GET", "/push/vapid?token=sekret")).status, 200);
    assert.equal((await request(s.port, "GET", "/sw.js")).status, 200); // register can't carry a token
    assert.equal(
      (await request(s.port, "POST", "/push/subscribe", { body: JSON.stringify(SUB) })).status,
      401,
    );
    assert.equal(
      (await request(s.port, "POST", "/push/subscribe?token=sekret", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(SUB),
      })).status,
      200,
    );
  } finally {
    await s.close();
  }
});

test("no wildcard CORS header on /state (board is same-origin)", async () => {
  const s = await start();
  try {
    const r = await request(s.port, "GET", "/state");
    assert.equal(r.status, 200);
    assert.equal(r.headers["access-control-allow-origin"], undefined);
  } finally {
    await s.close();
  }
});

test("POST /event: cross-origin blocked (403), same-origin & no-origin allowed", async () => {
  const s = await start();
  const body = JSON.stringify({ id: "a", state: "working" });
  try {
    // a different web origin -> blocked
    const cross = await request(s.port, "POST", "/event", {
      headers: { "Content-Type": "application/json", Origin: "http://evil.example" },
      body,
    });
    assert.equal(cross.status, 403);
    assert.equal(s.store.size, 0);

    // same-origin (Origin matches Host) -> allowed
    const same = await request(s.port, "POST", "/event", {
      headers: {
        "Content-Type": "application/json",
        Origin: `http://127.0.0.1:${s.port}`,
      },
      body,
    });
    assert.equal(same.status, 200);

    // no Origin (CLI/hooks/curl) -> allowed
    const cli = await request(s.port, "POST", "/event", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "b", state: "done" }),
    });
    assert.equal(cli.status, 200);
    assert.equal(s.store.size, 2);
  } finally {
    await s.close();
  }
});

test("GET /snd/done.mp3 serves the chime with range support", async () => {
  const s = await start();
  try {
    const r = await request(s.port, "GET", "/snd/done.mp3");
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], "audio/mpeg");
    assert.equal(r.headers["accept-ranges"], "bytes");
    assert.ok(Number(r.headers["content-length"]) > 0);
    const rg = await request(s.port, "GET", "/snd/done.mp3", { headers: { Range: "bytes=0-99" } });
    assert.equal(rg.status, 206);
    assert.match(String(rg.headers["content-range"]), /^bytes 0-99\/\d+$/);
    const oob = await request(s.port, "GET", "/snd/done.mp3", { headers: { Range: "bytes=999999-1000000" } });
    assert.equal(oob.status, 416);
  } finally {
    await s.close();
  }
});

test("unknown /snd names 404 — prototype keys cannot crash the server", async () => {
  const s = await start();
  try {
    assert.equal((await request(s.port, "GET", "/snd/nope.mp3")).status, 404);  // unknown chime
    assert.equal((await request(s.port, "GET", "/snd/done.wav")).status, 404);  // wrong extension
    // prototype-pollution guard: "constructor" must NOT resolve to an inherited Object member
    assert.equal((await request(s.port, "GET", "/snd/constructor.mp3", { headers: { Range: "bytes=0-0" } })).status, 404);
    assert.equal((await request(s.port, "GET", "/snd/__proto__.mp3")).status, 404);
    // …and the server is still alive after those crafted requests
    assert.equal((await request(s.port, "GET", "/healthz")).status, 200);
  } finally {
    await s.close();
  }
});
