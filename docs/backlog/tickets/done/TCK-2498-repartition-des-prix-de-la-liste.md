---
id: TCK-2498
title: Liste publique : répartition des prix par tranche pour l'histogramme du budget
status: done
phase: P1
family: back
estimate: S
wave: 84
created: 2026-11-08
updated: 2026-11-09
depends_on: []
blocks: [TCK-2499]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [back, search, facets, audit-ux]
---

## Objectif utilisateur

Le chercheur voit où sont les biens avant de fixer son budget, au lieu de deviner un plafond.

## Contrat de données

`GET /api/public/properties/price-distribution` — mêmes paramètres de filtre que la liste publique, **sans** `price_min`/`price_max`. Réponse : `{ data: { buckets: [{ from, to, count }], min, max } }`, au plus 20 tranches, bornes arrondies au millier de francs, séparément pour la location (par mois) et la vente selon `contract_type` (obligatoire).

## Contraintes strictes (métier)

- Mêmes filtres de visibilité que la liste (biens publics, non test) ; un loyer s'entend par mois (période ramenée comme le fait la liste).
- Limiteur public de la liste ; réponse mise en cache par jeu de filtres normalisé, une heure au plus.
- `contract_type` absent → 422.

## Delta à produire

- [x] Route dans `routes/api/public.php`, action `PublicPropertyController::priceDistribution`.
- [x] `App\Http\Requests\Public\PriceDistributionRequest`.
- [x] Calcul dans `PropertySearchService` (ou un service dédié `PriceDistribution`), sous les filtres de la liste.
- [x] Tests : `PriceDistributionTest` (tranches, filtres appliqués, `contract_type` requis, biens test exclus).

## Critères d'acceptation

- [x] AC1 — La somme des `count` égale le `meta.total` de la liste sous les mêmes filtres (sans bornes de prix).
- [x] AC2 — Un filtre de quartier change la répartition.
- [x] AC3 — Sans `contract_type`, 422.

## Hors périmètre

- L'affichage (TCK-2499).

## Notes d'implémentation

Re-mesuré le 2026-11-09 (vague 1, agent « recherche ») :

- **« un loyer s'entend par mois (période ramenée comme le fait la liste) » : la liste ne ramène rien.** Elle compare
  `price` tel quel (`PropertySearchService::buildFilter()`, `price >= …`), et `rent_period` est un filtre à part ;
  l'index ne porte aucun prix mensualisé. Un histogramme ramené au mois mènerait à des bornes `price_min`/`price_max`
  que la liste lirait autrement — et AC1 (somme = `meta.total`) deviendrait faux. La répartition compte donc le prix
  tel que la liste le filtre. **Règle de la session (après revue puis contre-vérification) : en location, sans
  `rent_period`, l'histogramme compte le loyer AU MOIS, implicite (`rent_period` nul) ou déclaré (`monthly`)**, côté
  back — le front n'a pas à s'en souvenir. Les périodes courtes (`daily`, `weekly`) et `yearly` n'y entrent pas
  (`RepartitionDesPrix::PERIODES_HORS_MOIS`, filtre `NOT rent_period IN [...]`, qui garde aussi un document sans
  l'attribut). Un `rent_period` explicite est respecté.
  - ⚠ La première version (`rent_period=monthly` par défaut) était fausse : relevé en développement le 2026-11-09,
    **641 locations : 519 sans période, 122 `monthly`, 0 `yearly`, 0 `daily`, 0 `weekly`** — elle rendait 46 biens à
    l'histogramme contre 172 à la liste. Les périodes nulles sont écrites hors du modèle (l'événement `saving` de
    `Property` pose sinon `monthly`). `yearly` (0 en développement) est exclu aussi, par décision.
  - L'histogramme et la liste comptent le même nombre de biens quand la liste n'a que des loyers au mois.
    `test_en_location_le_loyer_au_mois_implicite_ou_declare` (sans période + au mois + à la nuit + à l'année → 2) —
    ablations : ancienne règle `= monthly` rouge, aucune exclusion rouge, `yearly` retiré de la liste rouge.
- **« mêmes paramètres de filtre que la liste »** : les paramètres de la liste sont à plat (`location=…`), pas en
  `filter[…]` ; la requête hérite de `SearchPublicPropertyRequest` (comme `SuggestRequest`, `MapPublicPropertyRequest`)
  moins `CLES_HORS_REPARTITION`.

Décisions non évidentes :

- **Service dédié `App\Services\Search\RepartitionDesPrix`**, filtre emprunté par `PropertySearchService::filtreDeLaListe()`
  (jamais recopié). Deux lectures moteur : `facetStats.price` (min, max, total) puis un `/multi-search` d'une sonde
  `hitsPerPage: 0` par tranche. Pas la `facetDistribution` du prix : `maxValuesPerFacet` (100) la tronquerait en silence.
- **Tranches à largeur ronde** (1, 2, 5 × 10ⁿ, ≥ 1 000 F), alignées sur ses multiples, `[from, to)` : la plus petite qui
  tient en 20. Elles couvrent min et max, d'où somme = total (prix NOT NULL en base).
- Le mot-clé suit le régime conjonctif ; le repli élargi d'ADR-0024 n'est pas rejoué (répartition vide sous un mot-clé
  sans bien exact).
- Cache applicatif 900 s par jeu de filtres normalisé (`ksort`, vides retirés) ; limiteur : `public-read`, celui du
  groupe et de la liste.
- **`agency`/`agent` résolus AVANT la clé de cache** (revue adverse) : l'identifiant résolu entre dans la clé, et un
  profil hors ligne ou inconnu rend vide sur-le-champ, sans lire ni écrire le cache. Avant, une agence suspendue gardait
  sa répartition jusqu'à 15 min quand la liste rendait déjà 0. `test_une_agence_mise_hors_ligne_vide_l_histogramme_en_cache`
  — chacune des deux gardes couvre l'autre (ablation de l'une seule : vert) ; ablation des deux : rouge.

Contrat (après revue) : `GET /api/public/properties/price-distribution?contract_type=sale|rent&<filtres plats de la liste,
sauf price_min, price_max, sort, page, per_page, placements, seed_hour, published_after, facets>` →
`{data: {buckets: [{from, to, count}], min, max}}` ; `[from, to[`, au plus 20 tranches de largeur ronde ; vide →
`buckets: []`, `min`/`max` `null` ; en location sans `rent_period`, le loyer au mois seul (période nulle ou `monthly` ;
ni `daily`, ni `weekly`, ni `yearly`) ; un `rent_period` explicite est respecté.
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (ligne Budget) et § 2.4 (contrat de `price-distribution`, loyer au mois implicite ou déclaré).
