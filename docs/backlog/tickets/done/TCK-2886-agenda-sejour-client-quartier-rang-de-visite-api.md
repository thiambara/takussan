---
id: TCK-2886
title: "API de l'agenda : le séjour dit son client et le quartier du bien, la visite dit son rang (« 1ʳᵉ visite »)"
status: done
phase: P1
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
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

2026-11-15 — agent d'implémentation (vague 92).

**Prémisse re-mesurée** : `CalendarEventCollector::bookings` était bien l. 191-216, sans client ni
quartier ; l'événement `visit` n'avait pas de rang. Rien n'avait changé entre le relevé et l'implémentation.

**Livré** (`app/Services/Calendar/CalendarEventCollector.php`) :
- séjour : `with(['property:id,title,slug,agency_id', 'property.address', 'customer:id,first_name,last_name'])` ;
  `neighborhood` à tout lecteur de l'événement ; `customer_name` (fiche « prénom nom », `null` si vide)
  seulement au super-admin et au personnel de l'agence du bien (`stayer()`, même prédicat que `terrain()`
  de TCK-2585) — clé ABSENTE pour le bailleur et tout autre lecteur ;
- visite : `visit_rank` à tout lecteur (décision mineure : un rang n'identifie personne), nul sans `customer_id`.

**Écart avec le delta — sous-requête corrélée, pas fenêtre jointe.** Une première version joignait un
`row_number() over (partition by customer_id, property_id order by scheduled_at, id)` : correcte, mais
la fenêtre se calcule sur TOUTE la table `property_visits` à chaque appel de l'agenda. Remplacée par un
`count(*)` corrélé (`earlier.property_id/customer_id` égaux, non annulée, `(scheduled_at, id) <=`) —
même rang, même requête unique (AC3), servi par l'index `(property_id, scheduled_at)`. Le rang se juge
sur tout l'historique : une visite faite avant la fenêtre affichée compte.

**Effets voisins corrigés** :
- `tests/Feature/Database/TimestampDayRangeTest.php` (`the_calendar_visits_are_read_by_the_scheduled_at_index`)
  repérait la requête des visites par le préfixe `select * from "property_visits"` ; elle commence
  désormais par `select "property_visits".*` — préfixe mis à jour, l'assertion d'index reste verte.
- `takussan-web/src/types/calendar.ts` : `customer_name`, `visit_rank` déclarés (pour TCK-2888).
- Le flux .ics : un séjour porte désormais `LOCATION:<quartier>` (le rendu lit `neighborhood` pour tout
  événement) ; le nom du client n'y sort jamais (`IcsCalendarRenderer` ne lit pas `customer_name`).

**Mesures** : `CalendarBookingEventTest` (3) et `CalendarVisitRankTest` (6) verts ; les 6 autres classes
de `tests/Feature/Calendar/`, `Api/CalendarTest`, `TimestampDayRangeTest` et les classes qui appellent
`/api/calendar` verts ; trois gardes d'architecture vertes ; `scripts/check-*.mjs` tous verts.
Ablations (une à une, restaurées par `cp`, md5 vérifié) : sans le chargement groupé → AC3 séjour rouge ;
sans le cloisonnement du nom → bailleur rouge ; sans le filtre « non annulée » → AC2 annulée rouge ;
sans `property_id` dans la corrélation → « propre au client et au bien » rouge ; sans l'ordre → AC2 rang 2 rouge.

