#!/usr/bin/env bash
# Smoke-test the symlinked install path documented in .pi/INSTALL.md.
# Builds a fake $HOME/.pi/agent/ in a temp dir, runs the macOS symlink
# commands from the doc against the repo, then asserts:
#   - skills resolve through the skills symlink
#   - the compiled extension loads through the extensions symlink and
#     registers the expected lifecycle subscribers
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

TMP="$(mktemp -d -t pi-install-smoke-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

# Mirror the doc's commands, but rooted at $TMP instead of $HOME.
mkdir -p "$TMP/.pi/agent/skills"
ln -s "$REPO/skills" "$TMP/.pi/agent/skills/superpowers-optimized"

mkdir -p "$TMP/.pi/agent/extensions"
ln -s "$REPO/hooks/pi/dist" "$TMP/.pi/agent/extensions/superpowers-optimized"

# --- Skills discovery ---
for s in using-superpowers brainstorming test-driven-development verification-before-completion; do
  if [ ! -f "$TMP/.pi/agent/skills/superpowers-optimized/$s/SKILL.md" ]; then
    echo "FAIL: skill missing through symlink: $s" >&2
    exit 1
  fi
done

# Validate frontmatter on the resolved set (catches symlink + content drift).
"$HERE/validate-skill-frontmatter.sh" "$TMP/.pi/agent/skills/superpowers-optimized" >/dev/null

# --- Extension discovery + load through symlink ---
EXT_PATH="$TMP/.pi/agent/extensions/superpowers-optimized/index.js"
if [ ! -f "$EXT_PATH" ]; then
  echo "FAIL: extension index.js missing through symlink: $EXT_PATH" >&2
  exit 1
fi

node -e "
  const { create } = require('$HERE/mocks/extension-api.js');
  const api = create();
  const factory = require('$EXT_PATH').default;
  if (typeof factory !== 'function') { console.error('FAIL: default export not a function'); process.exit(1); }
  factory(api);
  const want = ['session_start','before_agent_start','input','tool_call','tool_result','agent_end'];
  const missing = want.filter(e => !api.handlers[e] || api.handlers[e].length === 0);
  if (missing.length) { console.error('FAIL: missing through symlink:', missing.join(',')); process.exit(1); }
"

echo "OK: install layout resolves through symlinks"
