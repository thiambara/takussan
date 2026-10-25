---
id: TCK-2340
title: "La restitution d'une caution est bornée à la caution réellement encaissée, selon la définition des rapports"
status: todo
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
    - "docs/models-spec.md#14-lease-"
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-4--argent--montants-devises-arrondis-factures-paiements"
tags: [back, baux, caution, payouts, argent, pistes]
---

## Objectif utilisateur

L'agence ne rend au locataire que la caution qu'elle a reçue. Une caution jamais encaissée ne se
restitue pas, et une caution encaissée en partie ne se restitue, ni ne se retient, qu'à hauteur de
ce qui est entré.

## Contexte

Réf : **P04.10** du fichier de pistes, `validé`.

- Le restituable (`Lease::deposit_remaining`) vaut `deposit_amount − deposit_refunded_amount −` la
  retenue vivante. Il part du montant écrit au bail, et aucune ligne ne lit une échéance `deposit`
  payée (`DepositRefundService.php:56`, `Lease.php:402-408`).
- Les rapports définissent déjà la caution détenue comme `Σ deposit payés − Σ deposit_refund payés`
  (`PortfolioMetrics::depositsHeld`, `AgingBalanceService::depositsHeld`). La restitution est la
  seule à suivre une autre règle.
- Une caution reçue hors plateforme se règle par `mark-paid` sur son échéance (TCK-681, P13.01) ;
  l'échéance naît de l'échéancier, jamais à la main (TCK-1920).

## Décision du porteur

- P04.10 :

  > validation du porteur (2026-10-25) : la restitution d'une caution est bornée à la caution réellement encaissée (Σ des échéances `deposit` payées − déjà rendu − retenue vivante), la définition qu'emploient déjà les rapports

## Hypothèses

- **« Déjà rendu »** est `leases.deposit_refunded_amount`, la valeur que la restitution tient déjà :
  il compte une restitution en cours (reversement pas encore payé) et la retire quand elle est
  refusée ou échoue (`PayoutService::releaseDeposit`). Le compter par les seules lignes
  `deposit_refund` payées laisserait rendre deux fois une caution dont le premier reversement
  attend son approbation.
- **La borne s'ajoute à l'ancienne** : le restituable est le plus petit de `deposit_amount` et de
  l'encaissé, moins le rendu et la retenue vivante. Une échéance `deposit` payée au-delà du montant
  du bail ne se restitue pas au-delà de ce montant.
- **Un code neuf** `deposit_refund.not_collected` (422) quand rien n'est encaissé : sans lui, le refus
  dirait `already_refunded` d'une caution jamais rendue.
- **La définition se partage** : un scope `LeasePayment::paidDepositMovements()` (lignes `deposit`
  et `deposit_refund` payées) que lisent les deux rapports et `Lease::collectedDeposit()`.
- **L'écran** suit `deposit_remaining`, comme avant : le bouton « Rembourser » disparaît d'une caution
  non encaissée. Le bandeau garde son titre ; aucun texte neuf côté front.

## Delta à produire

- [ ] `LeasePayment::scopePaidDepositMovements()`, lu par `PortfolioMetrics::depositsHeld` et
      `AgingBalanceService::depositsHeld`.
- [ ] `Lease::collectedDeposit()` ; `getDepositRemainingAttribute()` borné à l'encaissé.
- [ ] `DepositRefundService::refund` : refus `deposit_refund.not_collected` quand rien n'est encaissé.
- [ ] Textes du code (`fr`, `en` ; `wo` = `fr`).
- [ ] ADR-0039 amendé (2026-10-25), `docs/adr/README.md`, `docs/features.md` § 1.4.

## Critères d'acceptation

- [ ] AC1 — Bail terminé, caution de 600 000 au bail, aucune échéance `deposit` payée : la
      restitution rend 422 `deposit_refund.not_collected`, rien n'est créé, `deposit_remaining`
      vaut 0.
- [ ] AC2 — Encaissé 300 000 sur 600 000 : rendre 300 001 → 422 `deposit_refund.exceeds_remaining` ;
      rendre 200 000 avec un motif → retenue de 100 000, pas de 400 000 ; rendre 300 000 → aucune
      retenue.
- [ ] AC3 — Une échéance `deposit` non payée, une `deposit` payée d'un autre bail et une
      `deposit_refund` payée ne comptent pas dans l'encaissé.
- [ ] AC4 — Une restitution déjà faite au-delà de la borne n'est ni réécrite ni annulée :
      `deposit_refunded_amount`, sa ligne et son reversement restent tels quels ; une nouvelle est
      refusée.
- [ ] AC5 — Les deux rapports rendent les mêmes cautions détenues qu'avant (non-régression).

## Hors périmètre

- Une dérogation « caution remise hors plateforme » pour un bail sans échéance de caution (option b
  de la re-vérification) : non retenue ; la voie est `mark-paid` sur l'échéance.
- Le titre du bandeau quand rien n'est encaissé.

## Notes d'implémentation
