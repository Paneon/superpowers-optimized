import type { ExtensionAPI, ToolResultEvent } from './types';

export function register(api: ExtensionAPI): void {
  api.on('tool_result', async (_evt: ToolResultEvent) => {
    // Stub — Task 7 fills in.
  });
}
