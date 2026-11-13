---
id: TCK-2797
title: "Visites : la réponse ne rend que les clés de `fields[property_visits]`, et le front demande ce qu'il lit"
status: todo
phase: P2
family: back
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: [TCK-2779]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [back, front, visites, sparse-fieldsets, suite-de-tck-2779]
---

## Objectif utilisateur

Un écran qui demande quatre colonnes de visites n'en reçoit que quatre, et chaque écran demande toutes les
clés qu'il lit.

## Contrat de données

**Décision.** team-lead, 2026-11-13 : suite de TCK-2779 (option a). TCK-2779 a fermé la fuite en jugeant les
gardes sur `VisitReadContext`. Il n'a pas livré son AC1 (le filtre strict) ni la moitié de son AC7.

**Constat, relevé sur 01080e6dc pendant TCK-2779.**

- `PropertyVisitResource::toArray()` rend une liste fixe de clés, quel que soit `fields[property_visits]`. Une
  colonne hors du `SELECT` sort à `null`. La bande de semaine de « Ma journée » demande 4 clés et en reçoit 22.
- `PropertyVisit::$queryFields` ne connaît que des colonnes. Spatie refuse donc toute clé calculée :
  `fields[property_visits]=id,visitor_display` rend **400** (mesuré).
- Six appelants du front passent `fields[property_visits]` et lisent des clés qu'ils ne demandent pas. Ils
  comptent sur la liste fixe :
  - `VISIT_LIST_FIELDS` (`src/lib/queries/visits.ts`) ;
  - `VISIT_TIME_FIELDS` (`visits.ts`, par le temps et à confirmer ; repris par `src/lib/queries/accueil.ts`) ;
  - `VISIT_CLIENT_FIELDS` (`visits.ts`) ;
  - `VISITE_DE_LA_SEMAINE_FIELDS` (`src/lib/queries/journee.ts`) ;
  - `useRappelDuPersona.ts` (`id,property_id,scheduled_at,status`) ;
  - `FicheDeLaVisite.tsx` (`id,status,scheduled_at,property_id`).
- Ces appelants lisent en particulier `visitor_display` d'abord : `nomDuVisiteur` et `telephoneDuVisiteur` dans
  `components/visits/par-le-temps/pieces.tsx`. Ils lisent aussi `notes`, `report`, et des colonnes testées par
  `=== null`.
- Un filtre strict ferait passer une colonne non demandée de `null` à absente. Un test `=== null` se renverserait
  alors en silence.
- Le front lit la présence de `report` comme la garde du compte rendu (`compteRenduLisible`) et son absence de
  valeur comme « à faire » (`compteRenduAFaire`, `src/lib/visites/compte-rendu.ts`). TCK-2779 a rendu `report`
  absent quand `fields` retire `reported_at`.
- Le modèle existe : `AppNotificationResource::requestedFields()` lit `fields.app_notifications`, garde `id`, et
  rend `array_intersect_key`.

## Contraintes strictes (métier)

- **Sparse fieldsets obligatoires** (CLAUDE.md) : la réponse ne contient que `id` et les clés demandées. Sans
  `fields`, elle reste exactement celle d'aujourd'hui.
- **Une clé demandée n'ouvre aucun droit.** Les gardes de TCK-2779 restent les seules juges de chaque valeur :
  `ficheClientLisible`, `$visiteurLisible`, `outilDeLaConsole`, `adresseLisible`, `compteRenduLisible`. Elles se
  jugent sur `VisitReadContext`, jamais sur le `SELECT`.
- Les blocs de relation (`property`, `visitor`, `agent`, `customer`) suivent `include=`, pas `fields`.
- Les clés calculées (`visitor_display`, `report`, `abilities`) ne sortent que nommées dans `fields`.
- Une clé calculée qui lit des colonnes les obtient sans que l'appelant les demande. C'est le cas de `report`,
  qui lit `reported_at` et `report_*`.
- `HasQueryBuilder` est partagé par 35 modèles. Ce ticket ne le change pas.
- `fields` se lit dans la chaîne de requête (`$request->query('fields')`), pas dans `input()`.
- Back et front partent dans le **même** changement : une liste du front qui ne demande pas une clé qu'elle lit
  devient un écran vide.

## Delta à produire

- [ ] Back : `PropertyVisitResource::requestedFields(Request)`, sur le modèle de `AppNotificationResource`. Elle
  garde `id` et les seules clés connues. `toArray()` rend l'intersection quand `fields[property_visits]` est posé.
- [ ] Back : les noms virtuels (`visitor_display`, `report`, `abilities`) sont retirés de
  `fields[property_visits]` **avant** spatie (modèle ou contrôleur) ; spatie ne voit que des colonnes. La
  ressource les lit ensuite dans la chaîne de requête d'origine.
- [ ] Back : `report` demandé ajoute au `SELECT` `reported_at`, `report_*` et `reported_by_id`. Le cas « `report`
  absent faute de `reported_at` » de TCK-2779 disparaît alors.
- [ ] Front : chacun des 6 appelants demande toutes les clés qu'il lit. Les `=== null` sur une clé désormais
  absente sont relus un par un.
- [ ] Tests back : complétés dans `VisitesChampsDemandesTest`.
- [ ] Tests front : un test par liste. Il épingle que les clés lues par les composants sont dans la liste de
  `fields`.

## Critères d'acceptation

- [ ] AC1 — `GET /api/property-visits?fields[property_visits]=id,scheduled_at,status,preferred_window` rend, pour
  chaque ligne, exactement les clés `id`, `scheduled_at`, `status` et `preferred_window`.
- [ ] AC2 — `fields[property_visits]=id,visitor_display` rend 200, pas 400 ; `visitor_display` y est jugé comme
  sans `fields`.
- [ ] AC3 — Sans `fields`, la réponse est identique à celle d'avant ce ticket. On le prouve par l'instantané de
  TCK-2779 : 8 lecteurs × 4 visites × (liste, liste avec `include`, détail), clés et valeurs nulles.
- [ ] AC4 — Les refus de TCK-2779 tiennent sous le filtre : `VisitesChampsDemandesTest` reste vert, sans
  modification de ses assertions de refus.
- [ ] AC5 — Les 6 écrans rendent les mêmes visites qu'avant, en fidélité à 360 et 1280 : nom et téléphone du
  visiteur, rang (« 1re visite » / « revient »), compte rendu à faire.
- [ ] AC6 — Le nombre de requêtes d'une page de 20 visites ne dépasse pas 12. C'est le relevé de TCK-2779.
- [ ] AC7 — Vérifié par ablation :
  - une ressource qui ignore `fields` rend AC1 rouge ;
  - des noms virtuels laissés à spatie rendent AC2 rouge ;
  - chaque garde jugée sur le `SELECT` partiel rend rouge un test de refus de `VisitesChampsDemandesTest`.

## Hors périmètre

- Les autres ressources qui ignorent `fields` (bail, locataire : TCK-2780).
- Le support des champs virtuels dans `HasQueryBuilder` pour tous les modèles.
- Changer qui a droit à quoi.

## Notes d'implémentation

_(à remplir par implementing-specs)_
