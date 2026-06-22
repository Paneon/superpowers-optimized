# Subagent Dispatch Policy

Single source of truth for tier-aware subagent dispatch decisions. The `SessionStart`
hook reads this file and emits the active tier's rules as an ambient
`<dispatch-thresholds>` block into session context. All dispatch-decision skills
(`writing-plans`, `subagent-driven-development`, `dispatching-parallel-agents`,
`requesting-code-review`, `brainstorming`, `using-superpowers`) consult that block.

The user's tier comes from `~/.config/superpowers/config.conf`:

```ini
subagent_mode=balanced   # inline-first | balanced | aggressive
```

Default when unset, invalid, or unreadable: **balanced**.

## Threshold Matrix

| Decision point                                                   | inline-first                     | balanced (default)                  | aggressive                            |
| ---------------------------------------------------------------- | -------------------------------- | ----------------------------------- | ------------------------------------- |
| `writing-plans` Selection Logic → Subagent-Driven                | only on explicit user request    | context ≥75% OR ≥8 disjoint tasks   | context ≥60% OR ≥5 disjoint tasks     |
| `subagent-driven-development` dispatch                           | not without user opt-in          | true parallel waves only (≥3 disjoint) | freely                             |
| `requesting-code-review` reviewer subagent                       | inline review                    | inline review                       | dispatch subagent                     |
| `dispatching-parallel-agents`                                    | discouraged; propose inline      | allowed when independence proven    | freely                                |
| `brainstorming` / `writing-plans` drafting <sup>†</sup>          | ask user first; default no       | ask user first; default no          | dispatch freely                       |

<sup>†</sup> "Drafting" means writing the spec or plan output itself. Pre-design *research*
(e.g., dispatching `Explore` to map the codebase) is not drafting and follows the normal
dispatch rules for the active tier.

## Hard Rule Notes

- **Reactive ask format.** Under `inline-first` and `balanced`, when the model considers
  dispatching a subagent for *drafting*, it must first ask the user:
  `"This would normally run inline. Dispatch a subagent for it? [y/N]"`. Default is no.
  Only proceed on explicit yes.
- **Explicit user instructions win.** Per `using-superpowers` Instruction Priority, an
  explicit user instruction ("dispatch aggressively for this task") overrides the tier's
  default. This is the documented override path.
- **Tier is locked at session start.** Editing `config.conf` mid-session has no effect
  until the next session.

## Tier Rules (consumed by the SessionStart hook)

The hook extracts the active tier's block between its sentinels and emits the contents
verbatim inside `<dispatch-thresholds>`. Keep each tier's rules to one line per decision
point — the block lands in every turn's context, so concision matters.

<!-- TIER-RULES:inline-first START -->
writing-plans Selection Logic → Subagent-Driven: only on explicit user request; otherwise Inline.
subagent-driven-development dispatch: not without explicit user opt-in.
requesting-code-review reviewer subagent: run inline review.
dispatching-parallel-agents: discouraged; propose inline first.
brainstorming / writing-plans drafting: ASK the user before dispatching a subagent ("This would normally run inline. Dispatch a subagent for it? [y/N]") — proceed only on explicit yes.
<!-- TIER-RULES:inline-first END -->

<!-- TIER-RULES:balanced START -->
writing-plans Selection Logic → Subagent-Driven: context ≥75% OR ≥8 disjoint tasks; else Inline.
subagent-driven-development dispatch: true parallel waves only (≥3 disjoint tasks).
requesting-code-review reviewer subagent: run inline review.
dispatching-parallel-agents: allowed when independence proven.
brainstorming / writing-plans drafting: ASK the user before dispatching a subagent ("This would normally run inline. Dispatch a subagent for it? [y/N]") — proceed only on explicit yes.
<!-- TIER-RULES:balanced END -->

<!-- TIER-RULES:aggressive START -->
writing-plans Selection Logic → Subagent-Driven: context ≥60% OR ≥5 disjoint tasks; else Inline.
subagent-driven-development dispatch: dispatch freely for any independent work.
requesting-code-review reviewer subagent: dispatch the code-reviewer subagent.
dispatching-parallel-agents: dispatch freely when standard independence checks hold.
brainstorming / writing-plans drafting: dispatch freely when useful (no ask required).
<!-- TIER-RULES:aggressive END -->
