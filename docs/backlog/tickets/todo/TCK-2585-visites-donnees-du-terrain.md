---
id: TCK-2585
title: "Visites, les données du terrain : adresse, compteurs, confirmation en lot, créneaux libres pour la console, et des événements d'agenda qui disent avec qui"
status: todo
phase: P1
family: back
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2586, TCK-2587, TCK-2596, TCK-2597]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [back, visits, calendar, audit-ux, app]
---

## Objectif utilisateur

L'agent qui part à une visite a l'adresse et le visiteur sous la main, confirme dix demandes d'un coup, et ne propose au client que des heures où lui et le bien sont libres.

## Contrat de données

**Re-mesuré sur `1bce3798a`** :
- l'include `property` d'une visite ne rend que `id, title, slug` (`PropertyVisitResource.php:46-50`) : **ni adresse ni coordonnées** ;
- filtres : `property_id, visitor_id, customer_id, agent_id, type, status`, `scheduled_at_min/max`, `unassigned`, `mine` (`PropertyVisit.php:71-114`) ; **ni** recherche, **ni** compteurs (le front lance une requête par onglet pour compter), **ni** action en lot ;
- les créneaux libres n'existent que sur la route publique `GET /api/public/properties/{slug}/visit-slots?date=` (`routes/api/public.php:183`, `VisitSchedulingService::availableSlots`) : biens publiés seulement, agent = contact principal, sans paramètre d'agent ; la planification console propose une grille fixe 09:00-18:30 ;
- les événements `visit` de `GET /api/calendar` portent le titre du bien, la tranche et la durée (`CalendarEventCollector.php:244-279`) : **ni visiteur, ni adresse**.

À créer :
- `PropertyVisitResource`, include `property` : `address` (`{line, neighborhood, city, latitude, longitude}`) et `cover_url` ; include `customer` : `phone` ; champ `visitor_display` (`{name, phone, kind: customer|account|anonymous, visits_on_property}`) — « 1re visite » / « revient ».
- `filter[search]` (nom du visiteur, téléphone, titre du bien) ; `filter[day]=YYYY-MM-DD` (jour de Dakar) en raccourci de `scheduled_at_min/max`.
- `GET /api/property-visits/counts` : les comptes de chaque onglet (`unassigned`, `requested`, `confirmed`, `past`, `cancelled`, `today`, `to_close`) sous les mêmes portées (`mine`, agence active) en une requête.
- `POST /api/property-visits/bulk-confirm` (`BulkConfirmPropertyVisitsRequest` : `visits[] = {id, scheduled_at?}`, 50 au plus) et `POST /api/property-visits/bulk-assign` (`{ids[], agent_id}`, capacité `crm.assign`) : chaque ligne passe par la même règle que le geste unitaire ; la réponse dit ligne par ligne `ok` ou le code d'erreur.
- `GET /api/property-visits/slots?property_id=&date=&agent_id=` (`VisitSlotsRequest`, personnel qui gère le bien) : même moteur que `availableSlots`, pour tout bien de l'agence (publié ou non), l'agent donné ou l'appelant.
- `CalendarEventCollector` : un événement `visit` porte `visitor_name`, `address_line` et `neighborhood` — pour le personnel seulement ; le flux iCal personnel aussi (`LOCATION`).

## Contraintes strictes (métier)

- **Adresse au visiteur** : le personnel la lit toujours ; le visiteur (compte) ne la reçoit que pour une visite `confirmed` — **décidé par le porteur le 2026-11-10** (point 12 a), règle écrite dans `docs/features.md` § 1.3. Le bailleur hors personnel : comme aujourd'hui (ses biens).
- Confirmer une visite à tranche exige l'heure (`visit.time_required`, TCK-2502) : vaut aussi ligne par ligne dans le lot.
- Le lot n'est **pas** atomique : une ligne refusée (409 visite prise par un collègue, heure manquante) n'annule pas les autres ; chaque client confirmé est prévenu comme au geste unitaire (`VisitNotifier`).
- Les créneaux de la console tiennent compte des visites confirmées **de l'agent** sur tous ses biens et **du bien** avec tous les agents (règle actuelle d'`availableSlots`), en heure de Dakar ; la planification console reste libre d'heure (la grille est une aide, pas une contrainte — `StorePropertyVisitRequest` inchangé).
- `counts` respecte exactement les portées de l'index : aucun compte d'une autre agence.
- Codes d'erreur seulement ; `throttle:visit-planning` sur le lot.

## Delta à produire

- [ ] `PropertyVisitResource` (adresse, couverture, `visitor_display`) ; filtres `search`, `day`.
- [ ] `PropertyVisitController::counts`, `::bulkConfirm`, `::bulkAssign`, `::slots` + FormRequests + routes (littérales avant `{visit}`).
- [ ] `VisitSchedulingService::availableSlots` réutilisé sans le slug public.
- [ ] `CalendarEventCollector` et le flux iCal personnel enrichis.
- [ ] Tests : `PropertyVisitAddressVisibilityTest` (personnel ; visiteur avant / après confirmation), `PropertyVisitCountsTest` (égal aux totaux des index filtrés, agence isolée), `PropertyVisitBulkConfirmTest` (mixte ok / 409 / heure manquante, SMS par client confirmé), `PropertyVisitBulkAssignTest` (403 sans `crm.assign`), `StaffVisitSlotsTest` (bien non publié, agent pris ailleurs), `CalendarVisitEventEnrichedTest`.

## Critères d'acceptation

- [ ] AC1 (rouge sur `1bce3798a`) — `GET /api/property-visits/{id}?include=property` lu par l'agent rend l'adresse et les coordonnées du bien ; lu par le visiteur sur une visite `scheduled`, `address` est absent ; sur la même visite confirmée, présent.
- [ ] AC2 — `GET /api/property-visits/counts?mine=1` rend, pour chaque onglet, le même nombre que `meta.total` de l'index filtré correspondant (test qui compare les sept).
- [ ] AC3 — Un lot de trois visites dont une prise par un collègue et une à tranche sans heure : une confirmée, deux refusées, chacune avec le code que rend le geste unitaire (celui du 409 de prise par un collègue, et `visit.time_required`) ; un seul SMS envoyé.
- [ ] AC4 — `GET /api/property-visits/slots` sur un bien **non publié** de l'agence rend des créneaux, sans 10:00 quand l'agent a une visite confirmée à 10:00 sur un autre bien.
- [ ] AC5 — Un événement `visit` de `GET /api/calendar` lu par l'agent porte `visitor_name = "Abdoulaye Cissé"` et l'adresse ; le flux `.ics` de l'agent porte `LOCATION`.
- [ ] Ablations consignées (AC1, AC3, AC4).

## Hors périmètre

- Le compte rendu et le filtre « à clore » (TCK-2578).
- Les disponibilités déclarées de l'agent (créneaux de visite saisis une fois) : ambition de l'audit, non retenue.
- Un état « en cours » ou « en route » de la visite : « Je suis en route » est un message WhatsApp, rien n'est écrit.
- Le géocodage des adresses (la tournée, approche C, non retenue).

## Notes d'implémentation

_(à remplir par implementing-specs)_
