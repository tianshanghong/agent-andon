/**
 * Optional native desktop alerts — a banner (and optional spoken alert) the
 * moment a session flips into a state that needs you. Cross-platform: it picks
 * the right native command for the OS running `andon serve`, and silently
 * no-ops (never throws) if that tool isn't installed.
 *
 *   macOS    notify: osascript        say: say
 *   Linux    notify: notify-send      say: spd-say (falls back to espeak)
 *   Windows  notify: PowerShell toast say: PowerShell System.Speech
 *
 * The web board (chime + visuals) is the universal channel and works on every
 * device; this just adds a second channel on the machine running the server.
 */
import { spawn } from "child_process";
import type { Session, State } from "./types";

export interface AlertConfig {
  notify: boolean; // desktop banner
  say: boolean; // spoken alert
}

interface AlertSpec {
  tag: string;
  urgent: boolean; // linux: critical urgency (sticky banner)
  sound: string | null; // macOS sound name; null = silent (quiet banner)
  speak: boolean; // also speak it when --say is on
}
/** Which states alert, and how loud. `done` is a QUIET completion banner
 *  (no sound, no speech) so you get pulled back when work finishes without it
 *  competing with the urgent needs-you / stuck alerts. */
const SPEC: Partial<Record<State, AlertSpec>> = {
  error: { tag: "STUCK", urgent: true, sound: "Basso", speak: true },
  waiting: { tag: "NEEDS YOU", urgent: false, sound: "Submarine", speak: true },
  done: { tag: "READY", urgent: false, sound: null, speak: false },
};
const DONE_ALERT_GRACE_MS = 4000; // a completion must hold this long (matches the board)

/** AppleScript string literal — escape backslash + quote (injection-safe). */
const asStr = (s: string): string =>
  '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
/** PowerShell single-quoted literal — double any internal single quotes. */
const psStr = (s: string): string => "'" + String(s).replace(/'/g, "''") + "'";

/** [command, args] for a desktop banner on this OS, or null if unsupported. */
function notifyCommand(title: string, body: string, urgent: boolean, sound: string | null): [string, string[]] | null {
  switch (process.platform) {
    case "darwin": {
      const snd = sound ? ` sound name ${asStr(sound)}` : "";
      return ["osascript", ["-e", `display notification ${asStr(body)} with title ${asStr(title)}${snd}`]];
    }
    case "linux":
      // libnotify; critical urgency makes a "stuck" banner sticky on most DEs.
      // `--` ends option parsing so an attacker-posted title/body that starts
      // with `-` can't be read as a flag.
      return ["notify-send", [`--urgency=${urgent ? "critical" : "normal"}`, "--", title, body]];
    case "win32": {
      const ps =
        `$ErrorActionPreference='SilentlyContinue';` +
        `[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;` +
        `$tpl=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);` +
        `$n=$tpl.GetElementsByTagName('text');` +
        `$n.Item(0).AppendChild($tpl.CreateTextNode(${psStr(title)}))|Out-Null;` +
        `$n.Item(1).AppendChild($tpl.CreateTextNode(${psStr(body)}))|Out-Null;` +
        `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Andon').Show([Windows.UI.Notifications.ToastNotification]::new($tpl))`;
      return ["powershell", ["-NoProfile", "-NonInteractive", "-Command", ps]];
    }
    default:
      return null;
  }
}

/** [command, args] for speaking a short phrase, or null if unsupported. */
function sayCommand(phrase: string): [string, string[]] | null {
  // strip a leading `-`/space so the single argv token can't parse as a flag
  const safe = phrase.replace(/^[-\s]+/, "") || "agent";
  switch (process.platform) {
    case "darwin":
      return ["say", [safe]];
    case "linux":
      return ["spd-say", [safe]]; // speech-dispatcher; espeak is an alt if absent
    case "win32":
      return [
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", `Add-Type -AssemblyName System.Speech;(New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak(${psStr(safe)})`],
      ];
    default:
      return null;
  }
}

function run(spec: [string, string[]] | null): void {
  if (!spec) return;
  try {
    spawn(spec[0], spec[1], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* binary missing / unsupported OS — ignore */
  }
}

/**
 * The state we ALERT on — mirrors the board's `viewState`: a `done` session that
 * still has background tasks (`pending > 0`) is NOT finished, so it reads as
 * "working" and never fires a completion banner. Keeps the desktop alert honest
 * with the board (no false "READY" while `andon sub` work is in flight).
 */
export function alertState(s: Session): State {
  return s.state === "done" && (s.pending | 0) > 0 ? "working" : s.state;
}

/** Fire a banner (+ optional speech) for one session. */
export function alertFor(s: Session, cfg: AlertConfig): void {
  const spec = SPEC[alertState(s)];
  if (!spec) return; // only states we alert on
  if (cfg.notify) {
    const body = `${s.agent || "agent"} · ${s.title}${s.message ? " — " + s.message : ""}`;
    run(notifyCommand("Andon · " + spec.tag, body, spec.urgent, spec.sound));
  }
  if (cfg.say && spec.speak) {
    run(sayCommand(s.state === "error" ? `${s.title} is stuck` : `${s.title} needs you`));
  }
}

// Throttle so a LAN client spamming /event can't drive an unbounded process
// spawn flood (alerts are on by default with no token): at most one alert per
// session per cooldown, plus a global token bucket for bursts.
const PER_ID_COOLDOWN_MS = 1500;
const BUCKET_CAP = 6; // allow a burst (e.g. several agents going amber at once)
const BUCKET_REFILL_PER_SEC = 1; // …then sustain at ~1/s

/**
 * Stateful alerter: returns a function to feed each fresh snapshot. Fires on a
 * *transition* into an alerting state (computed via alertState, so done+pending
 * never alerts). Urgent states fire immediately; a completion is debounced so a
 * transient green flicker never fires a false "ready". All spawns are throttled.
 */
export function makeAlerter(cfg: AlertConfig) {
  const last = new Map<string, State>(); // last EFFECTIVE (alertState) value
  const latest = new Map<string, Session>(); // latest session, for fire-time recheck
  const doneTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const lastAlertAt = new Map<string, number>();
  let tokens = BUCKET_CAP;
  let lastRefill = Date.now();

  const cancelDone = (id: string) => {
    const t = doneTimers.get(id);
    if (t) {
      clearTimeout(t);
      doneTimers.delete(id);
    }
  };
  const fire = (s: Session) => {
    const now = Date.now();
    if (now - (lastAlertAt.get(s.id) ?? 0) < PER_ID_COOLDOWN_MS) return; // per-session cooldown
    tokens = Math.min(BUCKET_CAP, tokens + ((now - lastRefill) / 1000) * BUCKET_REFILL_PER_SEC);
    lastRefill = now;
    if (tokens < 1) return; // global flood guard
    tokens -= 1;
    lastAlertAt.set(s.id, now);
    alertFor(s, cfg);
  };

  return function onSnapshot(sessions: Session[]): void {
    const seen = new Set<string>();
    for (const s of sessions) {
      seen.add(s.id);
      latest.set(s.id, s);
      const es = alertState(s);
      const prev = last.get(s.id);
      last.set(s.id, es);
      if (prev === es) continue; // no transition

      if (es === "waiting" || es === "error") {
        cancelDone(s.id);
        fire(s); // urgent → immediate (throttled)
      } else if (es === "done") {
        cancelDone(s.id);
        const t = setTimeout(() => {
          doneTimers.delete(s.id);
          const cur = latest.get(s.id);
          if (cur && alertState(cur) === "done") fire(cur); // still really-done after grace
        }, DONE_ALERT_GRACE_MS);
        t.unref?.();
        doneTimers.set(s.id, t);
      } else {
        cancelDone(s.id); // working / idle → drop any pending completion banner
      }
    }
    for (const id of [...last.keys()]) {
      if (!seen.has(id)) {
        last.delete(id);
        latest.delete(id);
        lastAlertAt.delete(id);
        cancelDone(id);
      }
    }
  };
}
