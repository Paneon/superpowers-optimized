#!/usr/bin/env bash
# Loads the compiled Pi extension against a mocked ExtensionAPI and asserts
# all expected lifecycle subscribers are registered.
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

  const expected = ['session_start','before_agent_start','input','tool_call','tool_result','agent_end'];
  const missing = expected.filter(e => !api.handlers[e] || api.handlers[e].length === 0);
  if (missing.length) {
    console.error('FAIL: missing subscribers for:', missing.join(', '));
    process.exit(1);
  }

  const unexpected = ['subagent_stop','agent_start','message_start','message_end'];
  const present = unexpected.filter(e => api.handlers[e] && api.handlers[e].length > 0);
  if (present.length) {
    console.error('FAIL: out-of-scope subscribers registered:', present.join(', '));
    process.exit(1);
  }

  if (api.logCalls.length === 0) {
    console.error('FAIL: extension did not call api.log() (expected one load-confirmation log)');
    process.exit(1);
  }

  console.log('OK: ' + expected.length + ' subscribers registered, no out-of-scope subscribers');
"
