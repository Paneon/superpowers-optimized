"use strict";
// Pi (pi.dev) lifecycle event types and ExtensionAPI shape.
//
// These types reflect Pi's actual documented contract as of 2026-06-22
// (https://pi.dev/docs/latest/extensions). Adapters return what Pi will
// honor; the mocked ExtensionAPI in tests/pi/mocks/extension-api.js
// implements the same surface.
//
// Earlier drafts of this file invented shapes (api.injectContext / api.injectReminder /
// ToolCallDecision with allow:boolean+transformedParams). Pi ignores all of those.
// The audit + rewrite is captured in git history.
Object.defineProperty(exports, "__esModule", { value: true });
