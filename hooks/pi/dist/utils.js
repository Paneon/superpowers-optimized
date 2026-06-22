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
exports.REPO_ROOT = void 0;
exports.runJsHook = runJsHook;
exports.parseHookOutput = parseHookOutput;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
// When compiled, this file lives at hooks/pi/dist/utils.js
// Repo root is two directories up.
exports.REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
function runJsHook(scriptRelPath, payload, opts = {}) {
    const scriptPath = path.isAbsolute(scriptRelPath)
        ? scriptRelPath
        : path.join(exports.REPO_ROOT, scriptRelPath);
    return new Promise((resolve) => {
        const child = (0, child_process_1.spawn)('node', [scriptPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, CLAUDE_PLUGIN_ROOT: exports.REPO_ROOT },
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
