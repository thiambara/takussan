---
id: TCK-2607
title: "Ce que l'orientation enregistre : la réponse « professionnel » et une alerte sur plusieurs quartiers"
status: todo
phase: P1
family: back
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
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

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
