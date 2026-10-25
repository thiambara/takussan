---
id: TCK-2340
title: "La restitution d'une caution est bornée à la caution réellement encaissée, selon la définition des rapports"
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
- Une caution reçue hors plateforme se règle par `mark-paid` sur son échéance (TCK-681, P13.01).
  ⚠ Mesuré après coup (2026-10-25) : aucun chemin de l'application ne crée aujourd'hui d'échéance `deposit` (mesuré le 2026-10-25 : `LeaseService::generateSchedule` n'écrit que des loyers, `POST /api/leases/{lease}/payments` refuse `deposit` depuis TCK-1920, la résiliation n'écrit qu'une pénalité).

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

- [x] `LeasePayment::scopePaidDepositMovements()`, lu par `PortfolioMetrics::depositsHeld` et
      `AgingBalanceService::depositsHeld`.
- [x] `Lease::collectedDeposit()` ; `getDepositRemainingAttribute()` borné à l'encaissé.
- [x] `DepositRefundService::refund` : refus `deposit_refund.not_collected` quand rien n'est encaissé.
- [x] Textes du code (`fr`, `en` ; `wo` = `fr`).
- [x] ADR-0039 amendé (2026-10-25), `docs/adr/README.md`, `docs/features.md` § 1.4.

## Critères d'acceptation

- [x] AC1 — Bail terminé, caution de 600 000 au bail, aucune échéance `deposit` payée : la
      restitution rend 422 `deposit_refund.not_collected`, rien n'est créé, `deposit_remaining`
      vaut 0.
- [x] AC2 — Encaissé 300 000 sur 600 000 : rendre 300 001 → 422 `deposit_refund.exceeds_remaining` ;
      rendre 200 000 avec un motif → retenue de 100 000, pas de 400 000 ; rendre 300 000 → aucune
      retenue.
- [x] AC3 — Une échéance `deposit` non payée, une `deposit` payée d'un autre bail et une
      `deposit_refund` payée ne comptent pas dans l'encaissé.
- [x] AC4 — Une restitution déjà faite au-delà de la borne n'est ni réécrite ni annulée :
      `deposit_refunded_amount`, sa ligne et son reversement restent tels quels ; une nouvelle est
      refusée.
- [x] AC5 — Les deux rapports rendent les mêmes cautions détenues qu'avant (non-régression).

## Hors périmètre

- Une dérogation « caution remise hors plateforme » pour un bail sans échéance de caution (option b
  de la re-vérification) : non retenue (« on ne rend pas ce qu'on n'a pas encaissé », session du
  2026-10-25). La voie qui écrirait l'échéance `deposit` n'existe pas et n'est pas créée ici :
  écart signalé au porteur.
- Le titre du bandeau quand rien n'est encaissé.

## Notes d'implémentation

- **Mesuré avant le correctif** (`DepositRefundBoundedToCollectedTest`, 5 rouges sur 7) : une caution
  jamais encaissée se restituait en entier ; encaissée à 300 000 sur 600 000, le restituable valait
  600 000 et une restitution de 200 000 retenait 400 000.
- **Ablations**, chacune sur `DepositRefundBoundedToCollectedTest` puis remise :
  - borne retirée (`$total = deposit_amount`) → 5 rouges ;
  - refus `not_collected` retiré → 2 rouges (rien d'encaissé, seules les échéances payées du bail) ;
  - plafond du bail retiré (`$total = collectedDeposit()`) → 1 rouge (l'encaissé au-delà du bail).
  - `test_une_caution_encaissee_en_entier_se_restitue_comme_avant` est une non-régression : verte
    avec et sans le correctif.
- **Fixtures** : dix classes qui restituent une caution créaient un bail sans échéance payée. Elles
  passent par `LeaseFactory::withCollectedDeposit()` ou `BuildsMoneyOut::leasePayment(…, Deposit)`,
  et deux assertions qui comptaient « la » ligne du bail (`sole()`, `count() === 1`) comptent la
  ligne `deposit_refund`.
- Les rapports lisent le scope au lieu de leurs deux `where` : même SQL, `AgingBalanceTest` et
  `DashboardOwnerMetricsTest` verts.
