---
id: TCK-120
title: Formulaire "Publier un bien" — sections manquantes (adresse, médias, description, caractéristiques)
status: review
phase: P2
family: bug
estimate: L
created: 2026-04-29
updated: 2026-04-30
depends_on: [TCK-035, TCK-036, TCK-041]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
tags: [front, bug, p2, property, form]
---

## Objectif utilisateur

L'agent peut créer un bien complet depuis `/app/properties/new` en renseignant toutes les informations nécessaires à la publication.

## Contrat de données

Les endpoints backend pour adresse, médias, tags et caractéristiques sont implémentés dans TCK-035 et TCK-036. L'upload média est disponible via Spatie MediaLibrary (TCK-050). Les steps du formulaire doivent consommer :
- `POST /api/properties` (création de base — déjà câblé)
- `POST /api/properties/{id}/address` (adresse + coordonnées)
- `POST /api/properties/{id}/media` (photos)
- `PATCH /api/properties/{id}` (description, caractéristiques, tags)

## Direction UX / Artistique

Formulaire multi-étapes (wizard) : 1. Informations générales → 2. Localisation → 3. Caractéristiques → 4. Médias → 5. Récapitulatif. Cohérent avec le style des formulaires existants (RHF + Zod). Pas de prescription de composants spécifiques.

## Contraintes strictes (métier)

- Les champs obligatoires pour publication (titre, type, contrat, adresse, au moins 1 photo) doivent être validés avant soumission finale.
- Pas de publication directe — le bien passe par le workflow de modération (cf. TCK-098).
- L'upload photo utilise le composant MediaManager existant (TCK-071).

## Delta à produire

- [ ] **Section Adresse/Géolocalisation** — champs rue, quartier, ville, code postal + carte interactive pour placement du marqueur GPS (Leaflet `click` → lat/lng)
- [ ] **Section Caractéristiques** — chambres, SDB, surface (m²), année de construction, parkings, meublé (booléen)
- [ ] **Section Description** — textarea riche (ou textarea simple avec compteur de caractères)
- [ ] **Section Médias** — intégrer le composant MediaManager (drag-drop, reorder, 10 photos max)
- [ ] **Section Équipements/Tags** — sélection multiple depuis la liste de tags de l'agence
- [ ] Valider le formulaire complet avec Zod
- [ ] Tests : soumission d'un bien complet → bien créé en statut `draft` / `pending_review`

## Critères d'acceptation

- [ ] Le formulaire comporte les 5 sections : informations de base, adresse, caractéristiques, description, médias
- [ ] La soumission du formulaire complet crée bien le Property + Address + médias côté backend
- [ ] La validation côté client empêche la soumission sans les champs obligatoires
- [ ] Aucune régression sur la liste des biens `/app/properties`

## Hors périmètre

- Édition d'un bien existant (formulaire dédié à créer séparément)
- Publication directe sans modération (cf. TCK-098)
- Import CSV / MLS de biens en lot

## Notes d'implémentation

- Formulaire conservé **plat** (sections empilées) plutôt que wizard : le ticket est un bugfix, la direction wizard du Delta est aspirationnelle et constituerait une refonte UX hors périmètre.
- Pour la création, le MediaDropzone existant est conservé avec `maxFiles={10}` — le MediaManager (reorder post-upload) est réservé à la page d'édition via PropertyMediaPanel (déjà en place).
- Adresse envoyée via `PUT /api/properties/{id}/address` (upsert dédié) **après** la création, pas dans le POST initial. Idem pour les tags (`POST /api/properties/{id}/tags`).
- `UpdatePropertyRequest` ne validait pas `year_built` et `parking_spaces` (présents dans `store()` inline et `$fillable` mais omis) — corrigé.
- `PropertyDetail.location` étendu avec `street` et `postal_code` pour l'hydratation du formulaire d'édition.
- `LocationPickerMap` : composant Leaflet zero-dep (pas de `@react-leaflet` supplémentaire — utilise la lib déjà installée) chargé via `next/dynamic` (ssr: false), pattern identique au `PropertyMapLoader` existant.
- Tags amenity chargés côté serveur (page.tsx) via `fetchTagsAction` existant, passés en prop — pas de fetch client.
