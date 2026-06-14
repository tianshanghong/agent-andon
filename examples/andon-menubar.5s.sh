#!/usr/bin/env bash
# Agent Andon — always-visible status in your desktop menu/status bar.
#
# macOS  : install SwiftBar (https://swiftbar.app) or xbar, then drop this file
#          in the plugin folder. The "5s" in the filename = refresh every 5s.
# Linux  : call the same endpoint from Waybar/polybar/argos, e.g.
#            curl -s http://127.0.0.1:8787/menubar | head -1
#
# It just renders the server's platform-neutral /menubar summary — no parsing,
# no jq. Set ANDON_URL (and append ?token=… if you run with a token).

ANDON_URL="${ANDON_URL:-http://127.0.0.1:8787}"
out="$(/usr/bin/curl -s --max-time 2 "$ANDON_URL/menubar" 2>/dev/null)"

if [ -z "$out" ]; then
  echo "🚦 –"
  echo "---"
  echo "andon offline | color=gray"
  echo "is 'andon serve' running? | href=$ANDON_URL"
  exit 0
fi

echo "$out"
