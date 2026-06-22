"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const utils_1 = require("./utils");
// Pi has no SubagentStop equivalent (no sub-agent concept) — the
// subagent-guard JS hook is intentionally not invoked from this extension.
//
// agent_end has no documented return shape, so we cannot inject a reminder
// via the return value. Pi provides ctx.ui.notify() for transient
// notifications — we use it to surface stop-reminders. If ctx has no UI
// (headless mode), the reminder is silently dropped.
const STOP_REMINDERS = process.env.PI_STOP_REMINDERS_SCRIPT || 'hooks/stop-reminders.js';
function register(api) {
    api.on('agent_end', async (evt, ctx) => {
        const payload = {
            session_id: undefined,
            cwd: ctx.cwd ?? process.cwd(),
            messages: evt.messages,
        };
        try {
            const { stdout } = await (0, utils_1.runJsHook)(STOP_REMINDERS, payload, { timeoutMs: 3000 });
            // stop-reminders historically returns the legacy {decision, reason}
            // envelope. envelopeText() consults additionalContext then reason,
            // falling back to raw stdout when no JSON was emitted.
            const reminder = (0, utils_1.envelopeText)((0, utils_1.readEnvelope)(stdout), stdout);
            if (reminder && ctx.hasUI) {
                ctx.ui.notify(reminder, 'warning');
            }
        }
        catch {
            // Reminder surfacing must not block session end.
        }
    });
}
