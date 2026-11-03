---
id: TCK-1820
title: "L'annulation d'une visite juge son statut sur la ligne relue sous verrou"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-182--gestes-de-transition-rejoués-sur-un-état-déjà-atteint"
tags: [back, visites, concurrence, pistes]
---

## Contexte

Réf : **P182.06** du fichier de pistes, `retenu · autonome` (A1 : la garde `visit.cannot_cancel`
écrit déjà le contrat, une visite annulée ou faite ne s'annule pas).

`PropertyVisitController::cancel` jugeait `visit.cannot_cancel` sur le modèle lié à la route,
puis écrivait sans transaction ni verrou et prévenait. Deux annulations simultanées passaient
toutes deux et envoyaient deux avis ; une annulation concurrente d'un `complete` écrasait
`completed`. `confirmOrFail` verrouille et relit déjà.

## Delta à produire

- [x] `VisitSchedulingService::cancelOrFail(visit, reason)` : transaction, ligne relue par
      `lockForUpdate`, `visit.cannot_cancel` jugé sur elle, écriture de l'annulation.
- [x] `PropertyVisitController::cancel` (et `destroy`, qui le relaie) l'appelle ; l'avis part
      après la transaction, comme avant.
- [x] Test `tests/Feature/Api/PropertyVisitCancelSousVerrouTest.php`.

## Critères d'acceptation

- [x] AC1 — Une visite passée `cancelled` en base derrière un modèle resté `scheduled` rend 422
      `visit.cannot_cancel`, sans avis ni écriture.
- [x] AC2 — Une visite passée `completed` derrière le même modèle reste `completed`, 422, sans avis.
- [x] AC3 — Une visite planifiée s'annule toujours (200, motif écrit, un avis).

## Hors périmètre

- Le contrôle d'appartenance (403 `visit.staff_only`) reste jugé sur le modèle lié : il ne lit
  ni le statut ni rien que l'annulation change.
- Rendre 200 sur une visite déjà annulée (P182.04, au porteur).

## Notes d'implémentation

- La course se rejoue sans concurrence : un écouteur `PropertyVisit::retrieved` passe la ligne à
  l'état voulu juste après la liaison de route, une fois.
- Ablation : contrôleur rendu à `pre-dev` → 2 tests rouges sur 3 (200 au lieu de 422) ; remis →
  3/3 verts.
