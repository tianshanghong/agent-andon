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

test("snapshot keeps stable arrival order (display ordering is the board's job)", () => {
  const clock = { v: 0 };
  const s = storeAt(clock);
  clock.v = 10; s.apply({ agent: "claude", id: "work", state: "working" });
  clock.v = 20; s.apply({ agent: "codex", id: "err", state: "error" });
  clock.v = 30; s.apply({ agent: "claude", id: "wait", state: "waiting" });
  // arrival order, regardless of state — and an in-place update must NOT reorder
  clock.v = 40; s.apply({ agent: "claude", id: "work", state: "done" });
  assert.deepEqual(s.snapshot().sessions.map((x) => x.id), ["work", "err", "wait"]);
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

test("today: accumulates working-time, hands-off, peak, agents", () => {
  const clock = { v: 0 };
  const s = storeAt(clock);
  clock.v = 0; s.apply({ agent: "x", id: "a", state: "working" }); // a working from t=0
  clock.v = 10; s.apply({ agent: "y", id: "b", state: "working" }); // b from t=10 → peak 2
  clock.v = 30; s.apply({ id: "a", state: "done" }); // a worked 30s
  clock.v = 50; s.apply({ id: "b", state: "done" }); // b worked 40s; hands-off 0..50 = 50
  const t = s.snapshot().today;
  assert.equal(t.agent_sec, 70);
  assert.equal(t.hands_off_sec, 50);
  assert.equal(t.longest_hands_off_sec, 50);
  assert.equal(t.peak, 2);
  assert.equal(t.agents, 2);
  assert.equal(t.working_now, 0);
});

test("today: counts the currently-open working interval live", () => {
  const clock = { v: 0 };
  const s = storeAt(clock);
  clock.v = 0; s.apply({ agent: "x", id: "a", state: "working" });
  clock.v = 20;
  const t = s.snapshot().today; // still working at t=20
  assert.equal(t.working_now, 1);
  assert.equal(t.agent_sec, 20); // open interval counted live
  assert.equal(t.hands_off_sec, 20);
  assert.equal(t.peak, 1);
});

test("today: counts pull-ins and stuck on entry into alerting states only", () => {
  const clock = { v: 1 };
  const s = storeAt(clock);
  s.apply({ agent: "x", id: "a", state: "working" });
  clock.v = 2; s.apply({ id: "a", state: "waiting" }); // pull-in 1
  clock.v = 3; s.apply({ id: "a", state: "working" }); // back to working (clears amber)
  clock.v = 4; s.apply({ id: "a", state: "error" }); // pull-in 2 + stuck 1
  clock.v = 5; s.apply({ id: "a", state: "waiting" }); // error→waiting: already alerting, no new pull-in
  const t = s.snapshot().today;
  assert.equal(t.pulled_in, 2);
  assert.equal(t.stuck, 1);
});

test("today: `gone` closes an open working interval", () => {
  const clock = { v: 0 };
  const s = storeAt(clock);
  s.apply({ agent: "x", id: "a", state: "working" });
  clock.v = 15; s.apply({ id: "a", state: "gone" });
  const t = s.snapshot().today;
  assert.equal(t.agent_sec, 15);
  assert.equal(t.hands_off_sec, 15);
  assert.equal(t.working_now, 0);
});

test("today: sweep closes a zombie working interval at last-seen, not sweep time", () => {
  const clock = { v: 0 };
  const s = new SessionStore(() => clock.v, 200, 100); // ttl=100s
  clock.v = 0; s.apply({ agent: "x", id: "a", state: "working" }); // enters working at 0
  clock.v = 30; s.apply({ agent: "x", id: "a", state: "working" }); // last seen working at 30
  clock.v = 200; // now >100s stale → swept
  assert.equal(s.sweep(), 1);
  const t = s.snapshot().today;
  assert.equal(t.working_now, 0);
  assert.equal(t.agent_sec, 30); // counted to last-seen (30), NOT to sweep time (200) — no phantom hours
  assert.equal(t.hands_off_sec, 30);
});

test("today: peak is a high-water mark; `gone` decrements working_now", () => {
  const clock = { v: 0 };
  const s = storeAt(clock);
  s.apply({ id: "a", state: "working" });
  s.apply({ id: "b", state: "working" }); // working_now 2, peak 2
  clock.v = 5; s.apply({ id: "a", state: "gone" }); // a removed mid-work
  let t = s.snapshot().today;
  assert.equal(t.working_now, 1);
  assert.equal(t.peak, 2); // high-water retained even though only 1 works now
  clock.v = 9; s.apply({ id: "b", state: "done" });
  t = s.snapshot().today;
  assert.equal(t.working_now, 0);
  assert.equal(t.peak, 2);
});

test("today: resets at a new local day; an in-flight session re-bases", () => {
  const clock = { v: 0 };
  const s = storeAt(clock);
  s.apply({ agent: "x", id: "a", state: "working" });
  clock.v = 100; s.apply({ id: "a", state: "error" }); // worked 100s, pull-in 1, stuck 1
  clock.v = 2 * 86400; // +2 days → new local day
  const t = s.snapshot().today;
  assert.equal(t.pulled_in, 0);
  assert.equal(t.stuck, 0);
  assert.equal(t.agent_sec, 0);
  assert.equal(t.agents, 1); // 'a' still present, so it counts as seen "today"
});
