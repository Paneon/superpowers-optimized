"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumePendingSessionContext = consumePendingSessionContext;
exports.peekPendingSessionContext = peekPendingSessionContext;
exports.register = register;
const utils_1 = require("./utils");
// Pi's session_start has no documented return shape for context injection.
// We capture the assembled session context here and stash it; the
// before_agent_start handler consumes it on the next prompt and prepends
// it to the systemPrompt return (which Pi DOES honor for injection).
//
// On 'reload'/'resume'/'fork' the cache is refreshed.
const SESSION_START_HOOK = process.env.PI_SESSION_START_SCRIPT || 'hooks/codex/session-start-adapter.js';
let pendingSessionContext = null;
function consumePendingSessionContext() {
    const out = pendingSessionContext;
    pendingSessionContext = null;
    return out;
}
// Test helper — lets the dispatch test verify session_start cached something.
function peekPendingSessionContext() {
    return pendingSessionContext;
}
function register(api) {
    api.on('session_start', async (evt, ctx) => {
        const payload = {
            session_id: undefined,
            cwd: ctx.cwd ?? process.cwd(),
            source: evt.reason,
        };
        try {
            const { stdout } = await (0, utils_1.runJsHook)(SESSION_START_HOOK, payload, { timeoutMs: 8000 });
            const text = stdout.trim();
            if (text)
                pendingSessionContext = text;
        }
        catch {
            // Never block session startup.
        }
    });
}
