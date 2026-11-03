---
id: TCK-960
title: "Le passage en agence standard n'écrit plus metadata.legal_info, et les commentaires le disent"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#metadatalegal_info-reste-exposé-et-décrit-comme-la-source-alors-quil-nest-plus-écrit"
tags: [back, agency, docs, pistes]
---

## Contexte

Réf : **P47.06** du fichier de pistes, `retenu · autonome` (A6).

Le docblock de `AgencyKindFlipService::LEGAL_FIELDS` dit que les mentions légales vivent dans
`metadata.legal_info`. Depuis TCK-594, les quatre champs ont chacun leur colonne
(`COLUMN_OF`) : la branche qui écrivait `legal_info` n'est jamais atteinte, et le flip réécrivait
`metadata.legal_info` tel qu'il l'avait lu. Le commentaire d'`AgencyResource` décrit encore
`legal_info.*` comme les champs posés à l'approbation.

## Objectif

Le code et ses commentaires disent ce que fait le flip : il écrit les colonnes, il lit
`metadata.legal_info` sans y écrire.

## Hypothèses (mode sans humain)

- Retirer la réécriture de `metadata.legal_info` ne change qu'un cas : une agence sans
  `legal_info` n'y reçoit plus un tableau vide. Rien ne lit cette clé côté front (`grep` du
  mesureur : seul `types/agency.ts` la type).

## Delta à produire

- [x] Docblock de `LEGAL_FIELDS` : les colonnes, `legal_info` lu seulement.
- [x] Retrait de la branche inatteignable et de la réécriture de `metadata.legal_info`.
- [x] Commentaire d'`AgencyResource` corrigé.
- [x] `AgencyKindFlipTest` : chaque champ légal a sa colonne ; `legal_info` intact après le flip.

## Critères d'acceptation

- [x] AC1 — Tout `LEGAL_FIELDS` a son entrée dans `COLUMN_OF`, colonne remplissable d'`Agency`.
- [x] AC2 — Après le flip, `metadata.legal_info` vaut ce qu'il valait avant.
- [x] AC3 — Les tests du flip existants restent verts (valeur curée gagnante, colonnes remplies).

## Hors périmètre

- L'exposition de `metadata.legal_info` par `AgencyResource` et son type front (V3), et le retrait
  des données restantes (V4).

## Notes d'implémentation

- Le correctif retire du code mort : aucun test ne peut rougir sans lui. L'ablation porte donc sur
  ce qui rend la branche morte : un champ ajouté à `LEGAL_FIELDS` sans colonne fait rougir
  `test_every_legal_field_has_its_column` ; retiré → 8 verts.
