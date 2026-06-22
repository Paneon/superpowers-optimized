import type { ExtensionAPI, SessionStartEvent, ExtensionContext } from './types';
import { runJsHook } from './utils';

// Pi's session_start has no documented return shape for context injection.
// We capture the assembled session context here and stash it; the
// before_agent_start handler consumes it on the next prompt and prepends
// it to the systemPrompt return (which Pi DOES honor for injection).
//
// On 'reload'/'resume'/'fork' the cache is refreshed.

const SESSION_START_HOOK =
  process.env.PI_SESSION_START_SCRIPT || 'hooks/codex/session-start-adapter.js';

let pendingSessionContext: string | null = null;

export function consumePendingSessionContext(): string | null {
  const out = pendingSessionContext;
  pendingSessionContext = null;
  return out;
}

// Test helper — lets the dispatch test verify session_start cached something.
export function peekPendingSessionContext(): string | null {
  return pendingSessionContext;
}

export function register(api: ExtensionAPI): void {
  api.on('session_start', async (evt: SessionStartEvent, ctx: ExtensionContext) => {
    const payload: Record<string, unknown> = {
      session_id: undefined,
      cwd: ctx.cwd ?? process.cwd(),
      source: evt.reason,
    };

    try {
      const { stdout } = await runJsHook(SESSION_START_HOOK, payload, { timeoutMs: 8000 });
      const text = stdout.trim();
      if (text) pendingSessionContext = text;
    } catch {
      // Never block session startup.
    }
  });
}
