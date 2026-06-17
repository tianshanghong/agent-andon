/**
 * `andon verify <relay-url>` — T2 transparency check.
 *
 * Fetches the board + service worker the relay actually serves, hashes them, and
 * compares against the bytes in THIS open-source package. A match proves the relay
 * is serving the exact audited code (no hidden K-exfiltration). A persistent
 * mismatch (at the same version) means the relay is serving modified code — don't
 * trust it with your key. This is the "verifier" leg of the transparency model.
 */
import * as http from "http";
import * as https from "https";
import * as crypto from "crypto";
import { URL } from "url";
import { boardSha, swSha, bundleVersion } from "../hosted/board-assets";

function fetchBytes(urlStr: string, timeoutMs = 8000): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(urlStr);
    } catch {
      return reject(new Error("bad url"));
    }
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.get(u, { timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

const sha256 = (b: Buffer): string => crypto.createHash("sha256").update(b).digest("hex");
const short = (h: unknown): string => (typeof h === "string" ? h.slice(0, 12) + "…" : "?");

export async function verify(args: string[]): Promise<number> {
  const url = (args[0] || "").replace(/\/+$/, "");
  if (!url) {
    console.error("usage: andon verify <relay-url>\n  e.g.  andon verify https://relay.andon.dev");
    return 2;
  }

  let board, sw;
  try {
    board = await fetchBytes(`${url}/b/verify`); // the relay serves the static board for any id
    sw = await fetchBytes(`${url}/sw.js`);
  } catch (e) {
    console.error(`  ✗ couldn't reach ${url}: ${(e as Error).message}`);
    return 1;
  }
  if (board.status >= 400 || sw.status >= 400) {
    console.error(`  ✗ ${url} didn't serve a board/SW (HTTP ${board.status}/${sw.status}) — is it an Andon relay?`);
    return 1;
  }

  const servedBoard = sha256(board.body);
  const servedSw = sha256(sw.body);
  const localBoard = boardSha();
  const localSw = swSha();
  const localVer = bundleVersion();

  let claimed: { version?: string; board_sha256?: string; sw_sha256?: string } | null = null;
  try {
    const v = await fetchBytes(`${url}/version`);
    if (v.status < 400) claimed = JSON.parse(v.body.toString("utf8"));
  } catch {
    /* /version is optional */
  }

  const boardOk = servedBoard === localBoard;
  const swOk = servedSw === localSw;

  console.log(`\n  relay:        ${url}`);
  console.log(`  your andon:   v${localVer}`);
  if (claimed) console.log(`  relay claims: v${claimed.version}  (board ${short(claimed.board_sha256)} · sw ${short(claimed.sw_sha256)})`);
  console.log("");
  console.log(`  board   served ${short(servedBoard)}  vs  your source ${short(localBoard)}   ${boardOk ? "✓ match" : "✗ MISMATCH"}`);
  console.log(`  sw.js   served ${short(servedSw)}  vs  your source ${short(localSw)}   ${swOk ? "✓ match" : "✗ MISMATCH"}`);
  if (claimed) {
    const consistent = claimed.board_sha256 === servedBoard && claimed.sw_sha256 === servedSw;
    console.log(`  relay serves what it declares at /version:   ${consistent ? "✓" : "✗ NO — it misreports its own hash"}`);
  }
  console.log("");

  if (boardOk && swOk) {
    console.log("  ✓ This relay serves the EXACT open-source board you have — no hidden code.");
    if (claimed && claimed.version !== localVer) console.log(`    (versions differ: relay v${claimed.version}, you v${localVer} — match them for a clean check.)`);
    return 0;
  }
  console.log("  ✗ MISMATCH — the relay serves code that differs from your open-source copy.");
  console.log(`    First make the versions match (relay v${claimed?.version ?? "?"} vs you v${localVer}) and re-check.`);
  console.log("    If it still differs, the relay is serving modified code — do NOT trust it with your key.");
  return 1;
}
