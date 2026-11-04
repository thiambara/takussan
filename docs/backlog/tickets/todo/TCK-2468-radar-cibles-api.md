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
  fourchette). Une carte écartée ne crée **aucune** ligne. Une source ciblée sans aucune cible active ne saisit rien et le
  passage le dit (`radar.crawl.no_target`).
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

_(à remplir)_
