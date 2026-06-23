# Changelog

Notable changes to Agent Andon. Roughly follows [Keep a Changelog](https://keepachangelog.com/);
the project is pre-1.0, so a minor version may bundle features and fixes together.

## [0.2.2] — 2026-06-22

### Fixed
- **Finished sub-agent / teammate tiles no longer pile up on the board.** When a Claude Code team is
  torn down, its teammates are often killed without a clean `SessionEnd`, so their last `ready`/idle
  state used to linger for the full 6-hour TTL. Quiescent tiles (done/idle, no background work) now
  age out after **15 minutes** of inactivity (tunable via `ANDON_IDLE_TTL_SEC`), while active and
  "needs-you" tiles keep the 6h backstop. Applies to both the local board and the hosted relay.

### Changed
- **The relay is now described as "content-blind" (was "zero-knowledge").** The new term states the
  verifiable property precisely — the relay can't read your content — across the README (7 languages),
  the `andon relay` help, the relay startup banner, the image label, and the docs. The privacy claim
  is also scoped: your status *content* (title, message, agent name) is end-to-end encrypted and the
  relay stores only ciphertext it cannot decrypt (it never receives your key); it still sees coarse
  metadata (active, roughly when, the high-level state, your IP).
- Contributions are now accepted under a **Contributor License Agreement** (see `CLA.md`), signed once
  by comment.

## [0.2.1] — 2026-06-20

### Fixed
- **The board no longer shows "idle" while an agent is actively running.** `SessionStart` fires on
  resume and auto-compaction too — not only a fresh launch — yet the hook mapped it to `idle`
  unconditionally, so a busy session that auto-compacted mid-task had its tile blanked to idle. Now
  only a genuinely fresh start (startup/clear) idles; resume/compact leave the tile untouched. Fixed
  in both the Claude and Codex hooks.

### Added
- **README translated into 7 languages** (English · 中文 · 日本語 · 한국어 · Español · Deutsch ·
  Français) with a language switcher at the top of each.

## [0.2.0] — 2026-06-20

### Added
- **Hosted "board from anywhere" relay** — an optional, opt-in, **content-blind** relay
  (`andon relay` / `andon hosted setup` / `andon verify`). Every status is end-to-end encrypted on
  your machine; the relay stores **ciphertext only** and can't read your agents' titles, messages, or
  code. Multi-tenant (one URL, many isolated boards). *"Verifiable, not just trusted":* reproducible
  build + a `/version` hash + `andon verify` confirm a relay serves the exact open-source code.
- **Docker image** — reproducible multi-arch (amd64/arm64) image at
  `ghcr.io/tianshanghong/agent-andon`, built from source by CI with provenance + SBOM.
- **Landing page** (`site/index.html`) for agentandon.com.
- **"Which setup do you need?"** decision guide (with a flowchart) and a topic-organized `docs/`.

### Fixed
- **iPad / iOS sound** — alert chimes now play reliably on iPad Safari: served as MP3 from
  `/snd/*.mp3` (iOS won't play `data:`/WAV inline in `<audio>`), with the WebAudio synth still used
  where available. The single-beep "enable" vs two-tone "done" distinction is restored.
- **Cross-platform** — board UI + docs no longer assume macOS; the same on macOS / Linux / Windows.
- **Build** — `dist/cli.js` stays executable across rebuilds, so a globally-linked/installed `andon`
  no longer fails with "permission denied" after a local build.
- Hardening from independent code/security reviews: relay unsubscribe crash-safety + process-level
  guards, a `/snd` prototype-pollution guard, and a suspended-context silent-alert fallback.

### Changed
- README split into a lean landing page + `docs/` guides (commands, notifications, running,
  configuration, troubleshooting, develop).
- Alerts: in-browser sound + phone push unified into one device-neutral button; lighter CSP plus
  accessibility and i18n polish on the board.

## [0.1.0]

Initial public release.

### Added
- Full-screen status **board** for Claude Code & Codex — one full-width row per session; *stuck* and
  *needs-you* grow large and float to the top; a signal bar across the top. Live over SSE (1s polling
  fallback).
- **One-command setup** — `andon install claude` / `andon install codex` wire the native hooks (with
  a timestamped backup).
- **Desktop alerts** (on by default) + a **menu-bar** summary; cross-platform notifiers
  (osascript / notify-send / PowerShell).
- **Multi-agent** with background-task counting and per-tile naming.
- **7 languages**, auto-detected. **Zero runtime dependencies.**
