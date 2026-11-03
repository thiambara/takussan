---
id: TCK-1303
title: "Abonnement d'agence : la période d'un abonnement actif se reconduit chaque mois"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#44-agencysubscription-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-115--statuts-denum-quaucun-chemin-de-app-nécrit"
tags: [api, billing, scheduler, pistes]
---

## Contexte

Réf : **P115.03** du fichier de pistes, `validé` par le porteur.

`current_period_start` / `current_period_end` ne sont écrits qu'à l'attribution (maintenant →
+ 1 mois, `AgencySubscriptionService::assign`) : un mois plus tard, l'écran de facturation
affiche une période échue comme période en cours.

## Décision du porteur

porteur (2026-10-22) : une tâche quotidienne reconduit la période tant que l'abonnement est `active` ; `past_due` et `suspended` sortent de l'enum tant qu'aucun encaissement d'abonnement ne les pose

## Objectif

La période affichée d'un abonnement `active` est toujours celle qui contient aujourd'hui.

## Delta à produire

- [x] `AgencySubscriptionService::renewPeriods()` : abonnement `active`, non clos, période échue →
      période suivante d'un mois, rattrapée jusqu'à celle qui contient maintenant, sous verrou.
- [x] Job `App\Jobs\Billing\RenewAgencySubscriptionPeriods`, planifié chaque jour à 02:20,
      `withoutOverlapping()`.
- [x] Test : `tests/Feature/Billing/RenewAgencySubscriptionPeriodsTest.php`.

## Critères d'acceptation

- [x] AC1 — Un abonnement `active` attribué le 1er septembre a, le 2 novembre, la période du
      1er novembre au 1er décembre ; un abonnement en essai, clos, ou dont la période court encore
      ne bouge pas ; un second passage ne reconduit rien.
- [x] AC2 — Une période du 31 août finit le 30 septembre (pas de débordement de mois).
- [x] AC3 — La tâche est au planificateur, quotidienne, sans chevauchement.

## Reste à faire

`past_due` et `suspended` sortent de l'enum : `docs/models-spec.md` (§ 44 et table des enums) et ADR-0057 (MRR des abonnements `active` ou `past_due`) les nomment, et ni la spec ni l'ADR ne sont ouverts à l'implémenteur.

## Hors périmètre

- Tout encaissement d'abonnement : la reconduction ne facture rien, elle avance la période.
- Les abonnements `trialing` : la décision vise les seuls `active` ; l'essai passe `active` par
  `processTrialExpirations`, et sa période est alors reconduite au passage suivant.

## Notes d'implémentation

- Ablation : écriture de la période neutralisée → 2 rouges sur 3 ; remise → vert.
  `BillingPlansTest` vert.
- `addMonthNoOverflow` et non `addMonth` (celui d'`assign`) : `addMonth` du 31 août rend le
  1er octobre, et la période dériverait d'un jour à chaque mois court.
