---
id: TCK-2779
title: "GET /api/property-visits respecte `fields[property_visits]`, et ne rend chaque colonne sensible qu'au lecteur qui la lit"
status: todo
phase: P2
family: back
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [back, visites, sparse-fieldsets, confidentialite, suite-de-tck-2585]
---

## Objectif utilisateur

Un écran qui demande quatre colonnes de visites n'en reçoit que quatre. Aucun lecteur ne reçoit le téléphone,
l'e-mail, la fiche client ou les notes d'une visite qu'il n'a pas à lire, même quand ces champs ne lui sont pas
demandés.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 23 : ticket de suivi. Relevé par terrain-10 sur b7ada07ad.

**Constat, relu sur l'arbre du 2026-11-13.**

- La bande de semaine de « Ma journée » (b7ada07ad) demande
  `fields[property_visits]=id,scheduled_at,status,preferred_window` et reçoit 22 clés par visite.
- `PropertyVisit::buildQuery()` passe bien `fields` à spatie, qui restreint le `SELECT`. Mais
  `PropertyVisitResource::toArray()` rend une liste fixe de clés, sans lire `fields`.
- Ces clés vont de `visitor_name`, `visitor_phone`, `visitor_email`, `customer_id`, `cancellation_reason`,
  `feedback` et `rating` jusqu'à `visitor_display`, `notes` et `metadata` (sous `outilDeLaConsole`).
- Deux sortes de clés coexistent :
  - une colonne hors du `SELECT` sort à `null`, ce qui gonfle la réponse sans rien révéler ;
  - une clé **calculée** ne dépend pas du `SELECT` et peut sortir remplie : `visitor_display`, l'adresse sous
    `include=property` (`adresseLisible`), et les blocs `visitor` et `customer` sous `include=`.
- Le modèle existe déjà : `AppNotificationResource::requestedFields()` lit `fields.app_notifications`, garde `id`,
  et rend `array_intersect_key`.

**Endpoint touché :** `GET /api/property-visits`, et `GET /api/property-visits/{visit}` qui rend la même ressource.

## Contraintes strictes (métier)

- **Règle « sparse fieldsets obligatoires »** (CLAUDE.md) : la réponse ne contient que `id` et les clés demandées
  dans `fields[property_visits]`. Sans `fields`, elle reste celle d'aujourd'hui.
- **Une clé demandée n'ouvre aucun droit.** Les gardes d'aujourd'hui restent les seules juges de chaque valeur :
  `visiteurLisible` (nom, téléphone et e-mail du visiteur), `$fiche` (`customer_id`, bloc `customer`),
  `outilDeLaConsole` (`notes`, `metadata`) et `adresseLisible`. Demander `visitor_phone` ne le rend pas à un
  lecteur à qui la garde le refuse.
- **Une clé calculée suit la même règle** : `visitor_display` et l'adresse ne sortent que demandées, puis jugées.
- Les gardes ne se jugent pas sur le `SELECT` partiel. Si une garde lit une colonne que `fields` a retirée
  (`property_id`, `visitor_id`, `agent_id`…), elle la relit, comme `ficheJugeable()` de TCK-2759 r3. Un `fields`
  étroit ne doit ni ouvrir ni fermer un droit.
- Les colonnes que lit le front pour une vue se listent par la vue. Les appelants du front qui ne passent pas
  `fields` aujourd'hui ne sont pas changés par ce ticket.

## Delta à produire

- [ ] `PropertyVisitResource::requestedFields(Request)` : lecture de `fields.property_visits`, qui garde `id`
  et ne retient que les clés connues. `toArray()` rend l'intersection.
- [ ] Les gardes qui lisent une colonne absente du `SELECT` la relisent, au plus une requête par page, en passant
  par `VisitReadContext::prime`.
- [ ] Inventaire, écrit dans les notes du ticket, de chaque clé de la ressource × chaque lecteur. Les lecteurs sont
  le personnel de l'agence du bien, l'agent assigné, le bailleur du bien, le bailleur parti, le visiteur, le
  client de la fiche et le super-admin. Pour chaque case : rendu, `null`, ou absent. Le tableau est mesuré, pas
  déduit.
- [ ] Tests `VisitesChampsDemandesTest` :
  - un `fields` étroit rend exactement `id` plus les clés demandées ;
  - pour chaque lecteur, chaque clé sensible demandée explicitement sort `null` ou absente quand la garde la
    refuse ;
  - un `fields` qui retire `property_id` ne change aucun verdict.

## Critères d'acceptation

- [ ] AC1 — `GET /api/property-visits?fields[property_visits]=id,scheduled_at,status,preferred_window` rend, pour
  chaque ligne, exactement les clés `id`, `scheduled_at`, `status` et `preferred_window`.
- [ ] AC2 — Pour un lecteur à qui `visiteurLisible` refuse la visite, `fields[property_visits]=id,visitor_name,visitor_phone,visitor_email,visitor_display`
  rend ces clés à `null`, ou absentes. Le test épingle la valeur, pas seulement la présence de la clé.
- [ ] AC3 — Même chose pour `customer_id` (hors `$fiche`), et pour `notes` et `metadata` (hors outil de la console).
- [ ] AC4 — Un lecteur qui a droit au téléphone du visiteur le reçoit quand il le demande, y compris sous un
  `fields` qui ne contient ni `property_id` ni `visitor_id`.
- [ ] AC5 — Sans `fields`, la réponse est identique à celle d'avant le ticket, pour chacun des lecteurs de
  l'inventaire. C'est l'instantané des clés et des valeurs nulles.
- [ ] AC6 — Le nombre de requêtes d'une page de 20 visites sous un `fields` étroit ne dépasse pas celui d'aujourd'hui
  sans `fields`.
- [ ] AC7 — Vérifié par ablation. Une ressource qui ignore `fields` rend AC1 rouge. Une garde jugée sur le `SELECT`
  partiel rend AC4 ou AC2 rouge.

## Hors périmètre

- Les autres ressources qui ignorent `fields` (un balayage général serait un autre ticket). Pour le bail et le
  locataire, voir TCK-2780.
- Changer qui a droit à quoi : ce ticket rend la réponse fidèle aux gardes d'aujourd'hui, il ne les redéfinit pas.

## Notes d'implémentation

_(à remplir par implementing-specs)_
