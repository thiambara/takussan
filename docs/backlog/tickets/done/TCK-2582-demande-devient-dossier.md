---
id: TCK-2582
title: "La demande devient le dossier : la conversion emporte message, bien et origine, le doublon se dit d'avance, la visite naît de la demande"
status: done
phase: P1
family: back
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-11
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

**2026-11-11 (back-3).** Prémisse re-mesurée sur `5ac6480f4` : toujours vraie — `convert`
(`ContactLeadService.php`) ne recopiait que nom, e-mail, téléphone et l'étape ; `customers` sans
origine ; aucune ressource ne disait « déjà client » ; `property_visits` sans `contact_lead_id`.
Écart : **il n'existait aucune voie de « rattachement à une fiche existante »** — le 409
`customer.duplicate` ne laissait que « Convertir quand même ».

Ce qui est livré :

- Migrations `2026_11_11_190000_add_origin_to_customers` (`source_contact_lead_id`,
  `interested_property_id`, FK nommées `nullOnDelete`, un index chacune) et
  `2026_11_11_190100_add_contact_lead_id_to_property_visits`. Toutes deux réversibles. Elles étaient
  déjà passées sur la base de démo (lot 13) quand je les ai lancées : un `migrate` d'un autre agent
  les avait prises.
- `CustomerNoteKind::LeadMessage` ; `staffOnlyValues()` = `visit_report` + `lead_message`.
  `CustomerNote::scopeWithoutVisitReports` et `CustomerResource::notesLisibles` retirent les deux
  natures hors du personnel : le bailleur AUTEUR d'une fiche (qui la lit, TCK-591 §9) ne lit pas ce
  que le prospect a écrit à l'agence — notes, `include=notes` et fil d'activité.
- `ContactLeadService::linkLead()` (privée), commune à `convert()` et au nouveau `attach()` :
  origine et bien posés **seulement si la fiche n'en a pas** (la première demande reste l'origine) ;
  `source`/`medium` dans `metadata.origin` (la fiche n'a pas de colonnes d'attribution), sans écraser ;
  critères **vides** déduits du bien (`criteriaFromProperty()` : contrat, type, quartier, budget
  max = prix × 1,2 en entiers) ; note épinglée `lead_message`, le message tel quel (aucun préfixe :
  le front le rend), **datée de la demande** (`created_at` = celui de la demande) ; demande liée et
  traitée. Une seule note par demande : elle s'écrit sous le verrou de la demande, à l'instant où
  `customer_id` passe de `null` à la fiche — une conversion ou un rattachement rejoués rendent 409
  `lead.already_converted` avant toute écriture.
- **Choix de la session (à relire)** : le budget n'est déduit que d'une vente ou d'un loyer mensuel
  (un prix à la nuit ou à la semaine ne dit rien d'un budget mensuel) ; `seeking_cities` n'est pas
  déduit (le ticket ne le nomme pas).
- Rattachement : `POST /api/contact-leads/{lead}/convert {customer_id}` — une fiche de l'agence de
  la demande (`ClientDeLAgence`) que l'appelant lit (`CustomerPolicy::view`, jugée dans
  `authorize()` : une fiche d'une autre agence rend 403 avant tout 422). Les refus que les deux
  routes partagent sont tenus par le service (`attach()` / `convert()`) : un clic (WhatsApp, Appeler)
  rend 422 `lead.not_convertible`, une fiche que l'acteur ne lit pas (agent sans `crm.view_all`,
  fiche d'un collègue) 403 — la visite qui rattache y passe aussi.
- `known_customer` (`ContactLeadKnownCustomers`) : la fiche de l'agence de la demande au même
  téléphone normalisé ou au même e-mail replié (expressions du détecteur), téléphone d'abord, plus
  ancienne à égalité, `{id, name, visits_count}`. Fiche que le lecteur ne voit pas
  (`Customer::visibleTo`) : `{id: null, name: null, visits_count: null}`, comme le détecteur. **Clé
  absente** pour qui n'est pas du personnel de l'agence de la demande (le bailleur destinataire).
  Amorcée pour la page par `index` (relecture des demandes, fiches avec `withCount('visits')`,
  visibilité : un nombre de requêtes fixe) ; les autres réponses passent par le même chemin, sur une
  page d'une ligne. Les demandes sont relues : la clé est servie sous
  `fields[property_contact_leads]=id,name`. ⚠ Pour TCK-2584 : `known_customer` n'est **pas** une
  colonne — le citer dans `fields[property_contact_leads]` rend 400 ; il sort toujours (au personnel).
- `CustomerResource` : `origin` (`include=origin` : `contact_lead_id`, `received_at`, `message`,
  `property {id, title, slug}`) et `interested_property` (`include=interestedProperty`), au seul
  lecteur des critères (personnel de l'agence de la fiche), jugé sur la fiche relue si
  `fields[customers]` a omis l'agence. ⚠ Comme toute relation `belongsTo` sous sparse fieldsets, le
  front doit demander `source_contact_lead_id` / `interested_property_id` dans `fields[customers]`.
- `POST /api/property-visits {contact_lead_id, create_customer?, allow_duplicate?, customer_id?}` :
  `authorize()` exige `PropertyContactLeadPolicy::convert`, le personnel de l'agence du bien et un
  bien de l'agence de la demande (403 avant la validation) ; un visiteur qui réserve pour lui-même
  ne cite jamais une demande. Ce qui n'est pas donné vient de la demande (bien, nom, téléphone en
  E.164, e-mail) ; une demande sans bien et sans `property_id` → 422. Fiche : demande déjà
  rattachée → sa fiche (pas de 409) ; `customer_id` → rattachement ; `create_customer` →
  conversion (`customer.duplicate` sauf `allow_duplicate`) ; sinon aucune fiche. Conversion, visite
  et demande traitée dans **une** transaction (un 422 `visit.slot_overlap` ne laisse pas une
  demande convertie sans visite) ; le SMS part après. La visite reprend `source`/`medium` de la
  demande à défaut. `property_id` différent de celui de la demande : permis s'il est de la même
  agence (l'agent propose un autre bien).
- `contact_lead_id` n'est pas servi par `PropertyVisitResource` ni dans `PropertyVisit::$queryFields`
  (aucun écran ne le lit encore).
- `include=origin` sans `fields[property_contact_leads]` charge la ligne entière de la demande (dont
  `ip` et `user_agent`) ; elle n'est rendue que par `CustomerResource::origine()`, qui n'en cite que
  l'id, la date, le message et le bien (seuls appelants de `Customer::buildQuery` qui rendent :
  `CustomerController::index`/`show`, relevé).
- **Conservation** : la note `lead_message` est une SECONDE copie du message. Aucun chemin n'efface
  aujourd'hui le message d'une demande (relevé : `ErasedMemberPortfolio` ne fait que réattribuer) ;
  l'effacement de la fiche emporte ses notes. Un futur effacement des demandes devra suivre la note.

**Pour /sync-specs** : `docs/models-spec.md` § 7 (Customer : `source_contact_lead_id`,
`interested_property_id`, relations `origin`/`interestedProperty`), § 17 (PropertyVisit :
`contact_lead_id`), § 33 (CustomerNote.kind : `conversion`, `loss`, `visit_report`, `lead_message`),
§ 67 (PropertyContactLead : `known_customer` calculé) ; `docs/features.md` § 16 (conversion,
rattachement `customer_id`, « déjà client ») et § 13 (visite depuis une demande) ;
`docs/spatie-query-builder.md` (`include=origin`, `include=interestedProperty`).

Vérifications : 4 classes neuves (28 tests) vertes ; gardes `RessourceUniqueResolue`,
`ExistsSurTableASuppressionDouce`, `AgencyIdIsIndexed` vertes ; balayages `ImpersonationReadSweep`,
`ValeursEnListeParcoursDesRoutes`, `DateInventoryByValue` verts ; gardes racine : seules les 5 des
maquettes locales restent rouges. Ablations (une à une, restaurées par `cp`, md5 vérifié) : AC1
(critères et note retirés → rouge), AC2 (critère saisi écrasé → rouge), AC3 (aucune fiche cherchée →
rouge ; calcul ligne à ligne → 48 contre 318 requêtes, rouge), AC4 (fiche de la demande ignorée →
rouge), transaction retirée (chevauchement → demande convertie sans visite, rouge), portée
`lead_message` retirée de `withoutVisitReports` (bailleur auteur lit le message → rouge) ; clause
`managesProperty()` d'`authorize()` retirée (bailleur destinataire planifie → rouge) ; clause « bien de
l'agence de la demande » retirée (super-admin sur le bien d'une autre agence → rouge) ; refus du clic
dans `attach()` retiré (→ rouge) ; `can('view')` de la fiche dans `attach()` retiré (→ rouge).
