/** Pure mapping logic for the Claude hook and Codex notifier (no I/O). */
import { test } from "node:test";
import assert from "node:assert/strict";

// Keep label/session env from leaking into title/id assertions.
delete process.env.ANDON_LABEL;
delete process.env.ANDON_SESSION;

import { mapClaudeEvent } from "../src/commands/hook";
import { mapCodexEvent } from "../src/commands/notify";

test("claude: UserPromptSubmit -> working, title from cwd, id from session", () => {
  const ev = mapClaudeEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "s1",
    cwd: "/x/proj",
  });
  assert.equal(ev?.state, "working");
  assert.equal(ev?.agent, "claude");
  assert.equal(ev?.id, "s1");
  assert.equal(ev?.title, "proj");
});

test("claude: Stop -> done, collapses whitespace in last_assistant_message", () => {
  const ev = mapClaudeEvent({
    hook_event_name: "Stop",
    session_id: "s1",
    cwd: "/x/proj",
    last_assistant_message: "  done\n  now  ",
  });
  assert.equal(ev?.state, "done");
  assert.equal(ev?.message, "done now");
});

test("claude: Notification -> waiting, carries message", () => {
  const ev = mapClaudeEvent({ hook_event_name: "Notification", message: "need perms" });
  assert.equal(ev?.state, "waiting");
  assert.equal(ev?.message, "need perms");
});

test("claude: SessionEnd -> gone", () => {
  assert.equal(mapClaudeEvent({ hook_event_name: "SessionEnd" })?.state, "gone");
});

test("claude: unknown / missing event -> null", () => {
  assert.equal(mapClaudeEvent({ hook_event_name: "Whatever" }), null);
  assert.equal(mapClaudeEvent({}), null);
});

test("codex: agent-turn-complete -> done, hyphenated fields parsed", () => {
  const ev = mapCodexEvent(
    JSON.stringify({
      type: "agent-turn-complete",
      cwd: "/x/site",
      "thread-id": "t9",
      "last-assistant-message": "built it",
    }),
  );
  assert.equal(ev?.state, "done");
  assert.equal(ev?.agent, "codex");
  assert.equal(ev?.id, "t9");
  assert.equal(ev?.title, "site");
  assert.equal(ev?.message, "built it");
});

test("codex: snake_case fields also parsed (version tolerance)", () => {
  const ev = mapCodexEvent(
    JSON.stringify({ type: "agent-turn-complete", cwd: "/x/site", last_assistant_message: "snake" }),
  );
  assert.equal(ev?.message, "snake");
});

test("codex: non-turn-complete, bad json, missing arg -> null", () => {
  assert.equal(mapCodexEvent(JSON.stringify({ type: "other" })), null);
  assert.equal(mapCodexEvent("not json"), null);
  assert.equal(mapCodexEvent(undefined), null);
});
