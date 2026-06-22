#!/usr/bin/env bash
# subagent-mode test suite
# Tests: policy doc structure, hook config parsing, ambient block emission, skill prose updates, docs.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PASS=0
FAIL=0
ERRORS=()
TMPFILES=()
TMPDIRS=()

cleanup() {
  for f in "${TMPFILES[@]}"; do rm -f "$f" 2>/dev/null; done
  for d in "${TMPDIRS[@]}"; do rm -rf "$d" 2>/dev/null; done
}
trap cleanup EXIT

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
red()   { printf '\033[0;31m%s\033[0m\n' "$1"; }
bold()  { printf '\033[1m%s\033[0m\n' "$1"; }

mktmp() {
  local f
  f=$(mktemp)
  TMPFILES+=("$f")
  echo "$f"
}

mktmp_dir() {
  local d
  d=$(mktemp -d)
  TMPDIRS+=("$d")
  echo "$d"
}

# Build a temp HOME containing ~/.config/superpowers/config.conf from a fixture.
# Returns the temp HOME path on stdout.
mktmp_dir_with_config() {
  local fixture="$1"
  local home
  home=$(mktmp_dir)
  mkdir -p "$home/.config/superpowers"
  cp "$fixture" "$home/.config/superpowers/config.conf"
  echo "$home"
}

assert() {
  local desc="$1" result="$2" expected="$3"
  if [ "$result" = "$expected" ]; then
    green "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $desc"
    red "        expected: '$expected'"
    red "        got:      '$result'"
    ERRORS+=("$desc")
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    green "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $desc (expected to contain: '$needle')"
    red "        got: $(echo "$haystack" | head -c 200)"
    ERRORS+=("$desc")
    FAIL=$((FAIL + 1))
  fi
}

# Phase 1.1 — Policy doc structure
test_policy_doc_has_all_three_tier_blocks() {
  bold "Policy doc structure"
  local doc="$PLUGIN_ROOT/skills/using-superpowers/subagent-policy.md"
  if [ ! -f "$doc" ]; then
    red "  FAIL: policy doc not found at $doc"
    FAIL=$((FAIL + 1))
    return
  fi
  for tier in inline-first balanced aggressive; do
    local start_marker="<!-- TIER-RULES:$tier START -->"
    local end_marker="<!-- TIER-RULES:$tier END -->"
    local content
    content=$(awk "/$start_marker/{flag=1;next} /$end_marker/{flag=0} flag" "$doc" | tr -d '[:space:]')
    assert "tier block '$tier' has content" "$([ -n "$content" ] && echo yes || echo no)" "yes"
  done
}

# Phase 1.2 — Hook behavior
test_hook_emits_aggressive_block() {
  bold "Hook: emits aggressive block"
  local fixture="$SCRIPT_DIR/fixtures/config-aggressive.conf"
  local home
  home=$(mktmp_dir_with_config "$fixture")
  local out
  out=$(HOME="$home" "$PLUGIN_ROOT/hooks/session-start" 2>/dev/null || true)
  assert_contains "aggressive tag emitted" "$out" "<subagent-mode>aggressive</subagent-mode>"
  assert_contains "aggressive rules contain 'dispatch freely'" "$out" "dispatch freely"
}

test_hook_emits_balanced_when_config_missing() {
  bold "Hook: balanced default when config missing"
  local home
  home=$(mktmp_dir)
  local out
  out=$(HOME="$home" "$PLUGIN_ROOT/hooks/session-start" 2>/dev/null || true)
  assert_contains "balanced default" "$out" "<subagent-mode>balanced</subagent-mode>"
}

test_hook_falls_back_on_invalid_value() {
  bold "Hook: invalid value falls back to balanced"
  local fixture="$SCRIPT_DIR/fixtures/config-invalid.conf"
  local home
  home=$(mktmp_dir_with_config "$fixture")
  local out
  out=$(HOME="$home" "$PLUGIN_ROOT/hooks/session-start" 2>/dev/null || true)
  assert_contains "invalid value → balanced fallback" "$out" "<subagent-mode>balanced</subagent-mode>"
}

test_hook_emits_inline_first_block() {
  bold "Hook: emits inline-first block"
  local fixture="$SCRIPT_DIR/fixtures/config-inline-first.conf"
  local home
  home=$(mktmp_dir_with_config "$fixture")
  local out
  out=$(HOME="$home" "$PLUGIN_ROOT/hooks/session-start" 2>/dev/null || true)
  assert_contains "inline-first tag emitted" "$out" "<subagent-mode>inline-first</subagent-mode>"
}

# Phase 2.1 — Brainstorming reactive-ask section
test_brainstorming_has_tier_aware_section() {
  bold "Brainstorming: tier-aware section"
  local f="$PLUGIN_ROOT/skills/brainstorming/SKILL.md"
  assert "tier-aware section present" "$(grep -c 'Subagent dispatch (tier-aware)' "$f")" "1"
  assert "reactive ask prompt present" "$(grep -c 'Dispatch a subagent for it? \[y/N\]' "$f")" "1"
}

# Phase 2.2 — Writing-plans tier-aware Selection Logic
test_writing_plans_has_tier_aware_thresholds() {
  bold "Writing-plans: tier-aware thresholds"
  local f="$PLUGIN_ROOT/skills/writing-plans/SKILL.md"
  assert "balanced threshold present" "$(grep -c 'context ≥75% OR ≥8 disjoint tasks' "$f")" "1"
  assert "reactive ask for plan drafting" "$(grep -c 'Dispatch a subagent for it? \[y/N\]' "$f")" "1"
}

# Phase 2.3 — Remaining skills consult the ambient block
test_remaining_skills_consult_ambient_block() {
  bold "Remaining skills: consult ambient block"
  assert "sdd cites ambient block" \
    "$(grep -c 'consult the ambient <dispatch-thresholds> block' "$PLUGIN_ROOT/skills/subagent-driven-development/SKILL.md")" "1"
  assert "parallel-agents tier-aware" \
    "$(grep -c '≥3 disjoint tasks' "$PLUGIN_ROOT/skills/dispatching-parallel-agents/SKILL.md")" "1"
  assert "code-review inline under non-aggressive" \
    "$(grep -c 'run the code review inline in the main loop' "$PLUGIN_ROOT/skills/requesting-code-review/SKILL.md")" "1"
  assert "using-superpowers points to policy doc" \
    "$(grep -c 'subagent-policy.md' "$PLUGIN_ROOT/skills/using-superpowers/SKILL.md")" "1"
}

# Phase 3 — Docs
test_docs_updated() {
  bold "Docs: README + RELEASE-NOTES + MANUAL-CHECKS"
  assert "README configuration section" \
    "$([ "$(grep -c 'subagent_mode' "$PLUGIN_ROOT/README.md")" -ge 1 ] && echo yes || echo no)" "yes"
  assert "RELEASE-NOTES entry" \
    "$(grep -c 'balanced by default' "$PLUGIN_ROOT/RELEASE-NOTES.md")" "1"
  assert "manual-checks doc exists" \
    "$([ -f "$PLUGIN_ROOT/tests/subagent-mode/MANUAL-CHECKS.md" ] && echo yes || echo no)" "yes"
}

# ── Runner ────────────────────────────────────────────────────────────────────

bold "subagent-mode test suite"
echo "Plugin root: $PLUGIN_ROOT"
echo ""

# Discover and run all test_* functions in declaration order
for fn in $(declare -F | awk '/declare -f test_/ {print $3}'); do
  "$fn"
  echo ""
done

bold "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  red "Failures:"
  for e in "${ERRORS[@]}"; do red "  - $e"; done
  exit 1
fi
exit 0
