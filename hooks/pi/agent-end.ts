import type { ExtensionAPI, AgentEndEvent } from './types';
import { runJsHook, parseHookOutput } from './utils';

// Pi has no SubagentStop equivalent (no sub-agent concept) — the
// subagent-guard JS hook is intentionally not invoked from this extension.

// Path override supports the adapter test fixture. Real Pi installs never
// set this — they get the production stop-reminders.js.
const STOP_REMINDERS = process.env.PI_STOP_REMINDERS_SCRIPT || 'hooks/stop-reminders.js';

// Exported for unit testing of the envelope-extraction logic.
// hooks/stop-reminders.js returns { decision: 'block', reason } (legacy
// envelope used for broader version compat). Other hooks return
// { hookSpecificOutput: { additionalContext } }. A plain-text reminder is
// also surfaced when the script writes non-JSON to stdout.
export function extractReminder(stdout: string): string | null {
  const parsed = parseHookOutput(stdout);

  if (parsed) {
    const hookSpecific = parsed.hookSpecificOutput as
      | { additionalContext?: string }
      | undefined;
    if (typeof hookSpecific?.additionalContext === 'string' && hookSpecific.additionalContext) {
      return hookSpecific.additionalContext;
    }
    if (typeof parsed.reason === 'string' && parsed.reason) {
      return parsed.reason;
    }
    return null;
  }

  const trimmed = stdout.trim();
  return trimmed ? trimmed : null;
}

export function register(api: ExtensionAPI): void {
  api.on('agent_end', async (evt: AgentEndEvent) => {
    const payload = {
      session_id: evt.sessionId,
      cwd: evt.cwd ?? process.cwd(),
      last_assistant_message: evt.lastAssistantMessage,
    };

    try {
      const { stdout } = await runJsHook(STOP_REMINDERS, payload, { timeoutMs: 3000 });
      const reminder = extractReminder(stdout);
      if (reminder && api.injectReminder) {
        api.injectReminder(reminder);
      }
    } catch {
      // Reminder surfacing must not block session end.
    }
  });
}
