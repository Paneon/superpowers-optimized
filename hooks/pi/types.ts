// Pi (pi.dev) lifecycle event types and ExtensionAPI shape.
// This is our interpretation of Pi's documented contract — narrow it as
// pi.dev's API stabilises. The mocked ExtensionAPI in tests/pi/mocks/
// implements the same surface for hermetic testing.

export type LifecycleEvent =
  | 'session_start'
  | 'before_agent_start'
  | 'input'
  | 'tool_call'
  | 'tool_result'
  | 'agent_end';

export interface SessionStartEvent {
  sessionId?: string;
  cwd?: string;
  source?: 'startup' | 'resume' | 'clear' | 'compact';
}

export interface BeforeAgentStartEvent {
  sessionId?: string;
  prompt: string;
  cwd?: string;
}

export interface InputEvent {
  sessionId?: string;
  text?: string;
  skillExpansion?: { skill: string };
}

export interface ToolCallEvent {
  sessionId?: string;
  toolName: string;
  params: Record<string, unknown>;
}

export interface ToolResultEvent {
  sessionId?: string;
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
}

export interface AgentEndEvent {
  sessionId?: string;
  cwd?: string;
  lastAssistantMessage?: string;
}

// Handler return shape for tool_call: allow/block decision.
// Returning undefined or { allow: true } passes the call through unchanged.
// transformedParams replaces the params Pi sends to the tool.
export interface ToolCallDecision {
  allow: boolean;
  reason?: string;
  transformedParams?: Record<string, unknown>;
}

export interface ExtensionAPI {
  on(event: 'session_start',       handler: (e: SessionStartEvent)       => void | Promise<void>): void;
  on(event: 'before_agent_start',  handler: (e: BeforeAgentStartEvent)  => void | Promise<void>): void;
  on(event: 'input',               handler: (e: InputEvent)              => void | Promise<void>): void;
  on(event: 'tool_call',           handler: (e: ToolCallEvent)           => ToolCallDecision | void | Promise<ToolCallDecision | void>): void;
  on(event: 'tool_result',         handler: (e: ToolResultEvent)         => void | Promise<void>): void;
  on(event: 'agent_end',           handler: (e: AgentEndEvent)           => void | Promise<void>): void;
  log?(msg: string): void;
  injectContext?(text: string): void;
  injectReminder?(text: string): void;
}
