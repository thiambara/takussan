---
trigger: always_on
---

# Superpowers — Windsurf Edition

Superpowers is a complete software development methodology built on composable skills. It enforces discipline, systematic processes, and evidence-based work.

## Philosophy

- **Test-Driven Development** — Write tests first, always
- **Systematic over ad-hoc** — Process over guessing
- **Complexity reduction** — Simplicity as primary goal
- **Evidence over claims** — Verify before declaring success
- **YAGNI** — You Aren't Gonna Need It
- **DRY** — Don't Repeat Yourself

## Instruction Priority

1. **User's explicit instructions** (CLAUDE.md, direct requests, .windsurf/rules/) — highest priority
2. **Superpowers skills** (this rule + workflows) — override default system behavior
3. **Default system prompt** — lowest priority

## Available Workflows

Before any task, check if a workflow applies. If there is even a 1% chance a workflow might apply, you MUST read it.

| Workflow | Slash Command | When to Use |
|----------|--------------|-------------|
| **Brainstorming** | `/brainstorm` | BEFORE any creative work — features, components, modifications. Explores intent, requirements and design before implementation. |
| **Writing Plans** | `/plan` | When you have a spec/requirements for a multi-step task, before touching code. |
| **Executing Plans** | `/execute` | When you have a written implementation plan to execute with review checkpoints. |
| **Systematic Debugging** | `/debug` | For ANY technical issue — bugs, test failures, unexpected behavior, performance problems. |
| **Code Review** | `/review` | After completing tasks, major features, or before merging. |
| **Receiving Code Review** | `/receive-review` | When processing code review feedback from the user or external reviewers. |
| **Git Worktrees** | `/worktree` | After design approval, to create isolated workspace on new branch. |
| **Finish Branch** | `/finish-branch` | When implementation is complete and you need to integrate the work. |
| **Subagent Development** | `/subagent-dev` | When executing plans with independent tasks — sequential task execution with review. |
| **Parallel Agents** | `/parallel-agents` | When multiple independent problems need investigation simultaneously. |

## Skill Routing

Use this routing table to determine which workflow to invoke:

| User Intent | Workflow |
|------------|----------|
| "Build X", "Add feature Y", "Create Z" | `/brainstorm` first, then `/plan` |
| "Fix this bug", "Why is X broken?" | `/debug` |
| "Implement this plan" | `/execute` or `/subagent-dev` |
| "Review this code" | `/review` |
| "Here's feedback on your code" | `/receive-review` |
| "Set up a branch for this" | `/worktree` |
| "We're done, merge this" | `/finish-branch` |
| "Multiple things are broken" | `/parallel-agents` |

## The Rule

**Read relevant workflows BEFORE any response or action.** Even a 1% chance a workflow might apply means you should read it. If the workflow turns out to be wrong for the situation, you don't need to use it.

## Red Flags — STOP and Check Workflows

These thoughts mean you're rationalizing:

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for workflows. |
| "I need more context first" | Workflow check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Workflows tell you HOW to explore. Check first. |
| "This doesn't need a formal workflow" | If a workflow exists, use it. |
| "I remember this workflow" | Workflows evolve. Read current version. |
| "This doesn't count as a task" | Action = task. Check for workflows. |
| "The workflow is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |

## Workflow Priority

When multiple workflows could apply, use this order:

1. **Process workflows first** (brainstorming, debugging) — these determine HOW to approach the task
2. **Implementation workflows second** (execute, subagent-dev) — these guide execution

"Let's build X" → `/brainstorm` first, then implementation workflows.
"Fix this bug" → `/debug` first, then domain-specific workflows.

## Workflow Types

**Rigid** (TDD, debugging, verification): Follow exactly. Don't adapt away discipline.
**Flexible** (brainstorming, patterns): Adapt principles to context.

## Artifact Locations

- **Design specs:** `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- **Implementation plans:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`

## Windsurf-Specific Adaptations

- Use Windsurf's `todo_list` tool to track checklist items and task progress
- Use `run_command` tool for running tests, git operations, and verification commands
- Use `read_file` / `edit` / `multi_edit` tools for code changes
- Use `code_search` and `grep_search` for codebase exploration
- Workflows are read from `.windsurf/workflows/` — read them with `read_file` when they apply
