---
id: TCK-2498
title: Liste publique : répartition des prix par tranche pour l'histogramme du budget
status: todo
phase: P1
family: back
estimate: S
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: [TCK-2499]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [back, search, facets, audit-ux]
---

## Objectif utilisateur

Le chercheur voit où sont les biens avant de fixer son budget, au lieu de deviner un plafond.

## Contrat de données

`GET /api/public/properties/price-distribution` — mêmes paramètres de filtre que la liste publique, **sans** `price_min`/`price_max`. Réponse : `{ data: { buckets: [{ from, to, count }], min, max } }`, au plus 20 tranches, bornes arrondies au millier de francs, séparément pour la location (par mois) et la vente selon `contract_type` (obligatoire).

## Contraintes strictes (métier)

- Mêmes filtres de visibilité que la liste (biens publics, non test) ; un loyer s'entend par mois (période ramenée comme le fait la liste).
- Limiteur public de la liste ; réponse mise en cache par jeu de filtres normalisé, une heure au plus.
- `contract_type` absent → 422.

## Delta à produire

- [ ] Route dans `routes/api/public.php`, action `PublicPropertyController::priceDistribution`.
- [ ] `App\Http\Requests\Public\PriceDistributionRequest`.
- [ ] Calcul dans `PropertySearchService` (ou un service dédié `PriceDistribution`), sous les filtres de la liste.
- [ ] Tests : `PriceDistributionTest` (tranches, filtres appliqués, `contract_type` requis, biens test exclus).

## Critères d'acceptation

- [ ] AC1 — La somme des `count` égale le `meta.total` de la liste sous les mêmes filtres (sans bornes de prix).
- [ ] AC2 — Un filtre de quartier change la répartition.
- [ ] AC3 — Sans `contract_type`, 422.

## Hors périmètre

- L'affichage (TCK-2499).

## Notes d'implémentation

_(à remplir par implementing-specs)_
