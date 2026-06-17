/**
 * `andon relay [--port N] [--data-dir D]` — run the hosted, zero-knowledge relay.
 *
 * It stores ciphertext only and cannot read your agents' content. In-repo because
 * T2's whole guarantee is reproducible, publicly-auditable code.
 */
import { createRelay } from "../hosted/relay";

export function relay(args: string[]): void {
  const pi = args.indexOf("--port");
  const port = pi >= 0 ? parseInt(args[pi + 1], 10) : Number(process.env.ANDON_RELAY_PORT) || 8788;
  const di = args.indexOf("--data-dir");
  const dataDir = di >= 0 ? args[di + 1] : process.env.ANDON_DATA_DIR;
  const host = process.env.ANDON_RELAY_HOST || "0.0.0.0";

  const { server } = createRelay({ dataDir });
  server.listen(port, host, () => {
    console.log(`🛰  Agent Andon relay (zero-knowledge) on ${host}:${port}`);
    console.log("   POST /provision   POST /i/<board>   GET /s/<board>");
    console.log("   stores ciphertext only — it cannot read your agents' content.");
    console.log("   ⚠ no TLS here — the ingest token + board-id travel cleartext over plain HTTP.");
    console.log("     put it behind HTTPS before exposing it; ANDON_RELAY_HOST=127.0.0.1 keeps it local-only.");
  });
}
