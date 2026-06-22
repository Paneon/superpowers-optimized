import type { ExtensionAPI, AgentEndEvent } from './types';

export function register(api: ExtensionAPI): void {
  api.on('agent_end', async (_evt: AgentEndEvent) => {
    // Stub — Task 8 fills in.
  });
}
