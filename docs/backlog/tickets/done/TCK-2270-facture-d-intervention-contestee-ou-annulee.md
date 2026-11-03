---
id: TCK-2270
title: "La contestation ou l'annulation d'une intervention annule sa facture de prestataire ouverte, et rien ne valide, ne paie ni ne refacture une facture dont le travail n'est pas rendu"
status: done
phase: P3
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#77-serviceproviderbill-"
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-224--factures-de-prestataire-dune-intervention-annulée-contestée-ou-réassignée"
tags: [back, maintenance, payouts, notifications, pistes]
---

## Objectif utilisateur

L'agence ne valide, ne paie et ne refacture au bailleur que la facture d'un travail rendu. Une
intervention contestée ou annulée ne laisse pas derrière elle une facture qui attend d'être payée ;
une facture déjà payée ou déjà refacturée n'est pas défaite en silence, et l'agence en est avisée.

## Contexte

Réfs : **P224.01**, **P224.02**, **P224.03** et **P224.04** du fichier de pistes, toutes `validé`.

- La facture naît au passage à `completed` (`MaintenanceRequestObserver`), et la table d'états
  permet ensuite `completed → in_progress` (contestation) puis `in_progress → cancelled`. Aucun
  écrivain ne pose `cancelled` sur une facture ; `validate`, `pay` et `rechargeableBills` ne lisent
  pas l'état de l'intervention (P224.01).
- Après une contestation, réassigner laisse la facture de l'ancien prestataire, et l'index partiel
  `sp_bills_one_open_per_request` fait ignorer celle du nouveau (P224.02).
- Une seconde fin des travaux à un autre coût réel laisse la facture à l'ancien montant (P224.03).
- L'écran des factures ne montre pas l'état de l'intervention (P224.04).

## Décision du porteur

- P224.01 :

  > validation du porteur (2026-10-25) : la contestation et l'annulation de l'intervention passent sa facture `pending_validation` à `cancelled`, garde de `validate`, `pay` et `rechargeableBills` comprise ; une facture `validated` sans reversement vivant et non imputée passe aussi à `cancelled` ; une facture `paid` ou imputée reste, avec un avis à l'agence ; ADR-0039 § 8 amendé

- P224.02 :

  > validation du porteur (2026-10-25) : fermée par la règle de P224.01, avec un test de non-régression (contestation, réassignation, fin des travaux du second prestataire)

- P224.03 :

  > validation du porteur (2026-10-25) : fermée par la règle de P224.01 (la facture renaît au nouveau coût), avec un test de non-régression

- P224.04 :

  > validation du porteur (2026-10-25) : sans objet une fois la règle de P224.01 posée : une facture `pending_validation` n'existe plus que pour une intervention `completed` ou `closed`

## Hypothèses

- **Le déclencheur** : l'intervention QUITTE l'ensemble « travail rendu » (`completed`, `closed`),
  ce qui est la contestation, ou ENTRE en `cancelled`. Le geste vit dans l'observateur qui fait
  naître la facture : il voit tous les chemins qui écrivent le statut (`transition`,
  `contestResolution`, l'annulation en cascade du bien).
- **L'observateur tourne après le commit** : la garde de `validate`, `pay` et de l'imputation relit
  l'état de l'intervention, ce qui ferme la fenêtre entre le commit de la contestation et
  l'annulation de la facture.
- **Une facture `validated` dont un reversement est vivant** (`PayoutStatus::holdingItems()`) n'est
  pas nommée par la décision : elle reste, avec l'avis, comme une facture payée. C'est l'option qui
  ne défait aucun geste d'argent en cours ; les approbateurs voient l'avis et décident du
  reversement.
- **L'avis** : un code neuf `service_provider_bill.kept_on_reopen`, aux membres actifs de l'agence
  qui détiennent `payouts.create` (ceux qui valident et paient les factures), non désactivable
  comme les autres avis de sortie d'argent, cible neuve `service_provider_bills`
  (`/app/payments?tab=bills`). Paramètres : la référence, le montant, le titre de l'intervention.
  Il part à la contestation, et de nouveau à l'annulation : ce sont deux événements.
- **La garde de l'imputation** : une facture dont l'intervention n'est ni `completed` ni `closed`
  n'est ni proposée (`rechargeableBills`), ni acceptée (`POST /api/payouts`, 422 sur
  `service_provider_bill_ids`, comme une facture non validée), ni imputée si elle a changé sous le
  verrou. Cela vaut aussi pour une facture payée restée : sa reprise passe par le chemin manuel.
- **Le rejet** n'est pas gardé : rejeter une facture reste possible quel que soit l'état de
  l'intervention, c'est un geste qui ferme.
- **La fabrique** `ServiceProviderBillFactory` fait naître sa demande `completed` : une facture
  n'existe que pour un travail rendu.

## Delta à produire

- [x] `MaintenanceRequestObserver` : à la sortie de `completed`/`closed` ou à l'entrée en
      `cancelled`, `ReopenedRequestBills` annule ou garde chaque facture ouverte, sous verrou.
- [x] Garde de l'état de l'intervention dans `validateBill`, `createForBill`,
      `PayoutCalculator::rechargeableBills`, `PayoutService::assertItemsInScope` et `createLocked`.
- [x] Code `service_provider_bill.kept_on_reopen`, cible `service_provider_bills`, textes API et
      cloche (`fr`, `en` ; `wo` = `fr`) ; erreur `service_provider_bill.request_not_completed`.
- [x] `ServiceProviderBillStatus::Cancelled` n'est plus réservé (`CasDEnumReservesTest`).
- [x] ADR-0039 § 8 amendé (2026-10-25), `docs/adr/README.md`, `docs/models-spec.md` § 77,
      `docs/features.md` § 1.8.

## Critères d'acceptation

- [x] AC1 (P224.01) — Contestation puis annulation : la facture `pending_validation` passe
      `cancelled` ; `validate` et `pay` rendent 422 ; `rechargeableBills` ne la rend pas.
- [x] AC2 (P224.01) — Une facture `validated` sans reversement vivant et non imputée passe
      `cancelled` à la contestation.
- [x] AC3 (P224.01) — Une facture `paid` reste `paid` à la contestation, et les détenteurs de
      `payouts.create` reçoivent l'avis.
- [x] AC4 (P224.01) — Une facture imputée à un reversement au bailleur reste, avec l'avis.
- [x] AC5 (P224.01) — La garde seule : une facture `pending_validation` d'une intervention
      `in_progress` (contestée hors de l'observateur) ne se valide pas, une facture `validated`
      ne se paie pas et n'est ni proposée ni acceptée par `POST /api/payouts`.
- [x] AC6 (P224.02) — Contestation, réassignation à B, fin des travaux de B : une facture ouverte,
      celle de B, et celle de A `cancelled`.
- [x] AC7 (P224.03) — Seconde fin des travaux à 80 000 : la facture ouverte est de 80 000,
      `exceeds_quote` vrai, et la première est `cancelled`.

## Hors périmètre

- P224.04 : sans objet par la décision ; aucun changement de l'écran ni de la ressource.
- La reprise d'une facture payée ou imputée : chemin manuel (l'avis le dit).
- Les autres observateurs de l'angle 238.

## Notes d'implémentation

- Le test d'origine `ServiceProviderBillTest::test_ac15_completion_creates_one_bill_at_the_approved_quote`
  épinglait « un second passage par `completed` n'en crée pas de seconde » en passant par
  `in_progress` : c'est exactement P224.03. Il garde l'unicité sur deux `completed` de suite, et
  attend désormais une facture annulée et une ouverte après une contestation.
- La fabrique faisait naître sa demande `open` : avec la garde, six tests d'`OwnerStatementTest`
  imputaient une facture d'un travail non rendu (mesuré : 6 rouges avec l'ancienne fabrique). Elle
  naît `completed`.
- `getPrevious()` rend la valeur brute (`'completed'`) : l'observateur la relit par `tryFrom`.
- Ablations, chacune sur `FactureDInterventionRouverteTest` (8 tests) puis remise :
  - appel de `ReopenedRequestBills::settle` retiré → 7 rouges, la garde seule verte ;
  - rien n'est « engagé » → 3 rouges (payée, imputée, en cours de paiement) ;
  - imputation non lue → 1 rouge (imputée) ; reversement vivant non lu → 2 rouges ;
  - entrée en `cancelled` non lue → 1 rouge (le second avis de la facture payée) ;
  - garde de `validate`, de `pay`, d'imputation : 1 rouge chacune (la garde seule) ;
    garde de `rechargeableBills` → 2 rouges (la garde seule, la facture payée).
- La relecture sous verrou de `createLocked` n'a pas de test propre (course non reproduite) : son
  ablation va avec celle du contrôle d'avant le verrou (même prédicat `billImputable`).
