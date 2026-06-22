"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOOK_EXIT = exports.REPO_ROOT = void 0;
exports.readEnvelope = readEnvelope;
exports.envelopeText = envelopeText;
exports.runJsHook = runJsHook;
exports.parseHookOutput = parseHookOutput;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
// When compiled, this file lives at hooks/pi/dist/utils.js, so REPO_ROOT
// walks up three levels: dist → pi → hooks → repo root.
exports.REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// Cap each child process's stdout/stderr to prevent a runaway hook from
// holding hundreds of MB resident in the Pi runtime. Hooks that need to
// emit more than this are themselves the bug.
const MAX_BUFFER_BYTES = 2 * 1024 * 1024; // 2 MiB
// Defense in depth: only forward the env vars the shipped JS hooks
// actually read (enumerated by `grep process.env`). Forwarding the
// full host environment leaks AWS_*, GITHUB_TOKEN, OPENAI_API_KEY, etc.
// into spawned children that have no need for them.
const FORWARDED_ENV_KEYS = [
    'HOME', 'USERPROFILE', 'PATH',
    'XDG_CONFIG_HOME', 'ProgramFiles',
    'SP_NO_COMPRESS', 'SUPERPOWERS_AUTO_UPDATE',
    'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM',
    // Test-only path overrides for adapter fixtures. Safe to forward
    // because every script path is containment-checked below.
    'PI_STOP_REMINDERS_SCRIPT',
    'PI_PROTECT_SECRETS_SCRIPT',
    'PI_BLOCK_DANGEROUS_SCRIPT',
    'PI_BASH_COMPRESS_SCRIPT',
    'PI_TRACK_EDITS_SCRIPT',
    'PI_POSTTOOL_BASH_COMPRESS_SCRIPT',
    'PI_TRACK_EDITS_MARKER',
];
function buildChildEnv() {
    const out = { CLAUDE_PLUGIN_ROOT: exports.REPO_ROOT };
    for (const k of FORWARDED_ENV_KEYS) {
        const v = process.env[k];
        if (typeof v === 'string')
            out[k] = v;
    }
    return out;
}
function resolveAndContain(scriptRelPath) {
    const scriptPath = path.isAbsolute(scriptRelPath)
        ? scriptRelPath
        : path.join(exports.REPO_ROOT, scriptRelPath);
    const resolved = path.resolve(scriptPath);
    // Containment check: the resolved path must live under REPO_ROOT.
    // Today every caller passes a hardcoded literal, but this guard
    // closes the future RCE risk if any caller derives the path from
    // a Pi-supplied field.
    //
    // Note: this uses path.resolve, NOT fs.realpathSync. Real Pi installs
    // load this code via a symlink (~/.pi/agent/extensions/superpowers-optimized
    // → hooks/pi/dist), so a realpath-based check would either reject the
    // install entirely or require pinning the install location at build
    // time. The current check is sufficient to block `..` traversal and
    // absolute-path injection.
    const relative = path.relative(exports.REPO_ROOT, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`runJsHook: refusing path outside repo root: ${resolved}`);
    }
    return resolved;
}
/**
 * Named exit codes returned by runJsHook. Callers should prefer comparing
 * against these constants over magic numbers — e.g.
 * `if (r.exitCode !== HOOK_EXIT.OK) return null;` reads intent better than
 * `r.exitCode !== 0` for security-relevant callers that also need to
 * exclude TIMEOUT/SIGTERM/SPAWN_ERROR.
 */
exports.HOOK_EXIT = {
    OK: 0,
    /** GNU `timeout` convention — child killed by our timeout. */
    TIMEOUT: 124,
    /** Standard 128+SIGTERM. */
    SIGTERM: 143,
    /** spawn() never produced a process (binary not found, etc.). */
    SPAWN_ERROR: 127,
    /** Script path failed containment check against REPO_ROOT. */
    BAD_PATH: 126,
    /** Process exited via some other signal — surface non-zero. */
    OTHER_SIGNAL: -1,
};
function readEnvelope(stdout) {
    const parsed = parseHookOutput(stdout);
    if (!parsed)
        return null;
    const env = {};
    const hso = parsed.hookSpecificOutput;
    if (hso && typeof hso === 'object') {
        const h = hso;
        if (typeof h.additionalContext === 'string')
            env.additionalContext = h.additionalContext;
        if (h.permissionDecision === 'allow' || h.permissionDecision === 'deny') {
            env.permissionDecision = h.permissionDecision;
        }
        if (typeof h.permissionDecisionReason === 'string') {
            env.permissionDecisionReason = h.permissionDecisionReason;
        }
        if (h.updatedInput && typeof h.updatedInput === 'object') {
            env.updatedInput = h.updatedInput;
        }
    }
    if (typeof parsed.reason === 'string')
        env.reason = parsed.reason;
    return env;
}
/**
 * Extract the best human-readable text from an envelope. Order:
 * hookSpecificOutput.additionalContext → top-level reason → raw stdout
 * (only when no JSON envelope was parseable). Used by agent_end and
 * tool_result(Bash) where any of the three sources is valid content.
 */
function envelopeText(env, rawStdout = '') {
    if (env) {
        if (env.additionalContext)
            return env.additionalContext;
        if (env.reason)
            return env.reason;
        return null;
    }
    const trimmed = rawStdout.trim();
    return trimmed || null;
}
function runJsHook(scriptRelPath, payload, opts = {}) {
    let scriptPath;
    try {
        scriptPath = resolveAndContain(scriptRelPath);
    }
    catch (e) {
        return Promise.resolve({
            stdout: '', stderr: e instanceof Error ? e.message : String(e),
            exitCode: exports.HOOK_EXIT.BAD_PATH, timedOut: false,
        });
    }
    return new Promise((resolve) => {
        const child = (0, child_process_1.spawn)('node', [scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: buildChildEnv(),
            detached: opts.detach ?? false,
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let truncated = false;
        const appendCapped = (cur, chunk) => {
            if (truncated || cur.length >= MAX_BUFFER_BYTES) {
                truncated = true;
                return cur;
            }
            const room = MAX_BUFFER_BYTES - cur.length;
            if (chunk.length <= room)
                return cur + chunk;
            truncated = true;
            try {
                child.kill('SIGTERM');
            }
            catch { }
            return cur + chunk.slice(0, room);
        };
        child.stdout.on('data', (d) => { stdout = appendCapped(stdout, d.toString()); });
        child.stderr.on('data', (d) => { stderr = appendCapped(stderr, d.toString()); });
        const timer = setTimeout(() => {
            timedOut = true;
            try {
                child.kill('SIGTERM');
            }
            catch { }
        }, opts.timeoutMs ?? 5000);
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            // exitCode semantics:
            //   - normal exit: child's exit code
            //   - SIGTERM via timeout: keep as null so callers can detect via timedOut
            //   - any other signal: 128 + signal number (Unix convention) — but we
            //     just surface a non-zero so security callers fail-closed.
            let exitCode;
            if (typeof code === 'number')
                exitCode = code;
            else if (timedOut)
                exitCode = exports.HOOK_EXIT.TIMEOUT;
            else if (signal)
                exitCode = exports.HOOK_EXIT.SIGTERM;
            else
                exitCode = exports.HOOK_EXIT.OTHER_SIGNAL;
            resolve({ stdout, stderr, exitCode, timedOut });
        });
        child.on('error', () => {
            clearTimeout(timer);
            resolve({ stdout, stderr, exitCode: exports.HOOK_EXIT.SPAWN_ERROR, timedOut });
        });
        try {
            child.stdin.write(JSON.stringify(payload));
            child.stdin.end();
        }
        catch {
            // Child may have died before stdin write; the close handler resolves us.
        }
    });
}
function parseHookOutput(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed)
        return null;
    try {
        const parsed = JSON.parse(trimmed);
        return typeof parsed === 'object' && parsed !== null ? parsed : null;
    }
    catch {
        return null;
    }
}
