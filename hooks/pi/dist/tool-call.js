"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const utils_1 = require("./utils");
// Dispatch order is intentional: secrets check first (blocks reads/writes of
// .env etc.), then dangerous-bash (blocks rm -rf /), then bash-compress
// (transforms passing commands). Each script speaks the Claude stdin/stdout
// contract — stdin: { tool_name, tool_input, session_id, cwd }; stdout:
// { hookSpecificOutput: { permissionDecision, permissionDecisionReason?, updatedInput? } }
// or {} for pass-through.
const PROTECT_SECRETS = 'hooks/safety/protect-secrets.js';
const BLOCK_DANGEROUS = 'hooks/safety/block-dangerous-commands.js';
const BASH_COMPRESS = 'hooks/bash-compress-hook.js';
const SECRET_GUARDED_TOOLS = new Set(['Read', 'Edit', 'Write', 'Bash']);
function readDecision(stdout) {
    const parsed = (0, utils_1.parseHookOutput)(stdout);
    if (!parsed)
        return null;
    const hso = parsed.hookSpecificOutput;
    return hso && typeof hso === 'object' ? hso : null;
}
async function callHook(script, payload) {
    try {
        const { stdout } = await (0, utils_1.runJsHook)(script, payload, { timeoutMs: 3000 });
        return readDecision(stdout);
    }
    catch {
        return null;
    }
}
function register(api) {
    api.on('tool_call', async (evt) => {
        const payload = {
            tool_name: evt.toolName,
            tool_input: evt.params,
            session_id: evt.sessionId,
            cwd: process.cwd(),
        };
        // 1) Secrets first — covers Read/Edit/Write/Bash.
        if (SECRET_GUARDED_TOOLS.has(evt.toolName)) {
            const secretDecision = await callHook(PROTECT_SECRETS, payload);
            if (secretDecision?.permissionDecision === 'deny') {
                return { allow: false, reason: secretDecision.permissionDecisionReason ?? 'blocked by protect-secrets' };
            }
        }
        // 2) Dangerous-bash blocker.
        if (evt.toolName === 'Bash') {
            const dangerDecision = await callHook(BLOCK_DANGEROUS, payload);
            if (dangerDecision?.permissionDecision === 'deny') {
                return { allow: false, reason: dangerDecision.permissionDecisionReason ?? 'blocked by block-dangerous-commands' };
            }
            // 3) Bash compression rewrites the command. Carries permissionDecision='allow' + updatedInput.
            const compressDecision = await callHook(BASH_COMPRESS, payload);
            if (compressDecision?.updatedInput) {
                return { allow: true, transformedParams: compressDecision.updatedInput };
            }
        }
        return; // Pass through unchanged.
    });
}
