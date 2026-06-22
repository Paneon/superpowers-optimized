import type { ExtensionAPI, ToolCallEvent, ToolCallDecision } from './types';
import { runJsHook, parseHookOutput } from './utils';

// Dispatch order is intentional: secrets check first (blocks reads/writes of
// .env etc.), then dangerous-bash (blocks rm -rf /), then bash-compress
// (transforms passing commands). Each script speaks the Claude stdin/stdout
// contract — stdin: { tool_name, tool_input, session_id, cwd }; stdout:
// { hookSpecificOutput: { permissionDecision, permissionDecisionReason?, updatedInput? } }
// or {} for pass-through.

const PROTECT_SECRETS    = 'hooks/safety/protect-secrets.js';
const BLOCK_DANGEROUS    = 'hooks/safety/block-dangerous-commands.js';
const BASH_COMPRESS      = 'hooks/bash-compress-hook.js';

const SECRET_GUARDED_TOOLS = new Set(['Read', 'Edit', 'Write', 'Bash']);

interface HookSpecificOutput {
  permissionDecision?: 'allow' | 'deny';
  permissionDecisionReason?: string;
  updatedInput?: Record<string, unknown>;
}

function readDecision(stdout: string): HookSpecificOutput | null {
  const parsed = parseHookOutput(stdout);
  if (!parsed) return null;
  const hso = parsed.hookSpecificOutput;
  return hso && typeof hso === 'object' ? (hso as HookSpecificOutput) : null;
}

async function callHook(script: string, payload: object): Promise<HookSpecificOutput | null> {
  try {
    const { stdout } = await runJsHook(script, payload, { timeoutMs: 3000 });
    return readDecision(stdout);
  } catch {
    return null;
  }
}

export function register(api: ExtensionAPI): void {
  api.on('tool_call', async (evt: ToolCallEvent): Promise<ToolCallDecision | void> => {
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

    return;  // Pass through unchanged.
  });
}
