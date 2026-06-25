/**
 * Oracle for the terminal QR renderer (unit U3).
 *
 * Per scope-to-goal's "a test that can't fail is theater", there are two layers:
 *  1. ROUND-TRIP (the load-bearing check): render a real QR, strip ANSI, reconstruct the
 *     module grid, assert it equals the encoder's matrix (incl. quiet zone). Catches
 *     odd-row parity, FG/BG swaps, and dropped columns. Red until renderQr is built.
 *  2. ORACLE SELF-CHECK: parseRender() — the reconstruction the round-trip relies on — is
 *     itself proven on a known-GOOD render (positive control: must accept) and on
 *     CORRUPTED renders (negative fixtures: must reject), so the round-trip can't be a
 *     false green. These pass immediately; they validate the checking machinery.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { qrcodegen } from "../src/vendor/qrcodegen";
import { renderQr, QUIET } from "../src/hosted/qr-render";

const DARK_FG = 30, LIGHT_FG = 97, DARK_BG = 40, LIGHT_BG = 107;
const UPPER = "▀"; // ▀

type Grid = boolean[][]; // true = dark module

/** Reconstruct a module grid from rendered half-block ANSI. Each cell is
 *  `\x1b[<fg>;<bg>m▀`: fg encodes the TOP module, bg the BOTTOM module. */
function parseRender(s: string): Grid {
  const grid: Grid = [];
  for (const line of s.split("\n").filter((l) => l.length > 0)) {
    const cells = [...line.matchAll(/\x1b\[(\d+);(\d+)m▀/g)];
    const top: boolean[] = [];
    const bot: boolean[] = [];
    for (const m of cells) {
      top.push(Number(m[1]) === DARK_FG);
      bot.push(Number(m[2]) === DARK_BG);
    }
    grid.push(top, bot);
  }
  return grid;
}

/** The expected module grid (with quiet zone) for a QrCode. */
function expectedGrid(qr: { size: number; getModule(x: number, y: number): boolean }, quiet = QUIET): Grid {
  const total = qr.size + 2 * quiet;
  const g: Grid = [];
  for (let y = 0; y < total; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < total; x++) {
      const mx = x - quiet, my = y - quiet;
      row.push(mx >= 0 && mx < qr.size && my >= 0 && my < qr.size && qr.getModule(mx, my));
    }
    g.push(row);
  }
  return g;
}

// ── 1. ROUND-TRIP (red until renderQr exists) ───────────────────────────────────
test("renderQr round-trips to the encoder's module matrix (with quiet zone)", () => {
  const url = "https://relay.example.com/b/" + "a".repeat(43) + "#k=" + "b".repeat(43);
  const qr = qrcodegen.QrCode.encodeText(url, qrcodegen.QrCode.Ecc.MEDIUM);
  const expected = expectedGrid(qr);
  const total = expected.length;

  const out = renderQr(qr);

  const lines = out.split("\n").filter((l) => l.length > 0);
  for (const line of lines) {
    assert.equal([...line.matchAll(/▀/g)].length, total, "each line is `total` cells wide");
  }
  const recon = parseRender(out);
  assert.deepEqual(recon.slice(0, total), expected, "reconstructed grid equals the matrix");
  if (recon.length > total) {
    assert.ok(recon[total]!.every((d) => d === false), "odd-row padded bottom must be light");
  }
});

test("odd-height symbol: the phantom bottom row renders LIGHT (explicit, unconditional)", () => {
  // size 1 + quiet 0 → total 1 (odd). One text row: top = the module, bottom = phantom.
  const stub = { size: 1, getModule: () => true }; // single dark module
  const recon = parseRender(renderQr(stub, { quiet: 0 }));
  assert.equal(recon.length, 2, "one text row → two module rows");
  assert.deepEqual(recon[0], [true], "top half = the dark module");
  assert.ok(recon[1]!.every((d) => d === false), "phantom bottom half must be light, never dark/OOB");
});

// ── 2. ORACLE SELF-CHECK: positive control + negative fixtures (green now) ───────
const GOOD_2x2 =
  `\x1b[${DARK_FG};${LIGHT_BG}m${UPPER}\x1b[${LIGHT_FG};${DARK_BG}m${UPPER}\x1b[0m`;
const EXPECT_2x2: Grid = [[true, false], [false, true]];

test("self-check: parseRender accepts a known-good render (positive control)", () => {
  assert.deepEqual(parseRender(GOOD_2x2), EXPECT_2x2);
});

test("self-check: negative fixture — a FG/BG colour swap is rejected", () => {
  const bad = GOOD_2x2.replace(`\x1b[${DARK_FG};${LIGHT_BG}m`, `\x1b[${LIGHT_FG};${LIGHT_BG}m`);
  assert.notDeepEqual(parseRender(bad), EXPECT_2x2);
});

test("self-check: negative fixture — an odd-row DARK bottom is rejected", () => {
  const goodPadded = `\x1b[${DARK_FG};${LIGHT_BG}m${UPPER}\x1b[0m`; // bottom light (correct)
  const badPadded = `\x1b[${DARK_FG};${DARK_BG}m${UPPER}\x1b[0m`; // bottom DARK (the bug)
  assert.ok(parseRender(goodPadded)[1]!.every((d) => d === false), "good: bottom light");
  assert.ok(parseRender(badPadded)[1]!.some((d) => d === true), "bug caught: bottom dark");
});

test("self-check: negative fixture — a dropped column changes width", () => {
  const dropped = `\x1b[${DARK_FG};${LIGHT_BG}m${UPPER}\x1b[0m`; // one of two cells removed
  assert.notEqual(parseRender(dropped)[0]!.length, parseRender(GOOD_2x2)[0]!.length);
});
