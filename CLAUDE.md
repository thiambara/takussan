# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo for **Takussan**, a real estate property management platform, containing two separate projects:

- `takussan-api/` — Laravel 12 REST API backend (PHP 8.4)
- `takussan-web/` — Angular 21 frontend

---

## Specs & Backlog

The project uses a BMAD-style split between **specs** (source of truth) and **tickets** (actionable deltas).

### Sources de vérité (ne jamais dupliquer)

- `docs/features.md` — spec fonctionnelle (monolithique, stable, ~407 l).
- `docs/models-spec.md` — spec data/modèles (monolithique, stable, ~1711 l).
- `docs/sync-passes/` — audits de convergence `features.md` ↔ `models-spec.md`.

**Règle** : si une info fonctionnelle manque, elle va *dans la spec* (PR dédiée), jamais recopiée dans un ticket.

### Backlog (`docs/backlog/`)

```
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

Deux skills projet automatisent la création et l'exécution d'un ticket :

- **Créer un ticket** : ouvrir `.agent/skills/writing-specs/SKILL.md` et suivre le workflow. Ce skill crée un `TCK-NNN` à partir d'une idée, cherche les anchors dans `features.md` / `models-spec.md`, refuse de créer un ticket si la spec ne couvre pas le besoin, et met à jour `INDEX.md`. **Il ne touche jamais au code.**
- **Implémenter un ticket** : ouvrir `.agent/skills/implementing-specs/SKILL.md` et suivre le workflow. Ce skill lit le ticket + ses `spec_refs`, vérifie les `depends_on`, code selon le `Delta à produire`, valide les AC, et met à jour le statut. **Il ne modifie jamais les specs.**

**Invocation** — deux voies équivalentes :

- **Slash commands Claude Code** : `/write-spec` et `/implement-spec` (dans `.claude/commands/`, symlinks vers `.agent/workflows/`).
- **Référence directe** : ouvrir `.agent/skills/writing-specs/SKILL.md` ou `.agent/skills/implementing-specs/SKILL.md` via Read.

Quand l'utilisateur demande « crée un ticket pour X » ou « implémente TCK-NNN » sans passer par une slash command, ouvrir directement le SKILL.md correspondant et suivre ses instructions.

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

**Routes** are split into `routes/api/` subdirectory by resource (e.g. `routes/api/properties.php`). `routes/api.php` just requires them all.

**Controllers** extend `App\Http\Controllers\Base\Controller` which adds a `json()` helper. They are thin — all business logic lives in `app/Services/Model/`. Controllers inject service classes via constructor.

**Models** all extend `App\Models\Bases\AbstractModel` which uses `BaseModelTrait`. This trait adds powerful request-driven query scopes:
- `Model::allThroughRequest()` — applies both filters and ordering from the current request
- `filterThroughRequest()` — reads `filter_fields` from the request; supports operators: `@like`, `@in`, `@between`, `!` prefix for NOT, `..` for ranges (e.g. `100..500`)
- `orderThroughRequest()` — reads `order_by` from request
- Models also auto-configure `with`, `hidden`, `appends`, `with_count` from request params namespaced by table name (e.g. `?properties.with[]=address`)

**Permissions** use `spatie/laravel-permission`. Controllers apply middleware like `$this->middleware('permission:properties.view')`. Ownership checks use `properties.update_all` / `properties.delete_all` to distinguish own vs. all-resource permissions.

**Media** uses `spatie/laravel-medialibrary`. The `Property` model registers a `properties` collection with `thumbnail` (300×300) and `preview` (800×600) conversions.

**Auth** uses Laravel Sanctum (token-based) and Socialite (OAuth2). See `routes/api/auth/`.

**Search** uses Laravel Scout on the `Property` model.

**Global helpers** (autoloaded from `app/Helpers/`):
- `to_camel_case()` / `to_snake_case()` — handle arrays or strings
- `utils()` — resolves `App\Services\Utils\Utils`

**Enums** live in `App\Models\Bases\Enums\` (e.g. `ProprietyStatus`, `BookingStatus`).

**Paginates** via `paginatedThroughRequest()` (from `BaseModelTrait`).

---

## Frontend (`takussan-web/`)

### Commands

```bash
# Start dev server (runs on port 4201)
npm start

# Build
npm run build

# Run tests
npm test
```

### Architecture

Standalone Angular components with lazy loading throughout. No NgModules.

**App structure:**
- `src/app/core/` — guards, interceptors, layouts, models, services (HTTP clients)
- `src/app/pages/` — feature pages: `auth/`, `dashboard/`, `homepage/`, `search-results/`, `show-property/`
- `src/app/shared/` — reusable components and pipes
- `src/app/types/` — shared TypeScript types
- `src/environments/` — environment config (`apiUrl`, `cryptoKey`)

**API communication:** All HTTP services live in `core/services/http/`. The `takussanApiAuthInterceptor` automatically attaches the Bearer token (from `AuthService.authToken`) and `Accept: Application/json` header to all requests matching `environment.apiUrl`.

**UI stack:** PrimeNG 21 (Aura theme) + Tailwind CSS 4.2. `MessageService` and `DialogService` from PrimeNG are provided globally in `app.config.ts`. Dark mode toggled via `.app-dark` class. Templates use Angular 21 block control flow syntax (`@if`, `@for`, `@switch`).

**Locale:** French (`fr-FR`) is the app locale.

**Auth token storage:** `AuthService.authToken` is a static property — token is read synchronously in the interceptor.

**API base URL (dev):** `http://127.0.0.1:8002` (defined in `src/environments/environment.ts`)
