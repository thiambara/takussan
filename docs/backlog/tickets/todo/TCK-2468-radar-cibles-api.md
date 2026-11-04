---
id: TCK-2468
title: "Radar : des cibles (critères de recherche) bornent ce que la collecte saisit, et chaque cible a ses annonces"
status: todo
phase: P2
family: back
estimate: L
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: []
blocks: [TCK-2467, TCK-2469, TCK-2470]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, collecte, cibles, adr-0087]
---

## Objectif utilisateur

L'opérateur dit au Radar ce qu'il cherche (« F3 à louer à Almadies, Ngor, Ouakam, 300 000 à 700 000 F ») et le Radar ne
lit, n'extrait et ne paie que ce qui peut y correspondre.

## Contrat de données

**Migrations**

- `create_radar_targets_table` : `id`, `name` (string 120), `origin` (string : `operator` | `demand`), `status` (string :
  `active` | `paused` | `retired`), `pinned` (bool, défaut faux), `criteria` (jsonb), `criteria_signature` (string 64 —
  empreinte des critères normalisés, unique parmi les cibles non `retired` : index unique partiel), `demand_count` (int
  null), `matches_count` (int, défaut 0), `last_matched_at` (timestamptz null), `created_by_id` (FK users null,
  `nullOnDelete`), timestamps. Enum PHP `RadarTargetOrigin`, `RadarTargetStatus` (pas d'`enum()` SQL, ADR-0007).
- `create_radar_listing_target_table` : `radar_listing_id` (FK cascade), `radar_target_id` (FK cascade), `matched_at` ;
  clé primaire composée.
- `add_scope_to_radar_crawl_sources` : `scope` string (`targeted` | `all`), défaut `targeted`.

**`criteria` (forme exacte, validée par `App\Services\Radar\Targets\RadarTargetCriteria`)**

```json
{
  "cities": ["Dakar"],
  "neighborhoods": [{"name": "Almadies", "city": "Dakar"}],
  "types": ["apartment"],
  "contract": "rent",
  "price_min": 300000, "price_max": 700000,
  "bedrooms_min": 2, "bedrooms_max": 3,
  "furnished": null,
  "sites": [],
  "max_age_days": null
}
```

Toutes les clés sont facultatives ; listes vides = sans contrainte ; `types` ∈ `PropertyType`, `contract` ∈
`rent|sale`, `sites` ∈ `RadarSourceSite`, montants entiers XOF ≥ 0, `price_min ≤ price_max`, `bedrooms_min ≤
bedrooms_max`. Une cible sans aucun critère est refusée (`radar.targets.empty_criteria`).

**Routes** (`routes/api/` du Radar, préfixe `api/admin/radar`) — lecture `platform.radar.operate`, écriture
`platform.radar.publish` (même partage que les sources, ADR-0080) :

| Verbe | Route | Corps / réponse |
|---|---|---|
| GET | `/targets` | `filter[origin]`, `filter[status]`, `sort=-matches_count|-created_at|name`, `per_page` → pagination canonique de `RadarTargetResource` |
| POST | `/targets` | `{name, criteria, status?}` → 201 `RadarTargetResource` ; origine `operator` |
| GET | `/targets/{target}` | `RadarTargetResource` |
| PATCH | `/targets/{target}` | `{name?, criteria?, status?, pinned?}` ; modifier les critères d'une cible `demand` l'épingle |
| DELETE | `/targets/{target}` | passe `retired` (jamais de suppression) → 200 |
| GET | `/targets/{target}/listings` | pagination de `RadarListingResource`, plus récentes d'abord |
| PATCH | `/crawl/sources/{site}` | accepte en plus `scope` |

`RadarTargetResource` : `id, name, origin, status, pinned, criteria, demand_count, matches_count, last_matched_at,
created_at, updated_at` (dates par `iso()`). `RadarCrawlSourceResource` rend `scope`.

## Contraintes strictes (métier)

- **Une source ciblée ne saisit une carte que si elle PEUT correspondre** à au moins une cible `active` qui la concerne
  (`sites` vide ou contenant le site) : un critère que la carte ne montre pas ne l'exclut pas (prix absent ≠ hors
  fourchette). Une carte écartée ne crée **aucune** ligne. Une source ciblée sans aucune cible active ne saisit rien de neuf
  (amendé le 2026-11-04 : elle lit quand même et observe les annonces connues ; voir les Notes).
- **Après l'extraction**, l'annonce est rattachée (pivot) à chaque cible active dont elle remplit **strictement** les
  critères connus ; `matches_count` et `last_matched_at` suivent. Le quartier se compare par le référentiel déjà utilisé
  par `RadarNeighborhoodMatcher` (repli de casse par `CaseInsensitive`, jamais `lower()` nu).
- Plafond : `radar.targets.max_active` (50) cibles actives toutes origines ; au-delà, 422 `radar.targets.too_many`.
- Les cibles d'origine `demand` ne se créent pas par `POST` (réservé à TCK-2470).

## Delta à produire

- [ ] Migrations ci-dessus ; modèles `RadarTarget` (étend `AbstractModel`, `$queryFields`, `$requestFilterable`,
      `$requestSortable`) ; relation `RadarListing::targets()`.
- [ ] `RadarTargetCriteria` (validation, normalisation, signature) ; `RadarTargetMatcher::mayMatchCard(ListCard,
      RadarSourceSite): bool` et `matchingTargets(RadarListing): Collection`.
- [ ] `RadarCrawler::listingFor()` : filtre par cible quand `scope = targeted` ; compteur `cards_skipped` sur
      `radar_crawl_runs` (migration `add_cards_skipped_to_radar_crawl_runs`).
- [ ] Rattachement après extraction : là où `ExtractRadarListing` passe l'annonce `extracted` (après le commit — ne pas
      élargir sa transaction), et à la relecture validée.
- [ ] `RadarTargetController` + FormRequests `StoreRadarTargetRequest`, `UpdateRadarTargetRequest` (autorisation dans
      `authorize()`), `RadarTargetResource`.
- [ ] Tests : `RadarTargetApiTest` (droits — `PlatformRoutesDefaultDenyTest` reçoit les routes —, validation, 422 codés,
      retrait), `RadarTargetMatcherTest` (permissif sur la carte, strict après extraction, casse ICU des quartiers),
      `RadarCrawlTargetedTest` (une carte hors cible ne crée rien, source `all` inchangée, aucune cible = rien).

## Critères d'acceptation

- [ ] AC1 — Source `targeted`, une cible « appartement, location, ≤ 700 000 » : une carte « villa à vendre 300 M » ne crée
      aucune `radar_listings`, une carte « appartement à louer » sans prix en crée une.
- [ ] AC2 — Une annonce extraite qui remplit les critères est listée par `GET /targets/{id}/listings`, `matches_count = 1`.
- [ ] AC3 — Le niveau `support` lit les cibles mais reçoit 403 sur `POST`/`PATCH`/`DELETE`.
- [ ] AC4 — Ablation : retirer le filtre de `listingFor()` fait rougir AC1.

## Hors périmètre

- La console : TCK-2469. Les cibles de la demande et l'IA : TCK-2470.

## Notes d'implémentation

**Re-mesuré avant de coder (2026-11-04)** :

- Les droits ne sont pas des `Capability` mais des `PlatformAbility` (`platform.radar.operate`, `platform.radar.publish`),
  posés par `platform-can:` sur les groupes de `routes/api/admin-radar.php` — c'est bien le fichier du Radar. Les
  FormRequests d'écriture redisent `hasPlatformAbility(RadarPublish)` dans `authorize()` (précédent :
  `Admin\BlockUserRequest`) ; `DELETE` n'a pas de corps, donc pas de FormRequest : seule la route le garde (mesuré par
  ablation : déplacée sous `operate`, `POST`/`PATCH` restent 403 par `authorize()`, `DELETE` passe 200, et
  `PlatformRoutesDefaultDenyTest` rougit).
- `ListCard` porte `price` (XOF), `rentPeriod`, `contract`, `propertyType` (valeurs de `PropertyType`), `bedrooms`,
  `location` (texte libre « Almadies, Dakar ») — ni meublé ni date : ces deux critères ne se jugent jamais sur une carte.
- `RadarNeighborhoodMatcher` compare par `GeoNeighborhoodResolver::cle()` (casse repliée par `CaseInsensitive::fold`,
  séparateurs repliés, accents distincts). Le matcher des cibles réutilise cette clé, pas une seconde.
- Le dépôt n'a aucune colonne `timestampTz` : `last_matched_at` et `matched_at` sont des `timestamp`, comme toutes les
  dates du Radar (le ticket disait `timestamptz`).
- Les sources existantes passent `targeted` par le défaut de la migration : **les 5 classes de test qui jouent un passage
  ADR-0080** (`RadarCrawlTest`, `RadarCrawlStartUrlsTest`, `RadarSnapshotPrivacyTest`, `RadarSourceWatchCrawlTest`,
  `RadarSourceWatchStartUrlsTest`) règlent désormais leur source sur `all` dans `setUp()` — 34 rouges sans cela.
  ⚠ En préproduction, une source allumée cesse de saisir des annonces NEUVES au déploiement tant qu'aucune cible
  n'existe ou que le porteur ne la règle pas sur `all` (elle continue d'observer les connues, revue du 2026-11-04) :
  c'est la décision d'ADR-0087 §5, à dire au porteur.

**Décisions non évidentes** :

- Toutes les clés de critères sont des contraintes **indépendantes (ET)** : `cities` ET `neighborhoods` exigent les deux.
- **Carte (permissif)** : un prix ne se compare que pour un loyer mensuel ou une vente (un loyer à la journée n'exclut
  pas) ; le lieu n'exclut une carte que s'il nomme un AUTRE quartier (ou une autre ville) du référentiel approuvé sans
  nommer aucun de ceux de la cible — un lieu inconnu, ou la ville seule, n'exclut rien.
- **Annonce extraite (strict)** : un critère posé exige une valeur connue qui le remplit ; un loyer non mensuel ne remplit
  pas une fourchette de prix. Exception, la fraîcheur : aucune lecture ne rend encore de date de publication ; à défaut de
  `extracted.published_at.value`, l'âge est celui de `created_at` (borne basse). La ville d'un critère de quartier ne
  départage que si celle de l'annonce est connue.
- **Rattachement** : synchronisation, pas ajout — un lien vers une cible ACTIVE que l'annonce ne remplit plus (relecture
  corrigée) est retiré ; `matches_count` est recompté depuis le pivot. Déclenché par `RadarListingTargetObserver`
  (`ShouldHandleEventsAfterCommit`) à l'ENTRÉE de l'annonce en `extracted` ou `reviewed` — `ExtractRadarListing` n'est pas
  touché. Une cible créée ou modifiée après coup ne rattache PAS les annonces déjà extraites (hors périmètre : un
  rattrapage serait un ticket).
- **Source ciblée sans cible active** (corrigé le 2026-11-04, revue adverse) : le passage LIT ses listes ou son sitemap,
  observe les annonces déjà connues (instantanés, lecture complète pour l'observatoire) et ne saisit aucune annonce neuve
  (comptées en `cards_skipped`). L'ancien arrêt `radar.crawl.no_target` (0 page) aveuglait l'observatoire, au contraire de
  ce que cette note affirmait ; il est retiré (constante, libellé, table du front), aucun environnement ne l'ayant servi.
- **Doublon** : 422 `radar.targets.duplicate` (`params.target_id`) sur la même empreinte parmi les cibles non retirées ;
  l'empreinte replie la casse des lieux. Plafond et doublon jugés sous le verrou consultatif `radar_targets`
  (`App\Services\Radar\Targets\RadarTargets`, seul chemin d'écriture — TCK-2470 doit l'emprunter).
- `PATCH` n'accepte que `status` ∈ `active|paused` (retirer = `DELETE`) ; ~~réactiver une cible retirée la soumet au
  plafond et au doublon~~ — **corrigé le 2026-11-04 (décision du porteur, 2a)** : une cible `retired` ne se modifie
  plus du tout, `PATCH` → 422 `radar.targets.retired` (`params.target_id`), aucune réactivation ; pour la reprendre, on
  en crée une nouvelle. Tenu dans `RadarTargets::update()` sous le verrou, seul `retire()` y passe outre
  (`editsRetired`) ; le curateur de la demande ne la touche pas non plus (`radar.demand.unknown_target`).
- `RadarCrawlRunResource` rend `cards_skipped` ; `check-status-labels.mjs` et `check-status-unions.mjs` portent
  `RadarTargetStatus` en exemption **à convertir par TCK-2469**.

**À reporter dans les specs (la session)** :

- `docs/models-spec.md` — **`RadarTarget`** (`radar_targets`) : `id`, `name` string(120), `origin` string(20)
  (`operator`|`demand`, enum `RadarTargetOrigin`), `status` string(20) (`active`|`paused`|`retired`, enum
  `RadarTargetStatus`), `pinned` bool défaut faux, `criteria` jsonb (forme de `RadarTargetCriteria`), `criteria_signature`
  string(64) — index unique PARTIEL `radar_targets_live_signature_unique` `WHERE status <> 'retired'`, `demand_count`
  uint null, `matches_count` uint défaut 0, `last_matched_at` timestamp null, `created_by_id` FK users `nullOnDelete`,
  timestamps ; index `(status, origin)`. Relations : `creator()`, `listings()` (belongsToMany par `radar_listing_target`,
  pivot `matched_at`). Pivot **`radar_listing_target`** : `radar_listing_id` FK cascade, `radar_target_id` FK cascade,
  `matched_at` timestamp, PK composée, index `(radar_target_id, matched_at)`. `RadarListing::targets()`.
  `radar_crawl_sources.scope` string(20) défaut `targeted` (enum `RadarCrawlScope` : `targeted`|`all`).
  `radar_crawl_runs.cards_skipped` uint défaut 0.
- `docs/features.md` §2.12 — les cibles (routes, droits, plafond 50, portée d'une source ; plus de `radar.crawl.no_target`
  depuis le 2026-11-04 : `features.md:1482` et `models-spec.md` (`scope`, `stop_reason`) le citent encore).

**Revue adverse (2026-11-04)** — une source ciblée sans cible active observe les connues et ne saisit rien de neuf
(décision de la session ; `RadarCrawlTargetedTest`, `RadarSitemapCrawlTest`).
