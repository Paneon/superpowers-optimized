#!/usr/bin/env node
// Fixture: emits a permissionDecision: 'ask' envelope. Real shipped JS
// hooks don't emit 'ask' yet, but Claude's contract supports it and Pi's
// ctx.ui.confirm() is the right surface — this fixture exercises the wiring.
'use strict';
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: 'fixture: ask propagation test',
  },
}));
