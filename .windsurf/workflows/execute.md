---
description: When you have a written implementation plan to execute with review checkpoints.
---

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Note:** For best results, use `/subagent-dev` workflow instead if executing plans with independent tasks. This workflow is for batch execution with human checkpoints.

## The Process

### Step 1: Load and Review Plan

1. Read the plan file with `read_file`
2. Review critically — identify any questions or concerns about the plan
3. If concerns: Raise them with the user before starting
4. If no concerns: Create `todo_list` with all tasks and proceed

### Step 2: Execute Tasks

For each task:

1. Mark as `in_progress` in `todo_list`
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified via `run_command`
4. Mark as `completed` in `todo_list`

**Follow TDD discipline** (see `.windsurf/rules/tdd.md`):

- Write failing test first
- Watch it fail via `run_command`
- Write minimal code to pass
- Watch it pass via `run_command`
- Commit

### Step 3: Complete Development

After all tasks complete and verified:

- Read and follow `/finish-branch` workflow
- Verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**

- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**

- User updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** — stop and ask.

## Remember

- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Read referenced workflows when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent

## Integration

**Related workflows:**

- `/worktree` — Set up isolated workspace before starting
- `/plan` — Creates the plan this workflow executes
- `/finish-branch` — Complete development after all tasks
