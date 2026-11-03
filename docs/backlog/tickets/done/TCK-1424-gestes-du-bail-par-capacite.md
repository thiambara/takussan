---
id: TCK-1424
title: "La fiche d'un bail ne monte que les gestes que `LeasePolicy` accorde, par `abilities`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-152--gestes-hors-de-appagency-montrés-par-le-rôle-jugés-par-la-capacité"
tags: [back, front, leases, permissions, pistes]
---

## Objectif utilisateur

Un membre de l'agence dont le rôle ne porte pas `leases.renew`, `leases.rent_review`,
`payments.record` ou `leases.refund_deposit` ne se voit plus offrir le geste correspondant sur la
fiche d'un bail, que l'API lui refuse.

## Contexte

Réf : **P152.02** du fichier de pistes, `retenu · autonome` (A1 : la règle est écrite dans
`LeasePolicy`).

Mesuré avant correctif (tests ci-dessous, rouges sur `e2959c84c`) : `GET /api/leases/{id}` ne rend
aucun `abilities` ; la fiche monte les quatre gestes à tout rôle `super_admin`, `agency_admin`,
`agent` ou `owner`.

## Hypothèses (mode sans humain)

- Comme le recommande la Piste : `LeaseResource` rend `abilities` (`renew`, `review_rent`,
  `record_payment`, `refund_deposit`) sur le détail seul (`forViewer`), calculés par les quatre
  méthodes de `LeasePolicy`. Le statut du bail reste jugé par l'écran.
- Constater la pénalité réglée de l'échéancier passe par `recordPayment`
  (`MarkLateFeePaidRequest::authorize`) : il suit `record_payment`. Le lien de paiement, jugé par
  `LeasePaymentPolicy::update` (tout le personnel), garde le rôle de gestion.
- Les gestes qu'une autre règle juge (document, échéancier, garants, préavis) gardent le rôle.

## Delta à produire

- [x] `LeaseResource` : `abilities` sous `forViewer`.
- [x] `LeaseDetail` : renouveler, réviser le loyer, encaisser, restituer le dépôt sous leur drapeau ;
  `LeaseSchedule` : `canRecordPayment` pour la pénalité.
- [x] Tests : `tests/Feature/Leases/LeaseAbilitiesTest.php`, `LeaseDetail.capacites.test.tsx` ;
  `DateInventoryByValueTest` inscrit la clé (quatre booléens).

## Critères d'acceptation

- [x] AC1 — Agent `[crm.view_all]` : quatre drapeaux faux ; `[leases.renew, payments.record]` :
  ceux-là seuls vrais ; le bailleur du bail : quatre vrais.
- [x] AC2 — La fiche ne monte un geste que sous son drapeau ; sans `abilities`, aucun.

## Hors périmètre

- Toute règle de `LeasePolicy`.

## Notes d'implémentation

- Ablation : `LeaseResource`, `LeaseDetail` et `LeaseSchedule` rendus → 3 rouges API, 3 rouges
  front ; remis → 3 + 3 verts.
- `DateInventoryByValueTest` liste les clés en `when()` que son parcours n'atteint pas : la clé
  neuve s'y inscrit, avec sa raison.
