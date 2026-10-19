---
id: TCK-987
title: "La clé de chaque BelongsTo chargeable est sélectionnable sous un sparse fieldset"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#40-bankstatement-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-58--colonnes-absentes-du-sparse-fieldset--relation-valeur-par-défaut-ou-null-à-la-place"
tags: [api, query-builder, sparse-fieldsets, pistes]
---

## Contexte

Réf : **P58.02** du fichier de pistes, `retenu · autonome` (A1). `BankStatement` déclare
`uploadedBy` et `finalizedBy` chargeables, mais `uploaded_by` et `finalized_by` ne sont pas dans
`$queryFields` : sous un `fields[bank_statements]`, la clé n'est jamais lue et la relation se
charge à vide (`uploaded_by: null` pour un relevé qui a un auteur), et demander la clé rend 400.
Même forme sur `Agency::primaryAdmin` (`primary_admin_id`) et `Document::verifier`
(`verified_by`), dont les ressources rendent déjà la colonne.

Re-mesuré le 2026-10-19 sur `pre-dev` 99abff99b par les deux tests ci-dessous : 400 sur
`fields[bank_statements]=id,status,uploaded_by,finalized_by&include=uploadedBy,finalizedBy`, et
la garde nomme exactement ces quatre relations.

## Objectif

Un client qui lit un sparse fieldset peut charger l'auteur, le finaliseur, l'admin principal ou le
vérificateur en sélectionnant leur clé.

## Delta à produire

- [x] `BankStatement::$queryFields` : `+ uploaded_by, finalized_by`.
- [x] `Agency::$queryFields` : `+ primary_admin_id` (rendu par `AgencyResource`).
- [x] `Document::$queryFields` : `+ verified_by` (rendu par `DocumentResource`).
- [x] Tests: `tests/Feature/Api/Accounting/BankStatementSparseFieldsTest.php` et la garde
      `tests/Feature/Models/RelationChargeableACleSelectionnableTest.php` (toute `BelongsTo` de
      `$requestLoadable` a sa clé, et son type pour une `MorphTo`, dans `$queryFields`).

## Critères d'acceptation

- [x] AC1 — `GET /api/agencies/{id}/bank-statements?fields[bank_statements]=id,status,uploaded_by,finalized_by&include=uploadedBy,finalizedBy`
      → 200, `data.0.uploaded_by.id` et `data.0.finalized_by.id` = l'auteur.
- [x] AC2 — La garde est verte, et rougit en nommant la relation dès qu'une clé manque.

## Hypothèses (mode sans humain)

- La `Piste` propose deux voies ; celle retenue par le classement A1 du mesureur est la première
  (ajouter les colonnes que les ressources rendent déjà), qui n'expose rien de neuf. Les consoles
  publiques n'empruntent pas `buildQuery()` (lu, `PublicAgencyController.php:90`,
  `PublicAgentController.php:102`).

## Hors périmètre

- Faire sélectionner par `HasQueryBuilder` la clé d'une `BelongsTo` demandée par `include=` quand
  `fields[]` l'omet : sans cela, un client qui oublie la clé reçoit encore `null` (reste de
  l'entrée).
- La relation `Document::verifier` chargée sans être rendue par `DocumentResource` : angle 60.

## Notes d'implémentation

- Avant : HTTP 400 ; la garde nomme les quatre relations.
- Ablation : les trois `$queryFields` remis à l'identique → 2 rouges (400, et les quatre fautes) ;
  remis → 2 verts.
