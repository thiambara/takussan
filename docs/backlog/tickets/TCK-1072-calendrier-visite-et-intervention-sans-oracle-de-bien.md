---
id: TCK-1072
title: "Le calendrier, la visite et l'intervention ne disent plus quels biens existent (P62.06)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md"
tags: [back, authorization, calendar, visits, maintenance, pistes]
---

## Objectif utilisateur

Un compte connecté ne peut plus apprendre, par le calendrier, une demande de visite ou une demande
d'intervention, qu'un bien qu'il ne voit pas (brouillon, privé, archivé) existe.

## Contexte

Réf : **P62.06** du fichier de pistes (angle 62), `validé` par le porteur (critère V2 accordé).

`IndexCalendarRequest`, `StorePropertyVisitRequest` et `StoreMaintenanceRequestRequest` ont un
`authorize()` qui rend `true` (ou juge après coup), et `exists:properties,id` sur `property_id`
(et `property_ids.*`). Mesuré avant correctif, compte sans agence, brouillon d'une agence tierce :
calendrier 200 et agenda vide contre 422 pour un absent ; visite 403
`visit.property_unavailable` contre 422 ; intervention 403 contre 422 ; et, corps incomplet, une
erreur `property_id` de plus pour l'absent seul.

## Décision du porteur

> (a) comme P62.01 : retirer `exists:properties,id` là où la visibilité est déjà jugée, avec la réponse du refus pour un absent (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- La partie conversation de la `Piste` (`StoreConversationRequest:51`) est faite par TCK-1070
  (P62.04), qui a retiré les `exists:` de tous les champs que juge `guardContext()`.
- La réponse du refus de l'intervention est le 403 nu de `MaintenanceRequestController::store()`,
  et celle de la visite le 403 `visit.property_unavailable`.

## Contrat de données

Formes inchangées. Un `property_id` inconnu rend la réponse d'un bien invisible : agenda vide
(calendrier), 403 `visit.property_unavailable` (visite), 403 (intervention). Un identifiant non
entier reste un 422.

## Delta à produire

- [x] `IndexCalendarRequest` : `property_id` et `property_ids.*` en `integer` sans `exists:`
      (`agency_id` reste : P62.07).
- [x] `StorePropertyVisitRequest` : `property_id` `['required', 'integer']` ;
      `PropertyVisitController::store()` : bien absent → 403 `visit.property_unavailable`.
- [x] `StoreMaintenanceRequestRequest` : `property_id` `['required', 'integer']` ;
      `MaintenanceRequestController::store()` : bien absent → 403.
- [x] `ExistsSurRouteOuverteTest` : deux exceptions retirées, `IndexCalendarRequest` ne garde que
      P62.07.
- [x] `CalendarTest::test_calendar_rejects_unknown_property_id` : un inconnu rend l'agenda vide, un
      non entier 422.
- [x] Test : `tests/Feature/Api/PropertyContextExistenceOracleTest.php`.

## Critères d'acceptation

- [x] AC1 — calendrier : bien absent et brouillon tiers, même 200 et même agenda, par `property_id`
      et par `property_ids[]`.
- [x] AC2 — visite : bien absent et brouillon tiers, même 403 `visit.property_unavailable` ; corps
      incomplet, même 422.
- [x] AC3 — intervention : bien absent et brouillon tiers, même 403 ; corps incomplet, même 422.

## Hors périmètre

- P62.07 (`agency_id` du calendrier, intégrations, invitations, rôle d'agence).

## Notes d'implémentation

- Ablation : correctif d'`app/` retiré → 3 rouges sur 3 ; remis → 3 verts, 338 sur les vingt-deux
  classes voisines (calendrier, visites, interventions).
- `CalendarTest::test_calendar_rejects_unknown_property_id` (TCK-072) épinglait le 422 d'un bien
  inconnu « contre une tentative de sonde » : c'était la sonde même, le brouillon tiers rendant 200.
  Il attend désormais l'agenda vide, et le 422 d'un identifiant non entier.
- `PropertyVisitController::store()` lit le bien par `StorePropertyVisitRequest::property()`, déjà
  résolu pour les règles : une requête de moins.
