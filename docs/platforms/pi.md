# Superpowers Optimized for Pi (pi.dev)

Full Claude-Code parity for the [Pi coding agent](https://pi.dev): all 24
workflow skills **plus** the lifecycle hooks Pi exposes (5 of Claude's 10).
The hook layer reuses the same JS bodies Claude Code runs, wrapped in
TypeScript adapters that translate Pi's event payloads to the existing
stdin-JSON contract.

## What you get

| Feature | Status on Pi | Notes |
|---|---|---|
| 30+ workflow skills (debugging, TDD, code review, brainstorming, etc.) | ✅ | Discovered under `~/.pi/agent/skills/superpowers-optimized/` |
| Explicit skill invocation | ✅ | Via Pi's native skill expansion |
| Implicit skill matching (proactive routing on every prompt) | ✅ | `before_agent_start` returns `{ systemPrompt }` with `skill-activator.js` output |
| AGENTS.md workflow guidance | ✅ | Pi natively reads `AGENTS.md` |
| Startup context injection (project map, state, known issues) | ✅ | `session_start` caches the Codex `session-start-adapter.js` blob; `before_agent_start` consumes it on first prompt and prepends to `systemPrompt` |
| Async context engine (git blast-radius snapshot) | ✅ | Spawned by the session-start adapter chain |
| Dangerous Bash command blocking | ✅ | `tool_call` → `block-dangerous-commands.js` → `return { block: true, reason }` |
| Secret-file protection (.env, SSH keys, AWS creds, etc.) | ✅ | `tool_call` → `protect-secrets.js` → `return { block: true, reason }` |
| User-confirmation (`permissionDecision: "ask"`) | ✅ | Any hook returning `permissionDecision: "ask"` is routed to `ctx.ui.confirm(title, reason)`; the boolean answer maps to pass-through or `{ block: true, reason: "user declined" }`. Falls closed (block) in headless mode (no `ctx.hasUI`). |
| Bash command compression (pre-execution rewrite) | ✅ | `tool_call` → `bash-compress-hook.js` → mutates `event.input.command` in place (Pi's documented patch path) |
| Bash post-execution smart-compress | ✅ | `tool_result` → `codex/posttool-bash-compress-adapter.js` → `return { content: <compressed> }` (Pi merges the partial patch into the tool result the agent sees) |
| Edit/Write tracking | ✅ | `tool_result` → `track-edits.js` (fire-and-forget) |
| Stop-time discipline reminders | ✅ | `agent_end` → `stop-reminders.js`; reminder surfaces via `ctx.ui.notify(text, "warning")` |
| **Skill-usage session stats** | ❌ Pi-only gap | Claude wires this to `PostToolUse(Skill)`. Pi expands skills natively but does not surface the expansion to extensions, so `track-session-stats.js` is not invoked on Pi. |
| **SubagentStop guard** | ❌ Pi-only gap | **Pi has no sub-agent concept.** `subagent-guard.js` is intentionally not wired. |
| Custom agents (code-reviewer, red-team) | ❌ | Not in scope for this platform yet. Skills cover the same workflows. |

**24 skills work on every Pi install.** Lifecycle hooks require the
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
calls their default factory with an `ExtensionAPI`. Lifecycle handlers
receive `(event, ctx)` — the event payload plus an `ExtensionContext`
that exposes `ctx.ui.confirm()`, `ctx.ui.notify()`, `ctx.cwd`, and similar.

We compile our TypeScript adapters in `hooks/pi/` to `hooks/pi/dist/index.js`
and ship the dist. The extension registers one subscriber per Pi lifecycle
event we care about:

| Pi event | Claude hook(s) it covers | Return path | JS body invoked |
|---|---|---|---|
| `session_start` | `SessionStart` (sync + async) | (no return) caches output for next prompt | `hooks/codex/session-start-adapter.js` (also spawns `context-engine.js`) |
| `before_agent_start` | `UserPromptSubmit` + the cached session-start blob | `{ systemPrompt: existing + injected }` | `hooks/codex/user-prompt-submit-adapter.js` |
| `tool_call` | `PreToolUse(Read\|Edit\|Write\|Bash)` | `{ block: true, reason }` for deny; mutate `event.input` in place for transform; `await ctx.ui.confirm()` for `ask` | `hooks/safety/protect-secrets.js` → `hooks/safety/block-dangerous-commands.js` → `hooks/bash-compress-hook.js` |
| `tool_result` | `PostToolUse(Edit\|Write)` + `PostToolUse(Bash)` | `{ content: <compressed> }` to replace Bash output; fire-and-forget for Edit/Write tracking | `hooks/track-edits.js` + `hooks/codex/posttool-bash-compress-adapter.js` |
| `agent_end` | `Stop` | `ctx.ui.notify(text, "warning")` for reminder surface | `hooks/stop-reminders.js` |
| *(no subscription)* | `SubagentStop`; `PostToolUse(Skill)` | n/a | **Not invoked.** Pi has no sub-agents and no `Skill` tool. |

Each adapter:
1. Translates Pi's typed event payload to the Claude-shape JSON the
   existing hook script expects (`tool_name`, `tool_input`, `session_id`,
   `cwd`, etc.).
2. Spawns the JS hook via `node` (see `hooks/pi/utils.ts:runJsHook`).
3. Reads the hook's JSON envelope (`readEnvelope` in `utils.ts`) and
   translates it back to Pi's contract — `{ block: true, reason }`,
   in-place `event.input` mutation, `{ content }` for tool_result, or
   `ctx.ui.notify()`.

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

### No skill-expansion signal on `input`

Claude wires `track-session-stats.js` to `PostToolUse(Skill)`. Pi expands
skills natively but does not surface the expansion to extensions through
any documented event field. We previously registered an `input` subscriber
on speculative assumption; that was removed after the contract audit.
Session stats remain Claude-only.

### `permissionDecision: "ask"` in headless mode

When a hook returns `permissionDecision: "ask"`, we call `ctx.ui.confirm()`
to prompt the human. If Pi is running in a mode where `ctx.hasUI === false`
(headless / RPC), we cannot prompt — the adapter falls **closed** (block)
to keep security guards meaningful. A non-security hook that asks in
headless mode therefore appears denied; rerun in a UI mode if needed.

### Session-start matcher granularity

Claude distinguishes `startup`, `resume`, `clear`, and `compact` for
`SessionStart`. Pi's `session_start.reason` covers `startup | reload | new | resume | fork`.
The adapter forwards the reason verbatim as `source` to the JS hook.

### Auto-update on session start

OpenCode/Codex/Gemini CLI perform a best-effort `git fetch` and update
check once per 24 hours from their session-start hook. The Pi adapter
delegates to the same Codex `session-start-adapter.js`, so the update
check runs on Pi too — set `SUPERPOWERS_AUTO_UPDATE=0` to disable.

### Bash post-execution compression is real, not context-only

Earlier drafts of this doc said Pi's tool_result compression was
"context-only" because we had assumed Pi had no tool-output rewrite
surface. The contract audit corrected this: Pi's `tool_result` return
shape `{ content?, details?, isError? }` IS a partial patch that Pi
merges back into the result the agent sees. So Bash output compression
on Pi works the same as on Codex.

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
  returns the correct shape per Pi's contract — `rm -rf /` blocking,
  `.env` Read blocking, in-place Bash command rewrite, ask → ctx.ui.confirm,
  tool_result compression as `{ content }`, agent_end reminder via
  `ctx.ui.notify`.

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
