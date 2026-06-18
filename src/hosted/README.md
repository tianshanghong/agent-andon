# `src/hosted/` — the optional hosted relay (T2)

Everything in this folder is the **opt-in "board from anywhere" relay and its
client**. The local, self-hosted product (the default) lives in `src/` and does
**not** depend on anything here. The only seam is one line in `src/client.ts`
(`postEvent` fans a sealed copy out to the relay when hosted is configured).

Keeping it in one folder is deliberate: T2's privacy guarantee is "open-source,
reproducible, publicly-logged code", so the relay a user trusts must be easy to
find and audit — it's all here.

- `e2e.ts` — end-to-end content sealing (AES-256-GCM). The relay only ever sees
  ciphertext; the key `K` never leaves the user's machine / their board.
- `relay.ts` — the multi-tenant, ciphertext-only relay server (`andon relay`).
  Endpoints: `POST /provision`, `POST /i/<board>` (ingest), `GET /s/<board>`
  (snapshot), `GET /e/<board>` (SSE live stream), push (`GET /vapid`,
  `POST /p/<board>/{subscribe,unsubscribe}`), the board bundle (`GET /b/<board>`,
  `/sw.js`, per-board `/b/<board>/manifest.webmanifest`, `/favicon.svg`), and
  `GET /version` (the served-bundle hashes, for transparency).
- `forwarder.ts` — the client side (`andon hosted setup`): provision, store config,
  seal each event and forward it to the relay.
- `board-assets.ts` — the board the relay serves (the SAME `assets/dashboard.html`,
  self-detecting hosted mode), the push-decrypting service worker, the board CSP,
  and the bundle hashes (`boardSha`/`swSha`).

CLI verbs (`andon relay`, `andon hosted`, `andon verify`) are thin wrappers in
`src/commands/` that call into this folder.

## How the pieces fit (the UX is identical to self-host)
1. `andon hosted setup <relay>` → generate `K` + ingest token locally, send only the
   token *hash* to the relay, store config, print the board link (`/b/<id>#k=…`).
2. Every status event then also seals → `POST /i/<board>` (the hook's `postEvent`
   fan-out — no local server needed).
3. Open the link → the SAME dashboard self-detects hosted mode, reads `K` from `#k`,
   connects SSE, decrypts each event with WebCrypto, renders the same traffic-light
   board. The service worker decrypts pushes with `K`.

## Known parity gaps vs self-host (small, disclosed)
- **Background-task masking (`pending`) is not carried to the hosted board.** Locally,
  a card stays "running" until its background sub-agents drain (so a finished *turn*
  with draining work never falsely reads "all done"). The forwarder seals
  `{title,message,agent}` but not `pending`, so a hosted board can show READY a bit
  early for sessions with draining background work. Fix path (follow-up): track
  `pending` per session in the forwarder and seal it inside the ciphertext (wire/AAD
  unchanged).
- **The idle "today" leverage panel is absent** on hosted boards — those tallies are
  computed locally and deliberately never sent to the relay.

## Transparency (the T2 claim)
The relay serves the board JS, so "even if breached, can't read it" is only literally
true for an installed client (T3). For the **web board (T2)** the honest claim is
**"we can't *secretly* backdoor you"**, backed by:
- **Reproducible bytes** — the relay serves `assets/dashboard.html` + the SW verbatim;
  anyone can rebuild them from the tagged release.
- **`GET /version`** — the relay declares the SHA-256 of exactly what it serves.
- **`andon verify <relay-url>`** — fetches the served board + SW, hashes them, and
  compares to the bytes in *your* open-source copy. A match = no hidden code.
- *Remaining operational step:* publish each served hash to a public append-only log
  (CT-style) so even a **targeted** swap is caught. Until that + a real-time verifier
  extension, there's a disclosed TOCTOU window — use T3 for prevention-grade.

Design + threat model: `docs/DESIGN-hosted.md` (gitignored review artifact).
