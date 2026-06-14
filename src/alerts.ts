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

const TAG: Partial<Record<State, string>> = { waiting: "NEEDS YOU", error: "STUCK" };

/** AppleScript string literal — escape backslash + quote (injection-safe). */
const asStr = (s: string): string =>
  '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
/** PowerShell single-quoted literal — double any internal single quotes. */
const psStr = (s: string): string => "'" + String(s).replace(/'/g, "''") + "'";

/** [command, args] for a desktop banner on this OS, or null if unsupported. */
function notifyCommand(title: string, body: string, urgent: boolean): [string, string[]] | null {
  switch (process.platform) {
    case "darwin":
      return [
        "osascript",
        ["-e", `display notification ${asStr(body)} with title ${asStr(title)} sound name ${asStr(urgent ? "Basso" : "Submarine")}`],
      ];
    case "linux":
      // libnotify; critical urgency makes a "stuck" banner sticky on most DEs
      return ["notify-send", [`--urgency=${urgent ? "critical" : "normal"}`, title, body]];
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
  switch (process.platform) {
    case "darwin":
      return ["say", [phrase]];
    case "linux":
      return ["spd-say", [phrase]]; // speech-dispatcher; espeak is an alt if absent
    case "win32":
      return [
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", `Add-Type -AssemblyName System.Speech;(New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak(${psStr(phrase)})`],
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

/** Fire a banner (+ optional speech) for one session that needs you. */
export function alertFor(s: Session, cfg: AlertConfig): void {
  const tag = TAG[s.state];
  if (!tag) return; // only the states that actually need a human
  if (cfg.notify) {
    const body = `${s.agent || "agent"} · ${s.title}${s.message ? " — " + s.message : ""}`;
    run(notifyCommand("Andon · " + tag, body, s.state === "error"));
  }
  if (cfg.say) {
    run(sayCommand(s.state === "error" ? `${s.title} is stuck` : `${s.title} needs you`));
  }
}

/**
 * Stateful alerter: returns a function to feed each fresh snapshot. Fires only
 * on a *transition* into waiting/error, so re-rendering an already-amber tile
 * doesn't re-alert.
 */
export function makeAlerter(cfg: AlertConfig) {
  const last = new Map<string, State>();
  return function onSnapshot(sessions: Session[]): void {
    const seen = new Set<string>();
    for (const s of sessions) {
      seen.add(s.id);
      if (last.get(s.id) !== s.state) alertFor(s, cfg);
      last.set(s.id, s.state);
    }
    for (const id of [...last.keys()]) if (!seen.has(id)) last.delete(id);
  };
}
