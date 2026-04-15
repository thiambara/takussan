---
description: After completing tasks, major features, or before merging to verify work meets requirements.
---

# Requesting Code Review

Review code systematically to catch issues before they cascade.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**

- After completing a major feature
- Before merge to main
- After each task in plan execution

**Optional but valuable:**

- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Review

### 1. Get the scope of changes

```bash
# See what changed
git diff --stat HEAD~1
git log --oneline -n 5
```

### 2. Perform the review checklist

For each changed file, evaluate:

**Spec Compliance:**

- [ ] Does the implementation match the spec/plan requirements?
- [ ] Is anything missing that the spec requires?
- [ ] Is there anything extra that wasn't requested? (YAGNI violation)

**Code Quality:**

- [ ] Clean, readable code following project conventions
- [ ] No duplication (DRY)
- [ ] Proper error handling
- [ ] No hardcoded values that should be configurable
- [ ] Types are correct and complete

**Testing:**

- [ ] Tests exist for new functionality
- [ ] Tests follow TDD (were written first)
- [ ] Edge cases covered
- [ ] Tests are readable and descriptive

**Integration:**

- [ ] No regressions (all existing tests still pass)
- [ ] Build succeeds
- [ ] No new warnings or errors

### 3. Categorize issues found

- **Critical** — Blocks progress. Must fix immediately (bugs, security, missing requirements)
- **Important** — Fix before proceeding (quality issues, missing tests)
- **Minor** — Note for later (style, naming, optimization)

### 4. Act on findings

- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back on your own work if review reveals problems

## Review Report Template

```markdown
## Code Review: [Feature/Task Name]

**Changes reviewed:** [files changed]
**Commit range:** [base..head]

### Strengths
- [What's done well]

### Issues Found
#### Critical
- [Issue description + location]

#### Important
- [Issue description + location]

#### Minor
- [Issue description + location]

### Assessment
[Ready to proceed / Needs fixes / Major rework needed]
```

## Red Flags

**Never:**

- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Rush review under time pressure

## Integration

**Used by:**

- `/execute` — Review after each batch of tasks
- `/subagent-dev` — Review after each task
- `/finish-branch` — Final review before merge
