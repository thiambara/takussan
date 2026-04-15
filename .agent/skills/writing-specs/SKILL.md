---
name: writing-specs
description: Use when creating a new backlog ticket (TCK-NNN) from an idea, feature request, bug, or sync-specs warning — before any coding. Produces a ticket file under docs/backlog/tickets/ that references docs/features.md and docs/models-spec.md without duplicating their content.
---

# Writing Specs

## Overview

Create backlog tickets that describe a **delta** to produce — never a copy of a spec. A ticket is a contract between the specs (source of truth) and the code (the deliverable). This skill **never writes code** and **never edits `docs/features.md` or `docs/models-spec.md`**.

**Announce at start:** "I'm using the writing-specs skill to create ticket TCK-NNN."

**Save tickets to:** `docs/backlog/tickets/TCK-NNN-<slug>.md`
**Keep index in sync:** `docs/backlog/INDEX.md`
**Template:** `docs/backlog/_template.md`

## When to use

- The user wants a new feature, bug fix, or improvement captured as actionable work.
- A `sync-specs` pass surfaces a new ⚠️/❌ that warrants a ticket.
- A report of a P3 item needs to be filed.

## When NOT to use

- **The functional need is not in the specs.** → STOP. The missing info goes in `features.md` / `models-spec.md` first (separate PR). Do not create a ticket to compensate for a missing spec.
- **Writing code.** → This skill only creates the ticket. Implementation is `implementing-specs`.
- **Pure research / exploration.** → No ticket needed.
- **A ticket already covers the need.** → Update the existing ticket instead of creating a duplicate.

## The spec-fidelity law

| ❌ Don't | ✅ Do |
|---|---|
| Recopy spec content into the ticket body | Reference the spec via `spec_refs.features` / `spec_refs.models` anchors |
| Create a ticket on top of missing spec info | Open a PR on `features.md` / `models-spec.md` first, then create the ticket |
| Modify `features.md` or `models-spec.md` inside this skill | Stay read-only on the specs |
| Reuse or renumber a TCK-ID | Always pick the next unused TCK-NNN |
| Fill in the "Notes d'implémentation" section | Leave it empty — `implementing-specs` owns that section |
| Invent new sections in the ticket body | Follow `_template.md` exactly |

## Process

### 1. Clarify the need

If the user's request is vague ("something about search"), invoke
`.agent/skills/brainstorming/SKILL.md` to crystallize the intent first. Don't
start writing a ticket from a fuzzy prompt.

### 2. Check for duplicates

```bash
grep -ril "<keyword>" docs/backlog/tickets/
grep -in "<keyword>" docs/features.md docs/models-spec.md
```

- If an existing ticket already covers the need → update it, don't create a new one.
- If the keyword doesn't appear in `features.md` / `models-spec.md`, the functional need is **not yet specified** → STOP, propose a spec PR.

### 3. Locate spec anchors

List the relevant headings in the specs:

```bash
grep -n "^###" docs/features.md
grep -n "^###" docs/models-spec.md
```

Build GitHub-style anchors from the heading text:

- `### 1.1 Gestion des biens` → `docs/features.md#11-gestion-des-biens`
- `### 3. Property` → `docs/models-spec.md#3-property`
- `### 6. BookingPayment` → `docs/models-spec.md#6-bookingpayment`
- Ampersands disappear: `### 1.2 Recherche & découverte publique` → `#12-recherche--découverte-publique` (two dashes where `& ` stood).
- Emoji suffixes survive as trailing dashes: `### 14. Lease 🆕` → `#14-lease-`.

Every ticket must point to **at least one** anchor in `features.md` **or** `models-spec.md`. Most point to both.

### 4. Pick the next TCK-NNN

```bash
ls docs/backlog/tickets/ | grep -oE 'TCK-[0-9]+' | sort -u | tail -1
```

Increment by 1. IDs are sequential and **never reused**, even for deleted tickets.

### 5. Copy the template

```bash
cp docs/backlog/_template.md docs/backlog/tickets/TCK-NNN-<slug>.md
```

`<slug>` = kebab-case, 3–5 words max (e.g., `payment-gateway`, `booking-cancellation`).

### 6. Fill the frontmatter

| Field | Rule |
|---|---|
| `id` | `TCK-NNN` — must match the filename |
| `title` | Short imperative title (e.g., "Export comptable FEC") |
| `status` | `todo` by default. Use `blocked` only if the ticket depends on a product decision or an unresolved evolution trigger (EF) |
| `phase` | `P0` · `P1` · `P2` · `P3` · `EF` — derived from `features.md` priority |
| `family` | `applicatif` · `evolution` · `technique` · `bug` |
| `estimate` | `S` ≤2j · `M` 3–5j · `L` 6–10j · `XL` >10j |
| `created` / `updated` | Today's date (`YYYY-MM-DD`) |
| `depends_on` | List of other TCK-NNN that must be `done` before this ticket can start. Must be existing ticket IDs |
| `blocks` | List of other TCK-NNN that this ticket unblocks |
| `spec_refs.features` | Anchors in `docs/features.md` (at least one OR a `models` entry) |
| `spec_refs.models` | Anchors in `docs/models-spec.md` |
| `tags` | Freeform (e.g., `[back, payments, integration]`) |

### 7. Fill the body

Follow `_template.md` sections exactly:

- **Contexte** — one short paragraph. Point to the warning, sync-pass, or decision that triggered this ticket. No spec content.
- **Objectif** — one sentence. What this ticket delivers.
- **Delta à produire** — concrete checklist: migrations, endpoints, services, components, tests. This is the **only** place where the work is described.
- **Critères d'acceptation** — testable bullets. Each AC should be verifiable independently.
- **Hors périmètre** — explicitly call out what is *not* in scope (prevents scope creep downstream).
- **Notes d'implémentation** — leave the italic placeholder `_(à remplir par implementing-specs)_`. Do **not** write anything here.

### 8. Self-check before saving

Re-read the ticket. For each paragraph ask: *"Would this be in the spec if I looked? If yes, delete it and add a `spec_refs` link."* The ticket must be incomprehensible without the `spec_refs` — that's the proof they're load-bearing, not decorative.

### 9. Update `INDEX.md`

Add a new bullet line to the correct section (`Todo` or `Blocked`):

```markdown
- [TCK-NNN](tickets/TCK-NNN-<slug>.md) — <title> `<estimate> · <phase> · <family>`
```

If the ticket has `blocks`, update the **Graphe de dépendances** code block at the bottom of `INDEX.md`.

### 10. Report to the user

Output: the TCK-NNN, the file path, and a 2-line summary. Do **not** start implementing.

## Frontmatter checklist

Before considering the ticket done:

- [ ] `id` matches the filename
- [ ] `status` is `todo` OR `blocked` (never `doing`/`review`/`done` at creation)
- [ ] `depends_on` references only existing TCK-NNN
- [ ] `spec_refs.features` OR `spec_refs.models` has at least one entry
- [ ] `created` and `updated` set to today
- [ ] No content in "Notes d'implémentation"
- [ ] `INDEX.md` has the new line

## Common rationalizations

| Excuse | Reality |
|---|---|
| "Just a quick note in the ticket about the spec" | The ticket is the delta. Notes about the spec belong in the spec. Delete. |
| "The spec is vague, so I'll clarify in the ticket" | No — open a PR on the spec. The ticket trusts the spec. |
| "I can skip INDEX.md, the user will see the file" | INDEX is part of the ticket. Update both or don't commit either. |
| "This is a tiny fix, I'll just file a bug in the ticket and skip `spec_refs`" | A bug still touches a behavior described somewhere. Find the anchor or STOP. |
| "I'll reuse TCK-042, nobody will notice" | IDs are immutable. Use the next unused number. |
| "Let me quickly also edit `features.md` to add this line" | Out of scope for this skill. STOP and propose a spec PR. |

## Integration

- **`.agent/skills/brainstorming/SKILL.md`** — invoke upstream when the idea is fuzzy.
- **`sync-specs`** skill — if the ticket resolves a ⚠️ warning, run `/sync-specs` after the ticket is merged to confirm convergence.
- **Never delegate to `writing-plans`** — that skill produces an implementation plan for code; this skill produces a ticket. Different artifacts, different audiences.
- **Hand-off to `implementing-specs`** — once the ticket is saved, stop. Implementation starts only when the user explicitly asks.

## Example output (abridged)

```markdown
---
id: TCK-013
title: Endpoint healthcheck /ping
status: todo
phase: P2
family: technique
estimate: S
created: 2026-04-15
updated: 2026-04-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
tags: [back, observability]
---

## Contexte
Ajout demandé pour le monitoring externe (décision produit du 2026-04-14).

## Objectif
Exposer un endpoint public `GET /api/ping` renvoyant `{status, version, time}` pour les sondes externes.

## Delta à produire
- [ ] Route `routes/api/monitoring.php`
- [ ] Controller `PingController` (thin, pas de service)
- [ ] Test `PingEndpointTest` (200 + schéma)

## Critères d'acceptation
- [ ] `GET /api/ping` répond 200 avec le JSON attendu
- [ ] Le temps de réponse est < 50 ms en local
- [ ] L'endpoint est exclu de la rate-limit

## Hors périmètre
- Auth (endpoint public)
- Métriques détaillées (Prometheus scrape dédié)

## Notes d'implémentation
_(à remplir par implementing-specs)_
```

## Remember

- Tickets reference specs; they never copy them.
- `INDEX.md` is part of the deliverable.
- Empty `Notes d'implémentation` at creation — always.
- `depends_on` is the contract that `implementing-specs` enforces. Get it right.
