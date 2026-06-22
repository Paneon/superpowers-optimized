#!/usr/bin/env bash
# Pi (pi.dev) platform tests. Extended by each Pi support task.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

pass() { printf "  \033[32mPASS\033[0m %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m %s\n" "$1"; exit 1; }

echo "== Pi platform tests =="

# --- T1: SKILL.md frontmatter validator ---
echo "→ T1: SKILL.md frontmatter validator"
if ! "$HERE/validate-skill-frontmatter.sh" "$REPO/skills" >/dev/null; then
  fail "validator rejected real skills/ tree"
fi
pass "real skills/ tree is Pi-compatible"

if "$HERE/validate-skill-frontmatter.sh" "$HERE/fixtures" >/dev/null 2>&1; then
  fail "validator accepted bad-skill fixture (expected failure)"
fi
pass "validator rejected bad-skill fixture"

# --- T2: pi registered in plugin.universal.yaml ---
echo "→ T2: pi platform registered in plugin.universal.yaml"
node -e "
  const yaml = require('js-yaml');
  const fs = require('fs');
  const y = yaml.load(fs.readFileSync('$REPO/plugin.universal.yaml', 'utf8'));
  if (!y.meta || !Array.isArray(y.meta.platforms) || !y.meta.platforms.includes('pi')) {
    throw new Error('pi missing from meta.platforms');
  }
  if (!y.extensions || !y.extensions.pi) {
    throw new Error('extensions.pi block missing');
  }
  if (!y.extensions.pi.install_path)   throw new Error('extensions.pi.install_path missing');
  if (!y.extensions.pi.extension_path) throw new Error('extensions.pi.extension_path missing');
" || fail "manifest assertions failed"
pass "pi present in meta.platforms"
pass "extensions.pi.install_path and extension_path defined"

# --- T3: Pi extension entry-point loads against mocked ExtensionAPI ---
echo "→ T3: Pi extension loads and registers expected subscribers"
( cd "$REPO" && npm run build --silent ) >/dev/null || fail "tsc build failed"
pass "tsc build succeeded"

bash "$HERE/test-extension-loads.sh" >/dev/null || fail "extension-loads test failed"
pass "extension registers all expected lifecycle subscribers"

# --- T4–T9: Lifecycle adapter dispatch (session_start, before_agent_start,
#            tool_call, tool_result, input, agent_end) ---
echo "→ T4–T9: Lifecycle adapter dispatch end-to-end"
bash "$HERE/test-adapter-dispatch.sh" || fail "adapter dispatch test failed"

echo "== All Pi tests passed =="
