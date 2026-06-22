"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const utils_1 = require("./utils");
// Reuses hooks/codex/user-prompt-submit-adapter.js — its output shape is
// { hookSpecificOutput: { additionalContext } } when there's context to inject,
// or {} otherwise.
const USER_PROMPT_HOOK = 'hooks/codex/user-prompt-submit-adapter.js';
function register(api) {
    api.on('before_agent_start', async (evt) => {
        if (!evt.prompt)
            return;
        const payload = {
            prompt: evt.prompt,
            cwd: evt.cwd ?? process.cwd(),
            session_id: evt.sessionId,
        };
        try {
            const { stdout } = await (0, utils_1.runJsHook)(USER_PROMPT_HOOK, payload, { timeoutMs: 4000 });
            const env = (0, utils_1.readEnvelope)(stdout);
            if (env?.additionalContext && api.injectContext) {
                api.injectContext(env.additionalContext);
            }
        }
        catch {
            // Never block prompt submission.
        }
    });
}
