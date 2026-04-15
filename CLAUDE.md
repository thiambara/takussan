# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo for **Takussan**, a real estate property management platform, containing two separate projects:

- `takussan-api/` — Laravel 13 REST API backend (PHP ^8.3)
- `takussan-web/` — Next.js 16 + React 19 frontend (TypeScript, Tailwind CSS 4)

---

## Specs & Backlog

The project uses a BMAD-style split between **specs** (source of truth) and **tickets** (actionable deltas).

### Sources de vérité (ne jamais dupliquer)

- `docs/features.md` — spec fonctionnelle (monolithique, stable, ~407 l).
- `docs/models-spec.md` — spec data/modèles (monolithique, stable, ~1711 l).
- `docs/sync-passes/` — audits de convergence `features.md` ↔ `models-spec.md`.

**Règle** : si une info fonctionnelle manque, elle va *dans la spec* (PR dédiée), jamais recopiée dans un ticket.

### Backlog (`docs/backlog/`)

```text
docs/backlog/
├── INDEX.md              # kanban (todo / doing / review / done / blocked)
├── _template.md          # template de ticket
├── _archive/             # anciens backlogs groupés
└── tickets/
    └── TCK-NNN-<slug>.md # un fichier par ticket
```

**Convention ID** : `TCK-NNN` (séquentiel, jamais réutilisé).

**Format de ticket** : frontmatter YAML avec `id`, `title`, `status`, `phase`, `family`, `estimate`, `depends_on`, `blocks`, `spec_refs`, puis corps **Contexte / Objectif / Delta à produire / Critères d'acceptation / Hors périmètre / Notes d'implémentation**.

**Référencement spec** : via `spec_refs.features` / `spec_refs.models` avec les heading anchors markdown (ex: `docs/features.md#15-transactions--paiements`, `docs/models-spec.md#3-property`).

**Règles anti-répétition** :

1. Un ticket décrit un **delta**, pas la spec. Il pointe vers elle.
2. `depends_on` référence d'autres tickets, pas des sections de spec.
3. Un ticket ne démarre pas tant que ses `depends_on` ne sont pas `done`.
4. Après merge d'un ticket qui modifie une spec, lancer `/sync-specs`.

### Skills associés (cycle de vie d'un ticket)

Deux workflows automatisent la création et l'exécution d'un ticket :

- **Créer un ticket** : lire `.windsurf/workflows/write-spec.md` et suivre le workflow. Ce workflow crée un `TCK-NNN` à partir d'une idée, cherche les anchors dans `features.md` / `models-spec.md`, refuse de créer un ticket si la spec ne couvre pas le besoin, et met à jour `INDEX.md`. **Il ne touche jamais au code.**
- **Implémenter un ticket** : lire `.windsurf/workflows/implement-spec.md` et suivre le workflow. Ce workflow lit le ticket + ses `spec_refs`, vérifie les `depends_on`, code selon le `Delta à produire`, valide les AC, et met à jour le statut. **Il ne modifie jamais les specs.**

**Invocation** — deux voies équivalentes :

- **Slash commands Windsurf** : `/write-spec` et `/implement-spec` (dans `.windsurf/workflows/`).
- **Slash commands Claude Code** : `/write-spec` et `/implement-spec` (dans `.claude/commands/`).

Quand l'utilisateur demande « crée un ticket pour X » ou « implémente TCK-NNN » sans passer par une slash command, lire directement le workflow correspondant dans `.windsurf/workflows/` et suivre ses instructions.

---

## Backend (`takussan-api/`)

### Commands

```bash
# Start dev server (must run on port 8002 — frontend is hardcoded to this)
php artisan serve --port=8002

# Run all tests
php artisan test

# Run a single test class or method
php artisan test --filter=ClassName
php artisan test --filter=ClassName::methodName

# Lint (Laravel Pint)
./vendor/bin/pint

# Migrations
php artisan migrate
php artisan migrate:fresh --seed
```

### Architecture

> **État actuel : skeleton Laravel 13 vierge.** Seuls `app/Http/Controllers/Controller.php` (abstract vide) et `app/Models/User.php` existent. Les couches métier décrites dans la spec (`routes/api/`, `app/Services/`, traits de modèles, permissions, médias, search…) ne sont **pas encore implémentées** — elles sont à construire via les tickets du backlog.

---

## Frontend (`takussan-web/`)

### Commands

```bash
# Start dev server
npm run dev

# Build
npm run build

# Lint
npm run lint
```

### Architecture

> **État actuel : scaffold Next.js 16 vierge.** Seul `src/app/` contient le layout et la page d'accueil par défaut (create-next-app). Les features sont à construire via les tickets du backlog.

**Stack :**

- Next.js 16.2.3 (App Router) — **⚠️ cette version contient des breaking changes vs les versions antérieures. Lire `node_modules/next/dist/docs/` avant d'écrire du code Next.js.**
- React 19.2.4 + TypeScript 5
- Tailwind CSS 4

**Structure actuelle :**

- `src/app/layout.tsx` — root layout (Geist font, Tailwind)
- `src/app/page.tsx` — page d'accueil par défaut
- `src/app/globals.css` — styles globaux Tailwind
