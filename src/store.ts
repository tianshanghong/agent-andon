/**
 * In-memory session store. Pure logic, no I/O — so it is trivially testable.
 *
 * Concurrency note: Node runs this single-threaded, so unlike the Python
 * prototype no lock is needed. Each HTTP callback runs to completion.
 */
import {
  PRIORITY,
  VALID_STATES,
  type AndonEvent,
  type Session,
  type Snapshot,
  type State,
} from "./types";

/** Any session untouched for this long is swept (a process died without cleanup). */
export const HARD_TTL_SEC = 6 * 3600;

/** Hard cap so a misbehaving/abusive client can't grow the board unbounded. */
export const MAX_SESSIONS = 200;

export interface ApplyResult {
  ok: boolean;
  error?: string;
  removed?: boolean;
}

export class SessionStore {
  private sessions = new Map<string, Session>();

  constructor(
    private readonly now: () => number = () => Date.now() / 1000,
    private readonly maxSessions: number = MAX_SESSIONS,
    private readonly ttlSec: number = HARD_TTL_SEC,
  ) {}

  /** Create / update / delete one session from a single event. */
  apply(ev: AndonEvent): ApplyResult {
    const sid = String(ev.id ?? ev.agent ?? "agent").trim();
    if (!sid) return { ok: false, error: "missing id" };

    const state = (ev.state ?? "").trim();

    if (state === "gone") {
      const existed = this.sessions.delete(sid);
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
      updated_at: this.now(),
    });
    return { ok: true };
  }

  /** Snapshot, sorted by priority then most-recent — exactly what the board renders. */
  snapshot(): Snapshot {
    const items = [...this.sessions.values()].map((s) => ({ ...s }));
    items.sort(
      (a, b) =>
        (PRIORITY[a.state] ?? 9) - (PRIORITY[b.state] ?? 9) ||
        b.updated_at - a.updated_at,
    );
    return { server_time: this.now(), sessions: items };
  }

  /** Drop sessions older than the TTL. Returns how many were removed. */
  sweep(): number {
    const cutoff = this.now() - this.ttlSec;
    let removed = 0;
    for (const [id, s] of this.sessions) {
      if (s.updated_at < cutoff) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.sessions.size;
  }
}
