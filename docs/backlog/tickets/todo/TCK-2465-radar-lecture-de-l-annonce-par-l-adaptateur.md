---
id: TCK-2465
title: "Radar : l'adaptateur lit la page de l'annonce (téléphones, galerie, prix, vendeur), et le lecteur générique ne perd plus un numéro"
status: todo
phase: P2
family: back
estimate: L
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: []
blocks: [TCK-2466, TCK-2467]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, collecte, adr-0087]
---

## Objectif utilisateur

L'opérateur reçoit, pour chaque annonce collectée, le bon numéro de l'annonceur, toutes ses photos et les faits que la
page affiche, sans dépendre de l'IA pour les retrouver.

## Contexte (mesuré le 2026-11-04, ADR-0087)

- CoinAfrique : le numéro n'est que dans `href="tel:+221…"`, `data-phone-number="+221…"`, `data-mobile`, et le lien
  `web.whatsapp.com/send?phone=+221…` ; `HtmlCleaner::clean()` rend un texte **sans** ce numéro. La galerie est en
  `style="background-image:url(https://images.coinafrique.com/…)"` sur des `.swiper-slide` : une seule photo est gardée
  (`og:image`). Le texte nettoyé (6 041 car.) est surtout le menu des catégories.
- Expat-Dakar : le `dataLayer.push({...})` porte `listing_id`, `listing_price`, `listing_currency`,
  `listing_location_title`, `listing_category_slug` ; la page affiche « Vendu par <vendeur> », « Membre depuis … »,
  « Vérifié via : … », le numéro dans le texte et en `tel:`. Le JSON-LD `Organization.telephone` est le numéro **du
  site** (`+221 76 6448613`) : il ne doit jamais devenir celui de l'annonceur.

## Contraintes strictes (métier)

- **Aucun numéro du site lui-même** (organisation, service client) n'est rendu comme numéro d'annonceur. Chaque adaptateur
  déclare les numéros à écarter ; le lecteur générique écarte ceux du JSON-LD `Organization`.
- Le HTML est une DONNÉE : aucune URL de photo hors `https`, aucune URL de photo hors des hôtes d'images que l'adaptateur
  déclare (`images.coinafrique.com`, `i.roamcdn.net` pour Expat-Dakar — à re-mesurer).
- La lecture reste celle d'`UrlFetcher` (SSRF, `robots.txt`, créneau) : l'adaptateur ne lit jamais le réseau.
- Rien de deviné : une valeur absente reste nulle.
- Les numéros sont rendus au format international par `App\Support\RadarPhone` (ou l'outil de normalisation existant du
  Radar — à re-mesurer), jamais tels qu'écrits.

## Delta à produire

- [ ] DTO `App\Services\Radar\Crawl\ListingPage` (readonly) : `phones` (list), `photoUrls` (list, ordre de la galerie,
      au plus `radar.photos.max_per_listing`… re-mesurer la borne), `price` (?int XOF), `currency`, `contract`,
      `propertyType`, `rentPeriod`, `city`, `neighborhood`, `bedrooms`, `bathrooms`, `surfaceM2`, `furnished`,
      `postedAt` (?CarbonImmutable), `sellerName`, `sellerSignals` (list de `{signal, evidence}` : boutique, membre
      depuis, vérifié, « promoteur », etc.), `title`, `description` (texte de l'annonce seule, sans menu).
- [ ] Contrat `RadarSiteAdapter::parseListing(string $html, string $pageUrl): ?ListingPage` ; `ExpatDakarAdapter` et
      `CoinafriqueAdapter` l'implémentent ; `excludedPhones(): list<string>` par adaptateur.
- [ ] `RadarCrawlSources` (ou ce qui résout l'adaptateur d'un site) : retrouver l'adaptateur depuis l'URL d'une annonce
      saisie (`source_site`), pour qu'une URL saisie à la main sur ces sites passe aussi par lui.
- [ ] Migration `add_source_fields_to_radar_listings` : `source_fields jsonb null` — le `ListingPage` sérialisé (sans
      `description`, déjà dans `raw_text`). Rendue par `RadarListingResource` (champ `source_fields`).
- [ ] `ExtractRadarListing`, étape de lecture d'URL : quand un adaptateur existe pour le site, `raw_text` = titre +
      description de `ListingPage`, `photo_urls` = sa galerie, `source_fields` = le reste ; sinon `HtmlCleaner` comme
      aujourd'hui. Les numéros de `source_fields.phones` passent **en tête** des candidats de l'annonceur (avant ceux du
      texte et du modèle), et le refus STOP est jugé sur eux aussi.
- [ ] `HtmlCleaner` (lecteur générique) : récolte les numéros des liens `tel:`, des liens `wa.me` / `api.whatsapp.com` /
      `web.whatsapp.com/send?phone=` et des attributs `data-*phone*` / `data-mobile`, écarte ceux du JSON-LD
      `Organization`, et les rend dans `CleanedPage` (`phones`) ; retire aussi les listes de liens de navigation
      reconnaissables (bloc dont plus de N % du texte est fait de liens) — sans perdre la description.
- [ ] Fixtures écrites à la main (jamais une page réelle copiée) : `tests/fixtures/radar/expat-dakar-listing.html`,
      `coinafrique-listing.html`, reproduisant la STRUCTURE relevée.
- [ ] Tests : `ExpatDakarListingPageTest`, `CoinafriqueListingPageTest` (téléphone pris aux attributs, numéro du site
      écarté, galerie entière, prix, lieu, vendeur et indices), `HtmlCleanerPhonesTest`, et un test de
      `ExtractRadarListing` : « une annonce CoinAfrique saisie par URL est rattachée à l'annonceur du numéro de
      `data-phone-number` » (`Http::fake`, passerelle IA simulée).

## Critères d'acceptation

- [ ] AC1 — Sur la fixture CoinAfrique, `parseListing()` rend le numéro de l'annonceur au format international, toutes les
      photos de la galerie, et la description sans le menu.
- [ ] AC2 — Sur la fixture Expat-Dakar, le numéro du site (`Organization.telephone`) n'est jamais rendu, ni par
      l'adaptateur, ni par `HtmlCleaner`.
- [ ] AC3 — Une annonce CoinAfrique saisie par URL (`RadarListingIntake::fromUrls`) aboutit à `radar_advertiser_id` posé
      sur le numéro de `data-phone-number`, même si le modèle ne rend aucun numéro.
- [ ] AC4 — Retirer la lecture des attributs (ablation) fait rougir AC1 et AC3.

## Hors périmètre

- Ce que le modèle reçoit et le modèle choisi : TCK-2466. Le sitemap : TCK-2467.

## Notes d'implémentation

_(à remplir — écrire chaque mesure ici au fur et à mesure)_
