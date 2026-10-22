---
id: TCK-1491
title: "Les bornes de saisie du front recopient celles de l'API"
status: todo
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-145--champs-écartés-par-validated-reste-de-langle-114"
tags: [front, validation, forms, pistes]
---

## Contexte

Réf : **P145.03** du fichier de pistes, `validé (délégué)`.

Plusieurs champs du front sont plus larges que la règle de l'API, ou n'ont pas de borne :
l'utilisateur ne la découvre qu'au 422.

## Décision du porteur (déléguée)

validé (délégué) — aligner le `max` de l'année de construction du schéma du front (`schemas/property.ts:207`) sur la règle de l'API, l'année en cours + 3, et poser sur les champs du front les `maxLength` des règles existantes de l'API : messages de réservation et d'offre (1000), message de contact sans compte (2000), nom du visiteur (120), libellé d'un indicateur (120), commentaire de retour de visite (2000) ; aucune borne de l'API ne change ; test : une année hors borne refusée par le schéma, et un `maxLength` par champ ; reste : la borne des voyageurs (20 au front et dans `StoreBookingRequest`, 50 dans le flux public), au porteur

## Reste à faire

la borne des voyageurs (20 au front et dans `StoreBookingRequest`, 50 dans le flux public), au porteur

## Objectif utilisateur

La saisie s'arrête là où l'API s'arrêtera, au lieu d'un refus après l'envoi.

## Contrat de données

Règles existantes de l'API, inchangées : `StorePropertyRequest` / `UpdatePropertyRequest`
(`year_built` ≤ année en cours + 3), `BookingRequestPublicPropertyRequest` et l'offre
(`message` 1000), `ContactLeadPublicRequest` (`message` 2000), `VisitRequestPublicPropertyRequest`
(`name` 120), `StoreKpiConfigRequest` (`label` 120), `FeedbackPropertyVisitRequest` (`comment` 2000).

## Contraintes strictes (métier)

- Aucune borne de l'API ne change ; aucun texte neuf (le message `property.yearInvalid` existe).

## Delta à produire

- [ ] `year_built` : `max` calculé à l'année en cours + 3.
- [ ] `maxLength` sur les six champs.
- [ ] Tests : année hors borne refusée par le schéma ; un `maxLength` par champ.

## Critères d'acceptation

- [ ] AC1 — l'année en cours + 4 est refusée, l'année en cours + 3 acceptée.
- [ ] AC2 — chaque champ porte le `maxLength` de sa règle d'API.

## Hors périmètre

- La borne des voyageurs (reste, au porteur).

## Notes d'implémentation

_(à remplir par implementing-specs)_
