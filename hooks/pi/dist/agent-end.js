"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const utils_1 = require("./utils");
// Pi has no SubagentStop equivalent (no sub-agent concept) — the
// subagent-guard JS hook is intentionally not invoked from this extension.
const STOP_REMINDERS = 'hooks/stop-reminders.js';
function register(api) {
    api.on('agent_end', async (evt) => {
        const payload = {
            session_id: evt.sessionId,
            cwd: evt.cwd ?? process.cwd(),
            last_assistant_message: evt.lastAssistantMessage,
        };
        try {
            const { stdout } = await (0, utils_1.runJsHook)(STOP_REMINDERS, payload, { timeoutMs: 3000 });
            const parsed = (0, utils_1.parseHookOutput)(stdout);
            // stop-reminders historically writes the reminder text to stdout (Claude
            // surfaces it as a system reminder). It may also emit a JSON envelope
            // with hookSpecificOutput.additionalContext.
            const hookSpecific = parsed?.hookSpecificOutput;
            const reminder = hookSpecific?.additionalContext ?? (parsed === null ? stdout.trim() : null);
            if (reminder && api.injectReminder) {
                api.injectReminder(reminder);
            }
        }
        catch {
            // Reminder surfacing must not block session end.
        }
    });
}
