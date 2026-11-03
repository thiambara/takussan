---
id: TCK-845
title: "Visite planifiée par l'agent pour un client sans compte : `fr`, pas la langue de l'agent"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-visite-créée-par-lagent-pour-un-client-sans-compte-enregistre-la-langue-de-lagent-et-le-même-client-reçoit-ses-rappels-de-loyer-en-français"
tags: [back, visites, i18n, notifications, pistes]
---

## Contexte

Réf : **P29.02** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

Sur `POST /api/property-visits`, quand le personnel planifie pour un client
(`PropertyVisitController::planForCustomer`), la visite d'un client sans compte enregistrait
`app()->getLocale()`, la langue négociée de l'**agent**. `ContactSansCompte::fromVisit()` relit
cette langue pour chaque envoi au visiteur, alors que `fromCustomer()` sert `fr` au même client
pour ses relances de loyer (ADR-0032 § 3).

## Décision du porteur

`fr` (`DEFAULT_LOCALE`), puis la langue de la fiche client une fois P29.03 faite

## Reste à faire

la langue de la fiche client une fois P29.03 faite

## Objectif utilisateur

Un client sans compte dont l'agent planifie la visite reçoit confirmation, replanification,
annulation et rappels dans la même langue que ses autres messages de l'agence.

## Contrat de données

- `POST /api/property-visits` (existante), branche du personnel : `property_visits.locale` vaut
  la langue du compte lié s'il existe, sinon `ContactSansCompte::DEFAULT_LOCALE`.

## Delta à produire

- [x] `PropertyVisitController::planForCustomer` : repli sur `ContactSansCompte::DEFAULT_LOCALE`
  au lieu de `app()->getLocale()`.
- [x] Test : `PropertyVisitNotificationTest::test_l_agent_planifie_sous_sa_langue_le_client_sans_compte_garde_le_francais`.

## Critères d'acceptation

- [x] AC1 — Agent sous `Accept-Language: en`, fiche client sans compte → `locale = fr`, et la
  confirmation `VisitConfirmed` part en `fr`.
- [x] AC2 — Même agent, prospect sans fiche (nom + téléphone) → `locale = fr`.
- [x] AC3 — Un client avec compte garde la langue de son compte (chemin inchangé).

## Hors périmètre

- La langue de la fiche client (P29.03, migration et champ de formulaire) : reste du porteur.
- La demande de visite publique et la réservation pour soi gardent la langue de la page
  (`app()->getLocale()` de leur propre requête), qui est celle du visiteur.

Hypothèse (mode sans humain) : le prospect sans fiche (nom + téléphone dictés) est un client sans
compte au même titre, et reçoit `fr`.

## Notes d'implémentation

- Ablation : repli remis sur `app()->getLocale()` → le test neuf rougit (`en` au lieu de `fr`) ;
  remis → `PropertyVisitNotificationTest` 12 verts, `PropertyVisitTest` vert.
