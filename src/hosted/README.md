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
- `forwarder.ts` — the client side (`andon hosted setup`): provision, store config,
  seal each event and forward it to the relay.

CLI verbs (`andon relay`, `andon hosted`) are thin wrappers in `src/commands/` that
call into this folder, for dispatch consistency with the other verbs.

Design + threat model: `docs/DESIGN-hosted.md` (gitignored review artifact).
