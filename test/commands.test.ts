/** Pure mapping logic for the Claude hook and Codex notifier (no I/O). */
import { test } from "node:test";
import assert from "node:assert/strict";

// Keep label/session env from leaking into title/id assertions.
delete process.env.ANDON_LABEL;
delete process.env.ANDON_SESSION;

import { mapClaudeEvent } from "../src/commands/hook";
import { mapCodexHookEvent } from "../src/commands/codexhook";
import { menubarText } from "../src/menubar";
import { alertState } from "../src/alerts";
import { stripAndonFromSettings } from "../src/commands/uninstall";

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

test("claude: SessionStart -> idle, tile appears at launch", () => {
  const ev = mapClaudeEvent({ hook_event_name: "SessionStart", session_id: "s1", cwd: "/x/proj" });
  assert.equal(ev?.state, "idle");
  assert.equal(ev?.id, "s1");
  assert.equal(ev?.title, "proj");
});

test("claude: PostToolUse -> working (clears amber after an approval)", () => {
  const ev = mapClaudeEvent({ hook_event_name: "PostToolUse", session_id: "s1", cwd: "/x/proj" });
  assert.equal(ev?.state, "working");
  assert.equal(ev?.message, ""); // stale 'needs permission' text is cleared
});

test("claude: Notification -> waiting, carries message", () => {
  const ev = mapClaudeEvent({ hook_event_name: "Notification", message: "need perms" });
  assert.equal(ev?.state, "waiting");
  assert.equal(ev?.message, "need perms");
});

test("claude: a permission Notification -> waiting; an idle one is ignored", () => {
  // a real permission prompt still turns the tile amber
  assert.equal(
    mapClaudeEvent({ hook_event_name: "Notification", notification_type: "permission_prompt", message: "x" })?.state,
    "waiting",
  );
  // the ~60s idle reminder must NOT flip a finished (green) tile to amber
  assert.equal(mapClaudeEvent({ hook_event_name: "Notification", notification_type: "idle_prompt" }), null);
  assert.equal(mapClaudeEvent({ hook_event_name: "Notification", notification_type: "auth_success" }), null);
});

test("claude: SessionEnd -> gone", () => {
  assert.equal(mapClaudeEvent({ hook_event_name: "SessionEnd" })?.state, "gone");
});

test("claude: Notification permission_prompt -> precise 'needs approval' message", () => {
  const ev = mapClaudeEvent({
    hook_event_name: "Notification",
    session_id: "s1",
    notification_type: "permission_prompt",
    details: { tool_name: "Bash", tool_input: { command: "git push origin main" } },
  });
  assert.equal(ev?.state, "waiting");
  assert.equal(ev?.message, "needs approval: Bash(git push origin main)");
});

test("uninstall: strips only Andon hooks + statusLine, keeps the user's own", () => {
  const settings = {
    model: "opus",
    statusLine: { type: "command", command: '"node" "/x/dist/cli.js" statusline' },
    permissions: { allow: ["Read"], deny: ["Bash(rm:*)"] }, // the user's — must be untouched
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: "command", command: '"node" "/x/dist/cli.js" hook' }] },
        { hooks: [{ type: "command", command: "my-own-logger.sh" }] }, // user's — keep
      ],
      // a deprecated auto-approve hook from an old install — should still be cleaned up
      PreToolUse: [{ hooks: [{ type: "command", command: '"node" "/x/dist/cli.js" approve' }] }],
    },
  };
  const r = stripAndonFromSettings(settings);
  assert.equal(r.removedHooks, 2); // the hook + the stale approve hook
  assert.equal(r.removedStatusLine, true);
  assert.equal((r.settings as any).model, "opus"); // untouched
  assert.equal((r.settings as any).statusLine, undefined); // removed
  assert.equal((r.settings as any).hooks.PreToolUse, undefined); // emptied → key dropped
  // the user's permissions are never touched by Andon
  assert.deepEqual((r.settings as any).permissions, { allow: ["Read"], deny: ["Bash(rm:*)"] });
  // the user's own UserPromptSubmit hook survives
  const ups = (r.settings as any).hooks.UserPromptSubmit;
  assert.equal(ups.length, 1);
  assert.equal(ups[0].hooks[0].command, "my-own-logger.sh");
});

test("alerts: a done session with pending background tasks never fires a 'ready' banner", () => {
  const sess = (state: string, pending: number) =>
    ({ id: "a", agent: "claude", state, title: "x", message: "", pending, updated_at: 0 }) as any;
  assert.equal(alertState(sess("done", 0)), "done"); // truly finished → ready banner ok
  assert.equal(alertState(sess("done", 2)), "working"); // still draining → NOT done
  assert.equal(alertState(sess("waiting", 0)), "waiting");
  assert.equal(alertState(sess("error", 1)), "error"); // pending only masks done
});

test("menubar: summarises the most urgent state for a status bar", () => {
  const snap = {
    server_time: 0,
    sessions: [
      { id: "a", agent: "claude", state: "working" as const, title: "api", message: "", pending: 0, updated_at: 0 },
      { id: "b", agent: "codex", state: "waiting" as const, title: "site", message: "approve?", pending: 0, updated_at: 0 },
    ],
  };
  const out = menubarText(snap, 8787);
  assert.match(out.split("\n")[0]!, /🟠 1 need you/); // bar text = most urgent
  assert.match(out, /codex · site/); // dropdown lists the session
});

test("claude: unknown / missing event -> null", () => {
  assert.equal(mapClaudeEvent({ hook_event_name: "Whatever" }), null);
  assert.equal(mapClaudeEvent({}), null);
});


test("codex hooks: lifecycle events map to states, incl. amber needs-you", () => {
  assert.equal(mapCodexHookEvent({ hook_event_name: "SessionStart", session_id: "c1", cwd: "/x/api" })?.state, "idle");
  assert.equal(mapCodexHookEvent({ hook_event_name: "UserPromptSubmit", session_id: "c1" })?.state, "working");
  assert.equal(mapCodexHookEvent({ hook_event_name: "Stop", session_id: "c1" })?.state, "done");
  assert.equal(mapCodexHookEvent({ hook_event_name: "SessionEnd", session_id: "c1" })?.state, "gone");
  assert.equal(mapCodexHookEvent({ hook_event_name: "Whatever" }), null);
  // accept snake_case too (Codex's trust state uses session_start / pre_tool_use…)
  assert.equal(mapCodexHookEvent({ hook_event_name: "session_start", session_id: "c1" })?.state, "idle");
  assert.equal(mapCodexHookEvent({ hook_event_name: "user_prompt_submit", session_id: "c1" })?.state, "working");
  const ev = mapCodexHookEvent({
    hook_event_name: "PermissionRequest",
    session_id: "c1",
    cwd: "/x/api",
    tool_name: "Bash",
    tool_input: { command: "git push" },
  });
  assert.equal(ev?.state, "waiting"); // amber needs-you — newly possible on Codex
  assert.equal(ev?.agent, "codex");
  assert.equal(ev?.id, "c1");
  assert.equal(ev?.message, "needs approval: Bash(git push)");
});
