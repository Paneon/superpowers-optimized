---
name: writing-plans
description: >
  MUST USE after design approval to decompose requirements into executable
  task plans. Produces contract-altitude plans — interfaces + the test that
  proves each task — that stay true as implementation reveals reality.
  Triggers on: "write a plan", "break this down", "plan the implementation",
  after brainstorming approval. Routed by brainstorming as the next step.
---

# Writing Plans

Create an implementation plan another agent can execute with minimal ambiguity.
The plan is a **contract**, not a transcript: it pins down what each task must
produce and the test that proves it — not the literal implementation lines,
which drift the moment the first task is built differently than imagined.

## Why contract altitude

A plan full of complete implementation code rots. Once Task 1 is built (or its
signature changes under review), every later task that quoted Task 1's code is
describing a past that no longer exists, and the executor builds against fiction.
So:

- **The interface is the contract.** Each task states the exact names, signatures,
  and types it *produces* and *consumes*. Later tasks depend on this block, not on
  a code snapshot.
- **The test is the spec.** Showing *test* code is good — it is the durable, executable
  statement of what "done" means. Showing *implementation* code is what goes stale:
  describe the change and let the implementer write it.
- **Illustrative code only.** If an implementation snippet genuinely clarifies intent,
  mark it `Illustrative (implementer writes the real thing):`. Never present it as lines to transcribe.

## Output Path

Save to `.claude/plans/YYYY-MM-DD-<feature-name>.md` — a working artifact, kept out
of any curated `docs/` tree. (User preferences for plan location override this.)

## Plan Header

```markdown
# <Feature Name> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — `<EXECUTION_SUB_SKILL>`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Resolve `<EXECUTION_SUB_SKILL>` at plan-generation time** (see Selection Logic below) and write the chosen value into this line before saving the plan. The two valid values are `superpowers-optimized:executing-plans` (inline) or `superpowers-optimized:subagent-driven-development` (subagent-driven). Do not leave the placeholder unresolved — the plan file must tell the reader, with no indirection, which skill to invoke.

**Goal:** <single sentence>
**Architecture:** <2-4 sentences>
**Tech Stack:** <languages/libraries/tools>
**Verification gate:** <the project's own commands — e.g. `make test-e2e`, `pnpm test`, `cargo test`. Read these from the project's CLAUDE.md/AGENTS.md/README; do NOT invent or hardcode a runner.>
**Assumptions:** <key assumptions this plan rests on. For each: "Assumes X — will NOT work if Y."> *(skip only if the plan contains zero conditional logic)*

---
```

## Scope Check

If the spec covers multiple independent subsystems, suggest breaking it into separate
plans — one per subsystem, each producing working, testable software on its own.

## File Structure

Before defining tasks, map which files will be created or modified and what each is
responsible for. Design units with clear boundaries and one responsibility each;
files that change together live together; follow established patterns in existing codebases.

## Phases and Task Right-Sizing

Group tasks into **phases**. A phase is a coherent slice that ends at a green run of the
project's verification gate — it is the **integration checkpoint**, the level that
actually catches regressions. There is **no per-task reviewer gate**, so do not fragment
into micro-tasks to manufacture review points. A task is the smallest slice that is
independently testable and worth its own commit. Fold setup/config/scaffolding into the
task whose deliverable needs them.

## Task Template

````markdown
### Task N: <Name>

**Files:** Create / Modify / Test — exact paths.

**Security flag:** `none` *(set to `security` if this task handles auth, credentials, input validation, permissions, crypto, or data-access boundaries — triggers pre-implementation security review)*

**Produces:** <names, signatures, types later tasks rely on — the single source of truth for this interface>
**Consumes:** <interfaces from earlier tasks — exact signatures>

**Acceptance:** <observable behavior> proven by <exact test file + what it asserts>.

**Does NOT cover:** *(required when this task adds a condition, gate, or "when X do Y" logic — state the scenarios it excludes. If an excluded scenario should be covered, revise this task before implementing.)*

- [ ] **Step 1: Write the failing test** (show the test — it is the contract)

```<lang>
<actual test code>
```

- [ ] **Step 2: Run it, confirm it fails for the right reason** — `<command>` → FAIL with "<reason>"
- [ ] **Step 3: Implement the minimal change to pass** *(describe the change; illustrative code only if it clarifies)*
- [ ] **Step 4: Run the test, confirm PASS** — `<command>`
- [ ] **Step 5: Commit** — `git commit -m "<message>"`
````

## Single Source of Truth

Interfaces live in the task's `Produces`/`Consumes` lines and nowhere else. When
execution forces an interface to change, the plan is updated *there* — so a later task
always reads the current contract, never a stale copy.

## No Placeholders (for the durable parts)

The interface, acceptance test, and verification commands must be concrete — never
"TBD", "add validation", "similar to Task N", or a test that asserts nothing. The
*implementation* steps are intentionally not full code; that is the point, not a gap.

## Self-Review (inline, no subagent)

1. **Coverage:** every spec requirement maps to a task. Add tasks for gaps.
2. **Interface consistency:** a name/type a later task *consumes* matches what an earlier task *produces* (`clearLayers()` in Task 3 ≠ `clearFullLayers()` in Task 7).
3. **Every task names its proving test.** No task is "done" by inspection.
4. **Scope-reduction scan:** search for "v1", "basic", "simple", "for now", "minimal" — verify each was user-sanctioned, not a quiet downgrade.

Fix issues inline; no re-review.

## Execution Handoff

After saving and self-review, auto-select the execution approach, output the ready
message, and **stop**. Do not invoke any execution skill until the user replies.

### Selection Logic (tier prior + scope judgment)

Numeric thresholds are a crude proxy for what actually decides whether a subagent pays off. You are better than those thresholds — read the *actual plan you just wrote* and judge fit. The active tier from the ambient `<subagent-mode>` block is a *prior*, not a verdict.

**Step 1 — Tier default** (read `<subagent-mode>` from session context; full matrix in `skills/using-superpowers/subagent-policy.md`):

| Tier            | Default mode      | Bias for proposing the other mode                                      |
| --------------- | ----------------- | ----------------------------------------------------------------------- |
| `inline-first`  | Inline            | Propose Subagent-Driven only if scope **overwhelmingly** warrants it.   |
| `balanced`      | Inline            | Propose Subagent-Driven if scope warrants it (no "overwhelming" needed).|
| `aggressive`    | Subagent-Driven   | Propose Inline if scope is small or tightly coupled.                    |

**Step 2 — Scope assessment.** Look at the plan you just wrote and reason about fit. Inputs that favor Subagent-Driven:
- Many genuinely independent tasks (file-disjoint, no shared in-memory state, no sequential dependency)
- High current context window pressure (offloading per-task context to fresh subagents has clear value)
- Tasks where parallel wall-clock wins matter (long-running each)

Inputs that favor Inline:
- Few tasks, or tasks that share state / files / patterns
- Subtle interface coupling where one task's design informs the next
- A plan small enough that per-subagent setup cost exceeds the work

**Step 3 — Decision.**

- If scope assessment **agrees with the tier default** → use the default, *silently*. No ask.
- If scope assessment **points to the non-default mode** → ask the user with your reasoning: `"Tier default is <DEFAULT> for this plan, but <N> tasks across disjoint files (or: high context pressure / clear parallel wins) suggest <OTHER> would fit better. Go with <OTHER>? [y/N]"`. Default no (stick with the tier default unless the user agrees).

**Step 4 — Bake the resolved mode into the plan header** (replace `<EXECUTION_SUB_SKILL>` in the plan template with `superpowers-optimized:executing-plans` or `superpowers-optimized:subagent-driven-development`). The plan file must state the chosen skill directly — no pointer to ambient state the reader can't see.

**Plan drafting itself (this skill, right now):** under `inline-first` or `balanced`, if you consider dispatching a subagent to *draft the plan*, ask first: `"This would normally run inline. Dispatch a subagent for it? [y/N]"`. Default no. Under `aggressive`, dispatch freely. Pre-design research (e.g., `Explore` to map related files) is not "drafting" and follows the normal tier rules.

### Ready Message
```
Plan saved to `.claude/plans/<filename>.md` — execution mode **[Subagent-Driven / Inline]** baked in (<N> tasks, tier=<tier>[, one-word reason]). Reply to start, or say "inline" / "subagent" to switch (I'll update the plan header).
```

**Stop here.** On reply:
- **Subagent-Driven:** REQUIRED SUB-SKILL — `superpowers-optimized:subagent-driven-development`
- **Inline:** REQUIRED SUB-SKILL — `superpowers-optimized:executing-plans`
- **If the user switches** the mode after the Ready Message, update `<EXECUTION_SUB_SKILL>` in the plan file before handing off — the plan must stay accurate.
