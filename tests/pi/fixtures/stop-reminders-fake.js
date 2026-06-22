#!/usr/bin/env node
// Fixture: emits the legacy {decision, reason} envelope that the real
// hooks/stop-reminders.js writes. Used to verify the Pi agent_end adapter
// surfaces the reminder via api.injectReminder.
'use strict';
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: '<stop-hook-reminders>\nFAKE REMINDER for adapter test\n</stop-hook-reminders>',
}));
