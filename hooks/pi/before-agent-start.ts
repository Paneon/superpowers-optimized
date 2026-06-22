import type { ExtensionAPI, BeforeAgentStartEvent } from './types';
import { runJsHook, parseHookOutput } from './utils';

// Reuses hooks/codex/user-prompt-submit-adapter.js — its output shape is
// { hookSpecificOutput: { additionalContext } } when there's context to inject,
// or {} otherwise.
const USER_PROMPT_HOOK = 'hooks/codex/user-prompt-submit-adapter.js';

export function register(api: ExtensionAPI): void {
  api.on('before_agent_start', async (evt: BeforeAgentStartEvent) => {
    if (!evt.prompt) return;

    const payload = {
      prompt: evt.prompt,
      cwd: evt.cwd ?? process.cwd(),
      session_id: evt.sessionId,
    };

    try {
      const { stdout } = await runJsHook(USER_PROMPT_HOOK, payload, { timeoutMs: 4000 });
      const parsed = parseHookOutput(stdout);
      const hookSpecific = parsed?.hookSpecificOutput as
        | { additionalContext?: string }
        | undefined;
      const additionalContext = hookSpecific?.additionalContext;
      if (additionalContext && api.injectContext) {
        api.injectContext(additionalContext);
      }
    } catch {
      // Never block prompt submission.
    }
  });
}
