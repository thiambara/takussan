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

### Re-mesures du 2026-11-04 (pages réelles relevées le jour même, jamais copiées dans le dépôt)

- **CoinAfrique porte un JSON complet de l'annonce** dans l'attribut `data-ad` de `div#ad-details` (entités HTML) :
  `title`, `description`, `price` (entier), `currency` (`CFA`), `address` (« Thies, Sénégal »), `date_creation` (ISO),
  `images[].normal` (la galerie entière, 9 sur l'annonce relevée), `phone`, `re_offer_type` (`sell`/`rent`), `re_room`
  (**pièces**, pas chambres : la page l'affiche « Nbre de pièces »), `re_bathroom`, `re_surface`, `category.name`,
  `user.{name, is_pro, member_since, published_ads, whatsapp_phone}`. L'adaptateur le lit d'abord ; le DOM est le repli
  (galerie `div.slider .swiper-slide.slide-clickable[style*=background-image]` — la dernière diapositive est un appel à
  l'action qui reprend la vignette `thumb_` de la première —, `p.price`, `h1.title-ad`, `span[data-address]`,
  `.ad__info__box-descriptions p` hors `p.title`, `p.username`, `img.icon-pro`, `p.nb-ads`).
- **Numéros de CoinAfrique** : `tel:+221…` (×3), `data-phone-number` (×4), `data-mobile` **sans indicatif** (`77…`),
  `wa.me/+221…` (×3), `web.whatsapp.com/send?phone=+221…` (×4), `sms:+221…`. Le numéro du **service** de CoinAfrique
  (`tel:+221 765694843`, bandeau « Veuillez contacter ces numéros suivants ») est sur la page de **liste**, pas sur celle
  de l'annonce ; il est déclaré exclu quand même. Aucun JSON-LD sur la page d'annonce de CoinAfrique.
- **Expat-Dakar** : `Organization.telephone` **et** `contactPoint[].telephone` valent `+221 76 6448613` (le second
  aussi est à écarter). Le numéro de l'annonceur : `a.listing-item-contact__contact-phone__number[href^=tel:]` (texte
  `763623458`, sans indicatif), `whatsapp://send?abid=%2B221…&phone=%2B221…` (schéma `whatsapp:`, encodé) et
  `data-whatsapp="https://wa.me/221…"` (une URL dans un attribut `data-*`). Les attributs `data-listing-card-show-phone-*`
  portent des sélecteurs CSS, pas des numéros : `RadarPhone::canonical()` les écarte.
- **Galerie d'Expat-Dakar** : `ul.gallery--main li img`, `srcset` en trois tailles ; la plus grande est
  `listing-gallery-full-1920w`. Hôte : **`i.roamcdn.net`** (confirmé). `og:image` porte des variantes
  `og-letterbox-…-wm` (filigranées) : jamais prises.
- **Date d'Expat-Dakar** : le DOM dit « Aujourd'hui, 10:06 » (relatif, = `og:updated_time`, une remontée) ;
  `ItemPage.datePublished` vaut l'heure du rendu (14:13, inutilisable). `Product.offers.validFrom`
  (« 2026-05-18 17:00:39 ») est la seule date absolue de mise en ligne : c'est `postedAt`.
- **Prix d'Expat-Dakar** : `listing_price` « 0.00 » sur l'annonce relevée (prix sur demande) → null. Aucune période de
  loyer n'est affichée sur ces sites → `rentPeriod` reste nul pour Expat-Dakar.
- **Lieu d'Expat-Dakar** : `listing-item__address-location` (« Point-e » : le quartier, ou une ville comme « Mbour ») et
  `listing-item__address-region` (« Dakar » : la RÉGION, rangée dans `city`).
- **Vendeur d'Expat-Dakar** : `.listing-item-transparency__title`, `__member-since` (« Membre depuis 17. janv. '23 »),
  `__verified__list` (« Numéro de portable »).
- **Borne de la galerie** : `radar.photos.max_per_listing` (10) est la borne du calcul des **empreintes**, qui se borne
  déjà lui-même (`RadarListing::photoFingerprintStatus()`). La galerie gardée est bornée par `HtmlCleaner::MAX_PHOTOS`
  (20), égal à `radar.photos.reserve_max` : « toute la galerie » (AC1) sans élargir ce que la réserve accepte.
- **Normalisation des numéros** : `App\Support\RadarPhone::canonical()` existe et rend `+221XXXXXXXXX` ou null.

### Mesures après implémentation (pages réelles du 2026-11-04, lues en local, jamais versionnées)

- **CoinAfrique** : `parseListing()` rend le numéro de l'annonceur (absent du texte), **9 photos sur 9**, le prix, la
  ville, 9 pièces, 4 salles de bain, 300 m², la date de création, le vendeur et 4 indices (badge pro, nombre
  d'annonces, ancienneté, nom d'entreprise). `raw_text` passe de **6 041 à ≈ 375 caractères** (titre + description).
  `HtmlCleaner` seul (repli) : 6 041 → 3 751 caractères, menu des catégories retiré, numéro récolté.
- **Expat-Dakar** : le bon numéro, jamais `+221766448613` ; **5 photos** en 1920w ; quartier « Point-e », région
  « Dakar » ; `postedAt` = `validFrom`. `raw_text` : **≈ 620 caractères** (contre 2 341).

### Décisions et écarts au Delta

- **`rooms` ajouté au DTO** (non listé) : CoinAfrique affiche des PIÈCES (`re_room`), pas des chambres ; les ranger en
  `bedrooms` serait deviner, les jeter perdrait un fait affiché.
- **`App\Services\Radar\PagePhones`** (fichier neuf, non listé) : la récolte des numéros d'attributs est partagée par
  `HtmlCleaner` et les deux adaptateurs — une seule définition de « un numéro dans un attribut ».
- **`HtmlCleaner` récolte les numéros APRÈS le retrait du bruit** (`header`, `footer`, `nav`, `form`…) : un numéro
  d'en-tête ou de pied de page est celui du site. Le JSON-LD `Organization` est lu avant (les `script` partent avec le
  bruit). Seuil des listes de navigation : ≥ 3 liens, ≥ 70 % du texte en liens, ≤ 80 caractères hors liens, du plus
  profond au plus large.
- **Page non reconnue → `HtmlCleaner`** : `parseListing()` rend null sans description ; l'extraction retombe alors sur
  le lecteur générique, dont les numéros (moins `excludedPhones()` de l'adaptateur) vont seuls dans `source_fields`
  (`{"phones": [...]}`). Les photos du repli ne sont pas filtrées par hôte (comportement d'avant, qu'un test existant
  épingle).
- **Le job écarte `excludedPhones()` de TOUS les candidats de l'annonceur** (attributs, modèle, texte) — pas seulement de
  ceux de l'adaptateur : un numéro du site cité dans une description ne devient pas un annonceur. Le refus STOP, lui,
  se juge sur tous les numéros (prudence).
- **Hors du périmètre listé, mais conséquence directe de la colonne** : `RadarPurger::eraseListing()` efface
  `source_fields` (numéros et nom du vendeur sont des données personnelles, ADR-0077 §9) ; `RadarListingReview::
  setAdvertiser()` accepte un numéro de `source_fields.phones` (sinon l'opérateur ne pouvait pas rattacher le numéro de
  CoinAfrique, absent du texte : `radar.advertiser.phone_unknown`).
- **AC4, ce que l'ablation dit exactement** : retirer la lecture des attributs dans `CoinafriqueAdapter::phones()` fait
  rougir AC1 et AC3 (8 tests). Retirer SEULEMENT la récolte générique (`PagePhones::fromDom`) rougit AC1 (variante sans
  JSON) mais laisse AC3 vert : le JSON `data-ad` de CoinAfrique redit le numéro (`phone`), et l'adaptateur le lit aussi.

### À reporter dans les specs

- `docs/models-spec.md`, `radar_listings` : `source_fields jsonb null` — ce que la page dit en clair
  (`ListingPage::sourceFields()` : `phones`, `price`, `currency`, `contract`, `property_type`, `rent_period`, `city`,
  `neighborhood`, `bedrooms`, `rooms`, `bathrooms`, `surface_m2`, `furnished`, `posted_at`, `seller_name`,
  `seller_signals`, `title`), ou `{"phones": [...]}` pour une page lue par `HtmlCleaner` ; nul pour un texte ou des
  captures ; effacé par la purge.
- `docs/features.md` §2.12 : une annonce de CoinAfrique ou d'Expat-Dakar saisie par URL est lue par l'adaptateur du
  site (numéro des attributs, galerie entière, prix, lieu, vendeur) ; le numéro lu sur la page passe devant ceux du texte
  et du modèle ; le numéro du site n'est jamais celui d'un annonceur ; la fiche rend `source_fields`.

