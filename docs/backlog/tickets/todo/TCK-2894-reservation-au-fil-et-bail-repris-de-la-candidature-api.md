---
id: TCK-2894
title: "API : la réservation entre au fil de la fiche client, et le bail créé depuis une candidature reprend son loyer, sa durée, sa caution et ses garants"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2870, TCK-2893]
blocks: [TCK-2875, TCK-2878]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#14-lease-"
tags: [back, bookings, crm, leases, fil-commercial, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent lit tout le chemin d'un client de la demande au bail au même endroit, et le bail qu'il crée depuis une candidature acceptée est déjà rempli de ce qu'elle disait.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-reservations e1 historique ; app-fil-commercial e6 « Le fil de {prénom} », e7 « De la demande au bail », panneau « Nouveau bail · repris de la candidature »). Relevé : `CustomerTimeline::TYPES` (`note`, `visit`, `contact`, `stage`, `record`, `task`) ne contient pas la réservation ; le bail créé depuis `?booking_id=` (TCK-2643) ne rattache aucun garant et le formulaire reprend le loyer actuel du bien (`CreateLeaseForm.tsx:208-220`), pas le montant de la candidature. Décisions : [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 9, § 10.

## Contrat de données

- `GET /api/customers/{customer}/timeline?types=booking` (type neuf).
- `POST /api/leases` avec `booking_id` : reprise par défaut de la caution et des garants de la réservation.
- `GET /api/bookings/{booking}` sert déjà ce que le formulaire préremplit (montant, `term_months`, `security_deposit_amount`, `start_date`, garants — TCK-2870, TCK-2893).

## Contraintes strictes (métier)

- Le fil ne sert la réservation qu'au personnel de l'agence de la fiche (même lecture que les visites dans `CustomerTimeline`) ; il ne sert jamais le revenu ni le dossier.
- Le loyer repris est **le montant de la candidature** (le loyer du bien à sa création, ADR-0102 § 3), pas le loyer actuel du bien.
- Une requête de bail qui envoie ses propres garants ou sa propre caution l'emporte sur la reprise.

## Delta à produire

- [ ] `CustomerTimeline` : type `booking` (jalons `created`, `confirmed`, `rejected`, `counter_offer`), rangs, lecture personnel ; `CustomerTimelineRequest` l'accepte.
- [ ] `LeaseService::create` avec `booking_id` : rattache les garants de la réservation quand la requête n'en envoie pas ; reprend `security_deposit_amount` comme caution par défaut et `term_months` pour la date de fin par défaut.
- [ ] Tests : `CustomerTimelineBookingTest` (personnel oui, bailleur hors agence non, ordre avec visites et notes), `LeaseFromBookingTest` (garants et caution repris, surcharges de la requête respectées, loyer de la candidature quand le bien a changé de loyer).

## Critères d'acceptation

- [ ] AC1 — `GET /api/customers/{id}/timeline?types=booking` rend « candidature déposée » puis « candidature acceptée » au personnel de l'agence, rien à un bailleur d'une autre agence.
- [ ] AC2 — Le fil complet d'un client rend, dans l'ordre, la note `lead_message`, la visite confirmée, le compte rendu, le geste d'invitation et la candidature déposée.
- [ ] AC3 — Une candidature créée quand le bien était à 300 000 F, le bien passé ensuite à 320 000 F : `POST /api/leases` avec son `booking_id` sans loyer explicite crée un bail à 300 000 F, avec le garant et la caution de la candidature.

## Hors périmètre

- Les écrans (TCK-2875 historique, TCK-2878 fil commercial et panneau du bail).

## Notes d'implémentation

_(à remplir par implementing-specs)_
