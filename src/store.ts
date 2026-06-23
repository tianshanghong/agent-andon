/**
 * In-memory session store. Pure logic, no I/O — so it is trivially testable.
 *
 * Concurrency note: Node runs this single-threaded, so unlike the Python
 * prototype no lock is needed. Each HTTP callback runs to completion.
 *
 * It also keeps honest "today so far" leverage/attention tallies (see Today):
 * working-time and hands-off are accumulated from real state transitions, reset
 * at local midnight. All local — never persisted to disk, never forwarded to any
 * third-party service (the aggregate counts do ride along in the board snapshot).
 */
import {
  VALID_STATES,
  type AndonEvent,
  type Session,
  type Snapshot,
  type State,
  type Today,
} from "./types";

/** Any session untouched for this long is swept (a process died without cleanup). */
export const HARD_TTL_SEC = 6 * 3600;

/** A quiescent tile (done/idle, no background work) untouched this long is swept,
 *  even before the hard TTL — finished sub-agents/teammates that never sent a
 *  SessionEnd (e.g. a team torn down with SIGTERM) shouldn't pile up on the board.
 *  Set ≥ HARD_TTL_SEC to disable. Override via ANDON_IDLE_TTL_SEC. */
export const IDLE_TTL_SEC = 15 * 60;

/** Hard cap so a misbehaving/abusive client can't grow the board unbounded. */
export const MAX_SESSIONS = 200;

export interface ApplyResult {
  ok: boolean;
  error?: string;
  removed?: boolean;
}

const isWorking = (s: string | undefined): boolean => s === "working";
const isAlerting = (s: string | undefined): boolean => s === "waiting" || s === "error";

export class SessionStore {
  private sessions = new Map<string, Session>();

  // ── "today so far" accounting (resets at local midnight) ──
  private dayKey: string;
  private agentsSeen = new Set<string>(); // distinct sessions seen today
  private agentSec = 0; // Σ working-time today (closed intervals only)
  private handsOffSec = 0; // wall-clock with ≥1 working (closed intervals only)
  private longestHandsOffSec = 0;
  private pulledIn = 0;
  private stuck = 0;
  private peak = 0;
  private workingCount = 0; // sessions currently working
  private workingSince = new Map<string, number>(); // id → ts it entered working
  private anyWorkingSince: number | null = null; // ts the working-count went 0→≥1

  constructor(
    private readonly now: () => number = () => Date.now() / 1000,
    private readonly maxSessions: number = MAX_SESSIONS,
    private readonly ttlSec: number = HARD_TTL_SEC,
    private readonly idleTtlSec: number = IDLE_TTL_SEC,
  ) {
    this.dayKey = this.localDay(this.now());
  }

  /** Local calendar day for an epoch-seconds timestamp (drives midnight reset). */
  private localDay(t: number): string {
    return new Date(t * 1000).toDateString();
  }

  /** Roll the daily tallies if we've crossed into a new local day. */
  private rollDay(now: number): void {
    const key = this.localDay(now);
    if (key === this.dayKey) return;
    this.dayKey = key;
    this.agentSec = 0;
    this.handsOffSec = 0;
    this.longestHandsOffSec = 0;
    this.pulledIn = 0;
    this.stuck = 0;
    // re-base any in-flight intervals so yesterday's time isn't counted into today
    for (const id of this.workingSince.keys()) this.workingSince.set(id, now);
    this.anyWorkingSince = this.workingCount > 0 ? now : null;
    this.peak = this.workingCount;
    this.agentsSeen = new Set(this.sessions.keys()); // currently-present count as seen today
  }

  /** Update the leverage/attention tallies for one session state transition.
   *  `ts` is the moment the transition is effective — `now` for live events, but
   *  the session's last-seen time when a sweep closes a dead session's interval. */
  private account(id: string, prev: string | undefined, next: string, ts: number): void {
    // working-time + hands-off
    if (!isWorking(prev) && isWorking(next)) {
      this.workingSince.set(id, ts);
      if (this.workingCount === 0) this.anyWorkingSince = ts;
      this.workingCount++;
      if (this.workingCount > this.peak) this.peak = this.workingCount;
    } else if (isWorking(prev) && !isWorking(next)) {
      const since = this.workingSince.get(id);
      if (since != null) {
        this.agentSec += Math.max(0, ts - since); // guarded: a swept zombie closes at its last-seen ts
        this.workingSince.delete(id);
      }
      this.workingCount = Math.max(0, this.workingCount - 1);
      if (this.workingCount === 0 && this.anyWorkingSince != null) {
        const d = Math.max(0, ts - this.anyWorkingSince);
        this.handsOffSec += d;
        if (d > this.longestHandsOffSec) this.longestHandsOffSec = d;
        this.anyWorkingSince = null;
      }
    }
    // attention: a fresh pull into an alerting state, and a fresh stuck
    if (isAlerting(next) && !isAlerting(prev)) this.pulledIn++;
    if (next === "error" && prev !== "error") this.stuck++;
  }

  /** Create / update / delete one session from a single event. */
  apply(ev: AndonEvent): ApplyResult {
    const now = this.now();
    this.rollDay(now);

    const sid = String(ev.id ?? ev.agent ?? "agent").trim();
    if (!sid) return { ok: false, error: "missing id" };

    // Background-task delta: adjust the pending count, leave the base state
    // alone. Touches updated_at so a process whose foreground has stopped but
    // whose background is still running doesn't get swept as idle.
    if (ev.sub != null && ev.state == null) {
      const delta = Math.trunc(Number(ev.sub));
      if (!Number.isFinite(delta)) return { ok: false, error: "invalid sub delta" };
      const cur = this.sessions.get(sid);
      if (!cur) return { ok: true }; // nothing to attach to; ignore quietly
      this.sessions.set(sid, {
        ...cur,
        pending: Math.max(0, cur.pending + delta),
        updated_at: now,
      });
      return { ok: true };
    }

    const state = (ev.state ?? "").trim();

    if (state === "gone") {
      const prev = this.sessions.get(sid);
      const existed = this.sessions.delete(sid);
      // close an open working interval so the day tally stays honest
      if (prev) this.account(sid, prev.state, "gone", now);
      return { ok: true, removed: existed };
    }

    if (!VALID_STATES.has(state)) {
      return { ok: false, error: `invalid state: ${JSON.stringify(ev.state)}` };
    }

    if (!this.sessions.has(sid) && this.sessions.size >= this.maxSessions) {
      return { ok: false, error: "session limit reached" };
    }

    const prev = this.sessions.get(sid);
    const agent = ev.agent || prev?.agent || "agent";
    this.sessions.set(sid, {
      id: sid,
      agent,
      state: state as State,
      title: ev.title || prev?.title || agent,
      message: ev.message != null ? String(ev.message) : prev?.message ?? "",
      pending: prev?.pending ?? 0, // a state change never resets background work
      updated_at: now,
    });
    this.agentsSeen.add(sid);
    this.account(sid, prev?.state, state, now);
    return { ok: true };
  }

  /** Honest "today so far" tallies, including the currently-open intervals. */
  private today(now: number): Today {
    let agentSec = this.agentSec;
    // Math.max guards mirror the closed-interval paths in account() — a backwards
    // clock step (NTP correction / manual change) must never make an honest metric
    // go negative in the live snapshot.
    for (const since of this.workingSince.values()) agentSec += Math.max(0, now - since);
    let handsOff = this.handsOffSec;
    let longest = this.longestHandsOffSec;
    if (this.anyWorkingSince != null) {
      const d = Math.max(0, now - this.anyWorkingSince);
      handsOff += d;
      if (d > longest) longest = d;
    }
    return {
      agents: this.agentsSeen.size,
      agent_sec: Math.round(agentSec),
      hands_off_sec: Math.round(handsOff),
      longest_hands_off_sec: Math.round(longest),
      pulled_in: this.pulledIn,
      stuck: this.stuck,
      peak: this.peak,
      working_now: this.workingCount,
    };
  }

  /**
   * Snapshot in stable arrival order (Map preserves first-insertion order, and
   * updating a session never moves it). Display ordering is the BOARD's job — it
   * pins the alerting tiers to the top and keeps everything else in this stable
   * slot. Keeping one source of truth here means a card's position no longer
   * depends on whether you were watching when it started.
   */
  snapshot(): Snapshot {
    const now = this.now();
    this.rollDay(now);
    const items = [...this.sessions.values()].map((s) => ({ ...s }));
    return { server_time: now, sessions: items, today: this.today(now) };
  }

  /** Drop sessions older than the TTL. Returns how many were removed. */
  sweep(): number {
    const now = this.now();
    this.rollDay(now);
    const hardCutoff = now - this.ttlSec;
    const idleCutoff = now - this.idleTtlSec;
    let removed = 0;
    for (const [id, s] of this.sessions) {
      // quiescent = finished/idle with no background work — these age out early so a
      // torn-down team (whose teammates never sent a SessionEnd) doesn't leave a wall
      // of stale "ready" tiles. Active/alerting tiles wait for the full hard TTL.
      const quiescent = (s.state === "done" || s.state === "idle") && s.pending === 0;
      if (s.updated_at < hardCutoff || (quiescent && s.updated_at < idleCutoff)) {
        this.sessions.delete(id);
        // close any open working interval at the session's LAST-SEEN time, not
        // `now` — a process that died mid-"working" must not bank phantom
        // working-time for the (up to 6h) until we noticed and swept it.
        this.account(id, s.state, "gone", s.updated_at);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.sessions.size;
  }
}
