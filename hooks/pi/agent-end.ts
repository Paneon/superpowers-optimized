import type { ExtensionAPI, AgentEndEvent } from './types';
import { runJsHook, parseHookOutput } from './utils';

// Pi has no SubagentStop equivalent (no sub-agent concept) — the
// subagent-guard JS hook is intentionally not invoked from this extension.

const STOP_REMINDERS = 'hooks/stop-reminders.js';

export function register(api: ExtensionAPI): void {
  api.on('agent_end', async (evt: AgentEndEvent) => {
    const payload = {
      session_id: evt.sessionId,
      cwd: evt.cwd ?? process.cwd(),
      last_assistant_message: evt.lastAssistantMessage,
    };

    try {
      const { stdout } = await runJsHook(STOP_REMINDERS, payload, { timeoutMs: 3000 });
      const parsed = parseHookOutput(stdout);

      // stop-reminders historically writes the reminder text to stdout (Claude
      // surfaces it as a system reminder). It may also emit a JSON envelope
      // with hookSpecificOutput.additionalContext.
      const hookSpecific = parsed?.hookSpecificOutput as
        | { additionalContext?: string }
        | undefined;
      const reminder = hookSpecific?.additionalContext ?? (parsed === null ? stdout.trim() : null);

      if (reminder && api.injectReminder) {
        api.injectReminder(reminder);
      }
    } catch {
      // Reminder surfacing must not block session end.
    }
  });
}
