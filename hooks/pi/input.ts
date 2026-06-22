import type { ExtensionAPI, InputEvent } from './types';
import { runJsHook } from './utils';

// Pi expands skills via the `input` event. To preserve Claude's session-stats
// counter (which is wired to PostToolUse(Skill) there), we listen for
// skill-expansion signals on `input` here. If Pi's runtime does not surface
// a skill-expansion field, this handler simply no-ops — session stats stay
// Claude-only and the docs/platforms/pi.md gap is recorded.

const TRACK_SESSION_STATS = 'hooks/track-session-stats.js';

export function register(api: ExtensionAPI): void {
  api.on('input', async (evt: InputEvent) => {
    if (!evt.skillExpansion?.skill) return;

    const payload: Record<string, unknown> = {
      tool_name: 'Skill',
      tool_input: { skill: evt.skillExpansion.skill },
      session_id: evt.sessionId,
    };

    try {
      await runJsHook(TRACK_SESSION_STATS, payload, { timeoutMs: 2000 });
    } catch {
      // Stats failures never block.
    }
  });
}
