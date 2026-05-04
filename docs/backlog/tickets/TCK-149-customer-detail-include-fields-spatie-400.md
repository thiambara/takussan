---
id: TCK-149
title: "Fiche client dashboard — 400 sur include/fields Spatie"
status: todo
phase: P1
family: back
estimate: S
created: 2026-05-04
updated: 2026-05-04
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-crm-clients
  models:
    - docs/models-spec.md#5-customer
    - docs/models-spec.md#13-customer-note
tags: [back, bug, p0, smoke-test-2026-05-04, agent-immobilier, crm]
---

## Objectif utilisateur

Un agent ouvre n'importe quelle fiche client depuis `/app/customers/{id}` (créée ou existante) et voit le détail (notes, documents, tags) sans erreur runtime.

## Contrat de données

**Endpoint impacté** : `GET /api/customers/{id}?fields[customers]=…&include=notes,documents,tags`

Le frontend `fetchDashboardCustomer` (`takussan-web/src/lib/queries/customers.ts:107`) construit cette requête. Le backend retourne **400 Bad Request** — la cause probable est un `AllowedInclude` ou un champ de `AllowedFields` non whitelisté côté `App\Http\Controllers\…CustomerController` ou la classe Spatie QueryBuilder dédiée.

À investiguer :
- relations `notes`, `documents`, `tags` — déclarées dans `App\Models\Customer` ?
- `AllowedInclude::relationship('notes')`, `AllowedInclude::relationship('documents')`, `AllowedInclude::relationship('tags')` présents dans la query builder config ?
- liste `AllowedFields` (sparse fieldsets) cohérente avec `DASHBOARD_CUSTOMER_DETAIL_FIELDS` côté frontend (`takussan-web/src/lib/queries/customers.ts`).

## Contraintes strictes (métier)

- L'agent voit uniquement les clients de son agence (RBAC déjà en place via Policy — vérifier que la 400 ne masque pas un 403).
- Les notes / documents / tags retournés doivent respecter la même policy de scope que la ressource Customer parente.
- Pas de fetch global ni de filtrage côté client — on suit la convention spatie du projet (cf. `CLAUDE.md` § Conventions frontend).

## Delta à produire

- [ ] **Backend** — Identifier le controller `show` qui sert `/api/customers/{id}` (probablement `App\Http\Controllers\Dashboard\CustomerController` ou similaire)
- [ ] **Backend** — Whitelister sur la query builder : `AllowedInclude` pour `notes`, `documents`, `tags` ; `AllowedFields` cohérents avec les colonnes de `DASHBOARD_CUSTOMER_DETAIL_FIELDS` côté frontend
- [ ] **Backend** — Vérifier que les relations `notes()`, `documents()`, `tags()` existent sur `App\Models\Customer` ; sinon créer les relations Eloquent manquantes (sans changement de schéma — les tables existent déjà via `customer_notes`, `customer_documents`, `customer_tags`)
- [ ] **Tests backend** — Feature test `GET /api/customers/{id}?fields[customers]=...&include=notes,documents,tags` retourne 200 avec body cohérent pour un agent autorisé
- [ ] **Tests backend** — Feature test 403 quand l'agent appartient à une autre agence
- [ ] Linter Pint exécuté avant commit

## Critères d'acceptation

- [ ] L'ouverture de `/app/customers/{id}` (testé sur id 7, 25, 415, 424) ne provoque plus de Runtime Error 400 dans l'overlay Next.js dev
- [ ] La réponse `GET /api/customers/{id}?fields[customers]=…&include=notes,documents,tags` retourne 200 avec les blocs `data.notes`, `data.documents`, `data.tags`
- [ ] Un agent d'une autre agence reçoit 403 (RBAC respecté)
- [ ] Les tests backend passent

## Hors périmètre

- Refonte de l'UI fiche client (le crash actuel masque la page mais l'UI est à inspecter dans un ticket distinct si nécessaire)
- Création/édition de notes / tags / documents (P2 séparé)
- Pagination des notes / documents (P2 séparé)

## Notes d'implémentation

- Source de reproduction : `docs/smoke-tests/agent-smoke-test-2026-05-04.md`, bug **P0-2**.
- Stack trace UI : `Runtime Error — API error 400` à `src/lib/api.ts (115:11)` via `fetchDashboardCustomer` (`src/lib/queries/customers.ts:107`) → `(dashboard)/app/customers/[id]/page.tsx:54`.
- Création de client (`POST /api/customers`) fonctionne et redirige vers `/app/customers/{newId}` — le crash survient uniquement sur le fetch détail.
- Vérifier que la page `(dashboard)/app/customers/[id]/page.tsx` ne hardcode pas un `include` qui n'existe pas en backend (ex. include `notes` orthographié `customer_notes`).
