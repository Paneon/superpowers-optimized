#!/usr/bin/env bash
# Loads the compiled Pi extension against a mocked ExtensionAPI and asserts
# the expected lifecycle subscribers are registered.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

DIST="$REPO/hooks/pi/dist/index.js"
if [ ! -f "$DIST" ]; then
  echo "FAIL: $DIST not built — run 'npm run build' first" >&2
  exit 1
fi

node -e "
  const { create } = require('$HERE/mocks/extension-api.js');
  const api = create();
  const factory = require('$DIST').default;
  if (typeof factory !== 'function') {
    console.error('FAIL: default export is not a function (got ' + typeof factory + ')');
    process.exit(1);
  }
  factory(api);

  // Five lifecycle subscribers expected. 'input' is intentionally NOT
  // registered — Pi does not surface skill-expansion on input, so
  // track-session-stats remains Claude-only (documented gap in
  // docs/platforms/pi.md).
  const expected = ['session_start','before_agent_start','tool_call','tool_result','agent_end'];
  const missing = expected.filter(e => !api.handlers[e] || api.handlers[e].length === 0);
  if (missing.length) {
    console.error('FAIL: missing subscribers for:', missing.join(', '));
    process.exit(1);
  }

  const unexpected = ['input','subagent_stop','agent_start','message_start','message_end'];
  const present = unexpected.filter(e => api.handlers[e] && api.handlers[e].length > 0);
  if (present.length) {
    console.error('FAIL: out-of-scope subscribers registered:', present.join(', '));
    process.exit(1);
  }

  console.log('OK: ' + expected.length + ' subscribers registered, no out-of-scope subscribers');
"
