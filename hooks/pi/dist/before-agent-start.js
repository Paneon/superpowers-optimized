"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const utils_1 = require("./utils");
const session_start_1 = require("./session-start");
// Reuses hooks/codex/user-prompt-submit-adapter.js to compute per-prompt
// routing/context. The hook emits the Claude shape
// { hookSpecificOutput: { additionalContext } } when there's context, or {}.
//
// Two sources of context can be appended to Pi's systemPrompt:
//   1. The pending session_start blob (one-shot, consumed on first prompt)
//   2. The skill-activator output (per-prompt)
const USER_PROMPT_HOOK = process.env.PI_USER_PROMPT_SCRIPT || 'hooks/codex/user-prompt-submit-adapter.js';
function register(api) {
    api.on('before_agent_start', async (evt, ctx) => {
        const sessionBlob = (0, session_start_1.consumePendingSessionContext)();
        let perPromptContext = null;
        if (evt.prompt) {
            const payload = {
                prompt: evt.prompt,
                cwd: ctx.cwd ?? process.cwd(),
            };
            try {
                const { stdout } = await (0, utils_1.runJsHook)(USER_PROMPT_HOOK, payload, { timeoutMs: 4000 });
                const env = (0, utils_1.readEnvelope)(stdout);
                if (env?.additionalContext)
                    perPromptContext = env.additionalContext;
            }
            catch {
                // Never block prompt submission.
            }
        }
        if (!sessionBlob && !perPromptContext)
            return;
        const existing = evt.systemPrompt ?? '';
        const additions = [sessionBlob, perPromptContext].filter(Boolean).join('\n\n');
        return { systemPrompt: existing ? `${existing}\n\n${additions}` : additions };
    });
}
