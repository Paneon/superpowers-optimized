import type { ExtensionAPI, ToolCallEvent, ToolCallDecision } from './types';

export function register(api: ExtensionAPI): void {
  api.on('tool_call', async (_evt: ToolCallEvent): Promise<ToolCallDecision | void> => {
    // Stub — Task 6 fills in.
    return;
  });
}
