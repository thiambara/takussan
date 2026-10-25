---
id: TCK-2173
title: "L'avis d'un bien supprimé quitte la file de modération, et la supervision des paiements écarte une réservation supprimée"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-223--agrégats-en-sql-brut-sur-des-tables-à-softdeletes-sans-deleted_at-is-null"
tags: [back, admin, moderation, paiements, pistes]
---

## Objectif utilisateur

Le modérateur n'a plus à trancher l'avis d'un bien que plus personne ne voit, et la console des
paiements ne montre pas l'échec d'une réservation supprimée.

## Contexte

Réf : **P223.03** du fichier de pistes, `validé (délégué)`.

Décision du porteur (déléguée) : écarter de la file de modération les avis d'un bien supprimé, par `whereNull('rp.deleted_at')` sur la branche « avis » (la règle des trois branches de biens de la même requête ; un avis d'agence, sans bien joint, reste dans la file), et poser `b.deleted_at IS NULL` dans `bookingBase` comme `leaseBase` depuis TCK-2034 ; test : l'avis en attente d'un bien supprimé n'est plus dans `GET /api/admin/moderation`, l'avis en attente d'une agence y reste ; reste : clore ces avis à la suppression du bien

Avant (lu) : la branche « avis » de `UnifiedModerationService::unionQuery` joint `properties as rp`
en `leftJoin` sans `rp.deleted_at IS NULL` ; `PaymentSupervisionService::bookingBase` joint
`bookings as b` sans `b.deleted_at IS NULL`.

## Hypothèses (mode sans humain)

- Aucun chemin de l'application ne supprime une réservation : le test de `bookingBase` la supprime
  par le modèle.

## Delta à produire

- [x] `whereNull('rp.deleted_at')` sur la branche « avis » de la file.
- [x] `whereNull('b.deleted_at')` dans `bookingBase`.
- [x] Tests : `ModerationQueueTest::test_reviews_of_a_deleted_property_leave_the_queue_agency_reviews_stay`,
  `PaymentSupervisionTest::test_p223_03_un_echec_d_une_reservation_supprimee_ne_parait_pas`.

## Critères d'acceptation

- [x] AC1 — L'avis en attente d'un bien supprimé n'est plus dans `GET /api/admin/moderation`, ni
  dans son `meta.counts.review` ; l'avis en attente d'une agence y reste.
- [x] AC2 — L'échec de paiement d'une réservation supprimée ne paraît pas dans
  `GET /api/admin/payments?filter[status]=failed`.

## Reste à faire

- clore ces avis à la suppression du bien

## Hors périmètre

- Les signalements d'un bien supprimé dans la santé d'agence (P223.01, TCK-2171).

## Notes d'implémentation

- **Ablation** : les deux conditions retirées → 1 rouge sur 8 (file) et 1 rouge sur 5
  (supervision) ; remises → verts.
