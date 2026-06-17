/**
 * Static assets the relay serves for the hosted board:
 *   - the dashboard bundle (the SAME assets/dashboard.html as self-host, which
 *     self-detects hosted mode from the /b/<board> path + #k fragment), and
 *   - the hosted service worker, which decrypts pushes with K (from IndexedDB) so
 *     the relay's ciphertext push becomes a rich "needs you" notification locally.
 *
 * T2 transparency: these are exactly the bytes a user would reproduce + verify.
 */
import * as fs from "fs";
import * as path from "path";

/** Find assets/dashboard.html by walking up from this module — robust to both the
 *  shipped layout (dist/hosted/) and the test build (build/src/hosted/). */
function dashboardPath(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, "assets", "dashboard.html");
    if (fs.existsSync(p)) return p;
    dir = path.dirname(dir);
  }
  return path.join(__dirname, "..", "..", "assets", "dashboard.html"); // fallback → clear ENOENT
}

let cachedBoard: Buffer | null = null;
/** Read the dashboard bundle once (served verbatim, like the local server). */
export function boardHtml(): Buffer {
  if (!cachedBoard) cachedBoard = fs.readFileSync(dashboardPath());
  return cachedBoard;
}

/**
 * The hosted board's Content-Security-Policy. Like the self-host board's (keeps
 * `unsafe-inline` for the single verbatim file), but `connect-src 'self'` covers the
 * relay's own SSE /e + /vapid + /p/* — all same-origin — and nothing else.
 */
export const BOARD_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * The hosted service worker (served at /sw.js). On a push it gets the SEALED blob
 * {sid,state,seq,enc} (the browser has already stripped the RFC-8291 transport
 * layer); it pulls K + boardId from IndexedDB (the board page stored them) and
 * AES-GCM-decrypts to show a rich, local-only notification. The relay never sees the
 * plaintext. Mirrors src/hosted/e2e.ts `open` — same NORMATIVE wire format.
 */
export const HOSTED_SW = `// Agent Andon hosted service worker — decrypts pushes locally with K.
const DB = "andon-hosted", STORE = "kv";
function idbGet(key){
  return new Promise((res) => {
    let req; try { req = indexedDB.open(DB, 1); } catch (e) { return res(null); }
    req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch(e){} };
    req.onsuccess = () => {
      try {
        const g = req.result.transaction(STORE, "readonly").objectStore(STORE).get(key);
        g.onsuccess = () => res(g.result); g.onerror = () => res(null);
      } catch (e) { res(null); }
    };
    req.onerror = () => res(null);
  });
}
function b64uToU8(s){
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const u = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
  return u;
}
async function openSealed(rawKey, boardId, ev){
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const aad = new TextEncoder().encode(JSON.stringify([boardId, ev.sid, ev.state, ev.seq]));
  const ptBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64uToU8(ev.enc.nonce), additionalData: aad, tagLength: 128 },
    key, b64uToU8(ev.enc.ct));
  const pt = new Uint8Array(ptBuf);
  const len = (pt[0] | (pt[1] << 8) | (pt[2] << 16) | (pt[3] << 24)) >>> 0; // unsigned, matches node readUInt32LE
  if (len + 4 > pt.length) throw new Error("bad length");
  const obj = JSON.parse(new TextDecoder().decode(pt.subarray(4, 4 + len)));
  if (obj.seq !== ev.seq) throw new Error("seq mismatch");
  return obj;
}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let title = "Agent Andon", body = "needs you", nd = null;
    try {
      const data = e.data ? e.data.json() : null; // {boardId,sid,state,seq,enc}
      const boardId = data && data.boardId;
      const rawKey = boardId ? await idbGet("key:" + boardId) : null; // per-board slot
      if (rawKey && data && data.enc) {
        const opened = await openSealed(rawKey, boardId, data);
        const t = (opened.title || "an agent");
        const stuck = data.state === "error";
        title = "Andon · " + (stuck ? "STUCK" : "NEEDS YOU");
        body = stuck ? (t + " is stuck") : (t + " needs you");
        nd = { boardId };
      }
    } catch (_) { /* can't decrypt → fall back to the generic notice */ }
    await self.registration.showNotification(title, { body, tag: "andon", renotify: true, data: nd });
  })());
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const bid = e.notification.data && e.notification.data.boardId;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if (c.url.indexOf("/b/") >= 0 && "focus" in c) return c.focus();
    if (self.clients.openWindow) return self.clients.openWindow(bid ? ("/b/" + encodeURIComponent(bid)) : "/");
  })());
});
`;
