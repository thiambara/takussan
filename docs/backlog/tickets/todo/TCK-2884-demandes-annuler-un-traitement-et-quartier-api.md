---
id: TCK-2884
title: "API des demandes : annuler un traitement (« dé-traiter ») et servir le quartier du bien demandé"
status: todo
phase: P1
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2885]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#67-propertycontactlead-"
tags: [back, leads, crm, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent qui a marqué une demande traitée par erreur la remet à traiter d'un geste « Annuler » ; il lit dans la boîte le quartier du bien demandé.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-demandes e0, e2, e3). Le toast « Marquée traitée · Annuler » (e2) et « Demande traitée. · Annuler » (e3) avaient été écartés faute de route API ; le porteur veut tout. La ligne de la boîte ne lit que `property.title` (`LigneDeDemande.tsx:41`) : `PropertyContactLead::$requestLoadable` ne contient que `property` et `recipient`.

## Contrat de données

- `POST /api/contact-leads/{lead}/unhandle` (neuf).
- `include=property.address` (ou `property` qui porte `neighborhood`) sur `GET /api/contact-leads` et `/{lead}`.

## Contraintes strictes (métier)

- [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md) : « répondre ne vaut pas traiter » — dé-traiter n'efface aucun geste de contact ni la première réponse.
- Dé-traiter : même autorisation que `handle` ; seulement une demande traitée ; remet `handled_at` et `handled_by_id` à `null` ; journalisé ; une demande convertie en fiche reste rattachée à sa fiche (le traitement seul est annulé).
- Le quartier seul est servi dans la boîte (pas la rue) ; même lecture que la demande.

## Delta à produire

- [ ] `ContactLeadController::unhandle` + `ContactLeadService::unhandle` + route `contact-leads.unhandle`.
- [ ] `PropertyContactLead::$requestLoadable` : `property.address` ; vérifier que `PropertyContactLeadResource` sert `property.address.neighborhood`.
- [ ] Tests : `ContactLeadUnhandleTest` (remet à traiter, 422 sur une non traitée, 403 pour qui ne peut pas traiter, gestes conservés), `ContactLeadNeighborhoodTest` (une requête pour la page, quartier présent).

## Critères d'acceptation

- [ ] AC1 — Une demande traitée, dé-traitée par son destinataire, revient dans `filter[handled]=0` ; ses gestes de contact restent.
- [ ] AC2 — Dé-traiter une demande non traitée rend 422 ; un agent qui ne la lit pas reçoit 403.
- [ ] AC3 — `GET /api/contact-leads?include=property.address` rend le quartier de chaque bien, sans requête par ligne.

## Hors périmètre

- L'écran (TCK-2885).

## Notes d'implémentation

2026-11-15 — livré.

- **Dé-traiter** : `POST /api/contact-leads/{lead}/unhandle` (`contact-leads.unhandle`) →
  `ContactLeadController::unhandle` → `ContactLeadService::unhandle`. Même `HandleContactLeadRequest`
  que `handle` (403 avant tout 422 : l'intrus n'apprend rien de l'état). Sous `lockForUpdate` :
  422 `lead.not_handled` si `handled_at` est nul, sinon `handled_at`/`handled_by_id` à `null`, et une
  entrée du journal `event = lead_unhandled` (causer = l'acteur, `properties.handled_by_id` = qui
  l'avait traitée). `customer_id` et `first_responded_*` ne sont pas touchés. Réponse : la demande
  (`data`), comme `handle`.
- **Quartier** : `include=property.address` sur `GET /api/contact-leads` ; `show` charge
  `property.address` d'office. La ressource émet `property.address = {neighborhood}` (jamais la rue),
  seulement si la relation est chargée : `include=property` garde sa forme d'avant (pas de clé `address`).
- **Écarts au ticket** :
  - L'include n'est pas dans `$requestLoadable` (qui ne nomme que les relations du modèle, confronté
    à la ressource par `RequestLoadableEmittedTest`) mais ajouté par `getAllowedQueryIncludes()`, comme
    `CommissionEntry` (`lease.property`, TCK-2661).
  - **Pas de `fields[…]` pour l'adresse** (pour TCK-2885) : `fields[addresses]` rend 400 (non autorisé),
    spatie nommerait la clé `fields[property.addresses]`, et un `select` partiel sur un `morphOne` qui
    omet `addressable_id` rendrait `address: null` sans erreur. L'adresse se charge entière (une ligne
    par bien, en une requête groupée) ; seule `neighborhood` sort. La requête de la console reste
    `fields[property_contact_leads]=…&fields[properties]=id,title,slug&include=property.address,recipient`.
- **Mesures** : `ContactLeadUnhandleTest` (4) et `ContactLeadNeighborhoodTest` (3) verts ; 6 ablations
  rouges une à une (remise à null, 422, journal, quartier émis, lecture par ligne, `show`), restaurées
  au md5. Requêtes : 21 pour 2 lignes comme pour 5 (après un appel à blanc : la résolution des
  capacités est mémorisée au premier appel).
- Libellés : `lead.not_handled` (lang fr/en/wo, wo en français) ; `admin.audit.events.lead_unhandled`
  (« Demande remise à traiter »).
- Gardes : `RequestLoadableEmittedTest`, `LangGroupParityTest`, `ImpersonationReadSweepTest`,
  `DateInventoryByValueTest`, les trois classes d'architecture et `ContactLeadInboxTest` verts ; gardes
  racine vertes. `ValeursEnListeParcoursDesRoutesTest` rouge, mais pas à cause de ce ticket : la route
  `api/export/{entity}/count` de TCK-2866 n'est pas dans `HORS_PARCOURS` (ligne attendue :
  `'api/export/{entity}/count' => '{entity} : sans liaison de modèle',`).
- Les lecteurs du journal d'une demande (`CustomerTimeline::contacts`, `CustomerActivityFeed`)
  filtrent sur `event = contacted` : `lead_unhandled` n'y est pas compté comme un geste.
