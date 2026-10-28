---
id: TCK-2387
title: "Radar : relecture d'une annonce extraite et rapprochements avec le catalogue et les autres annonces"
status: doing
phase: P1
family: full
estimate: M
wave: 80
created: 2026-10-26
updated: 2026-10-28
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
- **Les numéros écartés se voient** (décision du porteur du 2026-10-27) : un numéro que le modèle
  a rendu mais que la normalisation a écarté parce qu'absent de la source
  (`extracted.phones_flags = ['evidence_not_in_source']`, TCK-2386) s'affiche dans la fiche, pour
  que l'opérateur puisse corriger l'annonceur. Aujourd'hui ce numéro **n'est pas conservé** : le
  ticket tranche s'il faut le garder (en clair, ou masqué) — c'est une donnée personnelle de plus,
  soumise à la purge (TCK-2391).
- Droits : `platform.radar.operate`.
- Prise en charge : hors de ce ticket (elle porte sur l'annonceur, TCK-2388).

## Delta à produire

- [x] `App\Services\Radar\RadarMatcher` (les trois signaux, contre `properties` et
      `radar_listings`).
- [x] `App\Services\Radar\SourcePhotoFingerprinter` (télécharge, calcule l'empreinte, jette).
- [x] Colonne d'empreintes des photos source sur `radar_listings` (migration
      `add_source_photo_hashes_to_radar_listings_table`).
- [x] Actions du contrôleur `RadarListingController` (ou contrôleurs dédiés) ;
      FormRequests `UpdateRadarListingRequest`, `ReviewRadarListingRequest`,
      `MarkRadarListingDuplicateRequest`, `DiscardRadarListingRequest`.
- [x] Conservation des numéros écartés par la normalisation (`ExtractionNormalizer::phones()`,
      `ExtractRadarListing`) selon la décision ci-dessus, et leur exposition dans
      `RadarListingResource`.
- [x] Front : fiche annonce (source, champs, confiance, passages, rapprochements, trois actions,
      numéros écartés).
- [x] Tests : `RadarMatcherTest` (chaque signal seul, contre un bien et contre une annonce),
      `SourcePhotoFingerprinterTest` (aucun fichier laissé derrière), `RadarListingReviewTest`
      (suggestion `edited` et différentiel ; refus d'une relecture incomplète).

## Critères d'acceptation

- [x] AC1 — Corriger le prix d'une fiche passe sa suggestion en `edited` avec le différentiel ; ne
      rien corriger et valider la passe en `accepted`.
- [x] AC2 — Un bien publié avec le même téléphone, ou au même quartier, prix à ±10 % et même nombre
      de chambres, apparaît dans les rapprochements avec son signal.
- [x] AC3 — Une photo source proche (dHash) d'une photo d'un bien publié est signalée.
- [x] AC4 — Après le calcul d'empreinte, aucun fichier de photo source ne subsiste (disque
      temporaire et médias vérifiés).
- [x] AC5 — Valider la relecture sans quartier rattaché rend 422.
- [x] AC6 — Un numéro que le modèle a rendu sans que la source le porte s'affiche dans la fiche,
      distinct des numéros retenus, et l'opérateur peut en faire l'annonceur.

## Hors périmètre

- La fusion de doublons entre sources collectées automatiquement (TCK-2392).
- La similarité de texte par embeddings (TCK-2392).

## Notes d'implémentation

Plan : [`docs/plans/2026-10-27-radar-tck-2387.md`](../../plans/2026-10-27-radar-tck-2387.md), huit tâches,
chacune relue (spec et qualité), puis une revue de toute la branche et un contrôle au navigateur.

**Décisions** (porteur : 1a-8a, puis 9a-13a confirmées le 2026-10-28) :

- 9a — un numéro écarté par la normalisation est gardé **en clair** dans `extracted.phones_dropped`,
  distinct de `extracted.phones` ; la fiche l'affiche à part et `PUT …/listings/{listing}/advertiser`
  permet d'en faire l'annonceur (AC6). Donnée personnelle de plus : la purge (TCK-2391) l'efface.
- 10a — les photos source s'affichent en `<img referrerpolicy="no-referrer">` direct, sans copie.
- 11a — motifs d'écart en liste fermée (`RadarDiscardReason` : `not_real_estate`, `out_of_scope`,
  `no_longer_available`, `unusable_source`, `other`).
- 12a — les rapprochements visent tous les biens vivants hors `is_test`, quel que soit leur statut.
- 13a — la suggestion de l'extraction se décide à la validation seulement : `accepted` sans
  correction, `edited` avec le différentiel sinon (AC1). Un `PATCH` ne la décide pas.
- 14a (session) — l'`input_snapshot` de la suggestion est anonymisé **à l'écriture**
  (`EvalCaseAnonymizer` : nom de l'annonceur et numéros), pas à l'export.

**Ce qui a été construit.** `RadarMatcher` (trois signaux, contre `properties` et `radar_listings`,
plafond par signal et par type de cible) ; `SourcePhotoFingerprinter` et le job
`FingerprintRadarSourcePhotos` (dHash d'ADR-0054 via `MediaFingerprint`, photo lue par `UrlFetcher`,
jamais écrite — AC4 vérifié sur le disque temporaire et les médias ; reprises [10, 60, 300] s,
`uniqueFor` 6 h) ; `RadarListingReviewController` (`update`, `review`, `duplicate`, `discard`,
`advertiser`) et `RadarListingMatchController` ; la fiche du front (source collante, champs et
confiance, passage cité surligné au survol, rapprochements, numéros écartés, trois gestes au clavier).
L'éligibilité au calcul d'empreintes est un seul prédicat, `RadarListing::fingerprintable()`.

**Comportements à connaître :**

- Ordre des verrous : annonce puis annonceur, partout (même règle que TCK-2386). Les rapprochements
  sont calculés **avant** le verrou, puis recalculés sous le verrou si `extracted`, l'annonceur ou
  `source_photo_hashes` ont changé entre-temps.
- Valider fige les rapprochements dans la fiche. **Écarter ou marquer doublon une fiche déjà
  `reviewed` les remplace** par l'instantané du moment : conforme au brief (une colonne, la dernière
  décision), relevé par la revue finale (M4) et laissé tel quel.
- Doublon : une cible déjà `duplicate` est refusée (`radar.duplicate.chain`, bouton désactivé au
  front), une cible bien de test aussi ; marquer A doublon de C repointe vers C les annonces qui
  pointaient vers A (jamais B → A → C). **Résiduel accepté** : deux gestes croisés strictement
  simultanés (A → B et B → A) ne sont pas sérialisés — console mono-opérateur, noté au docblock.
- `photoFingerprintStatus()` : `pending` seulement aux étapes où le calcul se fait ou va se faire
  (`captured`, `extracted`, `reviewed`), `done` dès que le compte est complet, `none` ailleurs — sans
  quoi la fiche relançait la route des rapprochements toutes les 10 s pour toujours.
- Une cible « annonce » dans les rapprochements n'expose ni quartier ni nombre de chambres (forme
  retenue à la tâche 5) ; le quartier d'un bien est le texte libre de son adresse, pas le nom du
  référentiel (cosmétique).
- Les codes `radar.photo.*` sont écrits photo par photo dans `source_photo_hashes` et ont leurs
  libellés au front ; aucune réponse de l'API ne les rend encore comme erreur.

**Laissé à d'autres tickets** (notes écrites dans chacun) :

- TCK-2388 — la nature présumée corrigée n'est pas recopiée dans `radar_advertisers.nature` ; le
  gestionnaire de STOP s'aligne sur `PUT …/advertiser` (même ordre de verrous, `do_not_contact`).
- TCK-2391 — la purge efface `phones_dropped`, les champs de la suggestion, et couvre une annonce
  passée `do_not_contact` par un STOP tardif (elle garde `extracted` et `raw_text`, ADR-0077 §9).
- TCK-2403 — les trois trous connus de l'anonymisation du cas d'évaluation.

**Vérification au navigateur** (2026-10-28, local : API sur :8002, front sur `localhost:3000`, sans
worker de file pour ne jamais appeler le vrai modèle ; annonce semée par fabrique, bien au même
numéro) : fiche rendue, survol du prix → passage surligné, quartier suggéré puis enregistré →
rapprochements rafraîchis (le bien passe « forte », deux signaux), à 800 px le focus ne fait plus
défiler la page, Ctrl+Entrée → `reviewed`, formulaire en lecture seule, rapprochements figés, retour
à la liste ; console sans erreur. Les deux défauts relevés (deux-points français dans les libellés
anglais, seize rapprochements qui repoussaient le formulaire de ~3 400 px) sont corrigés dans
b28113a4f. Le compte démo `super@demo.takussan.sn` porte désormais une 2FA **en local seulement**.

**Tests** : ciblés en local (classes Radar de l'API, `tests/Unit`, fichiers Vitest touchés, `tsc`,
ESLint, `check:*`, gardes racine) ; chaque correctif vérifié par ablation. Les suites entières sont
jouées par la CI de la PR.
