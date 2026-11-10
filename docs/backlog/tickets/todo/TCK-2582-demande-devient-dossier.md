---
id: TCK-2582
title: "La demande devient le dossier : la conversion emporte message, bien et origine, le doublon se dit d'avance, la visite naît de la demande"
status: todo
phase: P1
family: back
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2584, TCK-2586, TCK-2589]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#67-propertycontactlead-"
    - "docs/models-spec.md#7-customer"
    - "docs/models-spec.md#17-propertyvisit-"
    - "docs/models-spec.md#33-customernote-"
tags: [back, leads, crm, visits, audit-ux, app]
---

## Objectif utilisateur

Quand l'agent fait d'une demande un client ou une visite, il retrouve dans la fiche ce que la personne a écrit, le bien qui l'a fait venir et d'où elle vient — et il sait avant de répondre si elle est déjà cliente.

## Contrat de données

**Re-mesuré sur `1bce3798a`** : `ContactLeadService::convert` (`:247-293`) ne recopie que nom, prénom, e-mail, téléphone et l'étape `lead` ; ni message, ni bien, ni source. `customers` n'a ni `source_contact_lead_id` ni `interested_property_id` (`Customer.php:70-81`) ; le seul lien est `property_contact_leads.customer_id`. Le doublon ne se découvre qu'à la conversion (409 `customer.duplicate`, `:270-272`) ; la ressource de la demande ne dit pas « déjà client » (`PropertyContactLeadResource.php:32`). Une visite ne connaît pas la demande qui l'a amenée (pas de `contact_lead_id`).

À créer :

- Migration `add_origin_to_customers` : `source_contact_lead_id` (FK `property_contact_leads`, `nullOnDelete`), `interested_property_id` (FK `properties`, `nullOnDelete`). `down()` réversible.
- Migration `add_contact_lead_id_to_property_visits` : `contact_lead_id` (FK, `nullOnDelete`).
- `ContactLeadService::convert` : en plus de l'existant, pose `source_contact_lead_id`, `interested_property_id` (le bien de la demande), recopie `source`/`medium` de la demande dans les colonnes d'attribution de la fiche si elles existent, sinon dans `metadata.origin` ; crée une `CustomerNote` épinglée `kind = lead_message` qui cite le message et sa date ; déduit les critères de recherche **vides** du bien (contrat, type, quartier, budget max = prix × 1,2), sans jamais écraser un critère déjà saisi. Le rattachement à une fiche existante (`allow_duplicate` absent et doublon choisi) fait les mêmes écritures sur cette fiche.
- `PropertyContactLeadResource` : `known_customer` (`{id, name, visits_count}` ou `null`) — la fiche de l'agence de la demande qui a le même téléphone normalisé ou le même e-mail replié (`CustomerDuplicateDetector`), servie au personnel seulement.
- `CustomerResource` : `origin` (`{contact_lead_id, received_at, message, property: {id, title, slug}}`) et `interested_property`.
- `POST /api/property-visits` accepte `contact_lead_id` (`StorePropertyVisitRequest`) : le bien vient de la demande s'il n'est pas donné ; avec `create_customer=true`, la demande est convertie (règles ci-dessus) et la visite rattachée à la fiche ; sans, `visitor_name`/`visitor_phone` viennent de la demande ; la demande est marquée traitée (`handled_at`, `handled_by_id`) si elle ne l'était pas ; la visite naît confirmée comme aujourd'hui (`createConfirmedOrFail`).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0101](../../../adr/0101-le-fil-commercial-vit-dans-la-fiche-client.md).
- **L'agence est la frontière** : une demande ne se convertit, ne se rattache et ne lance une visite que dans son agence ; `known_customer` ne cherche que dans l'agence de la demande ; un agent d'une autre agence reçoit 403 sur `contact_lead_id` (la règle de `StorePropertyVisitRequest::managesProperty` vaut pour le bien de la demande).
- Une demande sur un agent (sans bien, TCK-441) : la conversion marche sans bien ; une visite depuis cette demande exige `property_id`.
- La note `lead_message` est créée une seule fois par demande, même si la conversion est rejouée (`lead.already_converted` inchangé).
- Le message n'est **jamais** recopié dans la ressource d'un compte non membre du personnel ; `ip` et `user_agent` restent hors API.
- Codes d'erreur seulement ; `PropertyContactLead::$queryFields` et `Customer::$queryFields` étendus pour les sparse fieldsets.

## Delta à produire

- [ ] Deux migrations ; `CustomerNote.kind` accepte `lead_message`.
- [ ] `ContactLeadService::convert` étendu (note, bien, origine, critères déduits) ; même chemin pour le rattachement au doublon.
- [ ] `known_customer` sur la ressource de la demande (requête groupée sur la page, pas une requête par ligne).
- [ ] `origin` et `interested_property` sur `CustomerResource` (include `origin`).
- [ ] `StorePropertyVisitRequest` + `PropertyVisitController::store` : `contact_lead_id`, `create_customer`.
- [ ] Tests : `ContactLeadConversionCarriesContextTest` (note épinglée, bien, critères vides remplis, critères saisis intacts), `ContactLeadKnownCustomerTest` (même téléphone, autre agence → `null`, N demandes = nombre de requêtes constant), `VisitFromContactLeadTest` (avec et sans `create_customer`, demande marquée traitée, 403 hors agence, demande sans bien → 422), `CustomerOriginResourceTest`.

## Critères d'acceptation

- [ ] AC1 (rouge sur `1bce3798a`) — Convertir la demande de Mouhamed Dieng sur la pièce de Ouakam (85 000 F/mois) : la fiche a `interested_property_id` = la pièce, une note épinglée `lead_message` contenant « je suis fonctionnaire », et `seeking_neighborhoods` contient Ouakam, `budget_max = 102000`.
- [ ] AC2 — Une fiche dont `budget_max` vaut déjà 150 000 garde 150 000 après conversion.
- [ ] AC3 (rouge sur `1bce3798a`) — `GET /api/contact-leads` rend `known_customer = {name: "Awa Ndiaye", visits_count: 2}` pour une demande dont le téléphone est celui d'une fiche de l'agence, `null` si la fiche est dans une autre agence ; 20 demandes en page coûtent le même nombre de requêtes que 2.
- [ ] AC4 (rouge sur `1bce3798a`) — `POST /api/property-visits {contact_lead_id, scheduled_at, create_customer: true}` crée la visite confirmée sur le bien de la demande, rattachée à une fiche neuve portant la note `lead_message`, et la demande a `handled_at` posé et `customer_id` = la fiche.
- [ ] AC5 — Rejouer la conversion n'ajoute pas de seconde note `lead_message`.
- [ ] Ablations consignées (AC1, AC3, AC4).

## Hors périmètre

- L'heure de première réponse et les gestes de contact (TCK-2583).
- Les écrans (TCK-2584 boîte des demandes, TCK-2589 fiche client).
- Les créneaux libres de la planification (TCK-2585).

## Notes d'implémentation

_(à remplir par implementing-specs)_
