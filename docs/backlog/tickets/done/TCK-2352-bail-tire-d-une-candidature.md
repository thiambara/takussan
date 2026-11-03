---
id: TCK-2352
title: "Le bail tiré d'une candidature : geste prérempli depuis la réservation, locataire = client de la réservation, et la réservation passe à completed"
status: done
phase: P2
family: full
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-2351]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-48--parcours-du-locataire--candidature-bail-quittance-plusieurs-agences"
tags: [api, front, baux, reservations, candidatures, pistes]
---

## Objectif

Une candidature retenue (réservation `confirmed` d'un bien à louer) mène au bail en un geste, prérempli,
et ce bail ne peut nommer que le candidat. Une fois le bail créé, la réservation ne bloque plus le
calendrier du bien.

## Contexte

Réf : **P48.03** du fichier de pistes, `validé`. Dépend de P15.01 (TCK-2350, TCK-2351) : la fiche du
candidat naît désormais dans l'agence du bien, donc le personnel la lit et `LeaseService` ne rend plus
403 sur elle.

Relevé à `4ef8e06b6` :

- `StoreLeaseRequest` accepte `booking_id`, et `LeaseService::create` le borne au seul bien (TCK-1068).
  Rien ne vérifiait que `tenant_id` était le client de la réservation.
- La réservation restait `confirmed` après le bail : ses nuits continuaient de bloquer toute autre
  confirmation sur le bien (`PropertyAvailabilityService`, seul `confirmed` bloque).
- Côté front, aucun formulaire n'envoyait `booking_id` (le schéma zod ne le déclarait pas, donc
  `useApiForm` l'aurait retiré), et les liens vers `/app/leases/new` étaient sans paramètre.

## Décision du porteur

validé — validation du porteur (2026-10-25) : après P15.01 : le geste prérempli `/app/leases/new?booking_id=…` et le contrôle `tenant_id` = `customer_id` ; la création du bail depuis une réservation la passe à `completed` et libère ses nuits

## Delta à produire

- [x] `LeaseService::create` : la réservation du bien est relue ; un `tenant_id` qui n'est pas son
  `customer_id` → 422 sur `tenant_id` (`errors.lease.tenant_not_booking_customer`). Le bail et la
  clôture de la réservation s'écrivent dans une même transaction.
- [x] `LeaseService::terminerLaReservation` : relue sous verrou ; `pending` ou `confirmed` → `completed`,
  activité `booking_completed` avec `lease_id`, causée par l'auteur du bail. Une réservation close
  (annulée, refusée, expirée, terminée) garde son statut.
- [x] Libellé `errors.lease.tenant_not_booking_customer` en `fr`, `en` et `wo` (texte français, wolof en
  pause).
- [x] Front, `BookingDetail` : lien « Créer le bail » (`/app/leases/new?booking_id=<id>`) sur une
  réservation `confirmed` d'un bien `rent`, pour le personnel qui détient `leases.create`.
- [x] Front, `/app/leases/new` lit `?booking_id=` ; `CreateLeaseForm` charge alors la réservation
  (`useBooking`), prérempli bien, locataire, dates, loyer (prix du bien) et devise, et affiche les
  parties en récapitulatif fixe, sans choix de bien ni de locataire.
- [x] `createLeaseSchema` et `CreateLeasePayload` portent `booking_id`.
- [x] Libellés `bookings.detail.actions.createLease`, `lease.form.fromBooking`, `fromBookingHint`,
  `fromBookingError` en `fr`, `en` et `wo`.
- [x] `docs/features.md` §1.4, `docs/models-spec.md` (`Booking.status`, `Lease.booking_id`).
- [x] `BailTireDUneCandidatureTest` (neuf), `BookingDetail.creer-le-bail.p48-03.test.tsx` et
  `CreateLeaseForm.depuis-reservation.p48-03.test.tsx` (neufs).

## Critères d'acceptation

- [x] AC1 — le bail tiré d'une candidature `confirmed`, au nom de son client : 201, `booking_id` posé,
  la réservation passe `completed`, et une autre candidature `pending` aux mêmes dates se confirme
  (ses nuits sont libérées).
- [x] AC2 — même réservation, une autre fiche de l'agence comme locataire : 422 sur `tenant_id`, aucun
  bail, la réservation reste `confirmed`.
- [x] AC3 — une candidature `pending` d'où l'on tire le bail passe `completed` aussi.
- [x] AC4 (témoin) — une réservation `cancelled` garde son statut ; le bail s'y rattache comme avant.
- [x] AC5 (témoin) — sans `booking_id`, la réservation du bien n'est pas touchée.
- [x] AC6 (front) — « Créer le bail » mène à `/app/leases/new?booking_id=<id>` ; absent sans
  `leases.create`, sur une demande en attente et sur un bien à vendre.
- [x] AC7 (front) — depuis une réservation, le formulaire nomme la réservation, le bien et le client,
  n'offre aucun choix de partie, et envoie `property_id`, `tenant_id` (le client), `booking_id`, les
  dates et le loyer préremplis.

## Hypothèses

- L'API complète aussi une réservation `pending` (AC3) : la décision dit « depuis une réservation »,
  sans exiger qu'elle soit confirmée. Le geste du front, lui, ne se montre que sur une candidature
  `confirmed` (la candidature retenue). C'est le choix le plus étroit côté écran ; il n'ajoute aucune
  règle côté API.
- Une réservation déjà close garde son statut : la passer `completed` réécrirait une annulation ou un
  refus.
- Le loyer prérempli est le prix du bien quand il est à louer, comme le `total_amount` d'une
  candidature au mois (un loyer). Les autres champs gardent les défauts du formulaire vierge.
- Pas de filtre sur la période de location (`rent_period`) au geste : un bien à louer suffit, l'agent
  choisit le type de bail au formulaire.
- Aucune décision structurelle neuve (aucun ADR ne régit le cycle de vie de la réservation) : pas
  d'amendement d'ADR.

## Hors périmètre

- Empêcher un second bail sur la même réservation : déjà `completed`, elle garde son statut et le
  contrôle du locataire tient toujours ; aucune règle d'unicité n'a été demandée.
- Le lien depuis la liste des réservations ou depuis la notification `BookingConfirmed`.

## Notes d'implémentation

- Avant correctif : API 3 rouges sur 5 (AC1, AC2, AC3 ; les deux témoins verts) ; front 3 rouges sur 6
  (le lien et les deux tests du formulaire ; les trois absences, témoins, vertes).
- Ablations API : contrôle du locataire retiré → AC2 rouge ; appel de `terminerLaReservation` retiré →
  AC1 et AC3 rouges ; filtre de statut retiré → AC4 rouge.
- Ablations front : `booking_id` retiré du schéma → envoi rouge (le schéma le retire) ; préremplissage
  retiré → envoi rouge ; parties sélectionnables → récapitulatif rouge ; garde de statut, garde du
  contrat ou capacité retirées → chacune son absence rouge. Correctifs remis → 5 et 6 verts.
- `LeaseExistenceOracleTest::test_la_reservation_du_bien_reste_acceptee` crée désormais la réservation
  au nom du locataire du bail : son ancienne fiche, une autre, tombe sous AC2.
