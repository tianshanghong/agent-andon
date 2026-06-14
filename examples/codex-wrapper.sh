# Agent Andon — Codex "working / gone" wrapper.
#
# Codex's notify only fires on turn-complete (green "done"); it never signals
# "started". This shell wrapper adds the blue "working" tile on launch and
# clears it on exit. Source it from ~/.zshrc or ~/.bashrc:
#
#     source /path/to/agent-andon/examples/codex-wrapper.sh
#
# Requires the `andon` CLI on your PATH (npm i -g agent-andon).

export AGENT_STATUS_URL="${AGENT_STATUS_URL:-http://127.0.0.1:8787}"

codex() {
  # Unique per-launch id so multiple codex sessions (even same dir) don't collide.
  local sid="codex-$$-$RANDOM"
  ANDON_SESSION="$sid" andon post working codex
  ANDON_SESSION="$sid" command codex "$@"
  local code=$?
  ANDON_SESSION="$sid" andon post gone codex
  return $code
}
