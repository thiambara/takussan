---
id: TCK-2375
title: "L'échéancier écrit l'échéance de caution à l'activation, et la restitution est bornée à la caution encaissée"
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
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md#amendement-du-2026-10-25--léchéance-de-caution-et-la-restitution-bornée-à-la-caution-encaissée"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements"
tags: [api, baux, caution, échéancier, payouts, argent, pistes]
---

## Objectif utilisateur

Le locataire voit sa caution comme une échéance de son bail et la paie par les mêmes voies qu'un
loyer. L'agence ne lui rend que la caution qu'elle a reçue : une caution jamais encaissée ne se
restitue pas, et une caution encaissée en partie ne se restitue, ni ne se retient, qu'à hauteur de
ce qui est entré.

## Contexte

Réf : **P04.10** du fichier de pistes, `validé`.

- Le restituable (`Lease::deposit_remaining`) partait de `deposit_amount`, sans lire d'échéance
  `deposit` payée ; les rapports définissent la caution détenue comme `Σ deposit payés −
  Σ deposit_refund payés` (`PortfolioMetrics::depositsHeld`, `AgingBalanceService::depositsHeld`).
- Une première borne (TCK-2340 : commits 8a804d777, dab30a082, 11680bb51, 4809ff620, decef182e) a
  été retirée avant fusion par 1a6209d89 (#1540) : aucun chemin n'écrivait d'échéance `deposit`
  (`generateSchedule` n'écrivait que des loyers, la saisie refuse `deposit` depuis TCK-1920), et la
  borne refusait toute restitution. Le porteur a tranché l'option a de la session.

## Décision du porteur

- P04.10 :

  > validation du porteur (2026-10-25) : l'échéancier écrit l'échéance `deposit` à l'activation du bail ; la restitution d'une caution est ensuite bornée à la caution réellement encaissée (Σ des échéances `deposit` payées − déjà rendu − retenue vivante), la définition qu'emploient déjà les rapports

## Hypothèses

- **Le point d'écriture** est la génération de l'échéancier (`LeaseService::scheduleUnderLock`), que
  toute activation déclenche (`completeActivation` → `GenerateLeasePaymentSchedule`), comme le
  bouton `generate-schedule`. L'échéance est due à `start_date`.
- **Un renouvellement n'écrit pas de caution** : elle est versée une fois pour la chaîne. L'encaissé
  et le déjà-rendu se lisent donc sur la chaîne (`renewed_from_lease_id`, du parent à la racine),
  sans quoi la caution d'un bail renouvelé ne se restituait jamais.
- **Pas de doublon** : aucune échéance quand le bail porte déjà une ligne `deposit` non annulée,
  la règle « non annulée » des loyers de l'échéancier (P46.04).
- **« Déjà rendu »** est `deposit_refunded_amount` (il compte une restitution en cours), comme dans
  TCK-2340, plus ce que les baux antérieurs de la chaîne ont rendu ou retenu.
- **Aucune reprise des baux déjà activés** (option la plus conservatrice) : leur écrire l'échéance
  réclamerait, en retard, une caution peut-être remise hors plateforme.

## Delta à produire

- [x] `LeaseService::writeDepositInstalment`, appelé par la génération de l'échéancier ; compteur des
      loyers séparé (plafond de douze d'un bail sans fin).
- [x] `LeasePayment::scopePaidDepositMovements()`, lu par les deux rapports et par
      `Lease::collectedDeposit()` ; `getDepositRemainingAttribute()` borné, sur la chaîne.
- [x] `DepositRefundService::refund` : refus `deposit_refund.not_collected` ; textes `fr`, `en`,
      `wo` = `fr`.
- [x] ADR-0039 amendé (2026-10-25), `docs/adr/README.md`, `docs/features.md` § 1.4.

## Critères d'acceptation

- [x] AC1 — Activer un bail à caution de 200 000 écrit une échéance `deposit` `pending` de 200 000,
      due au début du bail, payée par le locataire ; les loyers naissent comme avant.
- [x] AC2 — Un bail sans caution (nulle ou 0) n'a aucune échéance `deposit`.
- [x] AC3 — Un renouvellement reçoit ses loyers et aucune échéance `deposit` ; le parent garde la
      sienne.
- [x] AC4 — Régénérer l'échéancier (loyers annulés) ou générer sur un bail qui porte déjà une ligne
      `deposit` n'en écrit pas de seconde.
- [x] AC5 — Un bail sans fin garde ses douze loyers, plus sa caution.
- [x] AC6 — L'échéance se règle par `mark-paid`, puis la caution se restitue après résiliation ; elle
      se paie en ligne (Wave, ×100 au pilote) et entre dans la balance âgée des cautions détenues.
- [x] AC7 — Rien d'encaissé → 422 `deposit_refund.not_collected`, rien de créé ; encaissé en
      partie → restitution et retenue bornées ; le montant du bail plafonne l'encaissé ; une
      restitution passée au-delà n'est pas réécrite.
- [x] AC8 — Le dernier bail d'une chaîne de renouvellements restitue la caution encaissée sur le
      bail d'origine ; une caution déjà rendue sur un bail antérieur ne se rend pas une seconde fois.

## Hors périmètre

- La reprise des baux activés avant ce changement (aucune échéance de caution).
- L'échéance du complément quand un renouvellement relève la caution.
- Le texte des relances, qui dit « loyer » pour toute échéance, caution comprise.

## Notes d'implémentation

- **Mesuré avant le correctif** (`DepositInstalmentScheduleTest`, 5 rouges sur 7 à l'écriture) :
  l'activation n'écrivait aucune ligne `deposit` ; les deux tests de chaîne de
  `DepositRefundBoundedToCollectedTest` rouges sur la borne reprise de TCK-2340.
- **Ablations** (les deux classes, 19 tests), chacune remise :
  - aucune échéance écrite → 6 rouges ;
  - garde du renouvellement retirée → 1 rouge ;
  - garde d'existence retirée → 2 rouges ;
  - encaissé lu sur le seul bail → 2 rouges (chaîne) ;
  - rendu des baux antérieurs ignoré → 1 rouge ;
  - compteur unique (caution dans le plafond de douze) → 1 rouge ;
  - borne retirée → 6 rouges ;
  - refus `not_collected` retiré → 3 rouges.
- `GenerateLeasePaymentScheduleTest` : les tests de périodes lisent les seuls loyers, et le témoin
  P46.04 compte une ligne de plus (sa caution).
