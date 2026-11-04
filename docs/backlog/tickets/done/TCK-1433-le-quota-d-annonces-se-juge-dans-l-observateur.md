---
id: TCK-1433
title: "Le quota d'annonces se juge à toute entrée d'un bien dans un statut actif, dans l'observateur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-147--statuts-posés-par-un-ruleenum-entier-dans-les-requêtes-décriture"
tags: [back, biens, abonnement, quota, pistes]
---

## Contexte

Réf : **P147.04** du fichier de pistes, `validé` par le porteur (critère V1 accordé).

`store` et `publish` appellent `QuotaResolver::assertCanCreateActiveListing` quand le bien entre
dans `ACTIVE_LISTING_STATUSES` (TCK-627). `PATCH /api/properties/{id}` et `PUT …/status` ne
l'appelaient pas : mesuré par le mesureur, trois annonces actives pour une limite de 1.

## Décision du porteur

validé — porteur (2026-10-22) : juger le quota au seul point commun, l'observateur `updating`

## Contrat de données

- `PropertyObserver::updating` : un bien d'une agence dont le statut passe d'une valeur hors
  `QuotaResolver::ACTIVE_LISTING_STATUSES` à l'une d'elles est refusé, 422
  `quota.listings_exceeded`, au-delà de la limite du forfait. Rien n'est écrit.
- Passer d'un statut actif à un autre (`available` → `pending`) ne juge rien.
- `store` (événement `creating`) et `publish` gardent leur appel : `publish` juge le quota avant
  `PublishReadiness`, et l'ordre des refus ne change pas.
- Conséquence voulue par la décision, notée ici parce qu'elle sort du `PATCH` : toute sauvegarde
  Eloquent est concernée, dont `PropertyModerationService::resubmit` (`rejected` →
  `pending_review`, statut compté) ; un bien refusé ne se resoumet plus au-delà de la limite.
  Hypothèse : le juge au-delà de `withoutModerationGate()` aussi, ce verrou ne portant que sur
  la modération.

## Delta à produire

- [x] `PropertyObserver::guardListingQuota()`, appelé en tête d'`updating`.
- [x] `tests/Feature/Api/Property/QuotaDAnnoncesAuChangementDeStatutTest.php`.

## Critères d'acceptation

- [x] AC1 — agence à la limite (1) : `PATCH {status: available}` d'un brouillon → 422, brouillon.
- [x] AC2 — même agence : `PUT …/status` `pending` d'un brouillon → 422, brouillon.
- [x] AC3 — `available` → `pending` à la limite → 200.
- [x] AC4 — sous la limite, `PATCH {status: available}` → 200.

## Hors périmètre

- La limite elle-même et les forfaits (`Plan::limits`).

## Notes d'implémentation

- Ablation : l'appel retiré d'`updating` → 2 rouges (AC1, AC2 : 200), remis → 4/4.
