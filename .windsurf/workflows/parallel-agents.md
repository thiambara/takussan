---
description: When multiple independent problems need investigation simultaneously.
---

# Dispatching Parallel Investigations (Windsurf Adaptation)

When you have multiple unrelated failures (different test files, different subsystems, different bugs), investigating them sequentially wastes time. This workflow helps you structure parallel-safe investigations.

**Windsurf adaptation:** Since Windsurf doesn't support true parallel subagents, this workflow helps you structure independent investigations so they can be executed efficiently one after another without cross-contamination of context.

**Core principle:** Identify independent problem domains, investigate each with fresh focus, integrate all fixes.

## When to Use

- 3+ test files failing with different root causes
- Multiple subsystems broken independently
- Each problem can be understood without context from others
- No shared state between investigations

**Don't use when:**

- Failures are related (fix one might fix others)
- Need to understand full system state
- Investigations would interfere (editing same files)

## The Pattern

### 1. Identify Independent Domains

Group failures by what's broken:

```text
Domain A: [Test file / subsystem] — [symptom]
Domain B: [Test file / subsystem] — [symptom]
Domain C: [Test file / subsystem] — [symptom]
```

Each domain is independent — fixing one doesn't affect others.

### 2. Create Investigation Plan

For each domain, define:

- **Specific scope:** One test file or subsystem
- **Clear goal:** Make these tests pass / fix this behavior
- **Constraints:** Don't change code outside this domain
- **Expected output:** Summary of root cause and changes

Create a `todo_list` with one item per domain.

### 3. Execute Investigations Sequentially

For each domain (in order of perceived difficulty — easiest first):

1. Mark as `in_progress`
2. Follow `/debug` workflow for this specific domain
3. Stay scoped — don't touch code outside this domain
4. Document what you found and fixed
5. Commit changes for this domain separately
6. Mark as `completed`

**Between domains:** Clear your mental context. Start fresh for next domain.

### 4. Verify Integration

After all domains investigated:

```bash
# Run full test suite
npm test  # or appropriate command

# Check for conflicts between fixes
git log --oneline -n 10
```

- **All pass:** Integration successful
- **New failures:** Fixes conflicted — investigate the interaction
- **Spot check:** Review each fix briefly to ensure consistency

## Investigation Prompt Structure

For each domain, structure your investigation like this:

```text
DOMAIN: [Name]
SCOPE: [Specific files/tests]
SYMPTOMS: [Error messages, failing tests]
CONSTRAINTS: [Don't touch X, only modify Y]

Investigation:
1. Read the failing tests/code
2. Identify root cause (follow /debug workflow)
3. Fix the root cause
4. Verify fix

Result:
- Root cause: [what was wrong]
- Fix: [what changed]
- Files modified: [list]
```

## Common Mistakes

- **Too broad:** "Fix all the tests" → gets lost. Be specific per domain.
- **No constraints:** Investigations bleed into each other's code
- **No isolation:** Fixing domain A accidentally breaks domain B
- **Skipping integration check:** Individual fixes may conflict

## Key Benefits

1. **Structure** — Each investigation has clear scope
2. **Focus** — One problem at a time, no context switching
3. **Independence** — Fixes don't interfere with each other
4. **Traceability** — Each fix committed separately with clear scope

## Red Flags

**Never:**

- Mix investigations (fix two domains in one commit)
- Skip the integration verification
- Assume fixes won't conflict
- Investigate related failures separately (investigate together)

**Always:**

- Commit each domain's fix separately
- Run full test suite after all fixes
- Document root cause for each domain
- Start each investigation with fresh context
