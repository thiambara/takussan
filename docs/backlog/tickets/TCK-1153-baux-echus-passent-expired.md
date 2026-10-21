---
id: TCK-1153
title: "Un bail allé à son terme passe `expired`, et sa caution se restitue"
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
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#rien-nécrit-expired--un-bail-arrivé-à-son-terme-reste-active-et-sa-caution-ne-se-restitue-pas-depuis-lécran"
tags: [back, lease, scheduler, pistes]
---

## Objectif utilisateur

Le gestionnaire d'un bail allé à son terme peut en restituer la caution depuis l'écran : le bail
n'est plus `active` le lendemain de sa date de fin.

## Contexte

Réf : **P81.02** du fichier de pistes, `validé` (critères du dernier classement, V7 et V4,
accordés).

Rien n'écrivait `LeaseStatus::Expired` hors du seeder, et aucune tâche planifiée ne visait les
baux échus. `DepositRefundService::refund()` exige `terminated` ou `expired`, et
`DepositRefundBanner` ne s'affiche qu'en ces deux statuts. Mesuré avant correctif (test de garde
ci-dessous, `pre-dev` 464389140) : bail `active` échu le 2026-11-01 avec 200 000 de caution,
`POST /api/leases/{id}/deposit-refund` → 422 `deposit_refund.lease_not_ended`.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : **la tâche quotidienne**. La piste ne recommande aucune des deux voies ; la
recommandation du délégué (2026-10-20) retient la tâche, qui n'ajoute ni écran ni geste, et c'est
aussi la plus étroite (aucun changement au front). L'action « clore le bail » sur `terminate` reste
le reste de P13.08.

Sort des baux échus déjà en base : la tâche les passe `expired` à son premier passage, comme
tout bail échu (aucune reprise à part). Aucun avis n'est envoyé au bailleur ni au locataire.

## Delta à produire

- [x] `App\Jobs\Lease\ExpireEndedLeasesJob` : baux `active`, `end_date` antérieure à aujourd'hui,
  sans renouvellement `active` → `expired`, rejugé sous verrou, tracé `lease_expired`.
- [x] Planifiée chaque jour à 03:15, `withoutOverlapping()` (`routes/console.php`).
- [x] Test `tests/Feature/Jobs/ExpireEndedLeasesJobTest.php`.

## Critères d'acceptation

- [x] AC1 — bail `active` échu la veille : restitution refusée (422), la tâche le passe
  `expired`, la restitution passe (201).
- [x] AC2 — un bail qui finit aujourd'hui, sans fin, en préavis ou résilié n'est pas touché.
- [x] AC3 — un bail relevé par un renouvellement `active` n'expire pas.
- [x] AC4 — la tâche est planifiée chaque jour, sans chevauchement.

## Hors périmètre

- L'action « clore le bail » au front (reste de P13.08).
- Un avis au bailleur ou au locataire à l'expiration.

## Notes d'implémentation

- Ablation, chaque retrait rendu ensuite : tâche vidée → 1 rouge (AC1) ; clause du
  renouvellement retirée → 1 rouge (AC3) ; ligne du planificateur retirée → 1 rouge (AC4) ;
  remis → 4 verts.
