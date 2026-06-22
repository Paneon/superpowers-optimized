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
  // tool_result: Edit → track-edits invoked (no error)
  // tool_result: Bash → posttool-bash-compress invoked (no error)
  // (We assert no throw; track-edits has side effects on ~/.claude/ logs
  //  that we don't depend on.)
  // -----------------------------------------------------------------
  {
    const api = create();
    factory(api);
    await api.fire('tool_result', {
      toolName: 'Edit',
      params: { file_path: '/tmp/x.txt' },
      result: { ok: true },
    });
    await api.fire('tool_result', {
      toolName: 'Bash',
      params: { command: 'ls' },
      result: { stdout: 'a\nb\n' },
    });
    pass('tool_result Edit/Bash dispatch without error');
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
  // agent_end → stop-reminders runs and may inject reminder
  // (the reminder injection is optional — depends on stop-reminders logic
  //  for this session — but the handler must not throw.)
  // -----------------------------------------------------------------
  {
    const api = create();
    factory(api);
    await api.fire('agent_end', { sessionId: 't', cwd: '$REPO' });
    pass('agent_end dispatches stop-reminders without error');
  }

  console.log('OK: all adapter dispatch scenarios passed');
})().catch(e => { console.error('FAIL: unhandled exception:', e); process.exit(1); });
"
