---
id: TCK-2424
title: "Radar : des adaptateurs de collecte pour d'autres sites d'annonces, sur le contrat de TCK-2392"
status: todo
phase: P3
family: back
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-11-16
depends_on: [TCK-2392]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, collecte, adr-0077]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai, bloqué par la décision du porteur** (« plus tard », choix des sites ;
Facebook suspendu à une vérification de ses CGU). `config/radar.php:154-156` ne déclare toujours que
`expat_dakar` et `coinafrique`, et `app/Services/Radar/Crawl/` n'a que leurs deux adaptateurs.

Fermé ou changé entre-temps : les URLs de départ se règlent en console (TCK-2438, `done`) ; une
découverte par plan de site existe (`RadarSitemapReader.php`, migrations du 2026-11-04 `add_discovery_…`,
`add_scope_…`) — le contrat n'est plus seulement « une page de liste ».

- **Préalable que la décision demande en premier, jamais fait** : éprouver Expat-Dakar et CoinAfrique en
  préproduction (allumer leur ligne, lire `radar_crawl_runs`) — aucun relevé n'est consigné dans `docs/`.
- Puis un adaptateur + fixtures par site retenu.

**Décision attendue du porteur :** lever le « plus tard » ; choisir les sites suivants (CGU,
`robots.txt`) ; pour Facebook, viser seulement des pages publiques (Marketplace ?) — oui / non, après
vérification de ses CGU.

## Décision du porteur (2026-10-30)

Ordre des sites voulu : **Expat-Dakar et CoinAfrique d'abord** (déjà adaptés par TCK-2392, à éprouver en premier),
**puis Facebook**. **Configurable dans les paramètres** : ce qui est encore figé dans `config/radar.php` (l'URL de
départ de chaque site) se réglera dans la console (TCK-2438, en cours). *(2026-11-16 : TCK-2438 est
`done` — les URLs de départ se règlent en console.)*

> **Constat de la session (non vérifié juridiquement)**, à vérifier par le porteur avant tout travail sur Facebook :
> Facebook exigerait un navigateur sans tête (TCK-2425 : connexion, rendu côté client), et ses conditions
> d'utilisation interdiraient la collecte automatisée.

## Objectif utilisateur

Le Radar relève aussi les annonces des autres sites où les annonceurs publient.

## Contexte

TCK-2392 livre deux adaptateurs (Expat-Dakar, CoinAfrique) derrière le contrat
`App\Services\Radar\Crawl\RadarSiteAdapter` : une page de liste → des cartes et la page suivante.
*(2026-11-16 : s'y ajoute la découverte par plan de site, `RadarSitemapReader.php`, 2026-11-04.)*
Un site de plus = un adaptateur, sa ligne de `config/radar.php` (`crawl.sites`), ses fixtures
écrites à la main, et une valeur de `RadarSourceSite` s'il n'en a pas.

## Delta à produire

- [ ] Choisir les sites avec le porteur (conditions d'utilisation, `robots.txt`).
- [ ] Un adaptateur par site retenu, testé sur des fixtures inventées (`Http::fake`).

## Critères d'acceptation

- [ ] AC1 — Un passage sur une page de liste semée du site crée une annonce par URL nouvelle.

## Hors périmètre

- Airbnb (ADR-0077 § 10). Les groupes Facebook et WhatsApp, qui ne se lisent pas sans compte.
  *(2026-11-16 : la décision dit « puis Facebook » — seules des pages publiques, Marketplace par
  exemple, seraient visées, sous réserve des CGU de Facebook.)*

## Notes d'implémentation

_(à remplir par implementing-specs)_
