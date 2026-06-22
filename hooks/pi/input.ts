import type { ExtensionAPI, InputEvent } from './types';

export function register(api: ExtensionAPI): void {
  api.on('input', async (_evt: InputEvent) => {
    // Stub — Task 7 fills in (session-stats on skill expansion).
  });
}
