#!/usr/bin/env bash
# End-to-end dispatch test for the Pi extension's lifecycle adapters.
# Fires real events through the compiled extension and asserts behavior
# against the mocked ExtensionAPI + ExtensionContext. Real JS hooks are
# spawned — no spies — so this also exercises the runJsHook → existing
# hooks/*.js wiring.
#
# Assertions match Pi's actual return-shape contract (audited 2026-06-22):
#   - tool_call:   { block: true, reason } OR mutate evt.input in place
#   - tool_result: { content?, details?, isError? } partial patch
#   - before_agent_start: { systemPrompt? } return for context injection
#   - agent_end:   surface reminders via ctx.ui.notify()
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

DIST="$REPO/hooks/pi/dist/index.js"
[ -f "$DIST" ] || { echo "FAIL: $DIST not built" >&2; exit 1; }

# Disable network update checks during session_start tests.
export SUPERPOWERS_AUTO_UPDATE=0

# Unique session id per run so bash-compress's 60s re-run cache doesn't
# silently skip compression on a second test run within the window.
SESSION_ID="pi-test-$$-$RANDOM"

node --unhandled-rejections=strict -e "
const SESSION_ID = '$SESSION_ID';
const { create } = require('$HERE/mocks/extension-api.js');
const factory = require('$DIST').default;
const path = require('path');

const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };
const pass = (msg) => console.log('  PASS', msg);

function freshFactory() {
  // Clear cache so module-scope state (pendingSessionContext) starts fresh.
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(path.join('$REPO', 'hooks/pi/dist'))) delete require.cache[k];
  }
  return require('$DIST').default;
}

(async () => {

  // -----------------------------------------------------------------
  // session_start caches context; before_agent_start consumes it on
  // the next prompt and returns it via { systemPrompt }.
  // -----------------------------------------------------------------
  {
    const f = freshFactory();
    const api = create({ cwd: '$REPO' });
    f(api);
    await api.fire('session_start', { reason: 'startup' });

    // session_start has no return; assertion is via the cached blob.
    // We can't peek directly from outside the module — but the next
    // before_agent_start should consume and emit it.
    const [ret] = await api.fire('before_agent_start', {
      prompt: 'help me ship a new feature',
      systemPrompt: 'EXISTING_PROMPT',
    });
    if (!ret || typeof ret.systemPrompt !== 'string') {
      fail('before_agent_start: expected { systemPrompt } return, got ' + JSON.stringify(ret));
    }
    if (!ret.systemPrompt.startsWith('EXISTING_PROMPT')) {
      fail('before_agent_start: existing systemPrompt was dropped');
    }
    if (!/superpowers/i.test(ret.systemPrompt) || !/using-superpowers/.test(ret.systemPrompt)) {
      fail('before_agent_start: session-start blob not included in systemPrompt');
    }
    pass('session_start → cached blob surfaces via before_agent_start { systemPrompt }');
  }

  // -----------------------------------------------------------------
  // before_agent_start without prior session_start, with a real prompt:
  // skill-activator output appears in systemPrompt.
  // -----------------------------------------------------------------
  {
    const f = freshFactory();
    const api = create({ cwd: '$REPO' });
    f(api);
    const [ret] = await api.fire('before_agent_start', {
      prompt: 'let\\'s build a dashboard',
      systemPrompt: '',
    });
    // Skill activator may or may not match this prompt; assertion is permissive.
    if (ret && typeof ret.systemPrompt !== 'string') {
      fail('before_agent_start: return must be undefined or { systemPrompt: string }');
    }
    pass('before_agent_start dispatches skill-activator (return type valid)');
  }

  // -----------------------------------------------------------------
  // before_agent_start with empty prompt and no cache → no return.
  // -----------------------------------------------------------------
  {
    const f = freshFactory();
    const api = create();
    f(api);
    const [ret] = await api.fire('before_agent_start', { prompt: '', systemPrompt: '' });
    if (ret !== undefined) fail('before_agent_start: empty prompt + no cache should return undefined, got ' + JSON.stringify(ret));
    pass('before_agent_start no-ops on empty prompt + no cached session context');
  }

  // -----------------------------------------------------------------
  // tool_call: dangerous Bash → { block: true, reason } per Pi's contract.
  // -----------------------------------------------------------------
  {
    const f = freshFactory();
    const api = create();
    f(api);
    const [ret] = await api.fire('tool_call', {
      toolName: 'Bash',
      toolCallId: 'tc1',
      input: { command: 'rm -rf /' },
    });
    if (!ret || ret.block !== true) fail('tool_call(rm -rf /): expected { block:true }, got ' + JSON.stringify(ret));
    if (!/rm targeting root/i.test(ret.reason || '')) fail('tool_call(rm -rf /): reason missing rm-root marker');
    pass('tool_call blocks rm -rf / via { block: true, reason }');
  }

  // -----------------------------------------------------------------
  // tool_call: Read .env → block via protect-secrets.
  // -----------------------------------------------------------------
  {
    const f = freshFactory();
    const api = create();
    f(api);
    const [ret] = await api.fire('tool_call', {
      toolName: 'Read',
      toolCallId: 'tc2',
      input: { file_path: '/tmp/some-project/.env' },
    });
    if (!ret || ret.block !== true) fail('tool_call(Read .env): expected { block:true }, got ' + JSON.stringify(ret));
    if (!/.env/i.test(ret.reason || '')) fail('tool_call(Read .env): reason missing .env mention');
    pass('tool_call blocks Read of .env via { block: true, reason }');
  }

  // -----------------------------------------------------------------
  // tool_call: safe Bash (git status) → undefined return + evt.input
  // MUTATED in place with the rewritten command.
  // -----------------------------------------------------------------
  {
    const f = freshFactory();
    const api = create();
    f(api);
    const inputObj = { command: 'git status', description: 'status check' };
    const [ret] = await api.fire('tool_call', {
      toolName: 'Bash',
      toolCallId: SESSION_ID + '-compress',
      input: inputObj,
    });
    if (ret !== undefined) fail('tool_call(safe Bash): expected undefined (pass-through), got ' + JSON.stringify(ret));
    if (inputObj.command === 'git status') fail('tool_call(safe Bash): evt.input.command was not mutated');
    if (!/bash-optimizer/.test(inputObj.command)) fail('tool_call(safe Bash): evt.input.command not routed through bash-optimizer');
    pass('tool_call mutates evt.input in place for bash-compress transform');
  }

  // -----------------------------------------------------------------
  // tool_call: out-of-scope tool (Glob) → undefined pass-through.
  // -----------------------------------------------------------------
  {
    const f = freshFactory();
    const api = create();
    f(api);
    const [ret] = await api.fire('tool_call', {
      toolName: 'Glob', toolCallId: 'tc-glob', input: { pattern: '**/*.ts' },
    });
    if (ret !== undefined) fail('tool_call(Glob): expected undefined, got ' + JSON.stringify(ret));
    pass('tool_call passes through tools outside scope');
  }

  // -----------------------------------------------------------------
  // tool_call ask + ctx.ui.confirm = true → pass-through.
  // -----------------------------------------------------------------
  {
    process.env.PI_PROTECT_SECRETS_SCRIPT = path.join('$REPO', 'tests/pi/fixtures/protect-secrets-ask.js');
    const f = freshFactory();
    const api = create({ confirmAnswer: true });
    f(api);
    const [ret] = await api.fire('tool_call', {
      toolName: 'Read', toolCallId: 'tc-ask-yes', input: { file_path: '/tmp/file.txt' },
    });
    if (ret !== undefined) fail('tool_call(ask, confirmed): expected undefined, got ' + JSON.stringify(ret));
    if (api.confirms.length !== 1) fail('tool_call(ask): expected exactly one ctx.ui.confirm call, got ' + api.confirms.length);
    if (!/fixture/.test(api.confirms[0].message)) fail('tool_call(ask): confirm message missing fixture marker');
    pass('tool_call ask + confirmed → pass-through, ctx.ui.confirm was called');
    delete process.env.PI_PROTECT_SECRETS_SCRIPT;
  }

  // -----------------------------------------------------------------
  // tool_call ask + ctx.ui.confirm = false → block.
  // -----------------------------------------------------------------
  {
    process.env.PI_PROTECT_SECRETS_SCRIPT = path.join('$REPO', 'tests/pi/fixtures/protect-secrets-ask.js');
    const f = freshFactory();
    const api = create({ confirmAnswer: false });
    f(api);
    const [ret] = await api.fire('tool_call', {
      toolName: 'Read', toolCallId: 'tc-ask-no', input: { file_path: '/tmp/file.txt' },
    });
    if (!ret || ret.block !== true) fail('tool_call(ask, declined): expected { block:true }, got ' + JSON.stringify(ret));
    if (!/declined/i.test(ret.reason || '')) fail('tool_call(ask, declined): reason missing user-declined marker');
    pass('tool_call ask + declined → { block: true, reason: \"user declined\" }');
    delete process.env.PI_PROTECT_SECRETS_SCRIPT;
  }

  // -----------------------------------------------------------------
  // tool_result(Edit) → track-edits receives full payload.
  // -----------------------------------------------------------------
  {
    const fs = require('fs'), os = require('os');
    const marker = path.join(os.tmpdir(), 'pi-track-edits-' + SESSION_ID + '.json');
    process.env.PI_TRACK_EDITS_SCRIPT = path.join('$REPO', 'tests/pi/fixtures/track-edits-fake.js');
    process.env.PI_TRACK_EDITS_MARKER = marker;
    const f = freshFactory();
    const api = create();
    f(api);
    const [ret] = await api.fire('tool_result', {
      toolName: 'Edit',
      toolCallId: 'tr-edit',
      input: { file_path: '/tmp/x.txt', new_string: 'hi' },
      content: 'ok',
    });
    if (ret !== undefined) fail('tool_result(Edit): expected undefined, got ' + JSON.stringify(ret));
    if (!fs.existsSync(marker)) fail('tool_result(Edit): track-edits never received the payload');
    const captured = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (captured.tool_name !== 'Edit') fail('tool_result(Edit): payload.tool_name was ' + captured.tool_name);
    if (!captured.tool_input || captured.tool_input.file_path !== '/tmp/x.txt') {
      fail('tool_result(Edit): payload.tool_input not forwarded correctly');
    }
    pass('tool_result(Edit) forwards full payload to track-edits, returns undefined');
    fs.unlinkSync(marker);
    delete process.env.PI_TRACK_EDITS_SCRIPT;
    delete process.env.PI_TRACK_EDITS_MARKER;
  }

  // -----------------------------------------------------------------
  // tool_result(Bash) → posttool-bash-compress output returns as
  // { content: <compressed> } — Pi's documented partial-patch shape.
  // -----------------------------------------------------------------
  {
    process.env.PI_POSTTOOL_BASH_COMPRESS_SCRIPT = path.join('$REPO', 'tests/pi/fixtures/posttool-bash-compress-fake.js');
    const f = freshFactory();
    const api = create();
    f(api);
    const [ret] = await api.fire('tool_result', {
      toolName: 'Bash', toolCallId: 'tr-bash',
      input: { command: 'ls' }, content: 'a\\nb\\n',
    });
    if (!ret || typeof ret.content !== 'string') {
      fail('tool_result(Bash): expected { content: string }, got ' + JSON.stringify(ret));
    }
    if (!/compressed/.test(ret.content)) fail('tool_result(Bash): content missing compression marker');
    pass('tool_result(Bash) returns { content } partial patch with compressed text');
    delete process.env.PI_POSTTOOL_BASH_COMPRESS_SCRIPT;
  }

  // -----------------------------------------------------------------
  // agent_end → stop-reminders' legacy {decision, reason} envelope
  // surfaces via ctx.ui.notify().
  // -----------------------------------------------------------------
  {
    process.env.PI_STOP_REMINDERS_SCRIPT = path.join('$REPO', 'tests/pi/fixtures/stop-reminders-fake.js');
    const f = freshFactory();
    const api = create();
    f(api);
    await api.fire('agent_end', { messages: [] });
    if (api.notifications.length !== 1) {
      fail('agent_end: expected 1 ctx.ui.notify call, got ' + api.notifications.length);
    }
    if (!/FAKE REMINDER/.test(api.notifications[0].message)) {
      fail('agent_end: notification did not contain fixture marker');
    }
    if (api.notifications[0].level !== 'warning') {
      fail('agent_end: notification level should be warning, got ' + api.notifications[0].level);
    }
    pass('agent_end surfaces stop-reminders via ctx.ui.notify(text, \"warning\")');
    delete process.env.PI_STOP_REMINDERS_SCRIPT;
  }

  // Smoke: real stop-reminders.js dispatches without throwing.
  {
    const f = freshFactory();
    const api = create();
    f(api);
    await api.fire('agent_end', { messages: [] });
    pass('agent_end dispatches real stop-reminders without error');
  }

  // -----------------------------------------------------------------
  // Idempotency: factory(api) called twice must not double-register.
  // -----------------------------------------------------------------
  {
    const f = freshFactory();
    const api = create();
    f(api);
    f(api);
    for (const e of ['session_start','before_agent_start','tool_call','tool_result','agent_end']) {
      if (api.handlers[e].length !== 1) {
        fail('factory idempotency: ' + e + ' has ' + api.handlers[e].length + ' handlers (expected 1)');
      }
    }
    pass('factory is idempotent (re-invocation does not double-register subscribers)');
  }

  // -----------------------------------------------------------------
  // bash-compress deny propagation.
  // -----------------------------------------------------------------
  {
    process.env.PI_BASH_COMPRESS_SCRIPT = path.join('$REPO', 'tests/pi/fixtures/bash-compress-deny.js');
    const f = freshFactory();
    const api = create();
    f(api);
    const [ret] = await api.fire('tool_call', {
      toolName: 'Bash', toolCallId: SESSION_ID + '-denyprop',
      input: { command: 'echo hello' },
    });
    if (!ret || ret.block !== true) fail('compress-deny: expected { block:true }, got ' + JSON.stringify(ret));
    if (!/fixture/.test(ret.reason || '')) fail('compress-deny: reason missing fixture marker');
    pass('tool_call: bash-compress deny propagates as { block: true } (not silently allowed)');
    delete process.env.PI_BASH_COMPRESS_SCRIPT;
  }

  console.log('OK: all adapter dispatch scenarios passed');
})().catch(e => { console.error('FAIL: unhandled exception:', e); process.exit(1); });
"
