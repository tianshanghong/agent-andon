/**
 * `andon hosted` arg-parsing + status formatting (units U6 / U7).
 *
 * The review flagged that the old `args[1]` positional would read `--no-qr` as the relay
 * URL. These pin that flags are stripped before the positional, in any order. `formatStatus`
 * is asserted key-free and glyph-free (status must never leak the #k= secret or render a QR).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHostedArgs, formatStatus } from "../src/commands/hosted";

test("setup: `--no-qr` AFTER the url does not eat the url", () => {
  const p = parseHostedArgs(["setup", "http://x:8788", "--no-qr"]);
  assert.equal(p.sub, "setup");
  assert.deepEqual(p.positionals, ["http://x:8788"]);
  assert.equal(p.noQr, true);
});

test("setup: `--no-qr` BEFORE the url still finds the url", () => {
  const p = parseHostedArgs(["setup", "--no-qr", "http://x:8788"]);
  assert.deepEqual(p.positionals, ["http://x:8788"]);
  assert.equal(p.noQr, true);
});

test("setup: a bare `--no-qr` leaves no positional (→ usage error path)", () => {
  const p = parseHostedArgs(["setup", "--no-qr"]);
  assert.deepEqual(p.positionals, []);
  assert.equal(p.noQr, true);
});

test("pair: `--no-qr` recognised; no positional required", () => {
  const p = parseHostedArgs(["pair", "--no-qr"]);
  assert.equal(p.sub, "pair");
  assert.equal(p.noQr, true);
});

test("no flag → noQr is false", () => {
  assert.equal(parseHostedArgs(["setup", "http://x:8788"]).noQr, false);
});

test("status output has no QR glyphs and never leaks the key/ingest token", () => {
  const off = formatStatus(null);
  // Pass a FULL config (with real secret fields) via a variable so the RUNTIME output is proven
  // key-free — not merely compile-time-guarded. (An object literal would trip excess-property checks.)
  const full = { relayUrl: "https://relay.example.com", boardId: "abc123def", key: "SECRETKEY-xyz", ingestToken: "tok_SECRET" };
  const on = formatStatus(full);
  for (const s of [off, on]) {
    assert.ok(!/[█▀▄]/u.test(s), "status must contain no half-block glyphs");
    assert.ok(!s.includes("#k="), "status must never include the key marker");
  }
  assert.ok(!on.includes("SECRETKEY-xyz"), "the key value must not appear in status");
  assert.ok(!on.includes("tok_SECRET"), "the ingest token must not appear in status");
  assert.ok(on.includes("abc123def") && on.includes("https://relay.example.com"), "status shows relay + board");
});
