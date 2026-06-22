#!/usr/bin/env node
// Fixture: emits the compress envelope unconditionally (real hook only
// emits when output is long enough and matches a compression rule).
'use strict';
process.stdout.write(JSON.stringify({
  decision: 'block',
  continue: false,
  reason: '[compressed: 100->5 lines | fixture]',
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: '[compressed: 100->5 lines | fixture]',
  },
}));
