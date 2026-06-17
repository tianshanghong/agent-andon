/** `andon serve [--demo] [--port N] [--host H] [--token T]` */
import { createServer } from "../server";
import { startDemo } from "../demo";
import { lanIp } from "../net";

export interface ServeArgs {
  port: number;
  host: string;
  demo: boolean;
  token?: string;
  notify: boolean; // native desktop banner on needs-you/stuck
  say: boolean; // spoken alert on needs-you/stuck
  push: boolean; // Web Push endpoints available (opt-in per device)
}

export function parseServeArgs(argv: string[]): ServeArgs {
  const args: ServeArgs = {
    port: Number(process.env.ANDON_PORT) || 8787,
    host: process.env.ANDON_HOST || "0.0.0.0",
    demo: false,
    token: process.env.ANDON_TOKEN || undefined,
    notify: true, // native desktop alerts ON by default (--no-notify to disable)
    say: false,
    push: process.env.ANDON_PUSH !== "off", // phone-push endpoints available (--no-push to disable)
  };
  let notifyExplicit = false; // did the user pick notify on/off themselves?
  // Consume the value after a flag, erroring if it's missing or is itself a flag.
  const takeValue = (argv: string[], i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("-")) {
      throw new Error(`${flag} needs a value`);
    }
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--demo") args.demo = true;
    else if (a === "--notify") { args.notify = true; notifyExplicit = true; }
    else if (a === "--no-notify") { args.notify = false; notifyExplicit = true; }
    else if (a === "--say") { args.say = true; args.notify = true; notifyExplicit = true; }
    else if (a === "--no-push") args.push = false;
    else if (a === "--push") args.push = true;
    else if (a === "--port") args.port = Number(takeValue(argv, i++, "--port"));
    else if (a === "--host") args.host = takeValue(argv, i++, "--host");
    else if (a === "--token") args.token = takeValue(argv, i++, "--token");
    else if (a?.startsWith("--port=")) args.port = Number(a.split("=")[1]);
    else if (a?.startsWith("--token=")) args.token = a.split("=")[1];
    else if (a?.startsWith("--host=")) args.host = a.split("=")[1]!;
  }
  // demo cycles fake agents every 3s — don't spam banners unless asked explicitly
  if (args.demo && !notifyExplicit) args.notify = false;
  return args;
}

export function serve(argv: string[]): void {
  let args: ServeArgs;
  try {
    args = parseServeArgs(argv);
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exit(2);
    return;
  }
  if (!Number.isFinite(args.port) || args.port <= 0) {
    console.error(`✗ invalid port: ${args.port}`);
    process.exit(1);
  }

  const { server, store } = createServer({
    port: args.port,
    host: args.host,
    token: args.token,
    alert: { notify: args.notify, say: args.say },
    push: { enabled: args.push, subject: process.env.ANDON_PUSH_SUBJECT, dataDir: process.env.ANDON_DATA_DIR },
  });

  if (args.demo) startDemo(store);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\n  ✗ Port ${args.port} is already in use.\n` +
          `    Another Andon server may be running, or pick a free port:\n` +
          `      andon serve --port 8788\n`,
      );
    } else {
      console.error(`\n  ✗ Server error: ${err.message}\n`);
    }
    process.exit(1);
  });

  server.listen(args.port, args.host, () => {
    const url = `http://${lanIp()}:${args.port}`;
    const tokenSuffix = args.token ? `?token=${args.token}` : "";
    console.log("\n  🚦 Agent Andon is live");
    console.log("  ──────────────────────────────────────────");
    console.log(`  This Mac:   http://127.0.0.1:${args.port}${tokenSuffix}`);
    console.log(`  iPad:       ${url}${tokenSuffix}`);
    console.log("              (iPad must be on the same Wi-Fi)");
    if (args.token) console.log("  🔒 token auth enabled");
    if (args.notify) console.log(`  🔔 desktop alerts on${args.say ? " + speech" : ""} — needs-you · stuck · done  (--no-notify to disable)`);
    if (args.push) console.log('  📱 phone alerts ready — open the board on your phone over HTTPS (e.g. Tailscale), Add to Home Screen, tap "Enable phone alerts"');
    if (args.demo) console.log("  [demo] injecting fake agents, cycling every 3s");
    console.log("  Ctrl-C to stop\n");
  });

  const shutdown = () => {
    console.log("\n  stopped.");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
