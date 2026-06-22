"use strict";
// Pi (pi.dev) extension entry-point for superpowers-optimized.
// Pi loads this file (compiled to dist/index.js) and calls the default
// export with its ExtensionAPI. We register subscribers for the lifecycle
// events that map to Claude Code's hook surface, with the JS hook bodies
// in hooks/*.js as the single source of truth (invoked via spawn from
// utils.ts). See docs/platforms/pi.md for the parity table.
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = superpowersOptimizedPi;
const session_start_1 = require("./session-start");
const before_agent_start_1 = require("./before-agent-start");
const tool_call_1 = require("./tool-call");
const tool_result_1 = require("./tool-result");
const agent_end_1 = require("./agent-end");
// Idempotency: a Pi extension reload (or any double-invocation of the
// factory) would otherwise add a second subscriber to every event,
// doubling JS-hook spawn counts and producing conflicting tool_call
// decisions. We stamp the ExtensionAPI with a sentinel and bail on
// re-entry.
const REGISTERED = Symbol.for('superpowers-optimized.pi.registered');
function superpowersOptimizedPi(api) {
    const stamped = api;
    if (stamped[REGISTERED])
        return;
    stamped[REGISTERED] = true;
    (0, session_start_1.register)(api);
    (0, before_agent_start_1.register)(api);
    (0, tool_call_1.register)(api);
    (0, tool_result_1.register)(api);
    (0, agent_end_1.register)(api);
}
