import type { ExtensionAPI, ToolResultEvent } from './types';
import { runJsHook, parseHookOutput } from './utils';

// Claude's PostToolUse fires on Edit|Write (track-edits.js) and on Skill
// (track-session-stats.js). Pi has no Skill tool — skill expansion is the
// `input` event, handled by hooks/pi/input.ts. Here we cover Edit/Write
// (track-edits) and Bash post-execution compression.
//
// Note on Bash post-execution compression: Claude/Codex replace the tool's
// output stream with the compressed text. Pi's tool_result event has no
// return path to mutate the result Pi already gave the agent, so we
// surface the compressed summary via api.injectContext — the agent sees
// the summary as supplemental context alongside (not in place of) the
// original output. docs/platforms/pi.md notes this is ⚠️ context-only on Pi.

// Script paths can be overridden via env for hermetic testing. Real
// Pi installs never set these.
const TRACK_EDITS            = process.env.PI_TRACK_EDITS_SCRIPT            || 'hooks/track-edits.js';
const POSTTOOL_BASH_COMPRESS = process.env.PI_POSTTOOL_BASH_COMPRESS_SCRIPT || 'hooks/codex/posttool-bash-compress-adapter.js';

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
        return;
      }

      if (evt.toolName === 'Bash') {
        const { stdout } = await runJsHook(POSTTOOL_BASH_COMPRESS, payload, { timeoutMs: 2000 });
        const parsed = parseHookOutput(stdout);

        // posttool-bash-compress emits { decision, reason, hookSpecificOutput.additionalContext }
        // when it has a compressed replacement. Surface either form via injectContext.
        const hookSpecific = parsed?.hookSpecificOutput as
          | { additionalContext?: string }
          | undefined;
        const compressed =
          (typeof hookSpecific?.additionalContext === 'string' && hookSpecific.additionalContext) ||
          (typeof parsed?.reason === 'string' ? parsed.reason : null);
        if (compressed && api.injectContext) {
          api.injectContext(compressed);
        }
      }
    } catch {
      // Tracking failures must never block the agent loop.
    }
  });
}
