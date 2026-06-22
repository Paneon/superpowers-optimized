'use strict';

// Hermetic stand-in for Pi's ExtensionAPI + ExtensionContext.
// Records subscriber registrations and every ctx surface call so tests
// can assert side effects. `fire()` is test-only and intentionally
// outside the production ExtensionAPI interface in hooks/pi/types.ts.

function create({ confirmAnswer = true, cwd = process.cwd() } = {}) {
  const handlers = Object.create(null);
  const logCalls = [];
  const notifications = [];        // ctx.ui.notify(...)
  const confirms = [];             // ctx.ui.confirm(...) — calls recorded
  const statusCalls = [];          // ctx.ui.setStatus(...)

  const ctx = {
    cwd,
    mode: 'tui',
    hasUI: true,
    ui: {
      confirm(title, message) {
        confirms.push({ title, message });
        const answer = typeof confirmAnswer === 'function'
          ? confirmAnswer(title, message)
          : confirmAnswer;
        return Promise.resolve(Boolean(answer));
      },
      notify(message, level) {
        notifications.push({ message: String(message), level: level || 'info' });
      },
      setStatus(key, text) {
        statusCalls.push({ key, text: String(text) });
      },
    },
  };

  const api = {
    handlers,
    logCalls,
    notifications,
    confirms,
    statusCalls,
    ctx,

    on(event, handler) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },

    log(msg) {
      logCalls.push(String(msg));
    },

    // Test helper: drive an event through registered handlers and collect
    // their return values (used to assert tool_call / tool_result patches).
    //
    // NOTE: `fire()` is test-only and intentionally outside the production
    // ExtensionAPI interface. The real Pi runtime dispatches events.
    async fire(event, payload) {
      const hs = handlers[event] || [];
      const results = [];
      for (const h of hs) {
        results.push(await Promise.resolve(h(payload, ctx)));
      }
      return results;
    },
  };

  return api;
}

module.exports = { create };
