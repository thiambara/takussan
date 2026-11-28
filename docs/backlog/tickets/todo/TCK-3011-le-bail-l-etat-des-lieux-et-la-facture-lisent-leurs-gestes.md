---
id: TCK-3011
title: "Le bail, l'état des lieux et la facture lisent leurs gestes sur l'API, policy et état compris (ADR-0139)"
status: todo
phase: P2
family: full
estimate: M
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: [TCK-3006]
blocks: []
spec_refs:
  features: ["docs/features.md#14-location-longue-durée-baux", "docs/features.md#19-état-des-lieux--inventaires"]
  models: []
tags: [back, front, baux, etat-des-lieux, factures, gestes, architecture, adr-0139]
---

## Objectif utilisateur

Sur la fiche d'un bail, d'un état des lieux ou d'une facture, chacun voit exactement les gestes que l'API lui permettra.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7) :

- **Bail** : `LeaseResource::forViewer` (:48, :175-211) sert 13 `abilities` « policy seule » (« le statut du bail reste jugé par l'écran et l'API », :173-174), sauf `attach_guarantor`, `abandon`, `rent_review_force` ; `components/leases/fiche/gestes.ts` fait `a.x && lease.status …`. `LeaseController::show` pose `forViewer` ; les réponses des gestes (:94, 244, 258, 294) ne le posent pas.
- **État des lieux** : `InventoryDetail.tsx:84,128,140` fait `abilities.update && status`.
- **Facture** : `InvoiceDetailDialog.tsx:180` ne juge que `status === 'draft'`, sans `abilities` ni capacité.

## Contraintes strictes (métier)

- ADR-0139 : `abilities` = policy et état ; le front ne refait pas le statut pour décider ; pas d'`abilities`, pas de geste.
- Les réponses des gestes du bail rendent aussi `abilities` (la fiche se met à jour sans relecture).
- Les codes d'erreur et les règles des services (`LeaseService`, inventaire, facture) ne changent pas : on déplace le jugement d'état dans `abilities`, on n'invente pas de règle.

## Delta à produire

- [x] `LeaseResource` : chaque clé d'`abilities` porte la précondition d'état que le service exige ; `LeaseController` pose `forViewer` sur les réponses des gestes
- [x] `InventoryResource` et `InvoiceResource` : `abilities` (policy et état) pour leurs gestes
- [x] Front : `components/leases/fiche/gestes.ts` cesse de tester le statut pour décider ; fonctions pures équivalentes pour l'état des lieux et la facture
- [x] Tests API par ressource (chaque clé vraie et fausse selon l'état) ; tests front des fonctions pures

## Critères d'acceptation

- [x] AC1 — `gestes.ts` du bail ne compare plus `lease.status` pour décider qu'un geste est permis (il peut le lire pour présenter).
- [x] AC2 — Une facture non brouillon ne propose pas les gestes de brouillon, et l'API les refuse (test API + fonction pure).
- [x] AC3 — Après un geste du bail, la réponse porte `abilities` à jour (test API).

## Hors périmètre

- Les listes (ADR-0139 § 5).

## Notes d'implémentation

Livré sur `feat/approfondissements-architecture` (2026-11-28). Un module de gestes par domaine, sur le
patron de `GestesDeLaVisite` : `App\Services\Lease\GestesDuBail`, `App\Services\Inventory\GestesDeLEtatDesLieux`,
`App\Services\Invoice\GestesDeLaFacture` ; chacun compose la policy et des prédicats d'état statiques, et
ces prédicats sont ceux que relisent les services (sous verrou quand ils verrouillaient déjà) — une règle
d'état, une définition. Codes d'erreur inchangés ; la précédence pré-vol puis rejugement sous verrou est
conservée.

**Ce qui diffère du relevé :**

- **Trois repères restent des repères, pas des gestes** : `update` (le lecteur gère le bail ; garant, lien
  de paiement), `record_payment` (il encaisse sur ce bail ; l'état se juge par échéance, sur
  `LeasePaymentResource`) et `give_notice` (il en est le locataire). Les resserrer aurait cassé leurs
  lecteurs ; on a AJOUTÉ des clés à la place.
- **Clés neuves du bail** : `add_payment` (bail actif ou en préavis), `generate_schedule` (actif, aucun
  loyer émis — `echeancierExiste` du front comptait les charges, l'API non), `cancel_early_termination`
  (la bannière lisait `request_early_termination`, faux en préavis : l'annulation ne s'offrait jamais),
  `request_signature`, `sign` (le geste principal de signature ne lit plus `can_request_signature` /
  `can_sign_as` plus le statut). 18 clés, ordre de `GestesDuBail::GESTES`.
- `refund_deposit` porte désormais la fin de bail ET une caution encaissée non restituée : la fiche
  offrait « Restituer » sur une caution jamais encaissée (422 `deposit_refund.not_collected`).
  `review_rent` exclut le loyer nul (la vente) ; `renew` exclut un renouvellement déjà ouvert ; `abandon`
  exclut l'échéance saisie et l'état des lieux engagé (la fiche nomme encore la raison,
  `raisonDAbandonEmpeche`, sans juger le statut). Restent des refus de l'API, non anticipés : les
  parties du renouvellement et la profondeur de chaîne, le locataire sans compte ou sans nom (présentés
  comme raison de blocage), les éléments non qualifiés de l'état des lieux.
- **État des lieux** : `update` reste « le lecteur conduit » (récapitulatif, signature sur place) ;
  `edit` et `submit` ajoutés (policy ET brouillon) ; `can_sign_as` ne nomme plus que les rôles qui
  peuvent signer MAINTENANT (statut signable, partie pas encore signée). Le doublon `assertDraft` de
  `InventoryController` est remplacé par celui du service.
- **Facture** : `send`, `mark_paid`, `cancel`, `pay` ; `pay` reprend la règle de
  `PaymentGatewayController::initiate` (`update` et facture émise ou échue) — le dialogue offrait
  « Payer en ligne » sur un brouillon (409). Servi par `show` et les réponses des gestes, pas par la liste.
- **Deux écritures jugeaient l'état hors verrou**, corrigées : `DepositRefundService` (statut lu avant le
  verrou seulement : rejugé sous `lockForUpdate`) et `LeasePaymentService::create` (aucun verrou : la
  ligne se pose dans une transaction, bail verrouillé `for no key update`, `lease_payment.lease_not_active`
  rejugé). Épinglés par des tests à instance périmée (`GestesDuBailTest`, `InvoiceGestesTest`,
  `InventoryGestesTest`).
- AC3 : les réponses de `store`, `update`, `activate`, `terminate`, du préavis (pose, annulation,
  confirmation), de la révision, du renouvellement et de la restitution portent `forViewer`.

**Vérification** : ablations (md5 vérifié avant restauration) — retrait du rejugement sous verrou de
`DepositRefundService`, du contrôle de `LeasePaymentService::create`, de l'état dans `send` de
`GestesDeLaFacture` : 6 rouges ; restaurés, les trois classes rejouées vertes (31 tests). `LeaseAbilitiesTest`
et `DateInventoryByValueTest` ajustés au nouveau contrat.

**Front** : `gestes.ts` du bail lit chaque clé ; « Encaisser » présélectionne l'échéance dont la LIGNE dit
`record_payment` (policy et reste dû, servie par l'échéancier — épinglé par
`test_l_echeancier_dit_par_ligne_ce_qui_s_encaisse`), sinon s'offre sur `add_payment`. Fonctions pures
neuves : `components/inventory/gestes.ts`, `components/payments/gestes-de-la-facture.ts`, chacune testée.
Toutes les mutations du bail invalidaient déjà `['leases', 'detail', id]` : les clés d'état se relisent
après chaque geste. Lu pour PRÉSENTER, le statut reste : la forme de la demande de signature (envoyer ou
relancer), la vue récapitulatif de l'état des lieux, et `RecapEtSignatures.avantDeSigner`, qui fige le
brouillon avant la signature sur place — un enchaînement, pas une permission.


**Vérification adverse (2026-11-28), quatre défauts corrigés, chacun par un test rouge d'abord, dans
`GestesDuBailTest` (ADR-0140)** :

- D1 — le préavis s'offrait sur un bail échu (et sur un bail actif qui finit avant la fin du préavis),
  que `request()` refuse toujours (`after_end_date`). `GestesDuBail::preavisTientAvantLaFin` lit la date
  de l'écriture, `EarlyTerminationService::premiereDateDEffet` (aujourd'hui plus le préavis), que
  `request()` emploie aussi. Le décor « bail échu » portait une fin dans un an : corrigé.
- D2 — une échéance `failed` s'annonçait encaissable ; `markPaid` la refuse. Une règle,
  `GestesDuBail::echeanceEncaissable`, lue par `LeasePaymentResource` (`record_payment` de la ligne) et
  par `markPaid` sous verrou (codes et ordre inchangés). Côté front, `echeanceAEncaisser`,
  `LeaseSchedule` et `LeasePaymentDialog` lisent la clé de la LIGNE, plus le statut ni la clé repère.
- D3 — la branche « indemnité payée » ne fermait jamais l'annulation : `value()` rend l'enum casté,
  comparé à la chaîne. Corrigé et épinglé.
- D4 — `assertAwaiting`, `scheduleUnderLock` et `abandonDraft` relisent les prédicats du module
  (`signatureAttendue`, `rolesSignes`, `echeancierGenerable`, `brouillon`, `echeanceSaisie`,
  `etatDesLieuxEngage`), sous leur verrou. `lease.not_active_schedule` n'avait aucun test : épinglé.
- `GenerateLeasePaymentScheduleTest` cherchait un `count(*)` que `echeancierEmis` (`exists`) ne fait plus
  depuis la première livraison : ses deux tests de verrou rougissaient ; le motif accepte les deux.

Ablations (md5 vérifié) : D1-D4 ensemble → 5 rouges dans `GestesDuBailTest` ; `echeanceSaisie`,
`rolesSignes` → 3 rouges dans `LeaseDraftAbandonTest` et `LeaseSignatureTest` (l'écriture lit bien le
prédicat) ; `echeancierGenerable` → rouge ; front, retour au statut → 2 rouges. Aucun test plus ancien
n'est devenu redondant : ceux de l'abandon et de la signature éprouvent l'écriture, que le module ne
remplace pas.
