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

echo "== All Pi tests passed =="
