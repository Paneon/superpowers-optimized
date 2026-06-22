import type {
  ExtensionAPI, ToolResultEvent, ToolResultReturn, ExtensionContext,
} from './types';
import { runJsHook, readEnvelope, envelopeText } from './utils';

// Pi's tool_result return shape is a partial patch: { content?, details?, isError? }.
// Pi MERGES these fields into the tool result the agent then sees. So
// PostToolUse(Bash) smart-compression DOES work on Pi — we return
// { content: <compressed> } to replace the verbose output.
//
// Script paths can be overridden via env for hermetic testing.
const TRACK_EDITS            = process.env.PI_TRACK_EDITS_SCRIPT            || 'hooks/track-edits.js';
const POSTTOOL_BASH_COMPRESS = process.env.PI_POSTTOOL_BASH_COMPRESS_SCRIPT || 'hooks/codex/posttool-bash-compress-adapter.js';

const EDIT_TOOLS = new Set(['Edit', 'Write']);

export function register(api: ExtensionAPI): void {
  api.on('tool_result', async (
    evt: ToolResultEvent,
    ctx: ExtensionContext,
  ): Promise<ToolResultReturn | void> => {
    const payload: Record<string, unknown> = {
      tool_name: evt.toolName,
      tool_input: evt.input,
      tool_response: { stdout: evt.content, isError: evt.isError, details: evt.details },
      session_id: evt.toolCallId,
      cwd: ctx.cwd ?? process.cwd(),
    };

    try {
      if (EDIT_TOOLS.has(evt.toolName)) {
        // Tracking is observational — fire-and-forget, never patch.
        await runJsHook(TRACK_EDITS, payload, { timeoutMs: 2000 });
        return;
      }

      if (evt.toolName === 'Bash') {
        const { stdout } = await runJsHook(POSTTOOL_BASH_COMPRESS, payload, { timeoutMs: 2000 });
        // Hook emits either { hookSpecificOutput: { additionalContext } } or
        // legacy { decision, reason }. envelopeText picks the first source;
        // '' as rawStdout means we DO NOT surface non-JSON output here.
        const compressed = envelopeText(readEnvelope(stdout));
        if (compressed) {
          return { content: compressed };
        }
      }
    } catch {
      // Tracking failures must never block the agent loop.
    }
    return;
  });
}
