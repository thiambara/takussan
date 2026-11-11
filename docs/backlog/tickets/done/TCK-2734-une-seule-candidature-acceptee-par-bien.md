---
id: TCK-2734
title: "Deux candidatures acceptées sur la même location : une seule à la fois, ou plusieurs (décision du porteur)"
status: done
phase: P1
family: back
estimate: S
wave: 89
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2579]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
tags: [back, bookings, candidature, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

L'agent qui accepte la candidature d'un client pour une location au mois sait que personne d'autre n'a déjà été
accepté sur ce logement, et le client qu'on prévient « acceptée » n'est pas en concurrence avec un second client
prévenu de la même façon.

## Contexte

Relevé dans le journal du lot 1 (`docs/plans/2026-11-11-audit-ux-app-implementation.md`, entrée TCK-2579, « à
trancher par le porteur ») et re-mesuré dans le code le 2026-11-11 :

- [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md) § 3 : « une candidature ou une offre ne bloque
  aucune nuit ». `PropertyAvailabilityService::confirmedOverlapQuery()` ne retient donc que les réservations
  `kind = stay`.
- `BookingService::confirm()` appelle `assertNoOverlap()`, donc `assertAvailable()`, qui ne voit que les séjours.
  **Rien ne refuse la confirmation d'une seconde candidature sur le même bien** quand une première est déjà
  confirmée, datée ou non. Lu dans le code, pas encore éprouvé par un test.
- La création du bail depuis une réservation (`LeaseService`, `?booking_id=`, TCK-2643) ne lit que la réservation
  qu'on lui passe.

## Décision

**Décidé par le porteur le 2026-11-11 : (a), la recommandation (« je valide tout »).**

- **(a) Une seule candidature confirmée par bien à la fois.** Confirmer une seconde candidature rend
  `409 booking.application_already_accepted` tant que la première est `confirmed`. Elle est libérée quand le bail
  est créé depuis elle, quand elle est annulée ou quand elle est refusée. La confirmation dit « acceptée » au
  client : en accepter deux, c'est promettre le même logement à deux personnes.
- **(b) Plusieurs candidatures confirmées (liste courte).** Le bail créé depuis l'une d'elles fait passer les
  autres à `rejected`, et leurs clients sont prévenus. Le mot affiché au client à la confirmation devient « retenue »,
  pas « acceptée ».
- **(c) Statu quo.** Plusieurs candidatures confirmées, aucune fermeture automatique. Le fait est seulement écrit
  dans la spec.

Les offres d'achat (`kind = offer`) ne sont pas concernées : plusieurs offres sur un bien à vendre sont normales.

## Contrat de données

Aucune colonne neuve. Pour (a) : une règle sous le verrou du bien que `confirm()` pose déjà
(`Property::lockForUpdate()`). Pour (b) : la fermeture des autres candidatures dans la transaction de création du
bail.

## Contraintes strictes (métier)

- La règle est jugée sous le verrou existant du bien (piège PostgreSQL n° 2 de `takussan-api/CLAUDE.md` : verrouiller
  la ligne parent, jamais `lockForUpdate()->count()`).
- Un séjour (`stay`) garde sa règle de nuits (`assertAvailable`), inchangée.
- Le code d'erreur est un code (`abort_code`), jamais un libellé (ADR-0032). Le front le traduit.

## Delta à produire (option a)

- [ ] `BookingService::confirm()` : sous le verrou du bien, refuser `kind = application` si une autre candidature du
      même bien est `confirmed` → `409 booking.application_already_accepted`
- [ ] `lang/*/` côté front : le message du code (fr ; en ; wo = fr, Wolof en pause)
- [ ] Tests : `BookingApplicationSingleAcceptedTest`

## Critères d'acceptation (option a)

- [ ] AC1 — La prémisse est éprouvée avant le correctif : le test d'AC2, joué sur le code d'avant, est rouge (la
      seconde confirmation passe)
- [ ] AC2 — La seconde confirmation rend 409 `booking.application_already_accepted`, et son statut reste `pending`
- [ ] AC3 — Une fois la première annulée, refusée ou convertie en bail, la seconde se confirme
- [ ] AC4 — Deux offres d'achat sur un même bien se confirment toutes deux, et deux séjours qui ne se chevauchent pas
      aussi (témoins : la règle ne déborde pas sur les autres natures)
- [ ] AC5 — Ablation : retirer la règle rougit AC2 et AC3, et pas AC4

## Hors périmètre

- Les lecteurs qui lisent les réservations confirmées sans leur nature (TCK-2735)
- Les pièces du dossier de candidature et le garant (ADR-0102, « hors modèle »)

## Notes d'implémentation

- **Une candidature confirmée ne peut pas passer à « refusée »** : `reject` n'accepte qu'une candidature en attente et rend 422 sinon. Une fois une candidature acceptée, le bien n'est donc libéré que par la création du bail depuis cette candidature ou par une annulation (de l'agent ou du client).
- La seconde confirmation est refusée **sous le verrou du bien** (409 `booking.application_already_accepted`). Côté front, aucune clé neuve : le dialogue de BookingDetail affiche la prose localisée de l'API, par `useMessageErreurApi`.

## Vérification (2026-11-11)

Vérification adverse acceptée pour le delta.
- **Concurrence** : mesurée avec deux connexions. La seconde confirmation attend le verrou du bien, puis rend 409. Sans le verrou, les deux passent.
- **Libération** : l'annulation par l'agent ou par le client libère le bien, et la création du bail depuis la candidature aussi.
- **« Refusée »** : inatteignable, car le refus d'une candidature acceptée rend 422.
- **Message au client** : le dialogue de BookingDetail affiche la prose de l'API, en fr et en en.

Reste une seconde porte, hors delta : la création d'un bail ne lit pas la règle. Deux cas laissent A « acceptée » :
- un bail créé depuis une AUTRE candidature encore en attente ;
- un bail créé pour le client de A sans `booking_id`.

Toute candidature suivante rend alors 409 jusqu'à l'annulation de A. En démo, 10 candidatures acceptées sont déjà dans ce cas. La décision est remontée au porteur ; un ticket de suite la porte.

Mineurs, au lot 2 :
- un témoin « offre sur un bien à candidature acceptée » ;
- un test du verrou, porté du jetable de concurrence.
