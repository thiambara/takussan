---
id: TCK-2387
title: "Radar : relecture d'une annonce extraite et rapprochements avec le catalogue et les autres annonces"
status: todo
phase: P1
family: full
estimate: M
wave: 80
created: 2026-10-26
updated: 2026-10-26
depends_on: [TCK-2386]
blocks: [TCK-2389, TCK-2392]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, ia, doublons, adr-0077, adr-0054]
---

## Objectif utilisateur

Un opérateur vérifie une fiche extraite en la comparant à sa source, la corrige en quelques gestes,
et sait avant tout démarchage si ce bien est déjà sur Takussan ou déjà dans le Radar.

## Contexte

Lot 1 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md) (écran 3 « Fiche annonce »),
[ADR-0077](../../adr/0077-le-radar.md). Le doublon entre courtiers est la règle sur ce marché ; la
détection entre publieurs existe déjà (ADR-0054 : `MediaFingerprint`, `DuplicateSuspicion`).

## Contrat de données

- `PATCH /api/admin/radar/listings/{listing}` — champs corrigés ; chaque champ devient une décision
  sur la `ai_suggestions` de l'extraction (TCK-2384).
- `POST /api/admin/radar/listings/{listing}/review` — valide la relecture (`reviewed`).
- `POST /api/admin/radar/listings/{listing}/duplicate` — `{of_listing_id | of_property_id}`.
- `POST /api/admin/radar/listings/{listing}/discard` — avec motif.
- `GET /api/admin/radar/listings/{listing}/matches` — rapprochements, chacun avec son signal et sa
  force : même téléphone ; même quartier, prix à ±10 %, même nombre de chambres ; empreinte dHash
  des photos source proche.

## Direction UX / Artistique

La source à gauche, la fiche à droite : l'œil va de l'une à l'autre sans chercher. Le survol d'un
champ surligne dans la source le passage qui le justifie. Les champs peu sûrs attirent l'œil, les
sûrs se font oublier. Les rapprochements sont un avertissement qu'on ne peut pas manquer, avec la
vignette et le lien de ce qui ressemble. Valider, doublon, écarter : trois gestes, au clavier aussi.

## Contraintes strictes (métier)

- **L'empreinte dHash des photos source est calculée à la volée et la photo n'est pas conservée** :
  ni sur disque, ni en base, ni dans les médias. Seule l'empreinte reste. Le téléchargement passe
  par le `UrlFetcher` de TCK-2386 (SSRF compris).
- La comparaison d'empreinte réutilise le seuil et l'algorithme d'ADR-0054, sans les recopier.
- Une annonce `reviewed` exige un type, un contrat, un prix et un quartier rattaché au référentiel.
- Droits : `platform.radar.operate`.
- Prise en charge : hors de ce ticket (elle porte sur l'annonceur, TCK-2388).

## Delta à produire

- [ ] `App\Services\Radar\RadarMatcher` (les trois signaux, contre `properties` et
      `radar_listings`).
- [ ] `App\Services\Radar\SourcePhotoFingerprinter` (télécharge, calcule l'empreinte, jette).
- [ ] Colonne d'empreintes des photos source sur `radar_listings` (migration
      `add_source_photo_hashes_to_radar_listings_table`).
- [ ] Actions du contrôleur `RadarListingController` (ou contrôleurs dédiés) ;
      FormRequests `UpdateRadarListingRequest`, `ReviewRadarListingRequest`,
      `MarkRadarListingDuplicateRequest`, `DiscardRadarListingRequest`.
- [ ] Front : fiche annonce (source, champs, confiance, passages, rapprochements, trois actions).
- [ ] Tests : `RadarMatcherTest` (chaque signal seul, contre un bien et contre une annonce),
      `SourcePhotoFingerprinterTest` (aucun fichier laissé derrière), `RadarListingReviewTest`
      (suggestion `edited` et différentiel ; refus d'une relecture incomplète).

## Critères d'acceptation

- [ ] AC1 — Corriger le prix d'une fiche passe sa suggestion en `edited` avec le différentiel ; ne
      rien corriger et valider la passe en `accepted`.
- [ ] AC2 — Un bien publié avec le même téléphone, ou au même quartier, prix à ±10 % et même nombre
      de chambres, apparaît dans les rapprochements avec son signal.
- [ ] AC3 — Une photo source proche (dHash) d'une photo d'un bien publié est signalée.
- [ ] AC4 — Après le calcul d'empreinte, aucun fichier de photo source ne subsiste (disque
      temporaire et médias vérifiés).
- [ ] AC5 — Valider la relecture sans quartier rattaché rend 422.

## Hors périmètre

- La fusion de doublons entre sources collectées automatiquement (TCK-2392).
- La similarité de texte par embeddings (TCK-2392).

## Notes d'implémentation

_(à remplir par implementing-specs)_
