/**
 * Shared types and the single source of truth for state priority.
 *
 * The status palette IS the message: green/amber/red/blue each own a meaning,
 * and the iPad edge glows the most-urgent ("dominant") one on the board.
 */

/** A live agent status. */
export type State = "working" | "waiting" | "done" | "error" | "idle";

/** What a client may send. `gone` is a command: remove this session's tile. */
export type EventState = State | "gone";

/** Raw event posted to POST /event by a hook or the CLI. Intentionally loose. */
export interface AndonEvent {
  agent?: string;
  id?: string;
  state?: string;
  title?: string;
  message?: string;
  /**
   * Signed delta to a session's background-task count. Sent on its own (no
   * `state`) by a background workflow: +1 when it starts, -1 when it finishes.
   * Lets a card stay "running" until its background work actually drains, so
   * the agent finishing a *turn* (Stop) never falsely reads as "all done".
   */
  sub?: number;
}

/** A normalized, stored session — one tile on the board. */
export interface Session {
  id: string;
  agent: string;
  state: State;
  title: string;
  message: string;
  /** In-flight background tasks under this process. >0 ⇒ not really done. */
  pending: number;
  /** epoch seconds */
  updated_at: number;
}

/**
 * Honest, local-only "today so far" tallies — leverage + attention. Resets at
 * local midnight. Every field is a literal measured fact (counts and elapsed
 * seconds); NOTHING here is a "shipped/merged/completed" count, since a done/Stop
 * hook only means a turn was handed back, not that a task was delivered.
 */
export interface Today {
  /** distinct sessions seen today */
  agents: number;
  /** Σ of every session's time spent in `working` today (→ "agent-hours") */
  agent_sec: number;
  /** wall-clock today during which ≥1 session was working (you were free) */
  hands_off_sec: number;
  /** longest single hands-off stretch today */
  longest_hands_off_sec: number;
  /** times an agent needed you (entered waiting/error from a calm state) */
  pulled_in: number;
  /** times an agent hit `error` (subset of pulled_in) */
  stuck: number;
  /** max sessions working at once today */
  peak: number;
  /** sessions working right now */
  working_now: number;
}

/** The payload the dashboard polls from GET /state. */
export interface Snapshot {
  server_time: number;
  sessions: Session[];
  today: Today;
}

/**
 * Lower number = "more in need of your attention". The board border takes the
 * lowest (most urgent) state present. Mirrored verbatim in the dashboard JS.
 */
export const PRIORITY: Record<string, number> = {
  error: 0,
  waiting: 1,
  done: 2,
  working: 3,
  idle: 4,
};

/** States a tile can hold (excludes the `gone` delete-command). */
export const VALID_STATES: ReadonlySet<string> = new Set<State>([
  "error",
  "waiting",
  "done",
  "working",
  "idle",
]);
