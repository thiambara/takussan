# CLAUDE.md

Monorepo **Takussan** — plateforme de gestion immobilière.

- `takussan-api/` — Laravel 13, PHP ^8.3
- `takussan-web/` — Next.js 16.2.3, React 19, TypeScript 5, Tailwind CSS 4


---

## Specs & Backlog

**Sources de vérité** (ne jamais dupliquer dans un ticket) :

- `docs/features.md` — spec fonctionnelle
- `docs/models-spec.md` — spec data/modèles

**Backlog** : `docs/backlog/` → `INDEX.md` (kanban) + `tickets/TCK-NNN-<slug>.md`

**Format ticket** : frontmatter YAML (`id`, `title`, `status`, `phase`, `family`, `estimate`, `depends_on`, `blocks`, `spec_refs`) + corps (Contexte / Objectif / Delta / AC / Hors périmètre / Notes).

**Règles** :

1. Un ticket décrit un delta, pas la spec — il pointe vers elle via `spec_refs`.
2. `depends_on` → autres tickets uniquement. Un ticket ne démarre pas tant que ses dépendances ne sont pas `done`.
3. Après merge d'un ticket qui modifie une spec : `/sync-specs`.

**Workflows** (deux voies équivalentes — `.windsurf/workflows/` ou `.claude/commands/`) :
- `/write-spec` — crée un ticket, ne touche jamais au code.
- `/implement-spec` — implémente un ticket, ne modifie jamais les specs.

Si l'utilisateur demande « crée un ticket » ou « implémente TCK-NNN » sans slash command, lire directement le workflow correspondant dans `.windsurf/workflows/`.

---

## Backend (`takussan-api/`)

```bash
php artisan serve --port=8002   # dev (port fixe — frontend hardcodé)
php artisan test                 # tous les tests
php artisan test --filter=Foo   # filtre classe ou méthode
./vendor/bin/pint                # lint  ← à exécuter avant chaque commit
php artisan migrate
php artisan migrate:fresh --seed
```

> État actuel : skeleton vierge. Seuls `Controller.php` (abstract) et `User.php` existent.

---

## Frontend (`takussan-web/`)

```bash
npm run dev    # dev
npm run build  # build
npm run lint   # lint
```

> État actuel : scaffold vierge (create-next-app). Features à construire via tickets.
> ⚠️ Next.js 16 contient des breaking changes — lire `node_modules/next/dist/docs/` avant d'écrire du code.

---

## Design & UI

Pour tout travail d'interface, lire et appliquer **[`docs/design-guidelines.md`](docs/design-guidelines.md)**.
