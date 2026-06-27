/**
 * Board purity — the hosted board (`assets/dashboard.html`) and the hosted service worker
 * must carry NO external / third-party script.
 *
 * `andon verify` hashes these byte-for-byte against the user's installed copy, so a tracker
 * baked into the board would (a) make verify mismatch for every self-hoster and (b) phone
 * their usage home. Marketing analytics lives ONLY on the agentandon.com site (`site/`).
 *
 * SCOPE: this is the SOURCE-side half — it proves nothing in this repo's board/SW carries a
 * tracker. The DEPLOYED bytes are checked separately by `andon verify` (it hashes what a live
 * relay serves), and an edge/CDN injection at serve time — what actually broke verify against
 * the deployed relay on 2026-06-27 (Cloudflare Web Analytics auto-injection) — is prevented by
 * keeping the relay's Cloudflare zone in "JS-snippet" mode. This test does not (and cannot)
 * catch that; it catches a beacon committed into the source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { boardHtml, HOSTED_SW } from "../src/hosted/board-assets";

// An external `<script src=…>` pointing off-origin — the shape any injected beacon takes.
// Matches quoted/unquoted src, explicit `https?:` and protocol-relative `//host`. Inline
// scripts and relative/self srcs (`/foo.js`) read clean, as does a Google Fonts <link>.
const EXTERNAL_SCRIPT = /<script\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i;
// Belt-and-suspenders: the specific tracker that prompted this guard.
const BEACONS = [/cloudflareinsights/i, /cf-beacon/i];

function impurities(s: string): string[] {
  const hits: string[] = [];
  if (EXTERNAL_SCRIPT.test(s)) hits.push("external <script src>");
  for (const b of BEACONS) if (b.test(s)) hits.push(b.source);
  return hits;
}

test("board HTML is real, and carries no external/third-party script", () => {
  const html = boardHtml().toString("utf8");
  // Non-vacuity: an empty/truncated/wrong file would make the purity check meaningless.
  assert.ok(html.length > 10_000, `board looks empty/truncated (${html.length} bytes)`);
  assert.match(html, /andon/i, "board content marker missing — wrong file?");
  assert.deepEqual(impurities(html), []);
});

test("hosted service worker is real, and carries no external/third-party script", () => {
  assert.ok(HOSTED_SW.length > 100, "HOSTED_SW looks empty");
  assert.deepEqual(impurities(HOSTED_SW), []);
});

// POSITIVE CONTROLS — prove each detector can actually fail, independently.
// The generic regex is proven by a NON-Cloudflare script (so the substring matcher can't be
// the thing passing for it), and by a protocol-relative src (a real bypass we close).
test("positive control: a generic external script trips the regex", () => {
  const poisoned = boardHtml().toString("utf8") + `<script src="https://example.com/x.js"></script>`;
  assert.ok(
    impurities(poisoned).includes("external <script src>"),
    "EXTERNAL_SCRIPT regex failed — an unknown future beacon would slip through",
  );
});

test("positive control: a protocol-relative external script trips the regex", () => {
  const poisoned = boardHtml().toString("utf8") + `<script src="//evil.example/track.js"></script>`;
  assert.ok(impurities(poisoned).includes("external <script src>"), "protocol-relative src slipped through");
});

test("positive control: an unquoted external src trips the regex", () => {
  const poisoned = boardHtml().toString("utf8") + `<script src=https://evil.example/x.js></script>`;
  assert.ok(impurities(poisoned).includes("external <script src>"), "unquoted src slipped through");
});

test("positive control: the Cloudflare beacon is detected (substring path)", () => {
  const poisoned =
    boardHtml().toString("utf8") +
    `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"x"}'></script>`;
  assert.notDeepEqual(impurities(poisoned), [], "Cloudflare beacon missed");
});
