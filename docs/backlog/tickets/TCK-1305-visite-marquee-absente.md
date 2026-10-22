---
id: TCK-1305
title: "Visites : le geste « absent » écrit `no_show` sur une visite passée"
status: done
phase: P1
family: full
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-115--statuts-denum-quaucun-chemin-de-app-nécrit"
tags: [api, front, visits, pistes]
---

## Contexte

Réf : **P115.05** du fichier de pistes, `validé` par le porteur.

Rien n'écrit `VisitStatus::NoShow` : le statut ne change que par des routes dédiées (`confirm`,
`complete`, `cancel`, `claim`, `reschedule`), aucune pour l'absence. L'agent dont le visiteur ne
vient pas déclare la visite terminée (comptée parmi les visites menées, ouverte à l'avis) ou
l'annule.

## Décision du porteur

porteur (2026-10-22) : garder `no_show` et lui donner un écrivain : le geste « absent » (`POST property-visits/{visit}/no-show` depuis `scheduled`/`confirmed`, l'heure passée), pas le passage automatique à 24 h

## Objectif

Le personnel déclare absente une visite passée, sans la compter parmi les visites menées.

## Delta à produire

- [x] Route `POST /api/property-visits/{visit}/no-show` (`property-visits.no-show`) →
      `PropertyVisitController::noShow` : policy `update`, geste de qui agit pour le bien
      (`visit.staff_only`), 422 `visit.cannot_mark_no_show` hors `scheduled`/`confirmed` ou avant
      l'heure ; libellé d'erreur fr/en (wo : texte français, wolof en pause).
- [x] Front : « Marquer absent » sur la fiche visite, pour le personnel, visite planifiée ou
      confirmée dont l'heure est passée ; toast de succès.
- [x] Tests : `PropertyVisitNoShowTest`, `VisitDetail.absent.tck-1305.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Le bailleur d'un bien marque absente une visite confirmée (ou planifiée) passée → 200,
      `no_show`, `completed_at` vide.
- [x] AC2 — Une visite à venir, terminée, annulée ou déjà absente → 422
      `visit.cannot_mark_no_show`, statut inchangé.
- [x] AC3 — Le visiteur → 403.
- [x] AC4 — Le bouton n'apparaît qu'au personnel, sur une visite planifiée ou confirmée passée.

## Hors périmètre

- Le passage automatique à 24 h de TCK-075 (écarté par le porteur).
- Toute notification au visiteur marqué absent : la décision n'en demande pas.

## Notes d'implémentation

- Ablation API : garde d'état et d'heure neutralisée → 2 rouges sur 5 ; remise → vert.
  `PropertyVisitTest` vert.
- Front : avant correctif, 2 rouges sur 5 (bouton absent) ; les mocks de `@/lib/queries/visits`
  de `VisitDetail.test.tsx` et `VisitDetail.tck-590.test.tsx` gagnent `useMarkVisitNoShow`.
- Hors note et hors visites menées sans code de plus : `ReviewEligibility` et
  `TeamPerformanceService` ne lisent que `completed`.
