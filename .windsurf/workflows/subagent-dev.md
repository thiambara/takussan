---
description: When executing plans with independent tasks — sequential task execution with review.
---

# Subagent-Driven Development (Windsurf Adaptation)

Execute plan by working through each task sequentially with self-review after each: spec compliance review first, then code quality review.

**Why this approach:** In Windsurf, there are no subagents. Instead, you execute each task with fresh focus, performing the same two-stage review process that Superpowers uses with subagents — but inline. The discipline remains identical.

**Core principle:** One task at a time + two-stage review (spec then quality) = high quality, fast iteration.

## When to Use

- You have an implementation plan (from `/plan` workflow)
- Tasks are mostly independent
- You want thorough review after each task

**vs. `/execute` workflow:**

- More thorough (two-stage review per task vs. batch review)
- Better quality gates (spec compliance + code quality)
- Slightly slower but catches issues earlier

## The Process

### Step 1: Load Plan and Create Todo List

1. Read the plan file with `read_file`
2. Extract all tasks with their full text
3. Create `todo_list` with all tasks
4. Review plan critically — raise concerns before starting

### Step 2: Execute Each Task

For each task:

#### 2a. Implement

1. Mark task as `in_progress` in `todo_list`
2. Follow each step exactly (plan has bite-sized steps)
3. Follow TDD discipline (`.windsurf/rules/tdd.md`):
   - Write failing test → run it → implement → run it → commit
4. Self-review: Before moving to review, check your own work
   - Did you miss anything?
   - Any shortcuts you took?

#### 2b. Spec Compliance Review

Ask yourself these questions and answer honestly:

- [ ] Does the implementation match ALL spec/plan requirements for this task?
- [ ] Is anything MISSING that the spec requires?
- [ ] Is there anything EXTRA that wasn't requested? (YAGNI violation)
- [ ] Do types, method signatures, property names match the plan?

**If issues found:** Fix them. Re-check.
**If clean:** Proceed to code quality review.

#### 2c. Code Quality Review

Review the code changes for this task:

```bash
git diff HEAD~1 --stat
git diff HEAD~1
```

Check:

- [ ] Clean, readable code following project conventions
- [ ] No duplication (DRY)
- [ ] Proper error handling
- [ ] No hardcoded values that should be configurable
- [ ] Tests are thorough and descriptive
- [ ] No new warnings or lint errors

**If issues found:** Fix them. Re-run review.
**If clean:** Mark task complete.

#### 2d. Mark Complete

1. Mark task as `completed` in `todo_list`
2. Move to next task

### Step 3: Final Review

After ALL tasks complete:

1. Run full test suite via `run_command`
2. Review all changes together:

```bash
git log --oneline -n 20
git diff main --stat
```

3. Check overall spec compliance:
   - Re-read the spec/plan
   - Verify every requirement has been implemented
   - Report any gaps

### Step 4: Finish

- Read and follow `/finish-branch` workflow
- Verify tests → Present options → Execute choice

## Handling Blockers

**If blocked on a task:**

1. Note what's blocking you
2. Try to resolve with available context
3. If you can't resolve: STOP and ask user
4. Don't skip the task or force through

**If a task is too large:**

1. Break it into smaller sub-tasks
2. Update the `todo_list`
3. Execute sub-tasks individually

## Red Flags

**Never:**

- Skip either review stage (spec compliance OR code quality)
- Proceed with unfixed issues
- Skip TDD discipline for any task
- Mark task complete without both reviews passing
- Start code quality review before spec compliance passes

**Always:**

- Follow plan steps exactly
- Review after EACH task (not in batches)
- Fix issues before moving to next task
- Stop when blocked, don't guess

## Integration

**Related workflows:**

- `/worktree` — Set up isolated workspace before starting
- `/plan` — Creates the plan this workflow executes
- `/review` — Review template for each task
- `/finish-branch` — Complete development after all tasks
