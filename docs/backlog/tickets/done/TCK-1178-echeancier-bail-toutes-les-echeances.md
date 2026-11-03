---
id: TCK-1178
title: "L'échéancier d'un bail rend toutes ses échéances, de la plus ancienne à la plus récente"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-100--fields-du-front-face-aux-queryfields-et-ce-que-lécran-lit-hors-de-sa-demande"
tags: [back, front, baux, echeancier, pistes]
---

## Contexte

Réf : **P100.01** du fichier de pistes, `validé` (V1 accordé).

`useLeasePayments` demande `sort=due_date` et `per_page=100` et ne lit jamais de page suivante ;
`LeasePaymentController::index` trie en dur par `period_start` décroissant et ignore le `sort`.
Un bail de plus de 100 échéances (un bail à terme est généré en entier : 108 pour un bail mensuel
de 9 ans) perd ses plus anciennes à l'échéancier, au compte des retards de la fiche et au dialogue
d'encaissement.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenu** : la voie la plus étroite des deux volets.
- API : `index` honore `sort` sur une liste fermée (`due_date`, `-due_date`, `period_start`,
  `-period_start`), départagé par `id` ; un `sort` absent ou hors liste garde l'ordre d'avant
  (`period_start` décroissant). Pas de portage sur `buildQuery` : `LeasePayment::$queryFields` est
  vide (P100.04), et le porter changerait aussi le `fields`.
- Front : « faire paginer le front » plutôt que lever le plafond de l'API. `useLeasePayments` lit
  les pages jusqu'à la dernière (`fetchAllLeasePayments`) et rend une seule page aux trois lecteurs,
  qui ne changent pas.

## Objectif utilisateur

L'échéancier, le compte des retards et le dialogue d'encaissement voient toutes les échéances d'un
bail, quel que soit leur nombre.

## Delta à produire

- [x] `LeasePaymentController::index` : tri demandé honoré.
- [x] `useLeasePayments` : toutes les pages, par `fetchAllLeasePayments`.
- [x] `LeasePaymentIndexSortTest`, `echeancier-toutes-les-pages.tck-1178.test.ts`.

## Critères d'acceptation

- [x] AC1 — bail de 110 échéances, les 3 plus anciennes en retard, `sort=due_date&per_page=100` :
      la page 1 commence par la plus ancienne, en ordre croissant, avec les 3 retards ; la page 2
      rend les 10 suivantes.
- [x] AC2 — sans `sort`, l'ordre reste `period_start` décroissant.
- [x] AC3 — le front lit les deux pages et rend les 110 échéances, la plus ancienne en tête.

## Hors périmètre

- Le `fields[lease_payments]` reste inerte sur cet endpoint (P100.04, P100.05).

## Notes d'implémentation

- Ablation API : contrôleur d'avant → AC1 rouge (`dates[0]` vaut la plus récente).
- Ablation front : boucle bornée à une page → rouge (« expected length 110 but got 100 »).
