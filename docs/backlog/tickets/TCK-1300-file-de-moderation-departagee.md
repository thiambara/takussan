---
id: TCK-1300
title: "La file de modération des biens se départage par l'id"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-118--listes-paginées-triées-sur-une-colonne-non-unique"
tags: [back, moderation, pagination, pistes]
---

## Contexte

Réf : **P118.05** du fichier de pistes, `retenu · autonome` (A1). `PropertyModerationController::index`
trie sur `submitted_at` seul, puis pagine par 20 : des biens soumis dans la même seconde, ou dont
`submitted_at` est nul (les quatre biens `pending_review` des seeders), sortaient au hasard du plan.
La liste est écrite à la main, hors `buildQuery()` : le départage de TCK-1296 ne la couvre pas.

## Objectif utilisateur

L'admin qui modère parcourt sa file dans un ordre stable, sans bien manqué d'une page à l'autre.

## Contrat de données

`GET /api/properties/moderation` : `submitted_at` croissant (nuls en dernier), puis `properties.id`.

## Contraintes strictes (métier)

Aucun changement de périmètre ni d'autorisation de la file.

## Delta à produire

- [x] `->orderBy('properties.id')` après `orderBy('submitted_at')`.
- [x] Test : `PropertyModerationQueueOrderTest`.

## Critères d'acceptation

- [x] AC1 — Sept biens en attente (trois de même seconde, trois sans `submitted_at`, deux mis à
  jour) sortent par `submitted_at`, nuls en dernier, puis par `id`.

## Hors périmètre

- Les autres listes écrites à la main hors `buildQuery()` (angle 135).

## Notes d'implémentation

- Ablation : contrôleur rendu à `HEAD` → 1 rouge (ordre physique) ; correctif remis → vert.
