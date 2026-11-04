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

### Re-mesure du 2026-11-04 (avant de coder)

- **Contexte confirmé.** `robots.txt` d'Expat-Dakar déclare `sitemap-listings-index-fr.xml` (et ne refuse pas les
  sitemaps : `Disallow` seulement sur `/cdn-cgi/`, `/admin/*`, `/compte/*`). L'index porte 97 sitemaps ; les 14 noms
  « immobiliers » sont les 9 du ticket, les 2 à écarter (`promoteurs-immobiliers`, `services-agence-immobiliere`) et 3
  faux amis (`decoration-linge-de-maison`, `emploi-vente-commercial`, `location-de-voiture`). `appartements-a-louer` :
  1 496 `<url>`, 516 632 octets, `Content-Type: application/xml` (en-tête relevé par `curl -I`), un `<lastmod>` par
  URL, 1 495 `<image:loc>` (une URL sans photo). Les autres relevés : `appartements-a-vendre` 333, `appartements-meubles`
  706, `maisons-a-louer` 381, `terrains-a-vendre` 433.
- **`UrlFetcher::fetch()` refuse tout ce qui n'est pas HTML** (`radar.fetch.not_html`) : un sitemap ne peut pas passer
  par lui tel quel. Ajouté : `UrlFetcher::fetchXml()`, même chemin protégé (`retrieve()` : SSRF, `robots.txt`, créneau,
  `max_bytes`), et le refus `radar.fetch.not_xml`. Ces deux fichiers n'étaient pas dans le périmètre annoncé ; aucun autre
  ticket en cours ne les touche.
- **`max_pages` (5 par défaut) ne peut pas borner une lecture par sitemap** : 9 sitemaps déclarés, aucune lecture ne
  serait jamais complète. Le nombre de sitemaps lus est celui que l'adaptateur déclare (dans le code) ; `max_pages`
  reste la borne des listes.
- **Les six classes de test de la collecte d'ADR-0080 (et du filtre de TCK-2468) jouent Expat-Dakar par ses listes** : une source qui passe
  `sitemap` par défaut les ferait toutes rougir (elles ne servent que des pages de liste). Elles règlent désormais
  `discovery = lists` dans `setUp()` (à côté du `scope = all` de TCK-2468 pour cinq d'entre elles).
- **Une catégorie inconnue d'Expat-Dakar répond `200 application/xml`** avec `<error><code>404</code>…</error>` (relevé
  sur `sitemap-listings-categorie-inexistante-fr.xml`). Un lecteur qui accepterait tout XML bien formé lirait une
  catégorie renommée par le site comme VIDE, et l'observatoire déclarerait disparues toutes ses annonces au bout de
  deux passages. Le lecteur exige la racine `<urlset>` ; tout autre document coupe la lecture
  (`radar.crawl.sitemap_invalid`). Les quatre catégories non relevées par le ticket portent chacune des annonces
  (`chambres-a-louer` 88, `maisons-a-vendre` 276, `proprietes-commerciales-a-louer` 177, `-a-vendre` 29).

### Décisions d'implémentation

- **`discovery` est NULLABLE** (null = le défaut de l'adaptateur, `RadarCrawlDiscovery::effective()`) : le défaut dépend
  du code de l'adaptateur, pas de la base ; Expat-Dakar passe au sitemap au déploiement sans réécriture de lignes.
  `PATCH` accepte `sitemap`, `lists` ou `null` (retour au défaut) ; `sitemap` sur CoinAfrique → 422
  `radar.crawl.discovery_unavailable`. `RadarCrawlSourceResource` rend la valeur EFFECTIVE (`discovery`) et
  `sitemap_available`.
- **`source_lastmod` est un `timestamp`, pas un `timestamptz`** : aucune colonne du dépôt n'est en `timestamptz`, et la
  connexion PostgreSQL ne fixe pas de fuseau de session (l'application écrit et relit en UTC). Même écart que TCK-2468.
- **Une présence au sitemap ne compare rien** (`RadarSnapshots::present()`, neuf) : le sitemap ne dit pas le prix ;
  `observe()` remplacerait ce prix absent par celui de l'extraction, qui contredirait celui d'une relecture plus récente,
  et rouvrirait un instantané à chaque passage. Un changement ne s'ouvre que par une lecture de la page
  (`RefreshRadarListing` → `observe()`). Ablation : `observe()` à la place de `present()` fait rougir AC2.
- **Référence d'une annonce jamais vue dans un sitemap** : `source_lastmod` nul → la date de saisie (`created_at`).
  Sans cela, le premier passage par sitemap relirait toutes les annonces déjà collectées par les listes (≈ 3 300 pages).
  Un `lastmod` antérieur à la saisie devient la référence sans relecture.
- **Une annonce encore `captured` n'est jamais relue** : son extraction lira la page. Limite connue : si son `lastmod`
  avance entre la saisie et la lecture par l'extraction, elle sera relue une fois de trop (sans IA) au passage suivant —
  `ExtractRadarListing` (hors périmètre, TCK-2466) ne pose pas `source_lastmod`.
- **Les relectures partent à la fin du passage**, après la lecture des sitemaps : elles prennent le créneau du même
  domaine. File par défaut, `ShouldBeUnique` par annonce, `$timeout` 85 s (ADR-0078).
- **La relecture ne touche ni `raw_text`, ni `extracted`, ni `photo_urls`, ni l'étape**, et ne compare pas le TITRE
  (celui d'une carte de liste et le `h1` de la page ne s'écrivent pas pareil) : seul le prix ouvre un instantané, comme
  le dit le ticket. Un numéro de la page qui a dit STOP n'est pas gardé dans `source_fields.phones`. Une page refusée ou
  méconnaissable ne pose pas `source_lastmod` : le passage suivant la remet en file.
- **Plafond `max_new_per_run`** : par passage SITEMAP seulement (les listes sont bornées par `max_pages` ≤ 20). Les URL
  neuves sont saisies **les plus récentes d'abord** (`lastmod` décroissant, sans date à la fin). Le plafond ne coupe pas
  la lecture (`reached_end` reste vrai, arrêt `radar.crawl.end`) : les URL écartées ne sont pas des annonces, toutes les
  connues ont été vues. Elles ne sont pas comptées dans `cards_skipped` (réservé à l'écart de cible) ; aucun compteur
  dédié (il demanderait une colonne de `radar_crawl_runs` et l'écran de TCK-2469).
- **Lecture coupée** : un sitemap refusé (`radar.fetch.*`, dont `too_large` et le neuf `not_xml`), illisible
  (`radar.crawl.sitemap_invalid`, constante `RadarCrawler::STOP_SITEMAP_INVALID`) ou VIDE (`radar.crawl.no_cards`) ne
  coupe pas le passage — les autres sitemaps sont lus et leurs annonces observées — mais `reached_end` reste faux et
  l'arrêt est celui du premier sitemap fautif. Le domaine pris et le budget de temps arrêtent le passage.
- **Sécurité XML** : document refusé dès qu'il porte `<!DOCTYPE` ou `<!ENTITY` (avant l'analyse), puis analyse
  `LIBXML_NONET` sans `NOENT`/`DTDLOAD`/`PARSEHUGE`, puis refus d'un `doctype` résiduel. URL d'annonce : `https`, sans
  port ni identifiants, sur l'hôte du sitemap. Les sitemaps déclarés par l'adaptateur sont refiltrés sur
  `startHosts()`.
- **Fichiers hors du périmètre annoncé** : `UrlFetcher` (+ `fetchXml()`, `isXml()`) et `RadarFetchRefused` (+ `NOT_XML`),
  par ajout ; `RadarSitemapReader` et `SitemapEntry` (le lecteur neuf) ; l'enum `RadarCrawlDiscovery`. Six classes de
  test de la collecte par listes règlent `discovery = lists` (une ligne chacune).

### À reporter dans les specs (session)

- `docs/features.md` § 2.12 (Radar, collecte) : une source découvre par **sitemap** (défaut d'un site dont l'adaptateur
  en déclare : Expat-Dakar, 9 catégories) ou par **listes** (CoinAfrique) ; réglage `discovery` dans la console
  (`PATCH …/crawl/sources/{site}`, `platform.radar.publish`) ; URL neuve → cible → saisie, au plus
  `radar.crawl.max_new_per_run` (200) par passage, les plus récentes d'abord ; `lastmod` qui avance → relecture de la
  page sans IA (`source_fields`, instantané si le prix change) ; disparition après deux lectures COMPLÈTES de tous les
  sitemaps (un sitemap refusé, illisible ou vide rend la lecture incomplète).
- `docs/models-spec.md` : `radar_crawl_sources.discovery` (string 20, nullable : null = défaut de l'adaptateur ;
  `sitemap` | `lists`) ; `radar_listings.source_lastmod` (timestamp nullable : `<lastmod>` du sitemap à la dernière
  lecture de la page).

### À dire à TCK-2469 (console, front)

- Nouveaux codes à traduire : arrêt `radar.crawl.sitemap_invalid` (`ARRETS_COLLECTE_RADAR`), refus de lecture
  `radar.fetch.not_xml` (`MOTIFS_RADAR`), erreur `radar.crawl.discovery_unavailable` (`ERREURS_COLLECTE_RADAR`).
- `RadarCrawlSourceResource` rend `discovery` (`sitemap`|`lists`, effective) et `sitemap_available` ; en `sitemap`, les
  URL de départ et le plafond de pages ne sont pas lus (le formulaire peut le dire).

### Vérification

- `RadarSitemapCrawlTest` (17), `RadarSitemapReaderTest` (7), `RadarCrawlDiscoveryApiTest` (4) ; chaque AC et chaque
  garde-fou ablaté (26 ablations, toutes rouges après correction d'un test qui restait vert : la seconde relecture au même
  `lastmod` était différée par le créneau du domaine, pas par la garde). Deux gardes XML se couvrent l'une l'autre (le
  refus de `<!DOCTYPE` avant l'analyse et celui d'un `doctype` après) : chacune seule reste verte, les deux retirées
  rougissent ; `LIBXML_NOENT` sans les gardes rougit aussi.

**Revue adverse (2026-11-04)** — (D4) les relectures d'un passage par sitemap ont un plafond,
`radar.crawl.max_refresh_per_run` = 300, les `lastmod` les plus récents d'abord ; le reste attend le passage suivant (sa
référence `source_lastmod` n'a pas avancé). La console lit `max_new_per_run` sur la source (`RadarCrawlSourceResource`),
`RADAR_CRAWL_MAX_NEW_PER_RUN` n'est plus qu'un repli.
