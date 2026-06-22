import type { ExtensionAPI, AgentEndEvent, ExtensionContext } from './types';
import { runJsHook, readEnvelope, envelopeText } from './utils';

// Pi has no SubagentStop equivalent (no sub-agent concept) — the
// subagent-guard JS hook is intentionally not invoked from this extension.
//
// agent_end has no documented return shape, so we cannot inject a reminder
// via the return value. Pi provides ctx.ui.notify() for transient
// notifications — we use it to surface stop-reminders. If ctx has no UI
// (headless mode), the reminder is silently dropped.

const STOP_REMINDERS = process.env.PI_STOP_REMINDERS_SCRIPT || 'hooks/stop-reminders.js';

export function register(api: ExtensionAPI): void {
  api.on('agent_end', async (evt: AgentEndEvent, ctx: ExtensionContext) => {
    const payload: Record<string, unknown> = {
      session_id: undefined,
      cwd: ctx.cwd ?? process.cwd(),
      messages: evt.messages,
    };

    try {
      const { stdout } = await runJsHook(STOP_REMINDERS, payload, { timeoutMs: 3000 });
      // stop-reminders historically returns the legacy {decision, reason}
      // envelope. envelopeText() consults additionalContext then reason,
      // falling back to raw stdout when no JSON was emitted.
      const reminder = envelopeText(readEnvelope(stdout), stdout);
      if (reminder && ctx.hasUI) {
        ctx.ui.notify(reminder, 'warning');
      }
    } catch {
      // Reminder surfacing must not block session end.
    }
  });
}
