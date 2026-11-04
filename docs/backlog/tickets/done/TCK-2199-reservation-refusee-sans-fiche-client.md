---
id: TCK-2199
title: "Une réservation refusée ne crée plus de fiche client pour le demandeur"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-213--écritures-faites-avant-un-refus-4xx-hors-de-la-transaction-qui-porte-le-refus"
tags: [back, reservations, crm, pistes]
---

## Objectif utilisateur

Une personne dont la demande de réservation est refusée (nuits déjà confirmées, montant
incohérent) n'a pas de fiche client créée ou rattachée en son nom.

## Contexte

Réf : **P213.03** du fichier de pistes, `validé`.

Décision du porteur : validation du porteur (2026-10-24) : la fiche client se résout après les gardes, dans la transaction, après `assertAvailable`, et de même dans le tunnel public ; l'ordre des verrous (`properties` puis `users`) est vérifié sur tous les chemins

Avant (lu, puis mesuré par `BookingRefuseeSansFicheClientTest`, 2 rouges) : `BookingService::create`
et `PublicPropertyController::bookingRequest` appellent `findOrCreateFromUser` avant
`pricedAmounts` et avant la transaction de `assertAvailable`.

## Hypothèses (mode sans humain)

- L'offre d'achat du tunnel public n'a aucune garde après la résolution : elle garde sa place.
- **Ordre des verrous, relevé** (`grep -rn "lockForUpdate"` sur `users` et `properties` dans `app/`) :
  les deux chemins de réservation prennent désormais `properties` puis `users`
  (`findOrCreateFromUser`, l. 47). `ReviewController`, `AgentAbsenceService` et
  `HostIndividualOnboardingService` ne verrouillent pas `properties` dans la même transaction.
  **`AgencyMemberRemovalService::remove` prend l'ordre inverse** (`users` l. 68, puis
  `properties` l. 178) : un interblocage n'est possible que si le membre retiré réserve au même
  instant, par le tunnel public, un bien de son propre portefeuille (`BookingService::create` ne
  résout pas de fiche pour le personnel). PostgreSQL l'interrompt alors (40P01) sur l'une des deux
  requêtes. Non corrigé ici : hors des fichiers de la piste, laissé en reste.

## Delta à produire

- [x] `BookingService::create` : `findOrCreateFromUser` dans la transaction, après `assertAvailable`.
- [x] Tunnel public (séjour daté) : de même ; l'offre d'achat inchangée.
- [x] Test : `tests/Feature/Api/BookingRefuseeSansFicheClientTest.php`.

## Critères d'acceptation

- [x] AC1 — Utilisateur sans fiche, nuits déjà confirmées : `POST /api/bookings` → 422
  `booking.dates_overlap`, aucune fiche.
- [x] AC2 — Même chose par le tunnel public.
- [x] AC3 — Une demande acceptée crée la fiche et s'y rattache, par les deux chemins.

## Reste à faire

- ordonner les verrous de `AgencyMemberRemovalService::remove` (`users` puis `properties`, l. 68 et 178), seul chemin relevé dans l'ordre inverse du tunnel public, que croise le membre retiré qui réserve au même instant un bien de son portefeuille par le tunnel

## Notes d'implémentation

- **Ablation** : les deux fichiers remis à `HEAD` → 2 rouges sur 3 ; correctif remis → 3 verts.
