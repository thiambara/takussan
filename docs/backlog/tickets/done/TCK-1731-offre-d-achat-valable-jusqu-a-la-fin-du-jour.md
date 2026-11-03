---
id: TCK-1731
title: "Une offre d'achat « valable jusqu'au 21 » vit tout le 21, et n'expire plus le 21 à 00:00"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-163--bornes-de-fin-saisies-en-date-seule-et-rangées-dans-une-colonne-datetime"
tags: [back, reservations, offres, pistes]
---

## Objectif utilisateur

L'acheteur qui déclare son offre « valable jusqu'au 21 » la voit vivre tout le 21 : elle expire le
22 à 00:00 (heure de Dakar), et non le 21 à 00:00, quatorze heures après son envoi.

## Contexte

Réf : **P163.01** du fichier de pistes, 🔴.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué retenue : ranger une date seule de validité d'offre à 23:59:59 du jour
choisi, heure de Dakar, par le helper partagé avec la délégation (`App\Support\FinInclusive`,
TCK-1455), `metadata.offer_expires_at` gardé en date.

Mesuré avant correctif sur `f0c04f559` : temps figé au 2026-10-20 10:00 (Dakar), offre envoyée
avec `offer_expires_at = '2026-10-21'` → 201, `ExpireBookings` à 2026-10-21 23:59 → `expired`.

## Hypothèses (mode sans humain)

- **Le détail de l'agence ne change pas de code.** `BookingDetail.tsx` rend `expires_at` par
  `formatDateTime` : rangée à la fin du jour, l'échéance s'y lit « 21 oct. 2026, 23:59 », le jour
  choisi, au lieu de « 21 oct. 2026, 00:00 ». L'afficher en jour seul demanderait au front de
  reconnaître une offre, ce que `BookingResource` n'expose pas (`metadata` n'est pas rendu) :
  voie plus large, laissée en reste.
- `after:today` de `BookingRequestPublicPropertyRequest` reste tel quel : il refuse déjà le jour même.
- Les offres déjà rangées à 00:00 ne sont pas réécrites (aucune donnée réécrite, V4).

## Delta à produire

- [x] `PublicPropertyController::bookingRequest` (branche offre) range `expires_at` par
  `FinInclusive::de()`.
- [x] Test : `PropertyBookingRequestTest::test_une_offre_valable_jusqu_au_jour_choisi_vit_tout_ce_jour`.

## Critères d'acceptation

- [x] AC1 — Offre avec une date seule : `pending` à 23:59 le jour choisi, `expired` le lendemain à
  00:00:01, `metadata.offer_expires_at` égal à la date envoyée.

## Reste à faire

> le détail de l'agence montre l'échéance d'une offre en jour et heure (« 21 oct. 2026, 23:59 ») : l'afficher en jour seul demande que `BookingResource` dise qu'une réservation est une offre (`metadata.kind`), ce qu'il ne rend pas

## Notes d'implémentation

- Ablation : `expires_at` rendu à `$data['offer_expires_at']` → 1 rouge (`expired` à 23:59) ;
  remis → 15 verts.
