# Vendored third-party source

## `qrcodegen.ts` — Nayuki QR Code generator (TypeScript)

Vendored verbatim from upstream — we deliberately do **not** hand-roll a QR encoder (the
Reed–Solomon / masking / interleaving math is bug-prone; this is the reference implementation).

- **Upstream:** <https://github.com/nayuki/QR-Code-generator> — tag **v1.8.0** (2022-04-17)
- **File:** `typescript-javascript/qrcodegen.ts`
- **License:** MIT (header preserved verbatim in the file)
- **Upstream body SHA-256:** `c4749095a91bf9696e3a303998b9905e467094f53041e64393e65e6d887737fd`

### Only local modification: a 2-line adapter footer
The upstream file exposes a `namespace qrcodegen`, which is not importable across modules under this
project's `module: commonjs`. We append (and only append) a footer so it can be imported:

```ts
// --- agent-andon vendor adapter (not part of upstream v1.8.0; see README.md) ---
export { qrcodegen };
```

The body **above** the footer is byte-identical to upstream. Verify any time:

```sh
sed -n '1,991p' src/vendor/qrcodegen.ts | shasum -a 256
# must print: c4749095a91bf9696e3a303998b9905e467094f53041e64393e65e6d887737fd
```

The body is never edited — only the footer.

### Why vendored (not an npm dependency)
Keeps `dependencies: {}` empty (no auto-update supply-chain vector) and out of the `andon verify`
board-asset surface (the QR is CLI-only, never served to a browser). Purity-audited: pure
`string → QrCode` computation — no I/O, network, `eval`, or `process` access.

### Updating
Re-download the same file at the newer tag, re-audit for purity, update the SHA above, re-append the
footer. Never edit the body.
