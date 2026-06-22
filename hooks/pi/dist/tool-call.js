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
// Script paths can be overridden via env for hermetic testing of edge cases
// (e.g., a fixture that emits a deny-with-updatedInput envelope). Real Pi
// installs never set these.
const PROTECT_SECRETS = process.env.PI_PROTECT_SECRETS_SCRIPT || 'hooks/safety/protect-secrets.js';
const BLOCK_DANGEROUS = process.env.PI_BLOCK_DANGEROUS_SCRIPT || 'hooks/safety/block-dangerous-commands.js';
const BASH_COMPRESS = process.env.PI_BASH_COMPRESS_SCRIPT || 'hooks/bash-compress-hook.js';
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
        const result = await (0, utils_1.runJsHook)(script, payload, { timeoutMs: 3000 });
        // Security-relevant: if the hook was killed by timeout or crashed, we
        // cannot trust its (possibly partial) stdout. The safe move is to
        // fail-closed at the caller — but that's the caller's policy, not
        // ours. We surface "no decision" (null) so the caller picks.
        if (result.timedOut || result.exitCode !== 0)
            return null;
        return readDecision(result.stdout);
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
            // 3) Bash compression rewrites the command. Today the hook only emits
            //    permissionDecision='allow' + updatedInput, but a future change
            //    (or a substitute compress hook) could emit 'deny' too. Check
            //    decision FIRST so a deny is never downgraded to allow.
            const compressDecision = await callHook(BASH_COMPRESS, payload);
            if (compressDecision?.permissionDecision === 'deny') {
                return { allow: false, reason: compressDecision.permissionDecisionReason ?? 'blocked by bash-compress-hook' };
            }
            if (compressDecision?.updatedInput) {
                return { allow: true, transformedParams: compressDecision.updatedInput };
            }
        }
        return; // Pass through unchanged.
    });
}
