---
id: TCK-1838
title: "Le PATCH ne déplace plus une visite hors statut actif"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-184--champs-hors-statut-que-le-patch-générique-écrit-alors-quun-geste-dédié-les-garde"
tags: [back, visites, notifications, pistes]
---

## Contexte

Réf : **P184.04** du fichier de pistes, `validé (délégué)` (critère accordé : V7). `update` de
`PropertyVisitController` ne refusait que `completed` et `cancelled` : une visite `no_show` se
déplaçait, le visiteur recevait `VisitRescheduled`, puis ni la confirmation ni le report du
visiteur n'étaient plus possibles. Le report (`rescheduleOrFail`) et l'écran (`VisitDetail`) ne
déplacent qu'une visite de `VisitSchedulingService::ACTIVE_STATUSES`.

## Décision du porteur (déléguée)

> validé (délégué) — borner le refus au déplacement : le `PATCH` refuse en 422 `visit.reschedule_inactive` tout changement de `scheduled_at` sur une visite hors `VisitSchedulingService::ACTIVE_STATUSES`, sans avis au visiteur ; notes, type et agent restent modifiables sur une visite `no_show` ; reste : la prise en charge (`claim`) d'une visite `no_show`, non mesurée

## Objectif utilisateur

Le visiteur d'une visite close n'est plus averti d'un nouveau rendez-vous que rien ne peut tenir.

## Contrat de données

`PATCH /api/property-visits/{visit}` : `scheduled_at` différent de l'heure enregistrée sur une
visite hors `scheduled`/`confirmed` → 422 `visit.reschedule_inactive` (code existant, texte déjà
présent dans les trois langues), rien d'écrit, aucun avis. `completed` et `cancelled` gardent leur
refus `visit.closed`, jugé avant.

## Delta à produire

- [x] `PropertyVisitController::update` : refus du changement d'heure hors `ACTIVE_STATUSES`,
  avant toute écriture.
- [x] Test `PropertyVisitUpdateInactiveTest`.

## Critères d'acceptation

- [x] AC1 — Le cas mesuré : visite `no_show` d'il y a une heure, `PATCH {scheduled_at: J+2 10:00}`
  du propriétaire → 422 `visit.reschedule_inactive`, statut et heure inchangés, aucun avis.
- [x] AC2 — Notes et type d'une visite `no_show` restent modifiables (200), sans avis.

## Reste à faire

- la prise en charge (`claim`) d'une visite `no_show`, non mesurée

## Hors périmètre

- Les règles de `completed`/`cancelled` (`visit.closed`), inchangées.

## Notes d'implémentation

- Le refus ne joue que sur un **changement** réel de l'heure : un `scheduled_at` égal à l'heure
  enregistrée n'est pas un déplacement (il est de toute façon refusé par `after:now` sur une
  visite passée).
- Ablation : condition neutralisée → AC1 rouge (200 au lieu de 422), AC2 vert ; remise → 2 verts.
