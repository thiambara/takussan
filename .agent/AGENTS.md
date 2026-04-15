# Superpowers for Antigravity

You have superpowers.

This profile adapts Superpowers workflows for Antigravity with strict single-flow execution.

## Project conventions — read CLAUDE.md first

**Before doing any work, read `<project-root>/CLAUDE.md`.** It is the canonical project guide (shared with Claude Code) and documents:

- Repository structure (monorepo: `takussan-api/` Laravel 12, `takussan-web/` Angular 21)
- Specs & Backlog conventions (`docs/features.md`, `docs/models-spec.md`, `docs/backlog/tickets/TCK-NNN-*.md`, `INDEX.md`)
- Backend architecture (routes by resource, thin controllers, `AbstractModel`, spatie permission/medialibrary, Sanctum, Scout)
- Frontend architecture (standalone components, PrimeNG 21 + Tailwind 4, `AuthService.authToken`, French locale, dev ports 8002/4201)
- Ticket lifecycle skills (`writing-specs`, `implementing-specs`) — the canonical way to add or execute backlog work
- Anti-repetition rules between specs and tickets

The Antigravity-specific rules in this file (single-flow execution, tool-name translations, task tracker location) **layer on top** of CLAUDE.md — they do not replace it. If CLAUDE.md and this file ever conflict on a project detail, CLAUDE.md wins for project state; this file wins for Antigravity execution discipline.

## Core Rules

1. Prefer local skills in `.agent/skills/<skill-name>/SKILL.md`.
2. Execute one core task at a time with `task_boundary`.
3. Use `browser_subagent` only for browser automation tasks.
4. Track checklist progress in `<project-root>/docs/plans/task.md` (table-only live tracker).
5. Keep changes scoped to the requested task and verify before completion claims.
6. For backlog work, follow the two ticket-lifecycle skills documented in CLAUDE.md → Specs & Backlog:
   - Create tickets via `.agent/skills/writing-specs/SKILL.md`
   - Implement tickets via `.agent/skills/implementing-specs/SKILL.md`
   Never modify `docs/features.md` or `docs/models-spec.md` from within these skills.

## Tool Translation Contract

When source skills reference legacy tool names, use these Antigravity equivalents:

- Legacy assistant/platform names -> `Antigravity`
- `Task` tool -> `browser_subagent` for browser tasks, otherwise sequential `task_boundary`
- `Skill` tool -> `view_file ~/.gemini/skills/<skill-name>/SKILL.md` (or project-local `.agent/skills/<skill-name>/SKILL.md`)
- `TodoWrite` -> update `<project-root>/docs/plans/task.md` task list
- File operations -> `view_file`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`
- Directory listing -> `list_dir`
- Code structure -> `view_file_outline`, `view_code_item`
- Search -> `grep_search`, `find_by_name`
- Shell -> `run_command`
- Web fetch -> `read_url_content`
- Web search -> `search_web`
- Image generation -> `generate_image`
- User communication during tasks -> `notify_user`
- MCP tools -> `mcp_*` tool family

## Skill Loading

- First preference: project skills at `.agent/skills`.
- Second preference: user skills at `~/.gemini/skills`.
- If both exist, project-local skills win for this profile.
- Optional parity assets may exist at `.agent/workflows/*` and `.agent/agents/*` as entrypoint shims/reference profiles.
- These assets do not change the strict single-flow execution requirements in this file.

## Single-Flow Execution Model

- Do not dispatch multiple coding agents in parallel.
- Decompose large work into ordered, explicit steps.
- Keep exactly one active task at a time in `<project-root>/docs/plans/task.md`.
- If browser work is required, isolate it in a dedicated browser step.

## Verification Discipline

Before saying a task is done:

1. Run the relevant verification command(s).
2. Confirm exit status and key output.
3. Update `<project-root>/docs/plans/task.md`.
4. Report evidence, then claim completion.
