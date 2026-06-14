/**
 * SessionStore unit tests. Run with:  npm test   (Node 22.6+ strips the types)
 *
 * A fixed clock is injected so TTL/sorting assertions are deterministic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionStore } from "../src/store";

function storeAt(t: { v: number }) {
  return new SessionStore(() => t.v);
}

test("creates and updates a session", () => {
  const clock = { v: 100 };
  const s = storeAt(clock);
  assert.deepEqual(s.apply({ agent: "claude", id: "a", state: "working" }), { ok: true });
  assert.equal(s.size, 1);
  const snap = s.snapshot();
  assert.equal(snap.sessions[0]!.state, "working");
  assert.equal(snap.sessions[0]!.title, "claude"); // falls back to agent
});

test("rejects an invalid state and keeps the board unchanged", () => {
  const s = storeAt({ v: 1 });
  const r = s.apply({ agent: "claude", id: "a", state: "banana" });
  assert.equal(r.ok, false);
  assert.match(r.error!, /invalid state/);
  assert.equal(s.size, 0);
});

test("`gone` removes the tile", () => {
  const s = storeAt({ v: 1 });
  s.apply({ agent: "codex", id: "x", state: "done" });
  assert.equal(s.size, 1);
  const r = s.apply({ id: "x", state: "gone" });
  assert.deepEqual(r, { ok: true, removed: true });
  assert.equal(s.size, 0);
});

test("message persists across updates unless replaced", () => {
  const s = storeAt({ v: 1 });
  s.apply({ agent: "claude", id: "a", state: "waiting", message: "need perms" });
  s.apply({ agent: "claude", id: "a", state: "working" }); // no message field
  assert.equal(s.snapshot().sessions[0]!.message, "need perms");
});

test("snapshot sorts by priority then recency", () => {
  const clock = { v: 0 };
  const s = storeAt(clock);
  clock.v = 10; s.apply({ agent: "claude", id: "work", state: "working" });
  clock.v = 20; s.apply({ agent: "codex", id: "err", state: "error" });
  clock.v = 30; s.apply({ agent: "claude", id: "wait", state: "waiting" });
  const ids = s.snapshot().sessions.map((x) => x.id);
  // error(0) < waiting(1) < working(3)
  assert.deepEqual(ids, ["err", "wait", "work"]);
});

test("sweep drops sessions past the TTL", () => {
  const clock = { v: 0 };
  const s = new SessionStore(() => clock.v, 200, 100); // ttl=100s
  s.apply({ agent: "claude", id: "old", state: "done" });
  clock.v = 50;
  s.apply({ agent: "claude", id: "fresh", state: "done" });
  clock.v = 120; // old(0) is now >100s stale, fresh(50) is not
  assert.equal(s.sweep(), 1);
  assert.deepEqual(s.snapshot().sessions.map((x) => x.id), ["fresh"]);
});

test("`sub` adjusts the background-task count without touching state", () => {
  const s = storeAt({ v: 1 });
  s.apply({ agent: "claude", id: "a", state: "done", message: "turn done" });
  s.apply({ id: "a", sub: 2 });            // two background tasks started
  let snap = s.snapshot().sessions[0]!;
  assert.equal(snap.pending, 2);
  assert.equal(snap.state, "done");        // base state untouched
  assert.equal(snap.message, "turn done"); // other fields untouched
  s.apply({ id: "a", sub: -1 });
  assert.equal(s.snapshot().sessions[0]!.pending, 1);
});

test("`sub` clamps at zero and survives state changes", () => {
  const s = storeAt({ v: 1 });
  s.apply({ agent: "claude", id: "a", state: "working" });
  s.apply({ id: "a", sub: 1 });
  s.apply({ agent: "claude", id: "a", state: "done" }); // a state change keeps pending
  assert.equal(s.snapshot().sessions[0]!.pending, 1);
  s.apply({ id: "a", sub: -5 });                        // can't go negative
  assert.equal(s.snapshot().sessions[0]!.pending, 0);
});

test("`sub` for an unknown session is ignored", () => {
  const s = storeAt({ v: 1 });
  assert.deepEqual(s.apply({ id: "ghost", sub: 1 }), { ok: true });
  assert.equal(s.size, 0);
});

test("enforces the session cap", () => {
  const s = new SessionStore(() => 1, 2); // max 2
  assert.equal(s.apply({ id: "a", state: "working" }).ok, true);
  assert.equal(s.apply({ id: "b", state: "working" }).ok, true);
  const r = s.apply({ id: "c", state: "working" });
  assert.equal(r.ok, false);
  assert.match(r.error!, /limit/);
  // existing sessions can still update past the cap
  assert.equal(s.apply({ id: "a", state: "done" }).ok, true);
});
