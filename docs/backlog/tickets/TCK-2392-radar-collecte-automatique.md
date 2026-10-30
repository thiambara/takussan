---
id: TCK-2392
title: "Radar lot 2 : collecte automatique planifiée (Expat-Dakar, CoinAfrique), instantanés datés et fusion des doublons entre sources"
status: doing
phase: P2
family: full
estimate: XL
wave: 80
created: 2026-10-26
updated: 2026-10-30
depends_on: [TCK-2387]
blocks: [TCK-2393]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, collecte, pgvector, adr-0077, adr-0076]
---

## Objectif utilisateur

La liste à démarcher se remplit pendant la nuit : le Radar trouve lui-même les nouvelles annonces,
suit leurs changements de prix, et ne présente qu'une fiche pour la même maison vue sur trois sites.

## Contexte

Lot 2 du [plan](../../plans/2026-10-26-radar-et-socle-ia.md#les-lots). Ticket de cap : il sera
découpé (un ticket par adaptateur au moins) quand le lot 1 aura éprouvé l'extraction sur de vraies
annonces. Le service de collecte séparé (Playwright) n'est envisagé que si la lecture depuis l'API
échoue face aux protections des sites.

## Re-mesure (2026-10-30, sur `origin/feat/radar-revocation-purge`)

- La chaîne du lot 1 existe : `RadarListingIntake::fromUrls()` (empreinte `url|…` de l'URL canonique,
  unique), `ExtractRadarListing` (file `ai`, `RunsOnAiQueue`, lit la page puis appelle le modèle),
  `UrlFetcher` (SSRF, `robots.txt`, créneau par domaine `radar.fetch.min_delay_seconds`),
  `RadarMatcher` (trois signaux : téléphone, quartier + prix + chambres, photo dHash).
- **L'extraction est jugée au nom de `captured_by`** (`AiAuthority::allows()` refuse un acteur nul) :
  une annonce collectée sans opérateur ne s'extrairait jamais. La collecte a donc un opérateur.
- `TCK-344` n'a pas créé la table `embeddings`, ni l'extension `vector`. `vector` n'est **pas** une
  extension de confiance (`vector.control` sans `trusted = true`) : la créer exige un superutilisateur.
  `pg_trgm` l'est (`trusted = true`). Le rôle `embedding` de `config/ai.php` n'a aucun maillon.
- Un doublon (`duplicate`) est une étape terminale, sans retour : rien ne défait un « doublon de ».
- La purge (`RadarPurger`) vide `source_url`, mais garde `content_fingerprint` : une URL purgée revue
  par la collecte reste connue et ne renaît pas.

## Delta à produire

- [ ] **Adaptateurs** (`App\Services\Radar\Crawl\`) : un par site, Expat-Dakar et CoinAfrique. Une
      page de liste → des cartes (URL d'annonce, titre, prix affiché, lieu affiché, et ce que la carte
      montre de plus : chambres, surface, catégorie) + l'URL de la page suivante. Rien d'autre : ils
      fournissent des URL à `RadarListingIntake` et des observations aux instantanés.
- [ ] **Sources** `radar_crawl_sources` : une ligne par site, **éteinte par défaut** (`enabled` faux),
      fréquence en minutes, pages lues au plus par passage, l'opérateur qui l'a allumée (au nom duquel
      l'extraction est jugée).
- [ ] **Passages** `radar_crawl_runs` : déclencheur (planifié ou manuel), statut, pages lues, cartes
      vues, annonces créées, connues, instantanés écrits, fin de liste atteinte, motif d'arrêt.
      `radar:crawl` (toutes les 15 min) met en file le passage de chaque source allumée et due ; un seul
      passage en cours par source (index unique partiel). Le job du passage est sur la **file longue**
      (`RunsOnLongQueue`) ; il lit les pages par `UrlFetcher` (SSRF, `robots.txt`, créneau par domaine)
      et attend le créneau quand il est pris.
- [ ] **Instantanés** `radar_listing_snapshots` : un état observé d'une annonce collectée (prix XOF,
      période, contrat, type, surface, chambres, quartier lu et quartier du référentiel, ville,
      empreinte du titre), avec sa plage de présence (`first_seen_at`, `last_seen_at`, `observations`).
      Un prix ou un titre changé ouvre un nouvel instantané ; sinon le passage prolonge le dernier, et
      comble ses champs vides (valeurs extraites).
- [ ] **Quatrième signal** de `RadarMatcher` : similarité de texte. Pilote remplaçable
      (`radar.similarity.driver`), défaut `trigram` : `pg_trgm` sur `radar_listings.similarity_text`
      (description extraite, sinon texte brut, replié, sans chiffres, 1 000 caractères au plus), index GIN.
      Purgé avec l'annonce.
- [ ] **Fusion** : une annonce collectée, extraite, dont un rapprochement `high` désigne une annonce plus
      ancienne d'un **autre site** avec au moins un signal du bien (photo ou lieu), devient son doublon
      automatiquement (`merged_at`, `stage_reason = radar.merge.auto`). La fiche porte ses provenances
      (elle-même et ses doublons : site, URL, première et dernière présence). Une fusion automatique se
      **défait** (`POST …/unmerge`) et n'est plus retentée.
- [ ] **Écran super-admin** : un onglet « Collecte » (sources, interrupteur et fréquence pour
      `super_admin`, lancement manuel, derniers passages) ; la fiche annonce montre ses provenances et
      le bouton « Séparer » d'une fusion automatique.

## Critères d'acceptation

- [ ] AC1 — Un passage sur une page de liste semée crée une annonce par URL nouvelle, aucune pour une
      URL déjà connue.
- [ ] AC2 — Un prix changé entre deux passages laisse deux instantanés ; un prix inchangé prolonge le
      premier (`last_seen_at`, `observations`).
- [ ] AC3 — La même annonce vue sur deux sites devient une fiche à deux provenances.
- [ ] AC4 — Sans geste du porteur, aucun passage ne part : `radar:crawl` ne met rien en file tant
      qu'aucune source n'est allumée ; une source allumée n'est relue qu'une fois sa fréquence écoulée.
- [ ] AC5 — Une page que le `robots.txt` interdit n'est pas lue ; le passage s'arrête avec le motif
      `radar.fetch.robots`.
- [ ] AC6 — Deux annonces au même texte se rapprochent par le signal `text`, sans fournisseur
      d'embeddings ; un texte différent ne rapproche rien.
- [ ] AC7 — Une fusion automatique se sépare : l'annonce revient à `extracted`, sans lien, et la
      fusion n'est plus retentée ; une fusion posée à la main ne se sépare pas par cette route.
- [ ] AC8 — Le job du passage atterrit sur la file longue, et `scripts/check-queues.mjs` est vert.

## Découpé en suites

- **TCK-2423** — le pilote d'embeddings et la table `embeddings` d'ADR-0076 § 11 (extension `vector`),
  quand un fournisseur d'embeddings sera retenu.
- **TCK-2424** — les adaptateurs suivants (autres sites d'annonces), sur le même contrat.
- **TCK-2425** — le service de collecte séparé (navigateur sans tête), si la lecture depuis l'API
  échoue face aux protections des sites.

## Hors périmètre

- Airbnb. L'observatoire du marché (TCK-2393), qui lira les instantanés.

## Notes d'implémentation

_(à remplir par implementing-specs)_
