"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const utils_1 = require("./utils");
// Pi has no SubagentStop equivalent (no sub-agent concept) — the
// subagent-guard JS hook is intentionally not invoked from this extension.
// Path override supports the adapter test fixture. Real Pi installs never
// set this — they get the production stop-reminders.js.
const STOP_REMINDERS = process.env.PI_STOP_REMINDERS_SCRIPT || 'hooks/stop-reminders.js';
function register(api) {
    api.on('agent_end', async (evt) => {
        const payload = {
            session_id: evt.sessionId,
            cwd: evt.cwd ?? process.cwd(),
            last_assistant_message: evt.lastAssistantMessage,
        };
        try {
            const { stdout } = await (0, utils_1.runJsHook)(STOP_REMINDERS, payload, { timeoutMs: 3000 });
            // stop-reminders historically returns the legacy {decision, reason}
            // envelope (see comment on the JS hook). envelopeText() consults
            // hookSpecificOutput.additionalContext, then reason, then falls back
            // to raw stdout when no JSON was emitted.
            const reminder = (0, utils_1.envelopeText)((0, utils_1.readEnvelope)(stdout), stdout);
            if (reminder && api.injectReminder) {
                api.injectReminder(reminder);
            }
        }
        catch {
            // Reminder surfacing must not block session end.
        }
    });
}
