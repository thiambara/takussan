---
id: TCK-1182
title: "Cinq ressources omettent un montant, une nature ou une devise qu'un sparse fieldset n'a pas lus"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-100--fields-du-front-face-aux-queryfields-et-ce-que-lécran-lit-hors-de-sa-demande"
tags: [back, ressources, sparse-fieldsets, montants, pistes]
---

## Contexte

Réf : **P100.03** du fichier de pistes, `validé` (V1 accordé).

`InvoiceResource`, `PayoutResource`, `BookingResource`, `AgencyResource` et `LeasePaymentResource`
castent ou replient des colonnes que leur `$queryFields` permet de ne pas demander : sous un
`select` restreint, elles rendaient `kind` « invoice », des montants à 0 et la devise « XOF ». C'est
la forme que TCK-1019 (P58.04) a corrigée pour `UserResource`.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenu** : le plancher que la piste fixe, « au moins celles de montant, de nature et de
devise », et lui seul : `kind`, `subtotal`, `total_amount` (facture) ; `gross_amount`,
`commission_amount`, `net_amount` (versement) ; `total_amount` (réservation) ; `currency` (agence) ;
`amount`, et `paid_amount` / `remaining_amount` qui en dérivent, sous `whenHas('amount')`
(échéance). Le recensement que la piste demande d'abord :
- aucun appelant hors HTTP ne rend ces ressources (exports, PDF et notifications ne les citent qu'en
  commentaire, `grep` sur `app/`) ;
- chaque création recensée pose ses montants (`BookingService`, `PublicPropertyController`,
  `InvoiceService`, `DepositRefundService`, `EarlyTerminationService`, `PayoutService`), et `kind`
  (facture) et `currency` (agence) ont un défaut de modèle (`$attributes`) : la réponse d'une
  création sans `fresh()` porte toujours ces clés, ce que le test vérifie.

## Reste à faire

- les booléens `is_verified` et `moderation_required` d'`AgencyResource` : ni montant, ni nature, ni
  devise, et leur défaut est celui de la base, pas du modèle ; une agence rendue par `create()` sans
  `fresh()` les perdrait, ce qu'il faut recenser avant.

## Objectif utilisateur

Un appelant qui ne demande pas un montant ne reçoit plus un montant à 0, ni une facture pour un avoir.

## Delta à produire

- [x] `whenHas` sur les clés listées des cinq ressources.
- [x] `AmountResourcesSparseFieldsTest`.

## Critères d'acceptation

- [x] AC1 — modèle construit avec `id` et `created_at` seuls : aucune des clés listées n'est émise.
- [x] AC2 — modèle entier, et modèle tel que `create()` le rend : toutes les clés listées le sont.

## Hors périmètre

- Les types du front, qui déclarent ces clés obligatoires : aucun écran ne les lit sans les demander
  (relevé de l'explorateur, non re-mesuré).

## Notes d'implémentation

- `whenHas` lit `getAttributes()`, pas `hasAttribute()` : une colonne castée mais non sélectionnée
  est bien omise.
- Ablation : ressources d'avant → AC1 rouge sur les cinq jeux, AC2 vert.
