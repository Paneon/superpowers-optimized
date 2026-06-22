import type { ExtensionAPI, SessionStartEvent } from './types';
import { runJsHook } from './utils';

// Reuses hooks/codex/session-start-adapter.js as the JS body:
//   • Same payload contract (JSON on stdin: { session_id, cwd, source })
//   • Same output contract (plain text on stdout — full session context)
//   • Spawns hooks/context-engine.js asynchronously itself, so we don't need to.
const SESSION_START_HOOK = 'hooks/codex/session-start-adapter.js';

export function register(api: ExtensionAPI): void {
  api.on('session_start', async (evt: SessionStartEvent) => {
    const payload = {
      session_id: evt.sessionId,
      cwd: evt.cwd ?? process.cwd(),
      // Pi may or may not expose startup vs resume; default to startup.
      source: evt.source ?? 'startup',
    };

    try {
      const { stdout } = await runJsHook(SESSION_START_HOOK, payload, { timeoutMs: 8000 });
      const text = stdout.trim();
      if (text && api.injectContext) {
        api.injectContext(text);
      }
    } catch {
      // Never block session startup.
    }
  });
}
