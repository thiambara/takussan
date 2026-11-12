---
id: TCK-2747
title: "Accepter une candidature sur un logement déjà loué : la refuser, sauf relocation après la fin du bail (décision du porteur)"
status: todo
phase: P1
family: back
estimate: S
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2734]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
tags: [back, bookings, candidature, decision-porteur]
---

## Objectif utilisateur

L'agent qui accepte une candidature ne promet pas au client un logement qu'un locataire occupe encore, sauf quand le
bail en cours se termine avant l'entrée demandée.

## Contexte

Mesuré en démo (lecture seule) le 2026-11-12, pendant la seconde porte de TCK-2734 : sur 20 candidatures acceptées,
10 sont sur un bien qui a un bail, et **9 de ces 10 ont été acceptées APRÈS que le bail existait déjà**. Ce sont des
données de seed : l'API n'a jamais servi en production. Mais rien ne refuse ce geste dans le code :

- `BookingService::confirm()` ne juge que les nuits (`assertAvailable`, séjours seulement, ADR-0102 § 3) et la règle
  « une seule candidature acceptée » (TCK-2734).
- La seconde porte de TCK-2734 ferme les candidatures ouvertes **à la création** du bail. Une candidature déposée et
  acceptée APRÈS reste `confirmed` sur un bien loué.

## Décision à prendre (porteur)

- **(a) — recommandé.** Refuser la confirmation d'une candidature (`kind = application`) sur un bien qui porte un bail
  actif (`active`, ou à venir : `draft`, `pending_signature`), **sauf si ce bail se termine avant le début demandé**
  (`end_date` du bail < `start_date` de la candidature) : la relocation anticipée reste possible. Code
  `409 booking.property_already_leased`, jugé sous le verrou du bien que `confirm()` pose déjà.
- **(b)** Avertir sans refuser : la confirmation passe, le dialogue de l'agent signale le bail en cours.
- **(c) Statu quo.**

Les offres d'achat et les séjours ne sont pas concernés.

## Delta à produire (option a)

- [ ] `BookingService::confirm()` : la règle ci-dessus, sous le verrou du bien
- [ ] Le message du code : la prose localisée de l'API, rendue par `useMessageErreurApi` (pratique de TCK-2734)
- [ ] Le seeder ne fabrique plus de candidature acceptée sur un bien loué (sinon la démo contredit la règle)
- [ ] Tests : bail actif → 409 ; bail qui finit avant le début demandé → confirmée ; bail résilié ou expiré → confirmée ;
      offre et séjour non soumis

## Critères d'acceptation (option a)

- [ ] AC1 — La prémisse est éprouvée avant le correctif : le test du bail actif, joué sur le code d'avant, est vert
      pour la confirmation (elle passe)
- [ ] AC2 — Bail actif, ou à venir, couvrant le début demandé → 409 `booking.property_already_leased`, la candidature
      reste `pending`
- [ ] AC3 — Bail qui se termine avant le début demandé → la candidature se confirme
- [ ] AC4 — Ablation : retirer la règle rougit AC2 et pas AC3

## Hors périmètre

- Le rattrapage des données existantes : il n'y en a pas en production (décision du 2026-11-12)
