---
id: TCK-1105
title: "Un numéro d'agrément déjà porté par une agence se refuse en 422"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-92--contraintes-unique-sans-garde--doublon-rendu-en-500"
tags: [back, agence, validation, pistes]
---

## Contexte

Réf : **P92.04** du fichier de pistes, `retenu · autonome` (A1 : la contrainte
`agencies.license_number` `unique()` fixe la règle).

Les règles de création et de modification se limitaient à `['nullable', 'string']` : un numéro
porté par une autre agence, supprimée comprise, atteignait la contrainte, soit 500.

## Objectif utilisateur

Une agence qui saisit le numéro d'agrément d'une autre reçoit une erreur de validation sur le
champ, et non une panne serveur.

## Delta à produire

- [x] `StoreAgencyRequest` : `Rule::unique('agencies', 'license_number')`, sans exclure les agences
      supprimées (comme la contrainte).
- [x] `AgencyUpdateRequest` : même règle, `->ignore()` de l'agence modifiée.
- [x] Test `tests/Feature/Api/Agency/AgencyLicenseNumberUniqueTest.php`.

## Critères d'acceptation

- [x] AC1 — `POST /api/agencies` avec le numéro d'une agence vivante : 422 sur `license_number`.
- [x] AC2 — avec celui d'une agence supprimée : 422 ; un numéro libre : 201.
- [x] AC3 — `PATCH /api/agencies/{id}` vers un numéro pris : 422 ; renvoyer son propre numéro : 200.

## Hors périmètre

- Le numéro d'une agence supprimée n'est pas libéré (la contrainte le compte).
- La borne de longueur du numéro (P91.01).

## Notes d'implémentation

- Reproduction avant correctif : les trois tests rendent 500 (`agencies_license_number_unique`).
- Ablation : les deux FormRequest rendues à `HEAD` → 3 rouges sur 3 ; correctif remis → 3/3.
