---
id: TCK-1898
title: "`CancellationBy::System` déclaré réservé : aucun chemin de `app/` ne l'écrit"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1307]
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#5-booking"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-196--cas-denum-déclarés-que-rien-nécrit-mais-que-des-filtres-compteurs-transitions-ou-libellés-lisent"
tags: [api, enums, pistes]
---

## Contexte

Réf : **P196.03** du fichier de pistes, `retenu · autonome` (A5 et A6).

`CancellationBy::System` n'a aucun écrivain : `BookingService::cancel` (seul écrivain de
`bookings.status = cancelled`) ne pose que `customer`, `owner` ou `agent`
(`BookingService.php:294-307`), et l'expiration d'une réservation passe par
`BookingExpirationService`, pas par une annulation. La ressource sert pourtant `cancellation_by`
(`BookingResource.php:36`), sans que rien ne dise que `system` n'arrive pas. TCK-1307 a posé le
patron : un cas sans écrivain est gardé, mais déclaré « Réservé » dans son docblock et inscrit dans
`CasDEnumReservesTest`.

## Objectif

Le code ne laisse plus croire qu'une réservation peut être annulée par le système.

## Delta à produire

- [x] Docblock « Réservé (TCK-1898, P196.03) » sur `CancellationBy::System`.
- [x] `CancellationBy::System` ajouté à la liste de `tests/Unit/Architecture/CasDEnumReservesTest.php`.

## Critères d'acceptation

- [x] AC1 — `CancellationBy::System` porte la marque « Réservé ».
- [x] AC2 — Une écriture neuve de `CancellationBy::System` dans `app/` fait rougir la garde.

## Hors périmètre

- **`docs/models-spec.md:4735`** dit que `lease_payments` n'écrit plus `failed` depuis TCK-593,
  alors que `PayoutService.php:796-797` passe en `failed` la ligne `deposit_refund` d'une caution
  dont le reversement échoue (TCK-594). La correction est dans la `Piste` mais la spec est fermée à
  l'implémenteur : elle reste à faire (`/sync-specs` ou le porteur).
- `CANCELLABLE_DUE_STATUSES` (`LeaseRenewalService.php:43`) : branche morte sans effet, laissée
  telle quelle selon la mesure.
- Le point `partially_paid` de `mark-paid` d'un loyer : il revient à P04.11.

## Notes d'implémentation

- **Ablation** : docblock retiré → `test_chaque_cas_reserve_le_dit_dans_son_docblock` rouge
  (« Cas sans écrivain non déclarés réservés ») ; remis → 3 tests verts.
