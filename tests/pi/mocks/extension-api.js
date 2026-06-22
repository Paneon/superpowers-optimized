'use strict';

// Minimal stand-in for Pi's ExtensionAPI used by hermetic tests.
// Records all subscriber registrations, log calls, and surface calls
// so tests can assert what the extension did without a real Pi runtime.

function create() {
  const handlers = Object.create(null);
  const logCalls = [];
  const contextInjections = [];
  const reminderInjections = [];

  const api = {
    handlers,
    logCalls,
    contextInjections,
    reminderInjections,

    on(event, handler) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },

    log(msg) {
      logCalls.push(String(msg));
    },

    injectContext(text) {
      contextInjections.push(String(text));
    },

    injectReminder(text) {
      reminderInjections.push(String(text));
    },

    // Test helper: drive an event through registered handlers and collect
    // their return values (used to assert tool_call decisions).
    //
    // NOTE: `fire()` is test-only and intentionally outside the production
    // ExtensionAPI interface in hooks/pi/types.ts. The real Pi runtime
    // dispatches events; our adapters never call `api.fire`.
    async fire(event, payload) {
      const hs = handlers[event] || [];
      const results = [];
      for (const h of hs) {
        results.push(await Promise.resolve(h(payload)));
      }
      return results;
    },
  };

  return api;
}

module.exports = { create };
