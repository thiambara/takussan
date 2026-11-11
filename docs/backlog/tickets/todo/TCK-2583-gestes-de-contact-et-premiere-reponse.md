---
id: TCK-2583
title: "Les gestes de contact s'enregistrent : première réponse d'une demande, dernier contact d'un client, filtres de la boîte et délai médian par agent"
status: todo
phase: P1
family: back
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2578]
blocks: [TCK-2584, TCK-2588, TCK-2589, TCK-2590, TCK-2596]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#67-propertycontactlead-"
    - "docs/models-spec.md#7-customer"
tags: [back, leads, crm, reporting, audit-ux, app, adr]
---

## Objectif utilisateur

L'agent qui répond par WhatsApp ou par téléphone n'a rien d'autre à faire pour que la boîte et la fiche le sachent ; l'admin voit qui répond vite et quelles demandes attendent depuis plus de 24 h.

## Contrat de données

**Re-mesuré sur `1bce3798a`** : une demande n'a que `handled_at` / `handled_by_id` (`PropertyContactLead.php:38-39`) — `first_response_at` est absent ; une fiche client n'a ni dernier contact ni trace des appels et WhatsApp (seul le journal d'activité des attributs existe). Filtres de la boîte : `property_id`, `recipient_user_id`, `handled_by_id`, `channel`, `handled`, `mine` (`:48-85`) ; **ni** `unassigned`, **ni** recherche, **ni** plage de dates.

À créer (règle transverse : [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md) « Le pilotage commercial se dérive des gestes et des faits ») :

- Migration `add_first_response_to_property_contact_leads` : `first_responded_at` (timestamp), `first_responded_by_id` (FK users, `nullOnDelete`), `first_response_channel` (string(16)).
- Migration `add_last_contacted_at_to_customers` : `last_contacted_at` (timestamp, indexé avec `agency_id`).
- `POST /api/contact-leads/{lead}/contacts` et `POST /api/customers/{customer}/contacts` (`StoreContactGestureRequest` : `channel` ∈ `whatsapp`, `call`, `email`, `sms`) : écrit une entrée du journal d'activité (`event = contacted`, `properties.channel`), pose `first_responded_*` au premier geste sur une demande, et `last_contacted_at` sur la fiche (celle de la demande si elle est convertie). Réponse 204.
- `last_contacted_at` est aussi avancé par une note créée, une visite terminée et un compte rendu (TCK-2578).
- Filtres de `GET /api/contact-leads` : `filter[unassigned]=1` (sans destinataire, ou destinataire hors du personnel actif), `filter[search]` (nom, téléphone, e-mail, message), `filter[created_at_max]` / `filter[created_at_min]`, `filter[responded]=0|1` ; tri `created_at` dans les deux sens.
- `GET /api/contact-leads/response-stats?period=30` (personnel détenteur de `crm.view_all`) : délai médian de première réponse de l'agence et par agent, nombre de demandes ouvertes sans réponse depuis plus de 24 h, par agent.

## Contraintes strictes (métier)

- **Décision 3b de l'audit** : un geste de contact **ne marque pas** la demande traitée ; `handled_at` reste posé par « Marquer traitée », la conversion ou la visite (TCK-2582).
- **Décision 7a** : le délai par agent est montré à l'admin ; un agent sans `crm.view_all` reçoit 403 sur `response-stats` et ne lit jamais le délai de ses collègues.
- Un geste sur une demande d'une autre agence : 403 (policy `PropertyContactLeadPolicy::contact`, même règle que la lecture de la boîte) ; sur une fiche : `CustomerPolicy::update`.
- Le délai se mesure en temps calendaire (pas en heures ouvrées) ; l'API rend la mesure brute, la présentation est au front.
- Le journal ne porte aucune coordonnée (le canal seul) : rien de neuf pour l'export de données personnelles.

## Delta à produire

- [ ] Deux migrations ; `ContactGestureService` (journal + colonnes dénormalisées, idempotent sur la première réponse).
- [ ] Routes `contact-leads/{lead}/contacts`, `customers/{customer}/contacts` ; `StoreContactGestureRequest` ; méthodes de policy.
- [ ] `last_contacted_at` avancé par `CustomerNoteController::store`, la complétion de visite et le compte rendu.
- [ ] Filtres `unassigned`, `search`, `created_at_min/max`, `responded` sur `PropertyContactLead` ; `first_responded_at` dans `$queryFields`.
- [ ] `ContactLeadResponseStatsService` + route `contact-leads/response-stats`.
- [ ] `CustomerActivityFeed` : une entrée « Appel » / « WhatsApp » par geste.
- [ ] Tests : `ContactGestureTest` (premier geste pose `first_responded_*`, le second ne le déplace pas, `handled_at` inchangé), `CustomerLastContactedTest` (geste, note, visite terminée), `ContactLeadInboxFiltersTest` (quatre filtres), `ContactLeadResponseStatsTest` (médiane sur un jeu connu, 403 sans `crm.view_all`, autre agence exclue).

## Critères d'acceptation

- [ ] AC1 (rouge sur `1bce3798a`) — Un geste `whatsapp` sur une demande reçue à 08:00 et posté à 09:30 donne `first_responded_at = 09:30` ; un second geste à 11:00 ne change rien ; `handled_at` reste `null`.
- [ ] AC2 — Après le geste, la fiche convertie de la demande a `last_contacted_at = 09:30`, et son flux d'activité porte une ligne « WhatsApp ».
- [ ] AC3 (rouge sur `1bce3798a`) — `filter[unassigned]=1` rend la demande sans destinataire et celle d'un agent désactivé, pas celle d'un agent actif ; `filter[search]=garant` trouve la demande dont le message contient « garant ».
- [ ] AC4 — Trois demandes répondues en 1 h, 3 h et 10 h par le même agent : `response-stats` rend une médiane de 3 h pour cet agent ; une demande ouverte depuis 30 h sans geste compte dans « > 24 h ».
- [ ] AC5 — Un agent sans `crm.view_all` : 403 sur `response-stats` ; un agent d'une autre agence : 403 sur le geste.
- [ ] Ablations consignées (AC1, AC4).

## Hors périmètre

- Savoir si le message WhatsApp a vraiment été envoyé : le geste est l'ouverture de l'application, c'est ce que la mesure compte (l'ADR le dit).
- Les écrans (TCK-2584, TCK-2589, TCK-2596).
- Les délais d'étape du pipeline (TCK-2591).

## Notes d'implémentation

**Re-mesure (2026-11-11, branche `feat/audit-ux-app-lot-1`)** — la prémisse tient : ni première réponse
sur la demande, ni dernier contact sur la fiche, ni filtre `unassigned` / `search` / plage de dates.
Écarts relevés :

- `filter[created_at_min|max]` passe par `RangeFilter`, qui juge la borne selon le **cast** de la
  colonne : sans `'created_at' => 'datetime'` dans `$casts`, une date rendait 422 (règle `numeric`).
  Le cast est ajouté au modèle (ablation `cast-created-at` : rouge).
- La conversion d'une demande pose déjà `handled_at` : la demande convertie d'AC2 est « traitée »
  avant le geste ; le geste n'y change rien et avance quand même la fiche.
- Les deux migrations avaient déjà été jouées sur la base de démo par un `migrate` voisin.

**Choix faits** :

- Un seul écrivain des colonnes dénormalisées : `App\Services\Crm\ContactGestureService`
  (`onLead`, `onCustomer`, `touchCustomer`). La première réponse se pose sous verrou de la ligne
  puis `whereNull('first_responded_at')` ; `last_contacted_at` n'avance que vers l'avant, par la
  requête (`toBase()`) : ni entrée `updated` au journal de la fiche, ni `updated_at` touché.
- Le geste écrit une entrée `activity_log` `event = contacted`, `properties = {channel}` et rien
  d'autre, sur la demande ou la fiche. Le journal de la fiche (`CustomerActivityFeed`) rend aussi
  les gestes posés sur sa demande convertie (`subject: lead`), avec `channel`.
- Note (`CustomerNoteController::store`), visite terminée (`PropertyVisitController::complete`) et
  compte rendu (`VisitReportService::write`) appellent `touchCustomer`.
- Filtres : `responded` et `unassigned` vivent dans `App\Services\Crm\ContactLeadInboxFilters`
  (branchés par une ligne dans `PropertyContactLead::getAllowedQueryFilters()`). `unassigned` =
  sans destinataire, ou destinataire qui n'est plus personnel actif et joignable de l'agence de la
  demande (même définition que `filter[assignable]` des membres) ; une demande sans agence n'est
  orpheline que sans destinataire.
- `response-stats` (`ContactLeadResponseStatsService`) : demandes du **formulaire** de l'agence,
  déposées dans la période (`period`, 30 j par défaut, 1-365) ; médiane `percentile_cont(0.5)` en
  secondes, brute, `null` sans réponse. « Ouvertes depuis plus de 24 h » = ni répondues ni
  traitées, déposées il y a plus de 24 h, **sans borne de période** (un état courant), rangées sous
  leur destinataire. Le super-admin nomme l'agence par `agency_id` (requis pour lui).
- `CustomerResource` rend `last_contacted_at`, triable (`sort=-last_contacted_at` : sous
  PostgreSQL, les fiches jamais contactées viennent en tête d'un tri descendant).
- Pas d'index sur `first_responded_by_id` (piège n° 8 : à poser sur mesure).

**Tests** : `tests/Feature/Crm/{ContactGestureTest,CustomerLastContactedTest,ContactLeadInboxFiltersTest,ContactLeadResponseStatsTest}.php`
— 19 tests verts ; voisins verts (`ContactLeadInboxTest`, `ContactLeadConvertTest`,
`PropertyContactLeadTest`, `PropertyContactClickTest`, `CustomerActivityEndpointTest`,
`CustomerNoteTest`, `PropertyVisitReportTest`, `VisitReportPrivacyTest`, `DateInventoryByValueTest`,
`AuthorizationPrecedesValidationTest`, `ImpersonationReadSweepTest`, `ValeursEnListe*`…).

**Ablations (23, toutes rouges sans le correctif, restaurées et prouvées par md5)** : première
réponse idempotente (AC1) ; médiane remplacée par une moyenne, demandes traitées ou de moins de
24 h comptées ouvertes, clics comptés, autre agence comptée (AC4) ; policy des statistiques et du
geste, demande comme fiche (AC5) ; fiche de la demande convertie non avancée, geste de la demande
absent du journal, canal absent (AC2) ; note, visite terminée, compte rendu ; dernier contact qui
recule ; `updated_at` touché ; `unassigned` sans la branche « désactivé » ou sans `active()` ;
`responded` lu sur `handled_at` ; filtres non branchés ; recherche sans le message ; cast de
`created_at` retiré (AC3).
