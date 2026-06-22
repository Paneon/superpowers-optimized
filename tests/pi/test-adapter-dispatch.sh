#!/usr/bin/env bash
# End-to-end dispatch test for the Pi extension's lifecycle adapters.
# Fires real events through the compiled extension and asserts behavior
# against the mocked ExtensionAPI. Real JS hooks are spawned — no spies —
# so this also exercises the runJsHook → existing hooks/*.js wiring.
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

(async () => {
  const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };
  const pass = (msg) => console.log('  PASS', msg);

  // -----------------------------------------------------------------
  // session_start → injectContext should fire with superpowers context
  // -----------------------------------------------------------------
  {
    const api = create();
    factory(api);
    await api.fire('session_start', { sessionId: 't', cwd: '$REPO', source: 'startup' });
    if (api.contextInjections.length !== 1) {
      fail('session_start: expected 1 context injection, got ' + api.contextInjections.length);
    }
    const text = api.contextInjections[0];
    if (!/superpowers/i.test(text)) fail('session_start: context missing \"superpowers\" mention');
    if (!/using-superpowers/.test(text)) fail('session_start: context missing using-superpowers block');
    pass('session_start injects full superpowers context');
  }

  // -----------------------------------------------------------------
  // before_agent_start with execution-trigger prompt → context injected
  // -----------------------------------------------------------------
  {
    const api = create();
    factory(api);
    await api.fire('before_agent_start', {
      sessionId: SESSION_ID,
      cwd: '$REPO',
      prompt: 'let\'s build a new feature for the user dashboard',
    });
    if (api.contextInjections.length !== 1) {
      fail('before_agent_start: expected 1 context injection, got ' + api.contextInjections.length);
    }
    pass('before_agent_start injects skill-activator context for non-micro prompt');
  }

  // -----------------------------------------------------------------
  // before_agent_start with empty prompt → no injection
  // -----------------------------------------------------------------
  {
    const api = create();
    factory(api);
    await api.fire('before_agent_start', { prompt: '' });
    if (api.contextInjections.length !== 0) fail('before_agent_start: should not inject for empty prompt');
    pass('before_agent_start no-ops on empty prompt');
  }

  // -----------------------------------------------------------------
  // tool_call: dangerous Bash → blocked
  // -----------------------------------------------------------------
  {
    const api = create();
    factory(api);
    const [decision] = await api.fire('tool_call', {
      toolName: 'Bash',
      params: { command: 'rm -rf /' },
    });
    if (!decision || decision.allow !== false) {
      fail('tool_call(Bash rm -rf /): expected allow:false, got ' + JSON.stringify(decision));
    }
    if (!/rm targeting root/i.test(decision.reason || '')) {
      fail('tool_call(Bash rm -rf /): reason missing rm-root marker, got: ' + decision.reason);
    }
    pass('tool_call blocks rm -rf /');
  }

  // -----------------------------------------------------------------
  // tool_call: Read .env → blocked by protect-secrets
  // -----------------------------------------------------------------
  {
    const api = create();
    factory(api);
    const [decision] = await api.fire('tool_call', {
      toolName: 'Read',
      params: { file_path: '/tmp/some-project/.env' },
    });
    if (!decision || decision.allow !== false) {
      fail('tool_call(Read .env): expected allow:false, got ' + JSON.stringify(decision));
    }
    if (!/.env/i.test(decision.reason || '')) {
      fail('tool_call(Read .env): reason missing .env mention, got: ' + decision.reason);
    }
    pass('tool_call blocks Read of .env');
  }

  // -----------------------------------------------------------------
  // tool_call: safe Bash (git status) → bash-compress transforms it
  // -----------------------------------------------------------------
  {
    const api = create();
    factory(api);
    const [decision] = await api.fire('tool_call', {
      sessionId: SESSION_ID,
      toolName: 'Bash',
      params: { command: 'git status', description: 'status check' },
    });
    if (!decision || decision.allow !== true) {
      fail('tool_call(Bash git status): expected allow:true, got ' + JSON.stringify(decision));
    }
    if (!decision.transformedParams || typeof decision.transformedParams.command !== 'string') {
      fail('tool_call(Bash git status): expected transformedParams.command, got ' + JSON.stringify(decision));
    }
    if (!/bash-optimizer/.test(decision.transformedParams.command)) {
      fail('tool_call(Bash git status): transformedParams.command not routed through bash-optimizer');
    }
    pass('tool_call wraps safe Bash via bash-compress');
  }

  // -----------------------------------------------------------------
  // tool_call: tool outside our scope (e.g., Glob) → pass-through
  // -----------------------------------------------------------------
  {
    const api = create();
    factory(api);
    const [decision] = await api.fire('tool_call', {
      toolName: 'Glob',
      params: { pattern: '**/*.ts' },
    });
    if (decision !== undefined) {
      fail('tool_call(Glob): expected undefined (pass-through), got ' + JSON.stringify(decision));
    }
    pass('tool_call passes through tools outside scope');
  }

  // -----------------------------------------------------------------
  // tool_result(Edit) → track-edits actually receives the payload
  // (proven via a fixture that writes the stdin to a marker file)
  // -----------------------------------------------------------------
  {
    const fs = require('fs'), os = require('os'), path = require('path');
    const marker = path.join(os.tmpdir(), 'pi-track-edits-' + SESSION_ID + '.json');
    process.env.PI_TRACK_EDITS_SCRIPT = path.join('$REPO', 'tests/pi/fixtures/track-edits-fake.js');
    process.env.PI_TRACK_EDITS_MARKER = marker;
    delete require.cache[require.resolve('$REPO/hooks/pi/dist/tool-result.js')];
    delete require.cache[require.resolve('$REPO/hooks/pi/dist/index.js')];
    const factoryFresh = require('$REPO/hooks/pi/dist/index.js').default;

    const api = create();
    factoryFresh(api);
    await api.fire('tool_result', {
      toolName: 'Edit',
      params: { file_path: '/tmp/x.txt', new_string: 'hi' },
      result: { ok: true },
      sessionId: SESSION_ID,
    });

    if (!fs.existsSync(marker)) fail('tool_result(Edit): track-edits never received the payload');
    const captured = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (captured.tool_name !== 'Edit') fail('tool_result(Edit): payload.tool_name was ' + captured.tool_name);
    if (!captured.tool_input || captured.tool_input.file_path !== '/tmp/x.txt') {
      fail('tool_result(Edit): payload.tool_input not forwarded correctly');
    }
    pass('tool_result(Edit) forwards full payload to track-edits');

    fs.unlinkSync(marker);
    delete process.env.PI_TRACK_EDITS_SCRIPT;
    delete process.env.PI_TRACK_EDITS_MARKER;
  }

  // -----------------------------------------------------------------
  // tool_result(Bash) → posttool-bash-compress output surfaces via
  // api.injectContext (the only way Pi can see the compressed summary).
  // -----------------------------------------------------------------
  {
    const path = require('path');
    process.env.PI_POSTTOOL_BASH_COMPRESS_SCRIPT = path.join('$REPO', 'tests/pi/fixtures/posttool-bash-compress-fake.js');
    delete require.cache[require.resolve('$REPO/hooks/pi/dist/tool-result.js')];
    delete require.cache[require.resolve('$REPO/hooks/pi/dist/index.js')];
    const factoryFresh = require('$REPO/hooks/pi/dist/index.js').default;

    const api = create();
    factoryFresh(api);
    await api.fire('tool_result', {
      toolName: 'Bash',
      params: { command: 'ls' },
      result: { stdout: 'a\nb\n' },
      sessionId: SESSION_ID,
    });

    if (api.contextInjections.length !== 1) {
      fail('tool_result(Bash): expected 1 context injection from compress, got ' + api.contextInjections.length);
    }
    if (!/compressed/.test(api.contextInjections[0])) {
      fail('tool_result(Bash): injected context missing compression marker');
    }
    pass('tool_result(Bash) surfaces posttool-bash-compress output via injectContext');

    delete process.env.PI_POSTTOOL_BASH_COMPRESS_SCRIPT;
  }

  // -----------------------------------------------------------------
  // input: skill expansion → track-session-stats invoked (no error)
  // input without skill expansion → no-op
  // -----------------------------------------------------------------
  {
    const api = create();
    factory(api);
    await api.fire('input', { skillExpansion: { skill: 'brainstorming' } });
    await api.fire('input', { text: 'hello' });
    pass('input adapter handles skill-expansion and plain text');
  }

  // -----------------------------------------------------------------
  // agent_end → stop-reminders' legacy {decision, reason} envelope must
  // surface via api.injectReminder. Use a fixture script that ALWAYS
  // emits the envelope to make this assertion deterministic (the real
  // hook fires conditionally based on session state).
  // -----------------------------------------------------------------
  {
    process.env.PI_STOP_REMINDERS_SCRIPT = require('path').join(
      '$REPO', 'tests/pi/fixtures/stop-reminders-fake.js'
    );
    // Re-load the agent-end module under the env override.
    delete require.cache[require.resolve('$REPO/hooks/pi/dist/agent-end.js')];
    delete require.cache[require.resolve('$REPO/hooks/pi/dist/index.js')];
    const factoryFresh = require('$REPO/hooks/pi/dist/index.js').default;

    const api = create();
    factoryFresh(api);
    await api.fire('agent_end', { sessionId: SESSION_ID, cwd: '$REPO' });

    if (api.reminderInjections.length !== 1) {
      fail('agent_end: expected 1 reminder injection from legacy envelope, got ' + api.reminderInjections.length);
    }
    if (!/FAKE REMINDER/.test(api.reminderInjections[0])) {
      fail('agent_end: reminder text did not contain the fixture marker');
    }
    pass('agent_end surfaces stop-reminders legacy {decision, reason} envelope');

    delete process.env.PI_STOP_REMINDERS_SCRIPT;
  }

  // Smoke: real stop-reminders.js dispatches without throwing (does not assert
  // a reminder was emitted, since that depends on dynamic session state).
  {
    const api = create();
    factory(api);
    await api.fire('agent_end', { sessionId: SESSION_ID + '-real', cwd: '$REPO' });
    pass('agent_end dispatches real stop-reminders without error');
  }

  // -----------------------------------------------------------------
  // Idempotency: factory(api) called twice must not double-register.
  // -----------------------------------------------------------------
  {
    const api = create();
    factory(api);
    factory(api);
    for (const e of ['session_start','before_agent_start','input','tool_call','tool_result','agent_end']) {
      if (api.handlers[e].length !== 1) {
        fail('factory idempotency: ' + e + ' has ' + api.handlers[e].length + ' handlers (expected 1)');
      }
    }
    pass('factory is idempotent (re-invocation does not double-register subscribers)');
  }

  // -----------------------------------------------------------------
  // Dispatch contract: a deny-with-updatedInput from bash-compress must
  // propagate as deny, not get downgraded to allow+transformedParams.
  // (Today the real hook never emits deny, but the dispatch contract
  // must hold for future / substitute hooks.)
  // -----------------------------------------------------------------
  {
    const path = require('path');
    process.env.PI_BASH_COMPRESS_SCRIPT = path.join('$REPO', 'tests/pi/fixtures/bash-compress-deny.js');
    delete require.cache[require.resolve('$REPO/hooks/pi/dist/tool-call.js')];
    delete require.cache[require.resolve('$REPO/hooks/pi/dist/index.js')];
    const factoryFresh = require('$REPO/hooks/pi/dist/index.js').default;

    const api = create();
    factoryFresh(api);
    const [decision] = await api.fire('tool_call', {
      sessionId: SESSION_ID + '-denyprop',
      toolName: 'Bash',
      params: { command: 'echo hello' },
    });

    if (!decision || decision.allow !== false) {
      fail('compress-deny: must propagate as allow:false, got ' + JSON.stringify(decision));
    }
    if (!/fixture/.test(decision.reason || '')) {
      fail('compress-deny: reason did not include fixture marker, got: ' + decision.reason);
    }
    pass('tool_call: bash-compress deny propagates (not downgraded to allow)');

    delete process.env.PI_BASH_COMPRESS_SCRIPT;
  }

  console.log('OK: all adapter dispatch scenarios passed');
})().catch(e => { console.error('FAIL: unhandled exception:', e); process.exit(1); });
"
