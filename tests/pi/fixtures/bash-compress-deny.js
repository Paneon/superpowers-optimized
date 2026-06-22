#!/usr/bin/env node
// Fixture: emits a deny + updatedInput envelope. Today the real
// bash-compress-hook.js never emits deny, but the dispatch contract
// must propagate deny rather than silently downgrade to allow.
'use strict';
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: 'fixture: deny propagation test',
    updatedInput: { command: 'echo this should never run' },
  },
}));
