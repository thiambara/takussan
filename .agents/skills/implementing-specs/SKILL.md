---
name: implementing-specs
description: Use when implementing a backlog ticket TCK-NNN. Reads the ticket, verifies depends_on are done, loads the spec_refs for full context, writes code that satisfies the acceptance criteria, and updates the ticket status. Never modifies docs/features.md or docs/models-spec.md.
---

# Implementing Specs

## Overview

Execute a backlog ticket against the codebase. The ticket is the **contract**, the specs are the **truth**, the code is the **deliverable**. This skill reads all three, codes the delta, and updates the ticket — it **never edits `docs/features.md` or `docs/models-spec.md`**.

**Announce at start:** "I'm using the implementing-specs skill to execute TCK-NNN."

**Ticket location:** `docs/backlog/tickets/TCK-NNN-<slug>.md`
**Index to maintain:** `docs/backlog/INDEX.md`
**Specs (read-only):** `docs/features.md`, `docs/models-spec.md`

## When to use

- The user asks to implement a specific TCK-NNN.
- The user asks to work on the next available ticket (pick the first `todo` in `INDEX.md` with no unresolved `depends_on`).

## When NOT to use

- **The ticket does not exist.** → Invoke `.agent/skills/writing-specs/SKILL.md` to create it first.
- **The spec is insufficient to implement the AC.** → STOP. Propose a spec PR.
- **The user wants a hotfix unrelated to any ticket.** → Small fixes can bypass the backlog; use `systematic-debugging` instead.

## The no-scope-creep law

| ❌ Don't | ✅ Do |
|---|---|
| Modify `features.md` / `models-spec.md` | Treat specs as read-only. If they're wrong, STOP and report |
| Implement beyond the **Delta à produire** | Stay within scope. Surprises go in a new ticket |
| Mark `done` with a red AC | Keep `doing` or move to `review` and report what's missing |
| Start a ticket whose `depends_on` isn't all `done` | STOP and explain which parent is blocking |
| Touch multiple tickets in one pass | One ticket per invocation unless explicitly told otherwise |
| Write a prose summary in "Notes d'implémentation" | Only record non-obvious decisions — the diff speaks for itself |

## Process

### Phase 1 — Prerequisites check

**1. Load the ticket.**

```bash
cat docs/backlog/tickets/TCK-NNN-*.md
```

**2. Check `status`.**

- `done` → STOP. Already shipped. Ask the user what they want.
- `blocked` → STOP. Read the Contexte to see what's blocking (product decision, EF trigger). Do not proceed.
- `doing` / `review` → Resume where the previous session left off (read Notes d'implémentation).
- `todo` → proceed.

**3. Verify `depends_on`.**

For each ID in `depends_on`, open `docs/backlog/tickets/TCK-*.md` and check its `status`. **All** must be `done`. If any isn't, STOP and report which parent is blocking.

**4. Load the specs.**

For **every** URL in `spec_refs.features` and `spec_refs.models`, read the referenced section. Do **not** skip this — the ticket is intentionally terse and relies on this context.

```bash
# Example: resolve #15-transactions--paiements → find the ### 1.5 section
grep -n "^### 1\.5" docs/features.md
```

Then read the surrounding block (usually 10–30 lines).

**5. Consistency check.**

If the ticket's **Delta à produire** contradicts the spec you just read, STOP. Either:

- The spec is wrong → report and propose a spec PR.
- The ticket is wrong → update the ticket via `writing-specs` first.

Do **not** silently reconcile.

### Phase 2 — Mark `doing`

**6. Update the ticket frontmatter.**

```yaml
status: doing
updated: <today YYYY-MM-DD>
```

**7. Update `INDEX.md`.**

Move the ticket bullet from the `📋 Todo` section to `🚧 Doing`.

### Phase 3 — Plan the work

**8. Trivial delta (≤ 3 items, isolated, no architectural decision).**

Code directly. Skip planning.

**9. Non-trivial delta.**

Delegate to `.agent/skills/writing-plans/SKILL.md` to decompose into bite-sized tasks, then execute with `.agent/skills/executing-plans/SKILL.md`. The plan is **temporary** — it lives in `docs/plans/`, not in the ticket.

### Phase 4 — Code

**10. Apply TDD when possible.**

Invoke `.agent/skills/test-driven-development/SKILL.md`. Write the failing test first, then the minimal implementation.

**11. Respect the architecture** documented in `CLAUDE.md`:

- **Backend**: Controllers are thin and delegate to `App\Services\Model\...`. Models extend `App\Models\Bases\AbstractModel`. Routes live under `routes/api/<resource>.php`. Permissions sont résolues par `MembershipCapabilityResolver` à partir des **profils polymorphes** (TCK-278, Règle 5 du models-spec : profil = rôle ; `spatie/laravel-permission` a été retiré). Media uses `spatie/laravel-medialibrary`.
- **Frontend**: Standalone components (no NgModules). Services in `core/services/http/`. PrimeNG 21 + Tailwind 4. Template control flow uses `@if` / `@for` / `@switch`. Auth token in `AuthService.authToken` (static).
- **API base URL (dev)**: `http://127.0.0.1:8002`. Frontend runs on port 4201.

**12. Honor the ticket's constraints.**

- If the ticket says "aucun nouveau modèle", don't create one.
- If `spec_refs` reference a specific model, don't introduce another.
- If "Hors périmètre" excludes something, don't implement it.

**13. Migration naming**: Laravel convention (`YYYY_MM_DD_HHMMSS_<verb>_<subject>.php`).

### Phase 5 — Verify against AC

**14. Walk through each AC.**

For each bullet in **Critères d'acceptation**, explicitly confirm green/red. If any AC is red, loop back to Phase 4 or STOP and report.

**15. Run the tests.**

- Backend: `php artisan test --filter=<TestClass>`
- Frontend: `npm test -- --include='**/<spec>.spec.ts'`

**16. UI ACs require browser verification.**

Start the dev server and use the feature. Type-checking alone is not enough. If you cannot test the UI (e.g., no browser), say so explicitly — do not claim success.

**See also:** `.agent/skills/verification-before-completion/SKILL.md`.

### Phase 6 — Close the ticket

**17. Fill "Notes d'implémentation".**

Record **only** non-obvious information:

- Architectural decisions taken (and why)
- Gotchas / surprises / workarounds
- Link to the PR or commit SHAs
- Any follow-up ticket created for scope-creep items

Do **not** summarize the diff. Do **not** restate the AC. If you have nothing non-obvious to record, write one line: `Straightforward; see PR #NNN.`

**18. Update the frontmatter.**

```yaml
status: done   # default — let the user confirm before `done`
updated: <today>
```

Use `done` directly only if the user explicitly asked to auto-close.

**19. Update `INDEX.md`.**

Move the ticket from `🚧 Doing` to `👀 Review` (or `✅ Done`).

**20. Post-implementation sync-specs.**

If the ticket originated from a ⚠️ warning (`Contexte` mentions a sync-pass), propose running `/sync-specs` to confirm the warning is now resolved. Don't run it automatically.

### Phase 7 — Hand off

Report to the user:

- TCK-NNN title and new status
- Files touched (short list)
- Test commands run + results
- Any scope-creep item filed as a new ticket
- Next action requested from the user ("approve review", "merge PR", etc.)

## Spec fidelity guard

If, at any point during implementation, you discover that a spec is **incomplete, incorrect, or silent** on a point the ticket assumes: **STOP**. Report to the user. Propose a PR on `features.md` or `models-spec.md`. Do **not** "compensate" in the code — that creates a drift the sync-passes will catch later.

## Common rationalizations

| Excuse | Reality |
|---|---|
| "I'll add a small bonus endpoint while I'm here" | Out of scope. File a new ticket or drop it. |
| "The `depends_on` parent is 99% done, close enough" | `depends_on` is binary. STOP until it's green. |
| "The spec is probably right, I'll keep coding" | No — verify. If unsure, STOP. |
| "I'll tidy up an unrelated file since it's bothering me" | Separate ticket. Don't pollute the diff. |
| "Notes d'implémentation is empty, let me summarize what I did" | Only record non-obvious things. The diff + commit message are the summary. |
| "I can edit features.md, it's just one line" | No. Spec edits are a separate PR. |
| "I'll mark `done` because the user said `go ahead`" | Default to `review`. `done` requires explicit user confirmation on the AC. |

## Integration

- **`.agent/skills/writing-plans/SKILL.md`** — decompose non-trivial deltas into bite-sized tasks.
- **`.agent/skills/executing-plans/SKILL.md`** — execute that plan in single-flow mode.
- **`.agent/skills/test-driven-development/SKILL.md`** — RED / GREEN / REFACTOR.
- **`.agent/skills/systematic-debugging/SKILL.md`** — when something breaks unexpectedly.
- **`.agent/skills/verification-before-completion/SKILL.md`** — before marking `review`/`done`.
- **`.agent/skills/writing-specs/SKILL.md`** — sibling skill. Use if the ticket doesn't exist yet, or to file a new ticket for scope creep discovered during implementation.
- **`sync-specs`** — propose at the end if the ticket resolved a warning.

## Remember

- **Read the specs before coding.** Every time.
- **Stay inside the Delta à produire.** Surprises become new tickets.
- **Specs are read-only** from this skill. If they're wrong, STOP.
- **`depends_on` is a hard gate.** No half-started parents.
- **"Notes d'implémentation" records non-obvious decisions only** — the diff is the summary.
- **Default to `review`, never `done`** without explicit user confirmation.
