// Pi (pi.dev) extension entry-point for superpowers-optimized.
// Pi loads this file (compiled to dist/index.js) and calls the default
// export with its ExtensionAPI. We register subscribers for the lifecycle
// events that map to Claude Code's hook surface, with the JS hook bodies
// in hooks/*.js as the single source of truth (invoked via spawn from
// utils.ts). See docs/platforms/pi.md for the parity table.

import type { ExtensionAPI } from './types';
import { register as registerSessionStart }     from './session-start';
import { register as registerBeforeAgentStart } from './before-agent-start';
import { register as registerToolCall }         from './tool-call';
import { register as registerToolResult }       from './tool-result';
import { register as registerAgentEnd }         from './agent-end';

// Idempotency: a Pi extension reload (or any double-invocation of the
// factory) would otherwise add a second subscriber to every event,
// doubling JS-hook spawn counts and producing conflicting tool_call
// decisions. We stamp the ExtensionAPI with a sentinel and bail on
// re-entry.
const REGISTERED = Symbol.for('superpowers-optimized.pi.registered');

export default function superpowersOptimizedPi(api: ExtensionAPI): void {
  const stamped = api as ExtensionAPI & { [REGISTERED]?: boolean };
  if (stamped[REGISTERED]) return;
  stamped[REGISTERED] = true;

  registerSessionStart(api);
  registerBeforeAgentStart(api);
  registerToolCall(api);
  registerToolResult(api);
  registerAgentEnd(api);
}
