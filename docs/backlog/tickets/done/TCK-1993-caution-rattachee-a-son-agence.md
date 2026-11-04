---
id: TCK-1993
title: "La caution porte son agence : elle reste lisible par l'agence après l'effacement de son auteur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#27-guarantor-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-caution-ajoutée-par-un-agent-qui-efface-son-compte-nest-plus-lisible-ni-modifiable-par-personne-dans-lagence"
tags: [api, guarantors, authorization, account-deletion, migration, pistes]
---

## Contexte

Réf : **P175.01** du fichier de pistes, `validé` (V4 accordé).

`GuarantorPolicy::view` (donc `update`, `delete`) et `::agencyOf` lisaient l'agence d'une caution
par son auteur (`addedBy->agency_id`). Après l'effacement du compte de l'auteur (`anonymize()`,
profils supprimés), `addedBy` est nul : le personnel de l'agence et son admin recevaient 403.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : une colonne `guarantors.agency_id` posée à la création, avec rattrapage des lignes existantes

## Objectif utilisateur

Une caution reste lisible et modifiable par le personnel de son agence, quel que soit le sort du
compte qui l'a saisie.

## Delta à produire

- [x] Migration `2026_10_23_230000_add_agency_id_to_guarantors_table` : `agency_id` nullable, clé
  étrangère `nullOnDelete`, index ; rattrapage ; `down()` qui retire la colonne.
- [x] `Guarantor::agency()` et `agency_id` en `$fillable`.
- [x] `GuarantorController::store` : `staffAgencyId()` de l'auteur, à défaut l'accesseur pont.
- [x] `LeaseController::attachGuarantor` (caution créée depuis un bail) : l'agence du bail.
- [x] `GuarantorPolicy::agencyOf` : la colonne d'abord, l'auteur en repli ; `view` juge par elle.
- [x] `tests/Feature/Api/CautionApresEffacementDeLAuteurTest.php`.

## Critères d'acceptation

- [x] AC1 — une caution créée par un agent porte l'agence de l'agent.
- [x] AC2 — après `anonymize()` de l'auteur, un collègue et l'admin de l'agence lisent la caution
  (200), l'admin la modifie (200).
- [x] AC3 — un agent d'une autre agence reste refusé (403).
- [x] AC4 — une caution créée depuis un bail porte l'agence du bail.
- [x] AC5 — le rattrapage : agence du bail d'abord ; sinon agence unique des profils de l'auteur,
  profils supprimés compris ; auteur de plusieurs agences sans bail → nulle.

## Hors périmètre

- La liste `GET /api/guarantors` ne rend toujours, hors super-admin, que les cautions de leur
  auteur (`added_by_id`) : la décision ne la touche pas, et ce n'est pas un effet de l'effacement.
- `docs/models-spec.md` § 27 ne décrit pas encore `agency_id` : à aligner par `/sync-specs`.
- Le cas de l'agent seulement retiré de l'agence (« à vérifier » de la piste) est couvert par la
  colonne, sans test dédié.

## Notes d'implémentation

- Hypothèses du rattrapage : une source n'est retenue que si elle désigne une seule agence (la règle
  de l'accesseur `User::agency_id`) ; les profils bailleurs comptent, parce que l'ancienne règle les
  comptait par l'accesseur.
- Le repli sur l'auteur reste pour une colonne nulle : la règle d'avant, pour ces seules lignes.
- Ablation des changements de `app/` (migration gardée) : AC1, AC2, AC4 rouges. Ablation des deux
  `UPDATE` de la migration : AC5 rouge. Correctif remis → 5/5.
