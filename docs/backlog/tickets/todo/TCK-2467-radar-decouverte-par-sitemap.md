---
id: TCK-2467
title: "Radar : une source découvre ses annonces par le sitemap du site, ne relit que le neuf et le modifié, et voit les disparues"
status: todo
phase: P2
family: back
estimate: M
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2465, TCK-2468]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, collecte, adr-0087]
---

## Objectif utilisateur

Le Radar connaît tout l'inventaire d'un site, chaque jour, en quelques requêtes, au lieu de 20 pages de liste.

## Contexte (mesuré le 2026-11-04)

`https://www.expat-dakar.com/robots.txt` déclare `sitemap-listings-index-fr.xml` ; les catégories immobilières ont chacune
`sitemap-listings-<catégorie>-fr.xml` (`appartements-a-louer` : 1 496 `<url>`, 516 Ko, `<lastmod>` et `<image:loc>` par
annonce). Catégories relevées : appartements-a-louer, appartements-a-vendre, appartements-meubles, chambres-a-louer,
maisons-a-louer, maisons-a-vendre, terrains-a-vendre, proprietes-commerciales-a-louer, proprietes-commerciales-a-vendre
(et promoteurs-immobiliers, services-agence-immobiliere, à écarter). CoinAfrique : un sitemap unique de 6,5 Mo sur S3,
toutes catégories mêlées — **pas de découverte par sitemap pour CoinAfrique** (listes, comme aujourd'hui).

## Contraintes strictes (métier)

- Chaque sitemap est lu par `UrlFetcher` (SSRF, `robots.txt`, créneau par domaine, `max_bytes`) ; un sitemap plus gros que
  `max_bytes` est refusé et le passage le dit (jamais tronqué en silence).
- Le filtre des cibles (TCK-2468) s'applique à une URL neuve : la catégorie du sitemap donne type et contrat.
- **Plafond d'URL neuves saisies par passage** : `radar.crawl.max_new_per_run` (200) ; le reste attend le passage suivant.
- Une annonce déjà relue ou publiée n'est jamais ré-extraite par l'IA : une relecture met à jour `source_fields` et ouvre
  un instantané si le prix change (`RadarSnapshots`).
- Ce qui est réduit au silence (`RadarSnapshots::silenced()`) n'est ni relu ni compté.

## Delta à produire

- [ ] `RadarSiteAdapter::sitemapUrls(): list<string>` (vide = pas de sitemap) et `sitemapCategory(string $sitemapUrl):
      array{type:?string, contract:?string}` ; Expat-Dakar les déclare, CoinAfrique rend `[]`.
- [ ] Migration `add_discovery_to_radar_crawl_sources` : `discovery` string (`lists` | `sitemap`), défaut `sitemap` quand
      l'adaptateur en déclare, sinon `lists` ; réglable par `PATCH …/crawl/sources/{site}` (`platform.radar.publish`).
- [ ] Migration `add_source_lastmod_to_radar_listings` : `source_lastmod timestamptz null`.
- [ ] `RadarCrawler` : marche par sitemap (lecture XML sans réseau ni entités externes — `LIBXML_NONET`, pas
      d'`XXE`) ; URL neuve → cible → saisie ; `lastmod` plus récent → job `RefreshRadarListing` (lit la page par
      l'adaptateur, met à jour `source_fields`, `source_lastmod`, l'instantané) ; une lecture complète de tous les sitemaps
      = `reached_end`, périmètre = la liste triée des sitemaps (l'observatoire juge les disparues comme aujourd'hui,
      ADR-0083, `RadarSourceWatch`).
- [ ] Tests : `RadarSitemapCrawlTest` (URL neuve saisie, `lastmod` inchangé ignoré, changé relu sans IA, plafond d'URL
      neuves, sitemap trop gros refusé, XML avec entité externe refusé), et la disparition après deux lectures complètes.

## Critères d'acceptation

- [ ] AC1 — Un passage sur un sitemap semé de 3 URL (dont 1 connue au même `lastmod`) saisit 2 annonces et n'en relit aucune.
- [ ] AC2 — Une URL connue dont le `lastmod` avance est relue sans appel au modèle, et un prix changé ouvre un instantané.
- [ ] AC3 — Une URL absente de deux lectures complètes est déclarée disparue ; absente d'une lecture coupée, non.
- [ ] AC4 — Au-delà de `max_new_per_run` URL neuves, le reste n'est pas saisi par ce passage.

## Hors périmètre

- Le sitemap de CoinAfrique (fichier global de 6,5 Mo).

## Notes d'implémentation

_(à remplir)_
