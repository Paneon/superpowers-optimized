import type { ExtensionAPI, BeforeAgentStartEvent } from './types';

export function register(api: ExtensionAPI): void {
  api.on('before_agent_start', async (_evt: BeforeAgentStartEvent) => {
    // Stub — Task 5 fills in.
  });
}
