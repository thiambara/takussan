---
id: TCK-2585
title: "Visites, les données du terrain : adresse, compteurs, confirmation en lot, créneaux libres pour la console, et des événements d'agenda qui disent avec qui"
status: todo
phase: P1
family: back
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-11
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
- [ ] AC3 — *(corrigé le 2026-11-11 sur décision de la session : la confirmation unitaire ne rend jamais 409)* Un lot de trois visites dont une déjà confirmée par un collègue et une à tranche sans heure : une confirmée, deux refusées, chacune avec le statut et le code que rend le geste unitaire pour le même cas (`422 visit.not_scheduled_confirm`, `422 visit.time_required`) ; un seul SMS envoyé ; aucune attribution implicite.
- [ ] AC4 — `GET /api/property-visits/slots` sur un bien **non publié** de l'agence rend des créneaux, sans 10:00 quand l'agent a une visite confirmée à 10:00 sur un autre bien.
- [ ] AC5 — Un événement `visit` de `GET /api/calendar` lu par l'agent porte `visitor_name = "Abdoulaye Cissé"` et l'adresse ; le flux `.ics` de l'agent porte `LOCATION`.
- [ ] Ablations consignées (AC1, AC3, AC4).

## Hors périmètre

- Le compte rendu et le filtre « à clore » (TCK-2578).
- Les disponibilités déclarées de l'agent (créneaux de visite saisis une fois) : ambition de l'audit, non retenue.
- Un état « en cours » ou « en route » de la visite : « Je suis en route » est un message WhatsApp, rien n'est écrit.
- Le géocodage des adresses (la tournée, approche C, non retenue).

## Notes d'implémentation

**Livré (2026-11-11, back-3).**

- **Prémisse re-mesurée** : l'include `customer` rendait DÉJÀ `phone` (`PropertyVisitResource`, bloc `customer`, au lecteur de la fiche) — rien à faire. Le reste de la prémisse tenait.
- **Adresse** (`property.address` = `{line, neighborhood, city, latitude, longitude}`, `property.cover_url` par `PublicPhotoUrl`, filigrane respecté) : clé ABSENTE hors du super-admin, du personnel actif de l'agence du bien, du propriétaire du bien, et du lecteur d'une visite `confirmed`. Jugée sur des valeurs RELUES (`App\Services\Visit\VisitReadContext`, une requête par page + au plus trois pour l'historique) : sous `fields[property_visits]`, le statut ou l'agence absents de la ligne n'ouvrent rien.
- **`visitor_display`** `{name, phone, kind, visits_on_property}` : au personnel de l'agence du bien (au propriétaire d'un bien sans agence), `null` pour tout autre lecteur — comme `visits_on_property` d'une réservation (TCK-2593). `kind` : `customer` (fiche), `account` (compte sans fiche), `anonymous`. `visits_on_property` compte les visites NON ANNULÉES de la même personne sur le bien, celle-ci comprise (1 = « 1re visite ») ; la personne est sa fiche OU son compte (celui de la visite ou celui de la fiche) — la demande publique faite par le compte puis la visite planifiée sur sa fiche comptent 2, comme `visits_on_property` d'une réservation (TCK-2593) — et, sans fiche ni compte, son téléphone.
- **Filtres** : `filter[search]` — titre du bien, nom du visiteur (`CaseInsensitive`, pas d'insensibilité aux accents : `cisse` ne trouve pas `Cissé`), téléphone (≥ 3 chiffres) ; le nom et le téléphone ne se cherchent que là où le lecteur les lit (visite sans fiche, ou personnel de l'agence du bien) : un bailleur ne trouve pas un client de l'agence par son nom. `filter[day]=YYYY-MM-DD` — journée de Dakar `[début, lendemain[`, 422 `filter.day` sinon.
- **`GET /api/property-visits/counts`** : une requête (`count(*) filter (where …)`), portée de l'index extraite (`indexScope`), filtres `filter[...]` de l'index acceptés, `mine=1` raccourci de `filter[mine]=1`. Bornes des onglets = celles du front (`onglet-des-visites.ts`) : `unassigned` (en attente, sans agent, à venir), `requested` (en attente, à venir), `confirmed` (confirmée, à venir), `past` (heure ≤ maintenant, tout statut), `cancelled`, **`today` = tout statut, ce jour à Dakar (`filter[day]`)** — onglet neuf, définition posée ici —, `to_close` = `scopeToClose`. « À venir » inclut l'instant présent, « passée » aussi (bornes inclusives de `RangeFilter`) : le test fige l'heure et pose une visite à l'instant pivot.
- **`GET /api/property-visits/slots?property_id=&date=&agent_id=`** (`VisitSlotsRequest`) : personnel actif de l'agence du bien ou super-admin ; bien absent ou d'une autre agence → le même 403 avant validation ; `date` comme la route publique (aujourd'hui à +60 j) ; `agent_id` du personnel de l'agence (422) ; à défaut, l'appelant s'il est du personnel. Moteur inchangé : `availableSlots($property, $date, $agent)`.
- **`POST /api/property-visits/bulk-confirm`** (`visits[]={id, scheduled_at?}`, 1 à 50, ids distincts) et **`POST /api/property-visits/bulk-assign`** (`{ids[], agent_id}`, 1 à 50) — `throttle:visit-planning`, non atomiques. Réponse : `data[] = {id, ok: true, sms_sent?}` ou `{id, ok: false, code, status}`, `meta = {ok, failed}`. Confirmation = le geste unitaire par ligne (`update` + `agitPourLeBien`, `confirmOrFail` sous verrou, `VisitNotifier::confirmed` après ; un échec d'avis est journalisé, la confirmation reste). Attribution = la règle d'`update` : `crm.assign` dans l'agence de la visite (`visit.reassign_forbidden`), `visit.closed`, agent du personnel de l'agence du bien (`visit.agent_not_staff`, code neuf, utile au seul super-admin : pour les autres, `agent_id` est validé en 422 contre l'agence de leur profil actif). La requête entière exige `crm.assign` dans l'agence du profil actif (403 avant validation). Refus par ligne : en confirmation, ceux du geste unitaire dans son ordre — visite absente `404 http.not_found` (liaison de route), sans `update` `403 http.forbidden` (`ConfirmPropertyVisitRequest::authorize`), sans `agitPourLeBien` `403 visit.staff_only` ; en attribution, une visite absente ou étrangère rend `403 visit.staff_only`.
- **AC3 — décision de la session (2026-11-11, option a)** : `bulk-confirm` est le geste unitaire `confirm` ligne par ligne, mêmes autorisations, mêmes statuts et mêmes codes, aucune attribution implicite. La confirmation unitaire ne rend jamais 409 (le 409 `visit.already_assigned` est celui de `claim`) : une visite déjà confirmée par un collègue rend `422 visit.not_scheduled_confirm` sur sa ligne. Une visite seulement attribuée à un collègue et encore en attente se confirme, à l'unité comme en lot (l'agent reste le collègue). Épinglé par `test_parite_ligne_du_lot_et_geste_unitaire` (déjà confirmée, tranche sans heure, annulée, autre agence, absente, bailleur : chaque cas joué à l'unité et en lot, même statut et même code) et `test_confirmer_en_lot_n_attribue_pas`.
- **Agenda** : un événement `visit` porte `visitor_name` (nom de la fiche, à défaut le nom saisi), `address_line`, `neighborhood` — au super-admin et au personnel de l'agence du bien seulement (clés absentes pour le bailleur). Le flux `.ics` écrit `LOCATION:<rue>, <quartier>` et jamais le nom du visiteur (docblock d'`IcsCalendarRenderer` mis à jour).
- **Tests** : `PropertyVisitAddressVisibilityTest` (dont `cover_url` non nul avec une photo, et 2 pages de tailles différentes avec photos, adresses, fiches et comptes : même nombre de requêtes), `PropertyVisitCountsTest`, `PropertyVisitBulkConfirmTest`, `PropertyVisitBulkAssignTest`, `StaffVisitSlotsTest`, `PropertyVisitSearchFilterTest`, `CalendarVisitEventEnrichedTest`.
- **Ablations** (une à une, restaurées par copie, md5 vérifié) : AC1 adresse toujours lisible → 2 rouges ; AC1 sans la branche personnel → 2 rouges ; AC3 sans `catch` par ligne → 3 rouges ; AC3 sans avis → 1 rouge ; AC4 `availableSlots(…, null)` → 2 rouges ; AC2 sans `indexScope` → 2 rouges ; parité AC3 (refus 404/`http.forbidden` repliés sur `visit.staff_only`) → 2 rouges.
- **/sync-specs** : `docs/models-spec.md` § 17 (`visitor_display`, `property.address`/`cover_url` et leur règle de lecture, filtres `search`/`day`) ; `docs/features.md` § 13 (compteurs, confirmation et attribution en lot, créneaux de la console, agenda enrichi et `LOCATION`).

