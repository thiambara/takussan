---
id: TCK-2153
title: "L'acompte déjà reversé au bailleur rend son reversement, et le dialogue de remboursement avertit sans refuser"
status: done
phase: P1
family: applicatif
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2151]
blocks: []
spec_refs:
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md#amendement-du-2026-10-24--la-reprise-au-bailleur-le-relevé-lu-par-la-copie-la-pénalité-de-retard-reversée"
  features:
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-205--pièces-déjà-reversées-au-bailleur-puis-remboursées--aucune-reprise"
tags: [api, web, payouts, réservations, remboursement, pistes]
---

## Objectif utilisateur

Avant de rembourser l'acompte d'une réservation fermée, l'agence lit qu'il a déjà été reversé au
bailleur (référence et date du reversement), et que le remboursement créera une reprise sur son
prochain reversement.

## Contexte

Réf : **P205.02** du fichier de pistes. ADR-0039, amendement du 2026-10-24, point 5. La reprise
elle-même est TCK-2151.

## Décision du porteur

> validé — validation du porteur (2026-10-24) : la ressource, la tâche et le dialogue de remboursement d'un acompte exposent le reversement qui l'a porté (référence, date `processed_at`) ; le dialogue avertit sans refuser, la reprise suivant ADR-0039 (amendement du 2026-10-24)

## Hypothèses (mode sans humain)

- **Qui lit le reversement.** `BookingPaymentResource` est lue aussi par le client de la
  réservation (`BookingResource.booking_payments`). La référence d'un reversement au bailleur ne
  lui est pas due : `paid_out` n'est rendu qu'à qui passe `PayoutPolicy::view` sur ce reversement
  (personnel tenant `payouts.create`, émetteur, bailleur), `null` sinon. Aucune règle neuve.
- **La tâche** porte `metadata.paid_out` (par id d'acompte), figé à son ouverture ; aucun écran
  ne lit aujourd'hui les métadonnées de la tâche.
- Texte neuf `fr` et `en` ; `wo` porte le texte français (wolof en pause).

## Delta livré

- [x] `PayoutClawbacks::paidOutPayout()` : le reversement au bailleur `completed` qui porte un acompte.
- [x] `BookingPaymentResource.paid_out` : `{payout_id, reference_number, processed_at}` ou `null`.
- [x] `BookingRefundTaskService::openFor()` : `metadata.paid_out`.
- [x] `BookingRefundPanel` : mention « Reversé au bailleur le … (…) » sur la ligne, avertissement
      (`role="alert"`) dans le dialogue ; le geste reste permis. Clés `paidOut`, `paidOutWarning`.

## Tests

- API : `tests/Feature/Api/BookingPaymentPaidOutTest.php` — acompte reversé → référence et date
  rendues par `GET /api/bookings/{id}/payments`, acompte frais → `null`, inconnu → `null`, tâche
  ouverte avec `paid_out`, remboursement accepté (200).
- Front : `BookingDetail.remboursement.test.tsx`, deux cas neufs (mention et avertissement
  présents, geste permis ; témoin sans reversement).

## Notes d'implémentation

- **Ablation** : `paidOutPayout()` rendant `null` → test API rouge ; mention et avertissement
  masqués → test Vitest rouge ; rétablis → verts.
