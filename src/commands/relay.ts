/**
 * `andon relay [--port N] [--data-dir D]` — run the hosted, content-blind relay.
 *
 * It stores ciphertext only and cannot read your agents' content. In-repo because
 * T2's whole guarantee is reproducible, publicly-auditable code.
 */
import { createRelay } from "../hosted/relay";

export function relay(args: string[]): void {
  // A relay is multi-tenant — one stray throw must NOT take everyone down. Log + keep serving.
  process.on("uncaughtException", (e) => console.error("relay: uncaught exception (kept running):", e));
  process.on("unhandledRejection", (e) => console.error("relay: unhandled rejection (kept running):", e));

  const pi = args.indexOf("--port");
  const raw = pi >= 0 ? parseInt(args[pi + 1], 10) : Number(process.env.ANDON_RELAY_PORT);
  const port = Number.isInteger(raw) && raw > 0 && raw <= 65535 ? raw : 8788; // ignore a missing/garbage --port
  const di = args.indexOf("--data-dir");
  const dataDir = di >= 0 ? args[di + 1] : process.env.ANDON_DATA_DIR;
  const host = process.env.ANDON_RELAY_HOST || "0.0.0.0";

  const { server, stop } = createRelay({ dataDir });
  server.listen(port, host, () => {
    console.log(`🛰  Agent Andon relay (content-blind) on ${host}:${port}`);
    console.log("   POST /provision   POST /i/<board>   GET /s,/e/<board>   push: /vapid, /p/<board>/subscribe");
    console.log("   stores ciphertext only — it cannot read your agents' content.");
    console.log("   ⚠ no TLS here — the ingest token + board-id travel cleartext over plain HTTP.");
    console.log("     put it behind HTTPS before exposing it; ANDON_RELAY_HOST=127.0.0.1 keeps it local-only.");
  });
  // Graceful shutdown so open SSE streams don't hang the exit.
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => stop(() => process.exit(0)));
}
