---
id: TCK-1494
title: "Expirer une réservation à la main se juge par `bookings.cancel`, et non par le type de profil admin (P116.04)"
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-116"
  features:
    - "docs/features.md"
tags: [api, booking, authorization, pistes]
---

## Objectif

Que `POST /api/bookings/{booking}/expire-now` se juge par la capacité du geste voisin,
`bookings.cancel`, portée par le rôle du membre à l'agence de la réservation.

## Contexte

Réf : **P116.04** du fichier de pistes (angle 116), `validé` le 2026-10-22 (critère V2 accordé :
le geste est retiré à l'admin dont le rôle ne porte pas la capacité).

`Admin\BookingController::expireNow` exigeait super-admin ou `isAgencyAdminAt`, par
`abort_code_unless`, hors policy : un admin sans `bookings.cancel` expirait, un agent qui la porte
recevait 403. La route n'a aucun appelant au front.

## Décision du porteur

> porteur (2026-10-22) : juger l'expiration manuelle par `bookings.cancel` dans `BookingPolicy`

Hypothèse : le geste reste celui du personnel de l'agence (`isStaffOf` + `bookings.cancel`, comme la
branche « personnel » de `BookingPolicy::cancel`) ; le bailleur et le client, qui annulent, n'expirent
pas. Le contrôle du profil actif sur l'agence de la réservation (`booking.not_in_active_agency`)
reste en place, et le code du refus reste `auth.insufficient_privileges`.

## Delta produit

- [x] `BookingPolicy::expire` (neuve) ; `expireNow` l'appelle.
- [x] `tests/Feature/Booking/ExpireNowCapabilityTest.php` (5 cas).

## Critères d'acceptation

- [x] AC1 — admin dont le rôle retire `bookings.cancel` : 403 `auth.insufficient_privileges`,
      réservation toujours `pending`.
- [x] AC2 — agent du rôle système (qui la porte) : 200, réservation `expired`.
- [x] AC3 — agent sans la capacité, personnel d'une autre agence : 403 ; admin du rôle système : 200.

## Notes d'implémentation

- **Ablation** : contrôleur remis à `pre-dev` (policy laissée) → 2 rouges (AC1, AC2) ; remis → 5/5.
