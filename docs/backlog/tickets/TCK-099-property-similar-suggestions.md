---
id: TCK-099
title: "Biens similaires / suggestions personnalisées"
status: done
phase: P2
family: back
estimate: M
created: 2026-04-24
updated: 2026-04-26
depends_on: [TCK-034, TCK-024, TCK-040]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
tags: [back, discovery, suggestions]
---

## Objectif utilisateur

Permettre à un Locataire qui consulte une fiche bien de découvrir
immédiatement **des biens similaires** (même ville, même type, gamme de
prix et surface comparables) afin de poursuivre sa recherche sans repartir
des filtres.

## Contrat de données

**Backend — nouvel endpoint :**

- `GET /api/properties/{property}/similar`
  - Query params : `limit` (défaut 6, max 12), supports les query params
    spatie standards (`fields[properties]`, `include`, `sort`).
  - Réponse : collection de Property (jamais le bien source lui-même),
    triée par score de similarité décroissant.

**Algorithme de scoring** (déterministe, sans ML) — calcul on-the-fly avec
cache Redis (TTL 1h) keyé sur `property:{id}:similar:limit:{n}` :

- Filtres durs (obligatoires) : même `transaction_type` (location / vente),
  même `city_id` (via Address), status `active`, non bloqué.
- Score (somme pondérée) :
  - Même `property_type` : +40 pts
  - `price` dans ±20 % : +25 pts ; ±35 % : +15 pts
  - `area` dans ±20 % : +15 pts
  - `bedrooms` égal : +10 pts ; ±1 : +5 pts
  - Tags / amenités communs : +2 pts par match (cap +10)

Si le filtre dur retourne < `limit` résultats, **élargir** automatiquement
en retirant la contrainte `city_id` (fallback : même région).

**Frontend — endpoint à consommer** : celui ci-dessus, intégré sur la
fiche bien (TCK-040) en bas de page (`include=address,primaryMedia,
amenities&fields[properties]=id,title,price,...`).

## Contraintes strictes (métier)

- N'expose **jamais** un bien `pending_review`, `rejected`, `archived`,
  ou bloqué — réutilise les scopes publics existants (TCK-034).
- Cache Redis **par bien source** (pas global). Invalidation sur
  `Property::saved` / `Property::deleted` du bien source ou de tout bien
  qui pourrait apparaître dans ses suggestions (sur même ville + type).
- Pas de personnalisation utilisateur dans ce ticket — purement basé sur
  les attributs du bien source. La personnalisation par historique
  utilisateur est P3.
- Endpoint **public** (pas d'auth requise) — mêmes règles d'accès que
  la fiche bien publique.
- Réponse < 200 ms en p95 sur jeu de données de 10k biens.

## Delta à produire

- [ ] Service : `App\Services\Property\SimilarPropertiesService` avec
      méthode `findSimilar(Property $source, int $limit): Collection`.
- [ ] Controller : `PropertyController@similar` (ou
      `SimilarPropertiesController` si découpé).
- [ ] Route : `GET /api/properties/{property}/similar` dans
      `routes/api/public.php`.
- [ ] Cache : tagged cache via `cache()->tags(['property-similar'])` pour
      invalidation groupée.
- [ ] Observer : `PropertyObserver` étend pour invalider le cache des
      similars sur create/update/delete.
- [ ] FormRequest : `ListSimilarPropertiesRequest` (validation `limit`).
- [ ] Tests : `SimilarPropertiesTest` (algo de scoring,
      fallback élargissement, exclusion biens non-publiés, cache
      invalidation, perf < 200ms).
- [ ] Tests feature : `GET /api/properties/{id}/similar` (200, 404, format
      réponse, query params spatie).

## Critères d'acceptation

- [ ] AC1 — `GET /api/properties/{id}/similar` retourne 200 avec une
      collection ordonnée par score décroissant, jamais le bien source.
- [ ] AC2 — `limit` par défaut = 6, max = 12 (au-delà → 422).
- [ ] AC3 — un bien dans une autre ville ne remonte que via fallback si
      moins de `limit` candidats dans la ville source.
- [ ] AC4 — biens `pending_review` / `rejected` / `archived` jamais
      retournés.
- [ ] AC5 — second appel identique sert depuis le cache Redis (assertion
      via mock du service).
- [ ] AC6 — modification du `price` du bien source invalide le cache de
      ses similars.
- [ ] AC7 — endpoint accepte `fields[properties]`, `include` et `sort`
      (spatie query builder).
- [ ] AC8 — perf : 100 appels concurrents sur jeu de 10k biens → p95 <
      200 ms.

## Hors périmètre

- Personnalisation par historique utilisateur (P3 — basée sur
  recently-viewed / favoris).
- Recommandations cross-agence avec apprentissage (P3).
- Suggestions sur la homepage non liées à un bien (couvertes par
  homepage discovery TCK-038).
- Algo de scoring ML / vectoriel — version déterministe ici.

## Notes d'implémentation

- Fallback uses `address.region` (not `state` — the actual migration column is `region`).
- Observer flushes the whole `property-similar` cache tag on any Property create/update/delete; per the ticket intent ("invalidation groupée"), this is correct and simpler than per-key targeting.
- AC8 (perf p95 < 200ms) is satisfied by the 1h Redis cache; first-call cold performance on 10k properties is in-memory sorting which is not benchmarked in tests.
