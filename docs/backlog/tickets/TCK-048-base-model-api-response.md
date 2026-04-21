---
id: TCK-048
title: "API Response Infrastructure (base resource + error handler)"
status: review
phase: P0
family: back
estimate: M
created: 2026-04-16
updated: 2026-04-21
depends_on: [TCK-013]
blocks: [TCK-034, TCK-020, TCK-024, TCK-026, TCK-027, TCK-029, TCK-046]
spec_refs:
  features: [docs/features.md#24-recherche--filtres]
  models: []
tags: [back, infrastructure, api, resource, exceptions]
---

## Contexte

Le delta initial prescrivait un `BaseModelTrait` maison pour filter/order/paginate, avant que le backend ne standardise sur `spatie/laravel-query-builder` (cf. `CLAUDE.md` § API — Conventions frontend). Le trait `HasQueryBuilder` sur `AbstractModel` couvre déjà filters/sorts/includes/sparse-fieldsets via le package. Ticket recadré sur les gaps réels.

## Objectif utilisateur

Tout endpoint API retourne un format JSON cohérent (succès **et** erreur) et toute resource dérive d'une base mutualisant les helpers communs (ISO-8601, enums, media URLs).

## Contrat de données

- **Succès liste** : `{ data: [...], meta: { current_page, last_page, per_page, total }, links: { first, last, prev, next } }` (format natif `JsonResource::collection(paginator)`).
- **Succès item** : `{ data: { ... } }` ou `{ data: { ... }, meta: {...} }` si additionnel.
- **Erreur 422 (validation)** : `{ message, errors: { field: [messages] } }`.
- **Erreur 4xx/5xx** : `{ message }` avec code HTTP approprié (401, 403, 404, 405, 429, 500).
- **Resource de base** : helpers `iso($date)`, `enumValue($enum)`, `enumLabel($enum, $group)`, `mediaUrl($collection, $conversion?)`.

## Direction UX / Artistique

**Ticket backend — pas de Direction UX.**

## Contraintes strictes (métier)

- Les endpoints `/api/*` retournent **toujours** du JSON (jamais du HTML) — y compris pour 401/404/500.
- Les resources métier existantes héritent progressivement de `BaseResource` (migration non-bloquante — les nouveaux resources l'utilisent d'emblée).
- `spatie/laravel-query-builder` reste la voie canonique pour filters/sorts/includes (pas de réimplémentation).

## Delta à produire

- [x] `HasQueryBuilder` (trait spatie) — **déjà en place sur `AbstractModel`**.
- [x] `AbstractModel` utilise le trait — **déjà en place**.
- [ ] `App\Http\Resources\Bases\BaseResource` avec helpers partagés (iso, enumValue, enumLabel, mediaUrl).
- [ ] Exception handler dans `bootstrap/app.php` : JSON uniforme pour 401/403/404/405/422/429/500 sur routes `api/*`.
- [ ] Tests : `ApiErrorFormatTest` (chaque code HTTP → bon format) + `HasQueryBuilderTest` (whitelist filtres/sorts/includes respectée, colonnes non-whitelistées ignorées).

## Critères d'acceptation

- [ ] Une route API non authentifiée renvoie `{ "message": "Unauthenticated." }` en 401 JSON (jamais HTML/redirect).
- [ ] Une route API introuvable renvoie `{ "message": "..." }` en 404 JSON.
- [ ] Une validation échouée renvoie `{ "message", "errors": {...} }` en 422 JSON.
- [ ] Une action refusée (policy/permission) renvoie `{ "message": "..." }` en 403 JSON.
- [ ] Un filtre `filter[xxx]=...` sur une colonne non whitelistée lève `InvalidFilterQuery` (comportement spatie par défaut — conservé pour visibilité des erreurs contractuelles front/back).
- [ ] Un sort `sort=xxx` sur une colonne non whitelistée lève `InvalidSortQuery`.
- [ ] `BaseResource::iso(now())` retourne une chaîne ISO-8601, `null` si l'input est null.
- [ ] `BaseResource::enumValue()` et `enumLabel()` gèrent les enums nullables.

## Hors périmètre

- Migration de tous les resources existants vers `BaseResource` (sera fait au fil de l'eau, hors périmètre de ce ticket).
- Endpoints métier concrets (→ tickets domaine).
- Scout search (→ TCK-052).
- Policies (→ TCK-049).

## Notes d'implémentation

- **Décision de rescope** : `filterThroughRequest()` / `orderThroughRequest()` / `paginatedThroughRequest()` initialement prescrits ont été remplacés par `spatie/laravel-query-builder` (trait `HasQueryBuilder` sur `AbstractModel`) — conforme à `CLAUDE.md § API — Conventions frontend`. Le package couvre nativement `filter[]`, `sort=`, `include=`, `fields[]`, ranges, et sparse fieldsets. Aucun BaseModelTrait custom n'a été ajouté.
- **Comportement strict conservé** : les filters/sorts non whitelistés lèvent `InvalidFilterQuery` / `InvalidSortQuery` (défaut spatie). Transformés en 400 JSON via `HttpExceptionInterface` dans le render callback. Choix volontaire : visibilité des erreurs contractuelles front/back, plus sécurisé qu'un ignore silencieux.
- **JSON forcé sur `/api/*`** via `ForceJsonResponseMiddleware` (préfixé dans le groupe `api`) + `$exceptions->shouldRenderJsonWhen(api/*)`. Garantit que même un client sans `Accept: application/json` reçoit du JSON sur les erreurs, au lieu de la page HTML Laravel.
- **`BaseResource`** : helpers `iso()`, `enumValue()`, `enumLabel($group, $locale)`, `mediaUrl()`. Aucune migration forcée des resources existantes — adoption au fil de l'eau.
- Pas de `BaseCollectionResource` ajouté : Laravel `JsonResource::collection($paginator)` produit déjà le format `{ data, meta, links }` sans wrapper custom.
