import type { ExtensionAPI, ToolResultEvent } from './types';
import { runJsHook } from './utils';

// Claude's PostToolUse fires on Edit|Write (track-edits.js) and on Skill
// (track-session-stats.js). Pi has no Skill tool — skill expansion is the
// `input` event, handled by hooks/pi/input.ts. Here we cover Edit/Write
// (track-edits) and Bash post-execution compression.

const TRACK_EDITS               = 'hooks/track-edits.js';
const POSTTOOL_BASH_COMPRESS    = 'hooks/codex/posttool-bash-compress-adapter.js';

const EDIT_TOOLS = new Set(['Edit', 'Write']);

export function register(api: ExtensionAPI): void {
  api.on('tool_result', async (evt: ToolResultEvent) => {
    const payload = {
      tool_name: evt.toolName,
      tool_input: evt.params,
      tool_response: evt.result,
      session_id: evt.sessionId,
      cwd: process.cwd(),
    };

    try {
      if (EDIT_TOOLS.has(evt.toolName)) {
        await runJsHook(TRACK_EDITS, payload, { timeoutMs: 2000 });
      } else if (evt.toolName === 'Bash') {
        await runJsHook(POSTTOOL_BASH_COMPRESS, payload, { timeoutMs: 2000 });
      }
    } catch {
      // Tracking failures must never block the agent loop.
    }
  });
}
