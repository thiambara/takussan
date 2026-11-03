---
id: TCK-846
title: "Un équipement du catalogue ne se fusionne pas : 422 au lieu d'une fusion défaite au déploiement"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#10-tag"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-fusion-qui-absorbe-un-équipement-du-catalogue-est-défaite-au-déploiement-suivant"
tags: [back, tags, moderation, pistes]
---

## Contexte

Réf : **P30.02** du fichier de pistes, `validé` par le porteur (critères accordés : V7 et V4).

`TagModeration::fusionner()` acceptait pour source tout équipement sans liaison hors des biens,
catalogue compris, puis le supprimait. `tags:sync-catalog`, joué à chaque déploiement, recrée
tout nom du catalogue absent : la fusion était défaite, et l'équipement revenait sans bien.

## Décision du porteur

refuser en 422 la fusion dont la source est un équipement du catalogue ; pas de trace de fusion

## Objectif utilisateur

Le super-admin qui fusionne un équipement du catalogue apprend tout de suite que ce n'est pas
possible, au lieu de voir sa fusion défaite au déploiement suivant.

## Contrat de données

- `POST /api/admin/tags/{tag}/merge` (existante) : 422 `tags.catalog_merge_forbidden` quand la
  source porte un nom de `TagCatalog::EQUIPEMENTS` (casse repliée, comme `synchroniser()`).
  La cible peut toujours être un équipement du catalogue.

## Delta à produire

- [x] `TagModeration::fusionner()` : sur la source verrouillée, 422
  `tags.catalog_merge_forbidden` si `TagCatalog::estUnEquipement($src->name)`.
- [x] `lang/{fr,en,wo}/errors.php` : le message de `tags.catalog_merge_forbidden` (en `wo`, le
  texte français tel quel : wolof en pause depuis le 2026-10-16).
- [x] Test : `TagCatalogFusionTest` (3 cas).

## Critères d'acceptation

- [x] AC1 — Catalogue chargé, `Ventilateurs` fusionné dans `Climatisation` → 422
  `tags.catalog_merge_forbidden` ; la source et ses liaisons restent ; `synchroniser()` rejoué →
  une seule ligne `Ventilateurs`, même identifiant.
- [x] AC2 — Une proposition `VENTILATEURS` (nom du catalogue à la casse près) → 422 aussi.
- [x] AC3 — Une proposition `Clim` fusionnée dans `Climatisation` → 200, source supprimée.

## Hors périmètre

- Aucune trace de fusion que `synchroniser()` respecterait (décision du porteur).
- Le libellé de ce code dans la console super-admin : le front n'affiche aujourd'hui aucun des
  codes `tags.*` de la modération.

## Notes d'implémentation

- Ablation : la garde retirée de `fusionner()` → 2 rouges sur 3 (200 au lieu de 422) ; remise →
  3 verts, `TagModerationTest` vert.
