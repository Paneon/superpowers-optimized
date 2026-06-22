"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const utils_1 = require("./utils");
// Dispatch order: secrets first, then dangerous-bash, then bash-compress.
// Pi's contract:
//   - return undefined → pass through
//   - return { block: true, reason? } → block (Pi shows the reason to the user)
//   - mutate evt.input in place → patch tool args before execution
//   - no "transformedParams" field — mutation is the patch path
// 'ask' decisions go through ctx.ui.confirm(); the boolean answer maps to
// pass-through (confirmed) or block (denied).
//
// Script paths can be overridden via env for hermetic testing.
const PROTECT_SECRETS = process.env.PI_PROTECT_SECRETS_SCRIPT || 'hooks/safety/protect-secrets.js';
const BLOCK_DANGEROUS = process.env.PI_BLOCK_DANGEROUS_SCRIPT || 'hooks/safety/block-dangerous-commands.js';
const BASH_COMPRESS = process.env.PI_BASH_COMPRESS_SCRIPT || 'hooks/bash-compress-hook.js';
const SECRET_GUARDED_TOOLS = new Set(['Read', 'Edit', 'Write', 'Bash']);
async function callHook(script, payload) {
    try {
        const result = await (0, utils_1.runJsHook)(script, payload, { timeoutMs: 3000 });
        // Security-relevant: if the hook was killed by timeout or crashed, we
        // cannot trust its (possibly partial) stdout. Surface "no decision"
        // (null) so the caller picks the policy.
        if (result.timedOut || result.exitCode !== utils_1.HOOK_EXIT.OK)
            return null;
        return (0, utils_1.readEnvelope)(result.stdout);
    }
    catch {
        return null;
    }
}
function block(env, fallbackReason) {
    return { block: true, reason: env.permissionDecisionReason ?? fallbackReason };
}
async function resolveAsk(env, ctx, fallbackTitle) {
    // Pi has ctx.ui.confirm() — wire 'ask' to a real prompt. If ctx has no UI
    // (e.g., headless mode), default to block (fail-closed for security hooks).
    if (!ctx.hasUI) {
        return { block: true, reason: env.permissionDecisionReason ?? `${fallbackTitle} (no UI available to confirm)` };
    }
    const ok = await ctx.ui.confirm(fallbackTitle, env.permissionDecisionReason ?? 'Continue?');
    return ok ? undefined : { block: true, reason: 'user declined' };
}
function register(api) {
    api.on('tool_call', async (evt, ctx) => {
        const payload = {
            tool_name: evt.toolName,
            tool_input: evt.input,
            session_id: evt.toolCallId,
            cwd: ctx.cwd ?? process.cwd(),
        };
        // 1) Secrets first — Read/Edit/Write/Bash.
        if (SECRET_GUARDED_TOOLS.has(evt.toolName)) {
            const env = await callHook(PROTECT_SECRETS, payload);
            if (env?.permissionDecision === 'deny')
                return block(env, 'blocked by protect-secrets');
            if (env?.permissionDecision === 'ask') {
                const res = await resolveAsk(env, ctx, 'Sensitive operation');
                if (res)
                    return res;
            }
        }
        // 2) Dangerous-bash blocker.
        if (evt.toolName === 'Bash') {
            const dangerEnv = await callHook(BLOCK_DANGEROUS, payload);
            if (dangerEnv?.permissionDecision === 'deny')
                return block(dangerEnv, 'blocked by block-dangerous-commands');
            if (dangerEnv?.permissionDecision === 'ask') {
                const res = await resolveAsk(dangerEnv, ctx, 'Dangerous command');
                if (res)
                    return res;
            }
            // 3) Bash compression rewrites the command. Today the hook only emits
            //    permissionDecision='allow' + updatedInput, but a future change
            //    could emit 'deny' or 'ask'. Check deny FIRST.
            const compressEnv = await callHook(BASH_COMPRESS, payload);
            if (compressEnv?.permissionDecision === 'deny')
                return block(compressEnv, 'blocked by bash-compress-hook');
            if (compressEnv?.permissionDecision === 'ask') {
                const res = await resolveAsk(compressEnv, ctx, 'Confirm command rewrite');
                if (res)
                    return res;
            }
            // Apply the command rewrite by mutating evt.input in place — Pi's
            // documented patch mechanism for tool_call.
            if (compressEnv?.updatedInput) {
                const updated = compressEnv.updatedInput;
                for (const k of Object.keys(updated)) {
                    evt.input[k] = updated[k];
                }
            }
        }
        return; // Pass through unchanged.
    });
}
