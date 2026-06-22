import { spawn } from 'child_process';
import * as path from 'path';

// When compiled, this file lives at hooks/pi/dist/utils.js
// Repo root is two directories up.
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runJsHook(
  scriptRelPath: string,
  payload: object,
  opts: { timeoutMs?: number; detach?: boolean } = {},
): Promise<HookResult> {
  const scriptPath = path.isAbsolute(scriptRelPath)
    ? scriptRelPath
    : path.join(REPO_ROOT, scriptRelPath);

  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO_ROOT },
      detached: opts.detach ?? false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    const timer = setTimeout(() => child.kill('SIGTERM'), opts.timeoutMs ?? 5000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: 127 });
    });
    try {
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    } catch {
      // Child may have died before stdin write; the close handler resolves us.
    }
  });
}

export function parseHookOutput(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
