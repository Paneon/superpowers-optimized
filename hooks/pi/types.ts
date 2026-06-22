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

export type SessionStartReason = 'startup' | 'reload' | 'new' | 'resume' | 'fork';

export interface SessionStartEvent {
  reason: SessionStartReason;
  previousSessionFile?: string;
}

export interface BeforeAgentStartEvent {
  prompt: string;
  images?: unknown[];
  systemPrompt?: string;
  systemPromptOptions?: Record<string, unknown>;
}

export interface BeforeAgentStartReturn {
  message?: string;
  systemPrompt?: string;
}

export interface InputEvent {
  text: string;
  images?: unknown[];
  source?: string;
  streamingBehavior?: string;
}

export interface InputReturn {
  action: 'continue' | 'transform' | 'handled';
  text?: string;
}

export interface ToolCallEvent {
  toolName: string;
  toolCallId: string;
  /** Mutable. Mutate in place to patch tool arguments before execution. */
  input: Record<string, unknown>;
}

export interface ToolCallReturn {
  block: true;
  reason?: string;
}

export interface ToolResultEvent {
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  content?: string;
  details?: unknown;
  isError?: boolean;
}

/** Partial patch — Pi merges these fields into the tool result the agent sees. */
export interface ToolResultReturn {
  content?: string;
  details?: unknown;
  isError?: boolean;
}

export interface AgentEndEvent {
  messages?: unknown[];
}

// Subset of Pi's ExtensionAPI that we actually use. Pi exposes many more
// methods (sendMessage, registerTool, registerCommand, etc.) — we model
// only what the extension calls.
export interface ExtensionAPI {
  on(event: 'session_start',
     handler: (e: SessionStartEvent, ctx: ExtensionContext) => void | Promise<void>): void;
  on(event: 'before_agent_start',
     handler: (e: BeforeAgentStartEvent, ctx: ExtensionContext) =>
       void | BeforeAgentStartReturn | Promise<void | BeforeAgentStartReturn>): void;
  on(event: 'input',
     handler: (e: InputEvent, ctx: ExtensionContext) =>
       void | InputReturn | Promise<void | InputReturn>): void;
  on(event: 'tool_call',
     handler: (e: ToolCallEvent, ctx: ExtensionContext) =>
       void | ToolCallReturn | Promise<void | ToolCallReturn>): void;
  on(event: 'tool_result',
     handler: (e: ToolResultEvent, ctx: ExtensionContext) =>
       void | ToolResultReturn | Promise<void | ToolResultReturn>): void;
  on(event: 'agent_end',
     handler: (e: AgentEndEvent, ctx: ExtensionContext) => void | Promise<void>): void;
}

// Subset of Pi's per-handler context (`ctx`, the second argument). Adapters
// use ctx.ui.confirm() for tool-call ask-decisions and ctx.ui.notify() for
// surfacing stop-reminders.
export interface ExtensionUI {
  confirm(title: string, message: string): Promise<boolean>;
  notify(message: string, level?: 'info' | 'warning' | 'error'): void;
  setStatus?(key: string, text: string): void;
}

export interface ExtensionContext {
  ui: ExtensionUI;
  cwd?: string;
  signal?: AbortSignal;
  hasUI?: boolean;
  mode?: 'tui' | 'rpc' | 'json' | 'print';
}
