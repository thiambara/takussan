# AGENTS.md

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

**Workflows** (deux voies équivalentes — `.windsurf/workflows/` ou `.Codex/commands/`) :
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

## API — Conventions frontend

Le backend utilise `spatie/laravel-query-builder`. **Toujours utiliser les query params suivants depuis le frontend** pour optimiser les performances (éviter de retourner des champs inutiles et des enregistrements non pertinents).

**Règles obligatoires :**
1. **Ne jamais fetcher tous les champs** — toujours passer `fields[table]=col1,col2,...` avec uniquement les colonnes nécessaires à la vue.
2. **Utiliser les filtres spatie** — ne jamais filtrer côté client sur des listes déjà récupérées.
3. **Utiliser `include=` pour les relations** — ne jamais faire de requêtes séparées pour charger une relation si elle peut être incluse.

**Query params disponibles :**
```
filter[status]=active              # filtre exact
filter[search]=mot clé             # recherche textuelle multi-champs
filter[price_min]=50000            # filtre de range
filter[price_max]=200000
sort=-created_at                   # tri (- = décroissant)
include=address,owner              # eager load de relations
include=bookingsCount              # compter une relation
fields[properties]=id,title,price  # sparse fieldsets ← TOUJOURS utiliser
per_page=20
```

**Référence complète :** `docs/spatie-query-builder.md`

---

## Design & UI

Pour tout travail d'interface, lire et appliquer **[`docs/design-guidelines.md`](docs/design-guidelines.md)**.
