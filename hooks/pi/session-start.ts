import type { ExtensionAPI, SessionStartEvent } from './types';

export function register(api: ExtensionAPI): void {
  api.on('session_start', async (_evt: SessionStartEvent) => {
    // Stub — Task 4 fills in.
  });
}
