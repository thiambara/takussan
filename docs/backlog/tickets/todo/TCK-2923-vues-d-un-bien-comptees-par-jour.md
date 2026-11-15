---
id: TCK-2923
title: "Les vues datées d'un bien servies à l'agence : la mise en avant se compare à la semaine d'avant, et l'agence connaît ses biens les plus vus du mois"
status: todo
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2905]
blocks: [TCK-2925, TCK-2929]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#94-propertyboostdailystat-"
tags: [back, biens, vues, credits, vitrine, mesure, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'agence voit si une mise en avant a rapporté plus de vues que la semaine d'avant, et choisit sa vitrine parmi les biens les plus vus du mois.

## Contrat de données

Relevé du 2026-11-15 : une vue de fiche n'existe qu'en **cumul** (`properties.views_count`, incrémenté par la fiche publique) ; seules les mises en avant ont une série datée (`property_boost_daily_stats` : impressions, clics, **pendant** la mise en avant). Aucune donnée ne dit combien de vues un bien a eues avant sa mise en avant, ni ce mois-ci : c'est le motif des écarts acceptés de TCK-2664 (« × plus de vues que la semaine d'avant ») et TCK-2670 (« vos biens les plus vus ce mois · Utiliser cette sélection »).

La série journalière des vues de fiche (`property_daily_views`, une ligne par bien et par jour, sans donnée personnelle) est créée par **TCK-2905** (famille patrimoine, même vague) : ce ticket la **lit**, il ne la crée pas.

Livré par ce ticket :

- `GET /api/credits/boosts` : pour chaque mise en avant, `views_7d` (7 derniers jours) et `views_prev_7d` (les 7 jours précédant le début de la mise en avant) ;
- `GET /api/agencies/{agency}/properties/most-viewed?limit=6` (`AgencyMostViewedPropertiesController`) : les biens **publics** de l'agence triés par vues du mois civil en cours.

## Contraintes strictes (métier)

- Une seule source : la table de TCK-2905 ; aucune seconde écriture des vues, aucune seconde définition de « vue ».
- `most-viewed` ne rend que des biens publiés de l'agence, à qui peut écrire sa vitrine (règle de `peutEcrireLaVitrine`).

## Delta à produire

- [ ] `CreditBoostController@index` : `views_7d`, `views_prev_7d`.
- [ ] Endpoint des biens les plus vus du mois + policy.
- [ ] Tests : `CreditBoostViewsComparisonTest`, `AgencyMostViewedPropertiesTest`.

## Critères d'acceptation

- [ ] AC1 — Pour une mise en avant commencée il y a 7 jours, avec 10 vues dans les 7 jours précédant son début et 30 depuis, `GET /api/credits/boosts` rend `views_prev_7d: 10` et `views_7d: 30`. Sans vue avant le début, `views_prev_7d` vaut `0` (le front n'affiche alors pas de ratio).
- [ ] AC2 — Les biens les plus vus du mois rendent, dans l'ordre décroissant des vues du mois civil, les seuls biens publiés de l'agence ; un bien de l'agence B, un brouillon ou un bien vu le mois précédent seulement n'y sont pas.
- [ ] AC3 — Un agent sans droit d’écrire la vitrine reçoit 403 sur les biens les plus vus ; un admin d'une autre agence aussi.

## Hors périmètre

- Les écrans (TCK-2925 crédits, TCK-2929 fiche publique).
- La table et son écriture (TCK-2905). Une reprise du passé : la série commence au déploiement de TCK-2905.

## Notes d'implémentation

_(à remplir par implementing-specs)_
