---
id: TCK-2593
title: "Réservations : recherche, compteurs par nature et par statut, et le client servi avec la réservation"
status: todo
phase: P2
family: back
estimate: S
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2579]
blocks: [TCK-2594]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
tags: [back, bookings, audit-ux, app]
---

## Objectif utilisateur

L'agent retrouve « les offres reçues sur la villa des Almadies » ou la candidature d'Ousmane Ba en tapant un nom, et voit combien de demandes attendent sa décision dans chaque nature.

## Contrat de données

**Re-mesuré sur `1bce3798a`** (`Booking.php`) : filtres exacts `property_id, customer_id, created_by_id, agency_id, status, currency` (`:63`), `managed_by=me` (`:75-84`), montants (`:93`) ; `filter[status]=completed` **fonctionne déjà** (l'onglet manque côté front, pas l'API) ; **aucune recherche** ; **aucun compteur** ; include `customer` disponible (`:89`) mais l'audit relève qu'aucun écran ne l'affiche.

À créer :
- `filter[search]` : référence, nom et téléphone du client, titre du bien (requête SQL bornée à l'agence, pas Meilisearch).
- `GET /api/bookings/counts?filter[managed_by]=me` : `{stay: {pending, confirmed, completed, rejected, cancelled, expired}, application: {…}, offer: {…}}` sous les mêmes portées que l'index, en une requête groupée.
- Include `customer` : `phone`, `user_id` (pour « Écrire »), `pipeline_stage` dans les `fields[customers]` autorisés ; compte `visits_on_property` (visites du même client sur le même bien) servi au personnel.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md).
- Le client lit ses propres réservations seulement (portée actuelle de l'index) ; `counts` lu par un client ne compte que les siennes ; `visits_on_property` n'est jamais servi au client.
- `counts` égale exactement les totaux de l'index filtré (même portée, mêmes filtres de portée).
- Codes d'erreur seulement.

## Delta à produire

- [ ] `filter[search]` (`AllowedFilter::callback` sur `Booking`).
- [ ] `BookingController::counts` + route `bookings/counts` (avant `bookings/{booking}`).
- [ ] `fields[customers]` étendus ; `visits_on_property` (sous-requête groupée).
- [ ] Tests : `BookingSearchFilterTest` (référence, nom, bien ; autre agence jamais), `BookingCountsTest` (égal aux 18 totaux de l'index, client ne compte que les siennes), `BookingCustomerFieldsTest` (téléphone servi au personnel, `visits_on_property` absent pour le client).

## Critères d'acceptation

- [ ] AC1 (rouge sur `1bce3798a`) — `filter[search]=Ousmane` rend la candidature d'Ousmane Ba et rien d'une autre agence.
- [ ] AC2 — `GET /api/bookings/counts` rend, pour chaque couple nature × statut, le `meta.total` de `GET /api/bookings?filter[kind]=…&filter[status]=…` (comparaison exhaustive dans le test).
- [ ] AC3 — Lue par le personnel, une réservation avec `include=customer` porte le téléphone du client et `visits_on_property` ; lue par le client, ni l'un ni l'autre de ces champs propres au personnel.
- [ ] Ablation consignée (AC2).

## Hors périmètre

- La nature, la saisie par l'agent (TCK-2579) ; les écrans (TCK-2594).
- La contre-offre.

## Notes d'implémentation

Implémenté le 2026-11-11 (agent back-commercial-2, branche `feat/audit-ux-app-lot-1`, après TCK-2579).

**Prémisses re-mesurées, et ce qui différait**

- `filter[search]` rendait **400** (filtre inconnu), `bookings/counts` **404** : rouges avant le correctif.
- **`fields[customers]` n'avait rien à étendre** : `phone`, `user_id` et `pipeline_stage` sont déjà dans
  `Customer::$queryFields`, et `include=customer&fields[customers]=…,phone,user_id,pipeline_stage`
  rendait 200 avec leurs valeurs. Le test l'épingle.
- Le défaut réel était inverse : **la fiche imbriquée sortait entière vers tout lecteur** de la
  réservation — le client lisait son `pipeline_stage` (étape commerciale de l'agence), le bailleur du
  bien (TCK-1930) le téléphone et l'étape du candidat.

**Décisions**

- Recherche (`App\Services\Booking\BookingSearch`, branchée par `Booking::customQueryFilters`) : SQL
  sous la portée de l'index, jamais Meilisearch. Chaque mot (6 au plus) doit trouver la référence,
  le prénom ou le nom du client, ou le titre du bien ; casse repliée par `CaseInsensitive`, accents
  non (ADR-0020 §2, comme TCK-2630) ; `%` et `_` littéraux ; < 2 caractères : ignorée ; hors UTF-8 :
  rien. Une saisie faite de chiffres et de séparateurs (≥ 4 chiffres) cherche les seuls chiffres du
  téléphone de la fiche (`regexp_replace`), ce qui trouve aussi un numéro ancien rangé avec espaces.
- `counts` : la portée de l'index est extraite en `BookingController::visibleTo()` (une définition,
  deux appelants) ; `Booking::buildQuery` y applique les MÊMES filtres (y compris le 400 d'un filtre
  inconnu, `filter[kind]` et `filter[status]` compris). Une requête `GROUP BY kind, status`, les 18
  cases toujours présentes (0 comprises), réservations supprimées exclues.
- Champs du personnel (`App\Services\Booking\BookingCustomerFacts`) : `customer.phone`,
  `customer.pipeline_stage` et `visits_on_property` ne sortent que vers le personnel actif de
  l'agence de la réservation (`PersonnelDeLAgence::personnelActifDe`, la règle de la fiche client
  d'une visite, TCK-590) ou le super-admin. Client et bailleur ne les lisent plus ; le reste de la
  fiche (nom, `user_id`…) est inchangé. Agence inconnue (colonne omise par `fields[bookings]`) :
  retirés. Réservation sans agence : fiche non masquée (pas de CRM d'agence), `visits_on_property` omis.
- `visits_on_property` = visites **terminées** du client sur ce bien (« visites passées sur ce bien »
  de TCK-2594), par sa fiche (`customer_id`) ou par son compte (`visitor_id` = `customers.user_id`).
  Une requête groupée pour la page (index) ou la réservation (présentation), posée en attribut de
  requête ; omise là où rien ne la prépare (contrôleurs public et admin).

**Mesures** : 23 tests neufs (`BookingSearchFilterTest` 10, `BookingCountsTest` 6,
`BookingCustomerFieldsTest` 7). AC2 compare les 18 cases à `meta.total` de l'index, sans filtre,
sous `managed_by=me`, `search` et `property_id`, et pour le client. Lot lié (62 fichiers, réservations
et balayages) : vert hors `DateInventoryByValueTest`, qui demandait l'inscription de
`BookingResource::visits_on_property` à `CLES_JAMAIS_ATTEINTES` (un entier, posée par `prime()`
seul) — faite. Ablations : voir le rapport de l'agent.

**Décision du porteur du 2026-11-11** (après livraison) : le bailleur du bien doit pouvoir joindre le
candidat — il lit `customer.phone` et `customer.pipeline_stage` (bailleur au sens de
`BailleurDuBien::est`, verdict préparé pour la page en une requête) ; `visits_on_property` reste au
seul personnel. Épinglé par `BookingCustomerFieldsTest` (deux ablations rouges).
