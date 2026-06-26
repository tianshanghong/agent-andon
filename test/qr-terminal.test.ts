/**
 * Wiring oracle (unit U5) for qrForTerminal — the gate that decides whether to render.
 * Positive control: renders when interactive. Negative fixtures: every skip condition
 * returns null (the caller still printed the link), and a too-large input is SWALLOWED
 * (returns null, never throws) so the link survives an encoder failure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { qrForTerminal, pairingBlock } from "../src/hosted/qr-terminal";

const URL = "https://relay.example.com/b/" + "a".repeat(43) + "#k=" + "b".repeat(43);
const GLYPH = /[█▀▄]/u;

test("renders a QR when interactive, colour on, wide enough, not --no-qr (positive control)", () => {
  const out = qrForTerminal(URL, { isTTY: true, columns: 80, noColor: false, noQr: false });
  assert.ok(out && GLYPH.test(out), "should produce half-block glyphs");
});

test("renders when columns is undefined — unknown width must NOT skip", () => {
  const out = qrForTerminal(URL, { isTTY: true });
  assert.ok(out && GLYPH.test(out));
});

test("skip: not a TTY → null", () => {
  assert.equal(qrForTerminal(URL, { isTTY: false, columns: 80 }), null);
});

test("skip: isTTY undefined (the real value off a TTY) → null", () => {
  assert.equal(qrForTerminal(URL, { isTTY: undefined, columns: 80 }), null);
});

test("skip: --no-qr → null", () => {
  assert.equal(qrForTerminal(URL, { isTTY: true, columns: 80, noQr: true }), null);
});

test("skip: NO_COLOR set → null", () => {
  assert.equal(qrForTerminal(URL, { isTTY: true, columns: 80, noColor: true }), null);
});

test("skip: terminal narrower than the QR → null", () => {
  // a v7 link QR is 53 cols wide; 20 cols can't hold it
  assert.equal(qrForTerminal(URL, { isTTY: true, columns: 20 }), null);
});

test("skip (no throw): data too large to encode is swallowed → null", () => {
  const huge = "x".repeat(5000); // exceeds max QR byte capacity → encoder throws → caught
  assert.equal(qrForTerminal(huge, { isTTY: true, columns: 200 }), null);
});

test("pairingBlock includes the link, the password caution, and a QR when interactive", () => {
  const block = pairingBlock(URL, { isTTY: true, columns: 80 });
  assert.ok(block.includes(URL), "link present");
  assert.ok(block.includes("screenshot"), "scrollback/password caution present");
  assert.ok(GLYPH.test(block), "QR glyphs present when interactive");
});

test("pairingBlock keeps the link AND the caution on EVERY skip path (no glyphs)", () => {
  const skipEnvs = [
    { isTTY: false, columns: 80 }, // not a TTY
    { isTTY: undefined, columns: 80 }, // the real non-TTY value
    { isTTY: true, columns: 80, noQr: true }, // --no-qr
    { isTTY: true, columns: 80, noColor: true }, // NO_COLOR
    { isTTY: true, columns: 20 }, // too narrow
  ];
  for (const env of skipEnvs) {
    const block = pairingBlock(URL, env);
    assert.ok(block.includes(URL), `link must still print (env=${JSON.stringify(env)})`);
    assert.ok(block.includes("screenshot"), `caution must still print (env=${JSON.stringify(env)})`);
    assert.ok(!GLYPH.test(block), `no QR glyphs on skip (env=${JSON.stringify(env)})`);
  }
});
