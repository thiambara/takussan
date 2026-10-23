---
id: TCK-1735
title: "« Demandes en attente », sous « Mes chiffres », ouvre les réservations des biens de l'agent, et non celles de toute l'agence"
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
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-167--tuiles-et-lignes-cliquables-des-tableaux-de-bord--ce-que-le-lien-ouvre-face-à-ce-que-le-nombre-compte"
tags: [api, front, dashboard, bookings, pistes]
---

## Contexte

Réf : **P167.05** du fichier de pistes.

Sous « Mes chiffres », « Demandes en attente » compte les réservations `pending` des biens que
l'agent a saisis ou suit en collaborateur `agent`/`manager` (`DashboardAgentService::propertyScope`).
Son lien, `/app/bookings`, ouvrait les réservations de toute l'agence : `Booking` n'offrait aucun
filtre « mes biens ».

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

La recommandation du délégué s'applique : « un filtre de portée neuf aux réservations (biens que
l'agent a créés ou suit en `agent`/`manager`, la règle de `propertyScope`), porté par le lien sous
« Mes chiffres » et visible dans la liste, sur le modèle de `only_mine` (TCK-1289), plutôt qu'une
mention sous la ligne ».

Choix de l'implémenteur, là où la recommandation ne dit rien :
- le paramètre de page est `?only_mine=1`, le nom de la liste des biens ; le filtre d'API est
  `filter[managed_by]=me` ;
- la case « Mes biens » ne s'affiche que quand la portée est posée (la liste sert aussi aux
  clients, pour qui elle ne veut rien dire), cochée ; la décocher retire la portée. Son libellé
  reprend celui de la bascule des biens (`fr` « Mes biens », `en` « My properties », `wo` le
  français, le wolof étant en pause) ;
- sous « Agence », le lien reste `/app/bookings`, où le nombre et la liste coïncident déjà.

## Delta à produire

- [x] API : `Property::scopeManagedBy(User, ?int)`, la règle « Mes chiffres » des biens, lue par
      `DashboardAgentService::propertyScope` et par le filtre neuf.
- [x] API : `filter[managed_by]=me` sur `GET /api/bookings` — biens de l'appelant, dans son agence
      active ; toute autre valeur ne rend rien.
- [x] Front : le lien porte `?only_mine=1` sous « Mes chiffres » ; `BookingsList` le lit, l'envoie
      (`useBookings({ onlyMine })`) et le montre par une case qui se décoche.
- [x] Clé `bookings.list.onlyMine` (`fr`, `en`, `wo` = le français).

## Critères d'acceptation

- [x] AC1 — biens saisi, suivi en `manager`, observé en `viewer`, d'un collègue, d'une autre agence,
      chacun avec une réservation `pending` (plus une confirmée) : la tuile dit 2, et
      `filter[status]=pending&filter[managed_by]=me` rend les deux mêmes, `meta.total` = 2.
- [x] AC2 — `filter[managed_by]` à une autre valeur, ou en liste : aucune ligne.
- [x] AC3 — lien `?only_mine=1` sous « Mes chiffres », nu sous « Agence » ; la case se montre,
      cochée, et la décocher garde l'onglet.

## Hors périmètre

- Le périmètre de base de `BookingController::index` n'est pas touché : le filtre ne fait que le
  restreindre.

## Notes d'implémentation

- Avant le correctif : `DemandesEnAttenteLienTest` rendait 400 (filtre inconnu) ; côté front,
  4 rouges (lien nu, portée ni lue ni envoyée, case absente).
- Ablation : filtre retiré de `Booking::customQueryFilters()` → 2 rouges API ; les trois fichiers
  sources du front rendus à `pre-dev` → 4 rouges ; remis → verts.
