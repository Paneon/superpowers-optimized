import type { ExtensionAPI, AgentEndEvent } from './types';
import { runJsHook, readEnvelope, envelopeText } from './utils';

// Pi has no SubagentStop equivalent (no sub-agent concept) — the
// subagent-guard JS hook is intentionally not invoked from this extension.

// Path override supports the adapter test fixture. Real Pi installs never
// set this — they get the production stop-reminders.js.
const STOP_REMINDERS = process.env.PI_STOP_REMINDERS_SCRIPT || 'hooks/stop-reminders.js';

export function register(api: ExtensionAPI): void {
  api.on('agent_end', async (evt: AgentEndEvent) => {
    const payload: Record<string, unknown> = {
      session_id: evt.sessionId,
      cwd: evt.cwd ?? process.cwd(),
      last_assistant_message: evt.lastAssistantMessage,
    };

    try {
      const { stdout } = await runJsHook(STOP_REMINDERS, payload, { timeoutMs: 3000 });
      // stop-reminders historically returns the legacy {decision, reason}
      // envelope (see comment on the JS hook). envelopeText() consults
      // hookSpecificOutput.additionalContext, then reason, then falls back
      // to raw stdout when no JSON was emitted.
      const reminder = envelopeText(readEnvelope(stdout), stdout);
      if (reminder && api.injectReminder) {
        api.injectReminder(reminder);
      }
    } catch {
      // Reminder surfacing must not block session end.
    }
  });
}
