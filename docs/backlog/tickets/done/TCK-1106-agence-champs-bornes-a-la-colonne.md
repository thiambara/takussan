---
id: TCK-1106
title: "Téléphone, nom et numéro d'agrément d'une agence bornés à leur colonne : 422 et non 500"
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-91--bornes-max-des-formrequests-face-aux-varcharn"
tags: [back, agence, validation, pistes]
---

## Contexte

Réf : **P91.01** du fichier de pistes, `retenu · autonome` (A1 : la longueur des colonnes fixe le
contrat, seul un 500 devient 422).

`agencies.phone` est un `varchar(30)`, `name` et `license_number` des `varchar(255)`.
`StoreAgencyRequest` et `AgencyUpdateRequest` les validaient en `string` sans `max`, et l'assistant
d'ouverture de la console bornait `agency.phone` à 50 : une valeur trop longue atteignait
PostgreSQL (22001), soit 500.

## Objectif utilisateur

Un client de l'API qui envoie un téléphone, un nom ou un numéro d'agrément trop long reçoit une
erreur de validation sur le champ, et non une panne serveur.

## Delta à produire

- [x] `StoreAgencyRequest` et `AgencyUpdateRequest` : `max:255` sur `name` et `license_number`,
      `max:30` sur `phone`.
- [x] `StoreAgencyOnboardingRequest` : `agency.phone` ramené de `max:50` à `max:30`.
- [x] Test `tests/Feature/Api/Agency/AgencyFieldLengthTest.php`.

## Critères d'acceptation

- [x] AC1 — `POST /api/agencies` avec `phone` de 31, `name` ou `license_number` de 256 caractères :
      422 sur la clé, aucune agence créée ; à la borne, 201.
- [x] AC2 — `PATCH /api/agencies/{id}` : mêmes cas, 422 et agence inchangée ; à la borne, 200.
- [x] AC3 — `POST /api/admin/agencies` avec `agency.phone` de 31 caractères : 422 ; 30 : 201.

## Hors périmètre

- Le format du téléphone (`TelephoneSaisi`, `TelephoneJoignable`) : il changerait ce qui passe
  aujourd'hui.
- La borne de l'adresse e-mail (P91.05).
- Un nom de 250 à 255 caractères à `POST /api/agencies` rend encore 500 : le slug dérivé
  (`Str::slug(name)` suivi de 6 caractères, `Agency::booted`) dépasse le `varchar(255)` de
  `agencies.slug`. Autre cause, laissée en reste de P91.01.

## Notes d'implémentation

- Reproduction avant correctif : les trois tests rendent 500.
- Ablation : les trois FormRequest rendues à `HEAD` → 3 rouges sur 3 ; correctif remis → 3/3.
- Le témoin de création s'arrête à un nom de 249 caractères : à 255, le slug dérivé déborde (500),
  constaté en écrivant le témoin.
