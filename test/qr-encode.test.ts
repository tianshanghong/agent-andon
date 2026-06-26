/**
 * Encoder oracle (unit U2) for the vendored Nayuki QR encoder.
 *
 * We trust upstream (+ the purity audit), so these are a REGRESSION guard, not a proof
 * of Nayuki: they pin the module matrix for fixed pairing-URL shapes (catches any change
 * to EC level / boost / version params) and assert the output is a structurally valid QR
 * (three finder patterns, alternating timing). Each structural check is paired with a
 * NEGATIVE fixture that proves it can fail.
 *
 * Golden values generated from the vendored encoder:
 *   node -e '... encodeText(url, Ecc.MEDIUM); hash the module grid ...'
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { qrcodegen } from "../src/vendor/qrcodegen";

type Grid = boolean[][];
type Qr = { size: number; version: number; getModule(x: number, y: number): boolean };

function gridOf(qr: Qr): Grid {
  const g: Grid = [];
  for (let y = 0; y < qr.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < qr.size; x++) row.push(qr.getModule(x, y));
    g.push(row);
  }
  return g;
}

function gridHash(g: Grid): string {
  let s = "";
  for (const row of g) for (const c of row) s += c ? "1" : "0";
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

// Canonical 7×7 finder pattern (true = dark).
const FINDER: Grid = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
].map((r) => r.map((v) => v === 1));

function finderAt(g: Grid, ox: number, oy: number): boolean {
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    if (g[oy + y]![ox + x] !== FINDER[y]![x]) return false;
  }
  return true;
}

// Timing lines (row 6 and column 6) strictly alternate between the finders.
function timingAlternates(g: Grid): boolean {
  const n = g.length;
  for (let i = 9; i <= n - 9; i++) {
    if (g[6]![i] === g[6]![i - 1]) return false;
    if (g[i]![6] === g[i - 1]![6]) return false;
  }
  return true;
}

const M = qrcodegen.QrCode.Ecc.MEDIUM;
const CASES = [
  { url: "https://relay.example.com/b/" + "a".repeat(43) + "#k=" + "b".repeat(43), version: 7, size: 45, hash: "882ceeaacb54ffd2" },
  { url: "http://127.0.0.1:8788/b/" + "c".repeat(43) + "#k=" + "d".repeat(43), version: 7, size: 45, hash: "d5b6281f03b35645" },
];

for (const c of CASES) {
  test(`encoder pins the ${c.url.length}-byte URL to v${c.version} (regression)`, () => {
    const qr = qrcodegen.QrCode.encodeText(c.url, M);
    assert.equal(qr.version, c.version);
    assert.equal(qr.size, c.size);
    assert.equal(gridHash(gridOf(qr)), c.hash, "module grid must match the pinned Nayuki output");
  });

  test(`encoder is a structurally valid QR for the ${c.url.length}-byte URL`, () => {
    const g = gridOf(qrcodegen.QrCode.encodeText(c.url, M));
    const n = g.length;
    assert.ok(finderAt(g, 0, 0), "top-left finder");
    assert.ok(finderAt(g, n - 7, 0), "top-right finder");
    assert.ok(finderAt(g, 0, n - 7), "bottom-left finder");
    assert.ok(timingAlternates(g), "timing patterns alternate");
  });
}

// ── Negative fixtures: prove the structural + regression checks can FAIL ─────────
test("negative fixture: a corrupted finder module fails the finder check", () => {
  const g = gridOf(qrcodegen.QrCode.encodeText(CASES[0]!.url, M));
  assert.ok(finderAt(g, 0, 0)); // positive control
  g[0]![0] = !g[0]![0];
  assert.equal(finderAt(g, 0, 0), false);
});

test("negative fixture: a flipped timing module breaks the timing check", () => {
  const g = gridOf(qrcodegen.QrCode.encodeText(CASES[0]!.url, M));
  assert.ok(timingAlternates(g)); // positive control
  g[6]![10] = !g[6]![10];
  assert.equal(timingAlternates(g), false);
});

test("negative fixture: the regression hash detects any single-module change", () => {
  const g = gridOf(qrcodegen.QrCode.encodeText(CASES[0]!.url, M));
  assert.equal(gridHash(g), CASES[0]!.hash); // positive control
  g[20]![20] = !g[20]![20];
  assert.notEqual(gridHash(g), CASES[0]!.hash);
});
