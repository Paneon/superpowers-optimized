// Pi (pi.dev) extension entry-point for superpowers-optimized.
// Pi loads this file (compiled to dist/index.js) and calls the default export
// with its ExtensionAPI. We register subscribers for the lifecycle events that
// map to Claude Code's hook surface, with the JS hook bodies in hooks/*.js as
// the single source of truth (invoked via spawn from utils.ts).

import type { ExtensionAPI } from './types';
import { register as registerSessionStart }     from './session-start';
import { register as registerBeforeAgentStart } from './before-agent-start';
import { register as registerInput }            from './input';
import { register as registerToolCall }         from './tool-call';
import { register as registerToolResult }       from './tool-result';
import { register as registerAgentEnd }         from './agent-end';

export default function superpowersOptimizedPi(api: ExtensionAPI): void {
  registerSessionStart(api);
  registerBeforeAgentStart(api);
  registerInput(api);
  registerToolCall(api);
  registerToolResult(api);
  registerAgentEnd(api);
  api.log?.('superpowers-optimized: Pi extension loaded');
}
