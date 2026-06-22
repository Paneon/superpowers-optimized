"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const utils_1 = require("./utils");
// Pi expands skills via the `input` event. To preserve Claude's session-stats
// counter (which is wired to PostToolUse(Skill) there), we listen for
// skill-expansion signals on `input` here. If Pi's runtime does not surface
// a skill-expansion field, this handler simply no-ops — session stats stay
// Claude-only and the docs/platforms/pi.md gap is recorded.
const TRACK_SESSION_STATS = 'hooks/track-session-stats.js';
function register(api) {
    api.on('input', async (evt) => {
        if (!evt.skillExpansion?.skill)
            return;
        const payload = {
            tool_name: 'Skill',
            tool_input: { skill: evt.skillExpansion.skill },
            session_id: evt.sessionId,
        };
        try {
            await (0, utils_1.runJsHook)(TRACK_SESSION_STATS, payload, { timeoutMs: 2000 });
        }
        catch {
            // Stats failures never block.
        }
    });
}
