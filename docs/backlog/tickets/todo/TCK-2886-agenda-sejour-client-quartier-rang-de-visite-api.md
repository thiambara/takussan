---
id: TCK-2886
title: "API de l'agenda : le séjour dit son client et le quartier du bien, la visite dit son rang (« 1ʳᵉ visite »)"
status: todo
phase: P1
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2888]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#17-propertyvisit-"
tags: [back, calendar, agenda, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Sur l'occupation et le mois, l'agent lit qui séjourne (le nom sur la barre) et où est le bien ; sur une visite, s'il s'agit d'une première visite.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-agenda e2, e3, e4). L'événement `booking` de `/api/calendar` ne porte ni le client ni le quartier (`CalendarEventCollector::bookings`, l. 192-216) ; la fiche de TCK-2597 l'avait accepté (« nom du client remplacé par N nuits · référence », « quartier hors périmètre »), sans ticket. L'événement `visit` ne dit pas le rang (« · 1re visite », e4).

## Contrat de données

- `GET /api/calendar` : événements `booking` (+ `customer_name`, `neighborhood`) et `visit` (+ `visit_rank`).

## Contraintes strictes (métier)

- Même cloisonnement que `visitor_name` (TCK-2585) : le nom du client et le quartier ne sortent qu'au super-admin et au **personnel de l'agence du bien** ; le bailleur lit le quartier de son bien, pas le nom.
- `visit_rank` = rang de la visite parmi les visites non annulées du même client sur le même bien, par date ; nul sans client.
- Aucune requête par événement (chargements groupés).

## Delta à produire

- [ ] `CalendarEventCollector::bookings` : `with(['customer:id,first_name,last_name', 'property.address'])`, champs `customer_name`, `neighborhood` sous la règle ci-dessus.
- [ ] `CalendarEventCollector` (visites) : `visit_rank` par une sous-requête de fenêtre.
- [ ] Tests : `CalendarBookingEventTest` (personnel : nom et quartier ; bailleur : quartier seul ; une requête), `CalendarVisitRankTest` (1, 2, annulée non comptée).

## Critères d'acceptation

- [ ] AC1 — Un séjour d'Awa Diop sur un bien de Ngor rend au personnel `customer_name = "Awa Diop"`, `neighborhood = "Ngor"` ; le bailleur du bien reçoit `neighborhood` sans `customer_name`.
- [ ] AC2 — La deuxième visite d'un client sur un bien rend `visit_rank = 2` ; si la première a été annulée, `1`.
- [ ] AC3 — Le nombre de requêtes de `GET /api/calendar` ne dépend pas du nombre d'événements.

## Hors périmètre

- L'écran (TCK-2888).

## Notes d'implémentation

_(à remplir par implementing-specs)_
