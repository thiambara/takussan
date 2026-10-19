---
id: TCK-957
title: "L'échéancier ne compte que ses échéances de loyer, et aucune ligne ne se pose sur un bail qui ne court pas"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-seule-ligne-de-paiement-avant-lactivation-supprime-tout-léchéancier-et-le-locataire-peut-la-poser"
tags: [back, leases, payments, pistes]
---

## Contexte

Réf : **P46.04** du fichier de pistes, `validé` par le porteur (critère accordé : V1).

`LeaseService::scheduleUnderLock` comptait **toutes** les lignes du bail pour juger qu'un
échéancier existe. Une caution saisie sur un bail en brouillon suffisait : à l'activation, la
tâche se taisait (0 échéance de loyer) et `generate-schedule` répondait `lease.schedule_exists`.
Aucune voie de création ne jugeait l'état du bail.

## Décision du porteur

`scheduleUnderLock` ne compte que les échéances de loyer qu'il émet (`payment_type=rent` hors annulées), et la création d'une ligne est refusée sur un bail qui n'est pas actif

## Objectif

Un bail activé reçoit toujours son échéancier de loyers, quelles que soient les lignes posées
avant, et on ne pose plus de ligne sur un bail qui ne court pas.

## Hypothèses (mode sans humain)

- « Bail actif » s'entend `active` **et** `terminating` : l'enum documente le préavis comme
  « still effectively active (rent due) » (`LeaseStatus.php:11-16`), et des charges ou une
  pénalité s'y posent encore. Brouillon, attente de signature, expiré, résilié, renouvelé : refusé.
- La voie `POST /api/payments` n'est pas touchée : son retrait est en cours dans la PR #666 du
  porteur (TCK-940, P46.01), qui ferme aussi la voie du locataire. Le refus vit donc dans
  `LeasePaymentController::store`, seule voie de création qui reste, et non dans
  `LeasePaymentService::create` (qui aurait modifié un test que #666 supprime).
- Le refus est un code d'erreur neuf, `lease_payment.lease_not_active` (422), libellé en `fr` et
  `en` ; le `wo` porte le texte français tel quel (wolof en pause).

## Delta à produire

- [x] `scheduleUnderLock` : `existing` = échéances `rent` dont le statut n'est pas `cancelled`.
- [x] `LeasePaymentController::store` : 422 `lease_payment.lease_not_active` hors `active` et
  `terminating`, après l'autorisation et la validation.
- [x] `lang/{fr,en,wo}/errors.php` : `lease_payment.lease_not_active`.
- [x] Tests : `GenerateLeasePaymentScheduleTest` (caution préexistante, loyer annulé, loyer dû),
  `LeaseTest` (brouillon refusé, préavis admis).

## Critères d'acceptation

- [x] AC1 — Une caution `pending` préexistante n'empêche pas l'échéancier : autant d'échéances de
  loyer que sur un bail témoin sans ligne.
- [x] AC2 — Une échéance de loyer `cancelled` n'empêche pas la génération manuelle.
- [x] AC3 — Une échéance de loyer due empêche toujours une seconde génération.
- [x] AC4 — `POST /api/leases/{id}/payments` sur un brouillon → 422
  `lease_payment.lease_not_active`, aucune ligne ; sur un bail en préavis → 201.

## Hors périmètre

- `POST /api/payments` (retrait par TCK-940).
- Le bouton « Enregistrer un paiement » du front reste visible sur un brouillon : il reçoit
  désormais le 422.

## Notes d'implémentation

- Avant correctif : 3 rouges (`0` échéance au lieu du témoin sur la caution, `lease.schedule_exists`
  sur le loyer annulé, `201` au lieu de `422` sur le brouillon).
- Ablation : les deux correctifs de `app/` retirés → les 3 mêmes rouges ; remis → verts.
- La fabrique de `Lease` crée un **brouillon** par défaut : `BranchedCapabilitiesTest` et
  `OwnerIsolationWithinAgencyTest` posaient leur ligne sur un brouillon. Chacun reçoit un bail
  actif pour ce seul geste ; le second compte les baux du bailleur dans le contexte de
  conversation, et attend désormais les deux.
