/** Small networking helpers shared by the server and CLI. */
import * as os from "os";

/** Default base URL hooks post to; override with AGENT_STATUS_URL. */
export function serverBase(): string {
  return (process.env.AGENT_STATUS_URL || "http://127.0.0.1:8787").replace(
    /\/+$/,
    "",
  );
}

/**
 * Best-effort LAN IP for the "open this on your iPad" URL. Prefers a private
 * (RFC1918) IPv4, skips loopback / link-local / virtual where possible.
 */
export function lanIp(): string {
  const nis = os.networkInterfaces();
  const candidates: string[] = [];
  for (const name of Object.keys(nis)) {
    for (const ni of nis[name] ?? []) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      if (ni.address.startsWith("169.254.")) continue; // link-local
      candidates.push(ni.address);
    }
  }
  const isPrivate = (a: string) =>
    a.startsWith("192.168.") ||
    a.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(a);
  return candidates.find(isPrivate) ?? candidates[0] ?? "127.0.0.1";
}
