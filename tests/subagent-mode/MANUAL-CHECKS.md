# Manual Behavioral Checks — `subagent_mode`

The grep-based test runner (`run-tests.sh`) verifies that the policy doc, hook output, and skill prose are present and well-formed. It cannot verify that the model actually reads and acts on the ambient `<dispatch-thresholds>` block. These four scenarios cover that.

Each scenario assumes a fresh Claude Code session is opened from this repo root **after** editing `~/.config/superpowers/config.conf`.

## 1. `writing-plans` Selection Logic respects the tier

**Setup.** Complete a brainstorming session for a small feature so a design spec exists. The plan that `writing-plans` produces should have **3 tasks**, all touching disjoint files.

**Run for each tier value** (`inline-first`, `balanced`, `aggressive`):
1. Set `subagent_mode=<tier>` in `~/.config/superpowers/config.conf` and restart Claude.
2. Invoke `writing-plans`.
3. Read the "Ready Message" emitted at the end.

**Expected:**
- `inline-first`: Ready Message reports `Inline Execution` (no user opt-in given).
- `balanced`: `Inline Execution` (3 tasks < 8 threshold).
- `aggressive`: `Inline Execution` (3 tasks < 5 threshold).

Then **repeat with a 6-task plan** (independent, disjoint files):
- `inline-first`: still `Inline` (no opt-in).
- `balanced`: still `Inline` (6 < 8).
- `aggressive`: `Subagent-Driven Execution` (6 ≥ 5).

This confirms the tier-aware threshold logic in `skills/writing-plans/SKILL.md` is actually being applied.

## 2. Reactive ask before drafting dispatch (the regression test)

**Setup.** Open a fresh session. Do not pre-load any design.

**Steps:**
1. Set `subagent_mode=balanced`. Restart Claude.
2. Send a prompt that would tempt the model to spawn a subagent for spec drafting — e.g., "use brainstorming to design a notifications subsystem; feel free to dispatch subagents for the heavy lifting."
3. Observe what the model does.

**Expected (the bug fix):** The model proceeds inline OR asks the user `"This would normally run inline. Dispatch a subagent for it? [y/N]"` before dispatching anything. It does NOT silently spawn a subagent to draft the spec.

**Repeat under `subagent_mode=aggressive`:** dispatching without asking is now permitted. The model may legitimately dispatch a subagent for drafting if it judges it helpful.

This is the direct regression test for the original `/writing-plans` bug that motivated the entire feature.

## 3. Code review runs inline under non-aggressive tiers

**Setup.** Make a small code change worth reviewing (e.g., one function, one test).

**Run for each tier value:**
1. Set `subagent_mode=<tier>` in config and restart Claude.
2. Invoke `requesting-code-review`.
3. Observe whether a subagent is dispatched (look for an `Agent` tool call to `superpowers-optimized:code-reviewer`).

**Expected:**
- `inline-first`: review runs in the main loop, no Agent dispatch.
- `balanced`: same as inline-first (review inline).
- `aggressive`: the `code-reviewer` subagent is dispatched as in prior behavior.

## 4. Explicit user override wins under `inline-first`

**Setup.** `subagent_mode=inline-first` in config. Restart Claude.

**Steps:**
1. Write a plan with 4 independent disjoint tasks (below `aggressive`'s threshold of 5, well below `balanced`'s 8).
2. Send the prompt: "Use subagents aggressively for this — dispatch parallel implementers."
3. Observe what `writing-plans` / `subagent-driven-development` decide.

**Expected:** The explicit user instruction wins (per `using-superpowers` Instruction Priority), and the model dispatches subagents. The tier default does **not** override an explicit user directive.

This documents the override path so users on `inline-first` aren't trapped when they genuinely need parallel work on a one-off task.
