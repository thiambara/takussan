---
id: TCK-1146
title: "Un bailleur suspendu n'est plus donneur d'ordre des interventions sur ses biens de l'agence"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-82--bailleur-et-membre-jugés-en-dur-hors-de-landlordwrites-et-des-capacités"
tags: [back, maintenance, authorization, adr-0031, adr-0037, pistes]
---

## Contexte

Réf : **P82.01** du fichier de pistes, `validé` (V2 accordé : en `awaiting_owner`, aucun autre
acteur que le bailleur ne décide du devis, ADR-0037 ; qui tranche quand il est suspendu était le
choix réservé).

`MaintenanceRequestPolicy::isPrincipalFor()` rend vrai dès que `property.user_id === user.id`, sans
lire le statut du profil de bailleur : un bailleur `blocked` dans l'agence de son bien modifiait la
demande, commandait et tranchait les devis, assignait et changeait le statut, contre ADR-0031 § 2.

## Décision du porteur

validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la piste n'a qu'une voie. Les gestes d'écriture (`update`, `actAsPrincipal`, donc
`manageQuotes` et `decideQuote`, `transitionTo` par `actorsOf`, `respondToResolution`) passent par
une méthode privée `principalWrites()` : `isPrincipalFor`, sauf le bailleur suspendu dans l'agence
du bien (règle de `BasePolicy::landlordWrites`). `isPrincipalFor` lui-même, `view` et `viewQuote`
ne changent pas. En `awaiting_owner`, seul le super-admin tranche le devis tant que la suspension
dure.

## Objectif utilisateur

Un bailleur suspendu par une agence suit les interventions de ses biens de cette agence sans plus
les commander.

## Delta à produire

- [x] `MaintenanceRequestPolicy::principalWrites()` et son emploi dans les gestes d'écriture.
- [x] Test dans `tests/Feature/Api/Agency/TeamMemberSuspensionTest.php`.

## Critères d'acceptation

- [x] AC1 — bailleur bloqué dans A, demande `open` de son bien de A : `update`, `manageQuotes`,
      `actAsPrincipal`, `decideQuote`, `transitionTo(cancelled)` refusés ; `decideQuote` refusé aussi
      en `awaiting_owner` ; `PUT …/status` → 403, statut inchangé.
- [x] AC2 — `view` et `viewQuote` accordés, `GET` de la demande 200.
- [x] AC3 — les mêmes gestes accordés sur la demande de son bien de B, où il est actif.

## Hors périmètre

- `MaintenanceRequestController::store()`, qui lit `isPrincipalFor` pour ouvrir une demande : la
  piste ne le cite pas.

## Notes d'implémentation

- Ablation : la policy rendue à son état d'avant → AC1 rouge (`update` accordé) ; remise → vert.
