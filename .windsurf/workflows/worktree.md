---
description: After design approval, to create isolated workspace on new branch.
---

# Using Git Worktrees

Git worktrees create isolated workspaces sharing the same repository, allowing work on multiple branches simultaneously without switching.

**Core principle:** Systematic directory selection + safety verification = reliable isolation.

## Directory Selection Process

Follow this priority order:

1. **Check if `.worktrees/` or `worktrees/` exists** in the project root
2. **Check CLAUDE.md or project docs** for worktree preferences
3. **Ask user** for preferred location

## Creation Steps

### 1. Detect Project Name

```bash
project=$(basename "$(git rev-parse --show-toplevel)")
```

### 2. Create Worktree

```bash
# Determine branch name from feature
BRANCH_NAME="feat/<feature-name>"

# Create worktree directory if needed
mkdir -p .worktrees

# Create worktree with new branch
git worktree add ".worktrees/$BRANCH_NAME" -b "$BRANCH_NAME"
```

### 3. Verify .gitignore

Ensure the worktree directory is in `.gitignore`:

```bash
# Check if already ignored
grep -q '.worktrees' .gitignore 2>/dev/null || echo '.worktrees/' >> .gitignore
```

If you had to add it, commit the change:

```bash
git add .gitignore
git commit -m "chore: add .worktrees to .gitignore"
```

### 4. Run Project Setup

Auto-detect and run appropriate setup in the new worktree:

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# PHP/Laravel
if [ -f composer.json ]; then composer install; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
```

### 5. Verify Clean Baseline

Run tests to ensure worktree starts clean:

```bash
# Use project-appropriate test command
npm test
# or: php artisan test
# or: pytest
```

**If tests fail:** Report failures, ask whether to proceed or investigate.
**If tests pass:** Report ready.

### 6. Report Location

```text
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## Quick Reference

| Situation | Action |
|-----------|--------|
| `.worktrees/` exists | Use it (verify ignored) |
| `worktrees/` exists | Use it (verify ignored) |
| Neither exists | Create `.worktrees/`, add to .gitignore |
| Directory not ignored | Add to .gitignore + commit |
| Tests fail during baseline | Report failures + ask |
| No dependency file | Skip dependency install |

## Common Mistakes

- **Skipping ignore verification** — Worktree directory MUST be in `.gitignore`
- **Assuming directory location** — Always check existing directories first
- **Proceeding with failing tests** — Report and ask, don't proceed silently
- **Hardcoding setup commands** — Auto-detect from project files

## Red Flags

**Never:**

- Create worktree without verifying `.gitignore`
- Proceed with failing baseline tests without asking
- Skip project setup (dependencies, etc.)
- Hardcode project-specific setup commands

## Integration

**Called by:**

- `/brainstorm` — After design approval
- `/execute` — Before starting plan execution

**Pairs with:**

- `/finish-branch` — Cleans up worktree when done
