---
id: TCK-1151
title: "À la sortie du locataire, les loyers postérieurs ne sont plus dus"
status: done
phase: P1
family: bug
estimate: M
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
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#la-résiliation-laisse-dues-toutes-les-échéances-de-loyer-postérieures-à-la-sortie--pénalités-relances-et-paiement-continuent"
tags: [back, lease, payments, pistes]
---

## Objectif utilisateur

Un locataire parti (résiliation immédiate, ou résiliation anticipée confirmée) n'a plus de loyer
dû pour les mois qui suivent sa sortie : ni pénalité de retard, ni relance, ni lien de paiement.

## Contexte

Réf : **P81.01** du fichier de pistes, `validé` (critère V1 accordé).

`LeaseService::terminate()` et `EarlyTerminationService::confirm()` changeaient le statut du bail
sans toucher aux échéances émises ; seule la relève d'un renouvellement (`handOver`) les
annulait. `docs/models-spec.md` § 14 écrit qu'en préavis le loyer reste dû jusqu'à la date
d'effet : après, il ne l'est plus. Mesuré avant correctif (test de garde ci-dessous, `pre-dev`
464389140) : bail de juillet 2026 à juin 2027, résilié le 2026-10-20 → les huit loyers de
novembre à juin restent `pending`, et `ApplyLateFeesJob` les pénalise.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenus :
- **échéance à cheval sur la date de sortie** (période commencée au plus tard ce jour-là) : due
  en entier, aucun prorata — la voie la plus étroite ;
- **échéance postérieure engagée** (réglée, en partie réglée, pénalité payée, checkout ouvert) :
  « les mêmes refus que `handOver` » lu comme le refus de l'opération, 409
  `lease.termination_overlaps_paid_schedule` avec les échéances en cause, comme
  `lease.renewal_overlaps_paid_schedule` ; la tâche `ConfirmEarlyTerminationsJob` laisse alors le
  bail en préavis jusqu'au remboursement ;
- **trace** : un événement `lease_termination_schedule_cancelled` dans `activity_log`, de même
  forme que `lease_renewal_schedule_cancelled` (références annulées, date de sortie).

## Delta à produire

- [x] `App\Services\Lease\LeaseExitScheduleService::cancelAfterExit()` : annule les loyers dont
  `period_start` (à défaut `due_date`) suit la date de sortie, sous le verrou du bail.
- [x] Appelé par `LeaseService::terminate()` (sortie : aujourd'hui) et
  `EarlyTerminationService::confirm()` (sortie : date d'effet).
- [x] `LeaseRenewalService::isEngaged()` devient public (une seule définition d'« engagée »).
- [x] `ConfirmEarlyTerminationsJob` ne tombe pas sur le 409, il passe au bail suivant.
- [x] Clé `errors.lease.termination_overlaps_paid_schedule` en `fr`, `en` et `wo` (texte
  français, wolof en pause).
- [x] Test `tests/Feature/Services/LeaseExitScheduleTest.php`.

## Critères d'acceptation

- [x] AC1 — résiliation immédiate : les loyers postérieurs passent `cancelled`, celui du mois en
  cours reste dû ; deux mois plus tard, `ApplyLateFeesJob` n'en pénalise aucun.
- [x] AC2 — un loyer postérieur réglé : 409, le bail reste `active`, rien n'est annulé.
- [x] AC3 — résiliation anticipée confirmée : les loyers dont la période suit la date d'effet
  passent `cancelled`, celui à cheval reste dû.
- [x] AC4 — la tâche de confirmation laisse en `terminating` un bail dont un loyer postérieur est
  en partie réglé, sans lever.

## Hors périmètre

- Les baux déjà résiliés en base, dont les échéances postérieures restent `pending` : aucune
  reprise (réécriture de données, V4).
- Le prorata du mois de sortie.
- Les lignes hors loyer (charges, régularisations) postérieures à la sortie.

## Notes d'implémentation

- Ablation : `cancelAfterExit()` rendu vide → 4 rouges sur 4 ; remis → 4 verts.
- Le montant réglé d'une échéance vit dans `metadata.paid_amount`, pas dans une colonne.
