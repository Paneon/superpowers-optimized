# Superpowers Optimized for Pi (pi.dev)

Full Claude-Code parity for the [Pi coding agent](https://pi.dev): all 24
workflow skills **plus** 9 of 10 lifecycle hooks via a Pi-native extension.
The hook layer reuses the same JS bodies Claude Code runs, wrapped in thin
TypeScript adapters that translate Pi's event payloads to the existing
stdin-JSON contract.

## What you get

| Feature | Status on Pi | Notes |
|---|---|---|
| 30+ workflow skills (debugging, TDD, code review, brainstorming, etc.) | ✅ | Discovered under `~/.pi/agent/skills/superpowers-optimized/` |
| Explicit skill invocation | ✅ | Via Pi's native skill expansion |
| Implicit skill matching (proactive routing on every prompt) | ✅ | `before_agent_start` adapter dispatches `skill-activator.js` |
| AGENTS.md workflow guidance | ✅ | Pi natively reads `AGENTS.md` |
| Startup context injection (project map, state, known issues) | ✅ | `session_start` adapter reuses Codex's session-start logic |
| Async context engine (git blast-radius snapshot) | ✅ | Spawned from `session_start` adapter |
| Dangerous Bash command blocking | ✅ | `tool_call` → `block-dangerous-commands.js` |
| Secret-file protection (.env, SSH keys, AWS creds, etc.) | ✅ | `tool_call` → `protect-secrets.js` |
| Bash command compression (PreToolUse rewrite) | ✅ | `tool_call` → `bash-compress-hook.js` |
| Bash post-execution smart-compress | ✅ | `tool_result` → `codex/posttool-bash-compress-adapter.js` |
| Edit/Write tracking | ✅ | `tool_result` → `track-edits.js` |
| Skill-usage session stats | ⚠️ conditional | `input` adapter listens for `skillExpansion` payload; if Pi does not surface skill expansion in `input`, this stays Claude-only |
| Stop-time discipline reminders | ✅ | `agent_end` → `stop-reminders.js`, surfaced via `api.injectReminder` |
| **SubagentStop guard** | ❌ | **Pi has no sub-agent concept.** `subagent-guard.js` is intentionally not wired. |
| Custom agents (code-reviewer, red-team) | ❌ | Not in scope for this platform yet. Skills cover the same workflows. |

**24 skills work on every Pi install.** The 9 lifecycle hooks require the
TypeScript extension to be symlinked and Node.js ≥ 18 on the host.

---

## Quick Install

Tell Pi:

```
Fetch and follow instructions from https://raw.githubusercontent.com/Paneon/superpowers-optimized/refs/heads/main/.pi/INSTALL.md
```

The install symlinks two directories into Pi's discovery paths:

- `~/.config/pi/superpowers/skills` → `~/.pi/agent/skills/superpowers-optimized`
- `~/.config/pi/superpowers/hooks/pi/dist` → `~/.pi/agent/extensions/superpowers-optimized`

The second symlink targets the **compiled** extension output (`hooks/pi/dist/`),
not the TypeScript source. The `dist/` directory is tracked in the repo so
end users don't need to run `tsc`.

For manual install steps (Unix/macOS and Windows PowerShell) see
[`.pi/INSTALL.md`](https://github.com/Paneon/superpowers-optimized/blob/main/.pi/INSTALL.md).

---

## Architecture

### Skill layer

Pi natively discovers `SKILL.md` files under `~/.pi/agent/skills/` and
`.pi/skills/`. We symlink the repo's `skills/` directory there. Every
skill's frontmatter is validated against Pi's rules (`name` ≤ 64 chars
matching `^[a-z0-9-]+$`; `description` ≤ 1024 chars) by
`tests/pi/validate-skill-frontmatter.sh`.

### Extension layer (lifecycle hooks)

Pi loads extensions from `~/.pi/agent/extensions/<name>/index.{js,ts}` and
calls their default factory with an `ExtensionAPI`. We compile our
TypeScript adapters in `hooks/pi/` to `hooks/pi/dist/index.js` and ship
the dist. The extension registers one subscriber per Claude lifecycle
event:

| Pi event             | Claude hook(s) it covers                                  | JS body invoked                                              |
|----------------------|-----------------------------------------------------------|--------------------------------------------------------------|
| `session_start`      | `SessionStart` (sync + async)                             | `hooks/codex/session-start-adapter.js` (also spawns `context-engine.js`) |
| `before_agent_start` | `UserPromptSubmit`                                        | `hooks/codex/user-prompt-submit-adapter.js`                  |
| `input`              | (Pi-only) skill-expansion ↔ `PostToolUse(Skill)`          | `hooks/track-session-stats.js` *(when Pi surfaces expansion)*|
| `tool_call`          | `PreToolUse(Read\|Edit\|Write\|Bash)`                     | `hooks/safety/protect-secrets.js` → `hooks/safety/block-dangerous-commands.js` → `hooks/bash-compress-hook.js` |
| `tool_result`        | `PostToolUse(Edit\|Write)` + `PostToolUse(Bash)`          | `hooks/track-edits.js` + `hooks/codex/posttool-bash-compress-adapter.js` |
| `agent_end`          | `Stop`                                                    | `hooks/stop-reminders.js`                                    |
| *(no subscription)*  | `SubagentStop`                                            | **Not invoked.** Pi has no sub-agents.                       |

Each adapter:
1. Translates Pi's typed event payload to the Claude-shape JSON the
   existing hook script expects (`tool_name`, `tool_input`, `session_id`,
   `cwd`, etc.).
2. Spawns the JS hook via `node` (see `hooks/pi/utils.ts:runJsHook`).
3. Reads the hook's JSON envelope and translates it back to Pi's
   `ToolCallDecision` shape — `{ allow: false, reason }` for `deny`,
   `{ allow: true, transformedParams }` for `allow + updatedInput`,
   pass-through for `{}`.

### Why we ship compiled JS instead of TS source

Pi documents two extension forms: a single TypeScript file, or an npm
package shipping JS. We chose the compiled-JS path so:

- End users don't need `tsx` or other TS-runtime tooling.
- The compiled `dist/` is checked into the repo and stays current via the
  symlinked install pattern (same as Codex hooks today).
- Reference Pi-skill repos (e.g. `weiping/pi-superpowers`) follow the
  same pattern.

To rebuild after editing the TypeScript source:

```bash
npm install
npm run build
```

---

## Known limitations

### No SubagentStop equivalent

Pi explicitly omits the sub-agent concept ("Pi is a minimal agent
harness… intentionally omits features like sub-agents"). The Claude hook
that guards against subagent leakage (`subagent-guard.js`) has nothing to
guard on Pi and is intentionally not wired into the extension.

### Skill-expansion stats are conditional

`hooks/track-session-stats.js` is wired to Claude's `PostToolUse(Skill)`
matcher. Pi expands skills through the `input` event rather than as a
discrete tool call. The Pi `input` adapter listens for a
`skillExpansion: { skill: string }` field on the event payload. If Pi's
runtime does not surface that field, this handler no-ops and session
stats remain Claude-only.

### Session-start matcher granularity

Claude distinguishes `startup`, `resume`, `clear`, and `compact` for
`SessionStart`. Pi exposes a single `session_start` event. If the event
payload includes a `source` field we pass it through; otherwise the
adapter defaults to `startup`.

### Auto-update on session start

OpenCode/Codex/Gemini CLI perform a best-effort `git fetch` and update
check once per 24 hours from their session-start hook. The Pi adapter
delegates to the same Codex `session-start-adapter.js`, so the update
check runs on Pi too — set `SUPERPOWERS_AUTO_UPDATE=0` to disable.

---

## Verifying the install

`tests/pi/run-tests.sh` from a clone of the repo exercises everything
this platform integration depends on:

- Frontmatter parses (`tests/pi/validate-skill-frontmatter.sh`).
- Pi appears in `meta.platforms` and `extensions.pi.{install_path,extension_path}` in `plugin.universal.yaml`.
- `tsc -p .` succeeds and `hooks/pi/dist/index.js` is loadable.
- The compiled extension registers exactly the expected lifecycle
  subscribers (and no out-of-scope ones).
- End-to-end dispatch: each adapter routes to the correct JS body and
  returns the correct decision shape — including `rm -rf /` blocking,
  `.env` Read blocking, and bash-compress transformation of safe Bash.

Run it locally before reporting an install issue:

```bash
cd ~/.config/pi/superpowers
npm install
bash tests/pi/run-tests.sh
```

---

## Getting Help

- Report issues: https://github.com/Paneon/superpowers-optimized/issues
- Quick-install: [`.pi/INSTALL.md`](https://github.com/Paneon/superpowers-optimized/blob/main/.pi/INSTALL.md)
