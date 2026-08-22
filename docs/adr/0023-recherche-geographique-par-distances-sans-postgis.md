# ADR-0023 — La recherche géographique traite des DISTANCES, pas des géométries

- **Statut** : Accepté
- **Date de la décision** : 2026-08-22
- **Tickets** : TCK-346
- **ADR liés** : [ADR-0008](0008-meilisearch-sur-tous-les-environnements.md) (Meilisearch partout),
  [ADR-0020](0020-postgresql-sur-tous-les-environnements.md) §« Embarquer la recherche PostgreSQL
  et PostGIS dans ce chantier » (qui reportait cette décision-ci)

## Contexte

### La prémisse de TCK-346 était fausse, et c'est le premier fait à écrire

Le ticket ouvrait sur *« Il n'y a rien à migrer : la géo n'existe pas encore. […] zéro calcul de
distance, zéro `ST_*`, zéro filtre par rayon. »* Remesuré le **2026-08-22** :

| Affirmation du ticket | Commande | Résultat | Verdict |
|---|---|---|---|
| zéro `ST_*` | `grep -rEn '\bST_[A-Za-z]+\s*\(' takussan-api/app takussan-api/database takussan-web/src \| wc -l` | `0` | **vrai** |
| PostGIS nulle part | `grep -rn postgis takussan-api/app takussan-api/config takussan-api/database docker-compose.yml .github \| wc -l` | `0` | **vrai** |
| zéro calcul de distance | `app/Services/Model/SearchService.php:63-77` | **formule haversine SQL complète** (`6371 * acos(...)`) | **FAUX** |
| zéro filtre par rayon | même fichier, `:65` | `lat` + `lng` + `radius_km` | **FAUX** |
| la géo n'existe pas | `app/Models/Property.php:379-384`, `config/scout.php:177`, `app/Services/Search/PropertySearchService.php:410-416` | `_geo` émis à l'indexation **depuis TCK-280 (2026-05-20)**, `_geo` filtrable, `_geoBoundingBox(...)` posé | **FAUX** |

*Un document d'entrée qui ment coûte plus cher que son absence* : la version d'origine faisait
chercher une fonctionnalité neuve là où il y avait déjà trois implémentations à arbitrer. La
section « Contexte » de TCK-346 est réécrite, sa version d'origine conservée et datée.

### TROIS implémentations géographiques coexistent sans se connaître

| # | Chemin | Moteur | Contrat | Atteint par | Tests |
|---|---|---|---|---|---|
| 1 | `GET /api/public/properties/search` | Meilisearch | `_geoBoundingBox` via `lat_min/lat_max/lng_min/lng_max` | **personne** — `takussan-web/src/types/search.ts` `SEARCH_FILTER_KEYS` ne porte aucune clé géo (20 clés, mesuré le 2026-08-22) | 1 |
| 2 | `GET /api/public/properties/map` | SQL Eloquent | `bounds=swLat,swLng,neLat,neLng`, `whereBetween` sur `addresses.latitude/longitude`, GeoJSON, cap `MAP_MAX_RESULTS = 500` | la carte du front | 13 |
| 3 | `App\Services\Model\SearchService::search()` | SQL Eloquent, **haversine** | `lat` + `lng` + `radius_km` (km), et un second bounding box `lat_min…lng_max` | **aucune route HTTP** ; seul appelant `App\Jobs\SendSavedSearchAlerts:19`, nourri par `SavedSearch.criteria`, validé `['required','array']` | **0** |

Le chemin 3 est du code de production qui **envoie des notifications aux utilisateurs**, et rien ne
le couvrait.

### L'arbitrage réel n'est donc pas « faut-il PostGIS »

C'est **« comment unifier trois chemins existants »**. La question PostGIS n'est qu'un sous-cas :
elle se pose seulement si le produit a besoin de *géométries*. Il n'en a pas besoin, et trois faits
mesurés le tranchent.

## Décision

**La recherche géographique de Takussan traite des DISTANCES et des rectangles, jamais des
géométries. Le chemin principal est `_geoRadius` / `_geoPoint` de Meilisearch. PostGIS n'est pas
adopté ; `earthdistance` / `cube` non plus.**

### Les trois faits qui la tranchent

1. **La spec ne demande aucune géométrie.** `docs/features.md` §1.2 ligne 104 porte une seule
   entrée géographique : *« P1 · Recherche par carte interactive »*, à côté de *« P0 · Filtres de
   base »*. `grep -niE "rayon|distance|polygon|géoloc|proximit" docs/features.md` (2026-08-22) rend
   **une seule ligne**, `:72` — *« Associer une adresse géolocalisée »*, qui décrit la saisie, pas
   la recherche. Ni polygone, ni « dessiner une zone », ni intersection nulle part. **Un bounding
   box est exactement ce qu'une carte pan/zoom demande, et il est déjà livré** (chemin 2).

2. **La seule notion de quartier/zone du dépôt est une CHAÎNE.** `addresses.neighborhood` est un
   `string` nullable (`database/migrations/2026_04_17_160003_create_addresses_table.php:16`) ;
   `intervention_zones.*` est validé `['string','max:120']` dans trois FormRequests ;
   `takussan-web/src/components/agents/ZoneMultiSelect.tsx:16-17` porte en commentaire *« free-form
   chip input. We don't wire a cities autocomplete catalog here — the codebase doesn't ship one
   yet »*. `ls app/Models/ | grep -iE 'zone|area|district|quartier|neighborhood'` rend **rien**.
   Adopter PostGIS supposerait donc d'abord **fabriquer** des polygones de quartiers de Dakar qui
   n'existent dans aucune table : *c'est un chantier de données, pas un chantier d'extension.*

3. **Les deux chemins non-PostGIS sont déjà prouvés sur ce dépôt**, et l'image ne porte pas
   PostGIS. `docker-compose.yml` épingle `pgvector/pgvector:pg17` (ADR-0020 §2) : adopter PostGIS
   changerait l'image de **tous** les environnements, plus la CI et les runbooks, pour un besoin
   que la spec ne formule pas.

### Ce que devient chacun des trois chemins

| # | Décision | Pourquoi |
|---|---|---|
| 1 `/search` | **ÉTENDU** : `lat`, `lng`, `radius_km` → `_geoRadius(lat, lng, mètres)` ; `sort=distance` → `_geoPoint(lat,lng):asc`. Le `_geoBoundingBox` existant est **CONSERVÉ, et son statut est écrit** : c'est le contrat *viewport* — il existe pour synchroniser la liste de résultats avec le cadrage de la carte, il n'est délibérément pas exposé par le front aujourd'hui, et il est conjoint (ET) au rayon si les deux sont envoyés. | Le supprimer coûterait de le réécrire au premier « chercher dans cette zone de la carte », et son test existe déjà. Ce qui n'était pas défendable, c'était de le laisser **sans statut**. |
| 2 `/map` | **INCHANGÉ.** Reste le chemin de la carte : GeoJSON, cap à 500, sans pagination. | C'est un contrat différent (des marqueurs, pas des résultats paginés). Meilisearch ne rend pas de GeoJSON et le cap de 500 y serait à réinventer. |
| 3 `SearchService` haversine | **CONSERVÉ, MIS SOUS TEST, NON CONVERGÉ** — et le contrat est **aligné** : mêmes noms (`lat`, `lng`, `radius_km`), même unité (le kilomètre) que le chemin 1. | Voir ci-dessous. |

**Pourquoi le chemin 3 ne converge pas dans ce chantier.** `SavedSearch.criteria` est un `array`
libre — validé `['required','array']`, sans schéma de clés — dont le contenu a été **écrit par le
front à la date de la sauvegarde**. Les noms de filtres y divergent de ceux de `/search`
(`min_price` / `max_price` / `min_area` contre `price_min` / `price_max` / `area_min`). Faire
pointer `getMatchingProperties()` vers `PropertySearchService` **changerait silencieusement le sens
des recherches déjà enregistrées** : un critère de prix cesserait d'être lu, sans erreur, et
l'alerte se mettrait à notifier le catalogue entier. La convergence exige d'abord une migration des
`criteria`, qui est un ticket à elle seule. En attendant, **aligner les NOMS et l'UNITÉ** fait que
la convergence future sera un changement de moteur, pas un changement de contrat.

⚠ **Le mettre sous test a révélé qu'il PLANTE sur PostgreSQL**, et pas dans un cas exotique.
`acos()` reçoit un argument qui vaut mathématiquement 1 dès que le point de recherche coïncide avec
les coordonnées d'un bien — c'est-à-dire le cas « les biens autour de celui-ci » — et l'arithmétique
flottante le rend régulièrement à `1,0000000000000002`. PostgreSQL LÈVE
(`SQLSTATE[22003] input is out of range`) là où MySQL et SQLite rendaient `NULL` et écartaient
simplement la ligne. Comme `SendSavedSearchAlerts` itère par `each()`, l'exception ne perdait pas
UNE recherche sauvegardée : **elle tuait le job, donc toutes les alertes suivantes.**

C'est exactement la classe de divergence qu'ADR-0020 a rendue visible en amenant la suite de tests
sur le moteur de production — et ce chemin n'avait **aucun test** jusqu'à TCK-346, donc rien ne
pouvait la voir. Corrigé par `LEAST(1.0, GREATEST(-1.0, …))`. Un second défaut de la même famille est
corrigé au passage : les gardes employaient `! empty()`, pour qui `'0'` est vide, ce qui faisait
disparaître le filtre en silence sur l'équateur ou le méridien de Greenwich.

### Le kilomètre est l'unité publique ; le mètre ne sort jamais du service

`_geoRadius` de Meilisearch prend des **mètres**. Le paramètre public est en **kilomètres**, comme
l'était déjà `radius_km` du chemin 3. La conversion (`× 1000`) vit dans `buildFilter()` et nulle
part ailleurs.

### La validation est le seul garde-fou

`addresses` ne porte **aucun** `CHECK` sur `latitude`/`longitude` (mesuré le 2026-08-22 sur les 135
migrations). Les bornes sont donc posées à l'entrée : latitude `-90..90`, longitude `-180..180`,
`radius_km > 0` et plafonné à **500 km**. Le plafond n'est pas cosmétique : le catalogue est
sénégalais, sa plus grande diagonale avoisine 700 km, et **au-delà de 500 km un rayon centré sur
Dakar ne discrimine plus rien** — c'est un filtre qui coûte au moteur sans réduire l'ensemble.

## Conséquences

### Ce que ça rend possible

- « à moins de 3 km de ce point » sur la recherche publique, sans extension ni migration.
- Le **tri par distance** sans rayon : `lat` + `lng` + `sort=distance` classe le catalogue entier
  du plus proche au plus lointain. C'est le cas « autour de moi » d'un mobile, et il ne demande
  aucun filtre.
- Un contrat unique (`lat`, `lng`, `radius_km`) partagé par les chemins 1 et 3.

### Ce que ça coûte

- **`sortableAttributes` gagne `_geo`** dans `config/scout.php`. Un changement de réglage d'index :
  il exige `scout:sync-index-settings`, que le harnais de test appelle déjà
  (`Tests\Concerns\InteractsWithMeilisearch::setUpInteractsWithMeilisearch()`) mais que **le
  déploiement doit appeler aussi**. Sans lui, `sort=distance` rend une erreur Meilisearch
  (`invalid_search_sort`, HTTP 400 → 500 côté API), pas un résultat dégradé.

  ⚠ **Le jeton est `_geo`, PAS `_geoPoint` — et la prescription de TCK-346 disait `_geoPoint`.**
  Mesuré sur Meilisearch 1.16 le 2026-08-22, sur un index témoin monté pour la question. Avec
  `sortableAttributes: ["_geoPoint"]`, la requête `sort=_geoPoint(14.700000,-17.450000):asc` est
  refusée par *« Attribute `_geo` is not sortable. Available sortable attributes are:
  `_geoPoint, id`. »* — le moteur résout l'expression de tri vers l'attribut `_geo` et vérifie
  celui-là. Avec `["_geo"]`, la même requête rend `[1, 2, 3]`, et `[3, 2, 1]` depuis un point situé
  au nord. L'espace après la virgule est indifférent (les deux formes fonctionnent).

  *Le message d'erreur nommait la réponse* : il faut lire « `_geo` n'est pas triable » comme la
  demande, pas comme la liste des disponibles.
- **Un bien sans coordonnées est exclu d'un filtre par rayon, et exclu d'un tri par distance.**
  `Property::toSearchableArray()` n'émet `_geo` que si l'adresse porte les deux colonnes ; un
  document sans `_geo` ne satisfait aucun `_geoRadius` et n'est pas classable par `_geoPoint`.
  C'est la même règle que `area` ou `price` (ADR-0024) : *on ne promet
  pas ce qu'on ne sait pas.*
- **Trois implémentations restent trois.** Cet ADR les nomme et les borne ; il ne les fusionne pas.

### Ce que ça interdit

- Chercher « dans ce quartier » au sens géométrique. La recherche par quartier reste et restera un
  **filtre sur la chaîne** `neighborhood`, tant que le fait n°2 ci-dessus tient.
- Toute colonne de type `geometry` / `geography`.

## Ce qui rouvre la décision

Écrit ici pour qu'on n'ait pas à le déduire plus tard. **Un seul de ces trois faits suffit :**

1. **Un besoin de POLYGONE apparaît dans `docs/features.md`** — « dessiner une zone sur la carte »,
   « biens à l'intérieur de ce périmètre », un découpage administratif opposable, ou une règle
   métier (commission, zone d'intervention exclusive) qui se juge par appartenance à une surface et
   non par distance à un point.
2. **Un catalogue de quartiers GÉOMÉTRISÉ entre dans le dépôt** — c'est-à-dire un modèle `Zone`
   (ou équivalent) portant des contours, et non la chaîne libre d'aujourd'hui. Le fait n°2 tombe
   alors, et avec lui l'argument « c'est un chantier de données ».
3. **Le tri par distance devient le chemin dominant sur un catalogue que Meilisearch ne porte
   plus** — par exemple si ADR-0008 était révoqué au profit de la recherche PostgreSQL. La
   distance devrait alors se calculer en SQL, et `earthdistance`/`cube` (pas PostGIS) serait le
   premier candidat à réexaminer.

Ce qui ne rouvre **pas** la décision : la lenteur d'un `_geoRadius`, la disponibilité de PostGIS
dans une image, ou l'argument « on l'aura de toute façon un jour ».

## Alternatives écartées

### PostGIS

Écartée par les trois faits mesurés ci-dessus, et par un quatrième qui n'est pas technique : elle
exigerait de **fabriquer** la donnée géométrique qui la justifierait. Une extension dont il faut
d'abord inventer les données n'est pas une solution à un problème existant.

### `earthdistance` / `cube` en PostgreSQL

Plus légère que PostGIS, et elle donnerait exactement ce que la décision retient — distances et
rayons. **Écartée parce que le catalogue public est déjà servi par Meilisearch** : le filtre par
rayon doit s'appliquer *dans la même requête* que le texte, les facettes et le compte exact.
Calculer la distance en SQL après coup rendrait `meta.total` faux, ce qu'ADR-0008 et le service de
recherche existent précisément pour éviter. La ré-examiner appartient au cas de réouverture n°3.

### Généraliser le haversine du chemin 3 à `/search`

Écartée pour la même raison : elle ramène le filtrage hors du moteur. Elle ferait aussi de
`SearchService` — non testé jusqu'à ce ticket, sans route HTTP — le chemin principal de la
recherche publique.

### Supprimer le `_geoBoundingBox` du chemin 1, puisqu'il est inatteignable

Défendable, et pesée. Écartée : la carte interactive (P1, `features.md:104`) demandera
« rechercher dans ce cadrage », son test existe, et le coût de le garder est une clause de six
lignes. Le défaut réel n'était pas sa présence, c'était son **absence de statut** — que cet ADR
corrige.

## Application

- `takussan-api/app/Http/Requests/Public/SearchPublicPropertyRequest.php` — règles `lat`, `lng`,
  `radius_km`, `sort=distance`, et les deux dépendances croisées
- `takussan-api/app/Services/Search/PropertySearchService.php` — `hasGeoRadius()`,
  `_geoRadius(...)` dans `buildFilter()`, `_geoPoint(...):asc` dans `buildSort()`
- `takussan-api/config/scout.php` — **`_geo`** dans `sortableAttributes` de `Property` (le jeton du
  RÉGLAGE est `_geo` ; `_geoPoint(lat,lng):asc` est la syntaxe de l'EXPRESSION de tri — cf.
  § *Conséquences*)
- `takussan-api/app/Services/Model/SearchService.php` — `HAVERSINE_KM` avec son clamp, et les deux
  gardes `is_numeric`
- `takussan-api/lang/{fr,en,wo}/validation.php` — `geo_radius_requires_point`,
  `sort_distance_requires_point`
- `takussan-api/tests/Feature/Search/PropertyGeoSearchTest.php` — rayon, tri, bornes (chemin 1)
- `takussan-api/tests/Feature/Search/SearchServiceGeoTest.php` — haversine sous test (chemin 3)
- **Le front ne consomme rien de tout cela** : `SEARCH_FILTER_KEYS` reste sans clé géo. C'est le
  chantier suivant de TCK-346, et c'est écrit dans le ticket.
