---
id: TCK-2607
title: "Ce que l'orientation enregistre : la réponse « professionnel » et une alerte sur plusieurs quartiers"
status: done
phase: P1
family: back
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: [TCK-2608]
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#24-recherche--filtres"
  models:
    - "docs/models-spec.md#1-user"
    - "docs/models-spec.md#23-savedsearch-"
tags: [back, onboarding, saved-search, audit-ux, app]
---

## Objectif utilisateur

Le professionnel qui choisit sa porte est reconnu comme tel ; le chercheur qui coche Mermoz, Almadies et Ngor repart avec une seule alerte qui le prévient pour ces trois quartiers.

## Contrat de données

Re-mesure sur `dev` (1bce3798a) :

- `UpdateMeRequest` : `entry_intent` ∈ `search, publish, skipped` — aucune valeur pour le professionnel.
- `SavedSearchCriteria::KEYS` : `location` (un seul quartier, filtré par `QuartierDuFiltre` + `neighborhood_key`) et `cities` (plusieurs **villes**, OU) ; **aucune clé pour plusieurs quartiers**. `PropertySearchService` lit `location` et `cities`.

À produire :

- `UpdateMeRequest` : `entry_intent` accepte `professional`.
- `SavedSearchCriteria` : clé de liste `locations` (2 à 12 quartiers, chacun ≤ 100 caractères), OU entre les quartiers, même résolution que `location` (référentiel puis clé libre) ; exclusive de `location` (les deux → 422).
- `SearchPublicPropertyRequest` : `locations` en liste à virgules ou en tableau (même forme que `cities`), pour que « Voir les N biens » ouvre la liste filtrée.
- `PropertySearchService` (et `FiltresDeLaCarte`) : filtre OU sur les quartiers listés ; `SearchJournal` la journalise comme `location` (texte libre).

## Direction UX / Artistique

Sans objet : ticket back. L'écran qui consomme ce contrat est dit dans « Hors périmètre ».

## Contraintes strictes (métier)

- `location` seul garde son comportement exact (aucun appelant ne change).
- Une alerte à `locations` envoie ses correspondances par les canaux d'aujourd'hui (`SavedSearchMatchesNotification`, WhatsApp seulement si `search_alerts.whatsapp_enabled` et la préférence du compte).
- Le vocabulaire fermé reste fermé : toute autre clé → 422 (TCK-599).

## Delta à produire

- [ ] `UpdateMeRequest` : `professional`.
- [ ] `SavedSearchCriteria` : `locations`, règles, exclusivité avec `location`.
- [ ] `SearchPublicPropertyRequest` : `locationsEnListe()` (miroir de `villesEnListe()`).
- [ ] `PropertySearchService::buildFilter`, `FiltresDeLaCarte`, `SearchJournal` : `locations`.
- [ ] Tests : `EntryIntentProfessionalTest` ; `SavedSearchLocationsTest` (création, exclusivité, 13 quartiers → 422) ; `PublicSearchLocationsTest` (Mermoz + Ngor rend les biens des deux et seulement eux, quartier libre compris).

## Critères d'acceptation

- [ ] AC1 — `PATCH /api/me {entry_intent: "professional"}` rend 200 et la valeur est relue.
- [ ] AC2 — `GET /api/public/properties?locations=Mermoz,Ngor` rend exactement l'union des résultats de `location=Mermoz` et `location=Ngor` (comparaison des identifiants).
- [ ] AC3 — `POST /api/saved-searches` avec `location` et `locations` ensemble → 422.

## Hors périmètre

- L'écran d'orientation (TCK-2608) ; le formulaire d'alerte du site public.

## Notes d'implémentation

**Re-mesure (2026-11-11, branche `feat/audit-ux-app-lot-1`)** — la prémisse tient (`entry_intent`
∈ `search,publish,skipped` ; aucune clé de plusieurs quartiers). Trois écarts :

- **AC2 vise `/api/public/properties/search`**, pas `/api/public/properties` : l'index public passe
  par `HasQueryBuilder` (`filter[…]`) et ne lit ni `location` ni `cities`. C'est `/search`
  (Meilisearch) et `/map` (PostgreSQL) qui lisent `SearchPublicPropertyRequest` ; les deux sont
  éprouvés.
- **Le front casse sans une entrée `locations` dans `SEARCH_FILTER_KEYS`**
  (`search-filters.parity.test.ts` lit les règles PHP : toute clé acceptée par le serveur doit être
  un `filtre` de la table, sinon c'est un filtre appliqué, invisible et non retirable). Ajoutée dans
  `takussan-web/src/types/search.ts`, calquée sur `cities` (liste à virgules, une puce par quartier,
  libellé `tags.quarter` existant — aucune clé i18n neuve), plus une ligne dans les inventaires de
  `SearchToolbar.test.tsx` et `FilterSidebar.place-des-filtres.test.tsx` (hors panneau, comme
  `cities`).
- **`ENTRY_INTENTS` du front** (`src/types/user.ts`) n'est pas touché : l'ajouter casserait
  `QuestionDIntention` (`Record<Exclude<EntryIntent,'skipped'>, string>`) ; c'est l'écran, TCK-2608.

**Décisions** :

- **L'URL accepte 1 à 12 quartiers, l'alerte 2 à 12.** Une puce se retire seule : avec `min:2` sur
  l'URL, retirer Ngor de « Mermoz, Ngor » ferait rendre 422 à la liste. Bornes partagées par
  `SearchPublicPropertyRequest::QUARTIERS_MAX` / `QUARTIER_LONGUEUR_MAX`.
- Exclusivité par `prohibits:criteria.location` : `location: null` + `locations` passe (le vide
  n'est pas un quartier). La modification remplace `criteria` (`fill`), la règle suffit.
- Moteur : la clause d'un quartier est extraite en `clauseDeQuartier()` (même chaîne qu'avant pour
  `location`) ; `locations` = une seule expression `((q1) OR (q2))`, donc un ET avec le reste. Carte :
  un seul `whereHas('address')`, un groupe OU par quartier.
- `FILTRES_D_UNE_FACETTE['neighborhood']` ignore aussi `locations` ; `SearchJournal` journalise
  `locations` comme `cities` (texte libre, liste triée) ; le lien « Voir les N biens » de l'alerte
  écrit `locations=Mermoz,Almadies,Ngor` (et non `locations[0]=…`).

**Tests** : `EntryIntentProfessionalTest` (3), `SavedSearchLocationsTest` (5), `PublicSearchLocationsTest`
(3 : union liste et carte — rattaché par identifiant, texte libre, témoin Médina ; combinaison ET +
facette ; bornes de l'URL) ; une ligne `locations` dans `SavedSearchCriteriaVocabularyTest` (25 clés)
et `MapFiltersParityTest`. 12 classes concernées : 178 verts. Front : les 8 fichiers qui lisent la
table, 154 verts ; `vitest related src/types/search.ts` 1508/1509, le rouge
(`SaveSearchButton.test.tsx`, 6,5 s à `load` 200) vert seul ; eslint propre.

**Ablations** (rouges, restaurées par `cp`, md5 prouvé) : sans `professional` ; sans `prohibits` ;
plafond 50 ; liste en ET (moteur) ; liste en ET (carte) ; lien en tableau ; facette qui voit la
liste ; `locations` hors vocabulaire (l'alerte capte tout).

**Reste** : `RadarDemandSignals` et `ClaimDemand` ne lisent que `location`/`cities` — une alerte à
`locations` ne nourrit pas encore la demande du Radar. Le front d'enregistrement d'une alerte
(TCK-2608) doit écrire `location` pour un seul quartier, `locations` pour deux et plus.
