---
id: TCK-048
title: "BaseModelTrait + API Response Infrastructure"
status: todo
phase: P0
family: back
estimate: M
created: 2026-04-16
updated: 2026-04-16
depends_on: [TCK-013]
blocks: [TCK-034, TCK-020, TCK-024, TCK-026, TCK-027, TCK-029, TCK-046]
spec_refs:
  features: [docs/features.md#24-recherche--filtres]
  models: []
tags: [back, infrastructure, api, trait, resource]
---

## Objectif utilisateur

Tout endpoint API retourne un format JSON cohérent et tout modèle supporte filtrage, tri et pagination via query params.

## Contrat de données

- `BaseModelTrait` : `filterThroughRequest()`, `orderThroughRequest()`, `paginatedThroughRequest()` sur `Request`
- Réponse standard : `{ data, meta: { current_page, last_page, per_page, total }, links: { first, last, prev, next } }`
- `BaseResource` / `BaseCollectionResource` pour envelopper les réponses
- Erreur format : `{ message, errors?: { field: [messages] } }` (422), `{ message }` (4xx/5xx)

## Direction UX / Artistique

**Ticket backend — pas de Direction UX.**

## Contraintes strictes (métier)

- Toute réponse API utilise le format standard — pas de `return response()->json($model)` brut
- Pagination par défaut : 15 items, configurable par endpoint
- Filtrage whitelist : seules les colonnes déclarées sont filtrables (sécurité)
- Tri whitelist : seules les colonnes déclarées sont triables
- Soft deletes gérés par le trait (`onlyTrashed`, `withTrashed` via query param pour admin)

## Delta à produire

- [ ] Trait `App\Models\Bases\BaseModelTrait` avec filter/order/paginate
- [ ] Mise à jour `AbstractModel` pour utiliser le trait
- [ ] Resource `App\Http\Resources\BaseResource`
- [ ] Resource `App\Http\Resources\BaseCollectionResource`
- [ ] Exception handler : formatage uniforme des erreurs JSON (422, 404, 403, 500)
- [ ] Tests : `BaseModelTraitTest`, `ApiResponseFormatTest`

## Critères d'acceptation

- [ ] `filterThroughRequest()` filtre sur les colonnes whitelistées uniquement
- [ ] `orderThroughRequest()` trie sur les colonnes whitelistées uniquement
- [ ] `paginatedThroughRequest()` retourne le format standard avec meta + links
- [ ] Toute erreur API retourne le format standard
- [ ] Les colonnes non whitelistées sont ignorées (pas d'erreur, pas de filtre)

## Hors périmètre

- Endpoints métier concrets (→ tickets domaine)
- Scout search (→ TCK-052)
- Policies (→ TCK-049)
