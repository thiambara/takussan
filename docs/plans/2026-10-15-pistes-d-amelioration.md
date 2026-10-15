# Pistes d'amélioration et corrections — exploration du 2026-10-15

Relevé en lecture seule, un angle à la fois, par des agents d'exploration lancés depuis la
session de TCK-651 (branche `feat/reglages-metier-au-catalogue`). **Rien ici n'est un ticket** :
chaque piste qui mérite d'être faite passe par `/write-spec`, et toute décision structurelle par un
ADR.

Chaque constat cite `fichier:ligne` et dit comment il a été établi (lu, mesuré, déduit). *Une piste
déduite d'un nom ou d'un docblock n'est pas un constat* : elle est marquée **à vérifier**.

Gravité : 🔴 défaut avéré (comportement faux aujourd'hui) · 🟠 risque ou dette qui coûte · 🟢
amélioration.

## Angles

| # | Angle | État |
|---|-------|------|
| 1 | Recherche d'un bien (public et `/app`) : pertinence, filtres, performances, UX | fait |
| 2 | Performances des requêtes : N+1, index manquants (FK non indexées sous PostgreSQL), pagination | en cours |
| 3 | Isolation d'agence et autorisation : routes, policies, fuites entre agences | à faire |
| 4 | Argent : montants, devises, arrondis, pénalités, factures, idempotence des paiements | à faire |
| 5 | Jobs planifiés et files : idempotence, reprise, `withoutOverlapping`, échecs muets | à faire |
| 6 | Texte affiché par l'API (principe n° 5) et trous d'i18n fr/en/wo | à faire |
| 7 | Accessibilité du front : formulaires, focus, contrastes, lecteurs d'écran | à faire |
| 8 | Parcours mobile : formulaires longs, tableaux, défilement, cibles tactiles | à faire |
| 9 | Pages publiques : SEO, métadonnées, temps de chargement, images | à faire |
| 10 | Médias : tailles, conversions, disques privés/publics, nettoyage | à faire |
| 11 | Notifications (e-mail, SMS, WhatsApp, in-app) : doublons, préférences, échecs | à faire |
| 12 | Tests : zones non couvertes, tests qui seraient verts sans le code qu'ils gardent | à faire |
| 13 | Code mort et doublons : services, composants, routes, clés i18n | à faire |
| 14 | Observabilité : erreurs avalées, journaux, alertes, ce qu'on ne verrait pas en production | à faire |
| 15 | Parcours d'une agence neuve : inscription, mise en service, premier bien, premier bail | à faire |
| 16 | Listes internes sur un modèle `Searchable` avec `defaultSort` en dur (documents, propriétaires, biens enfants) | à faire |
| 17 | Qualité des adresses : référentiel ou texte libre, dans le formulaire de création de bien | à faire |
| 18 | Statistiques Boost (clics, impressions) face aux robots, aux rendus serveur et aux revalidations | à faire |

---

## Angle 1 — Recherche d'un bien

*Exploré le 2026-10-15 vers 0 h 30. Les trois 🔴 ont été relus contre le code par la session ; les
chiffres « mesurés » viennent de l'agent, sur la base et l'index Meilisearch de développement.*

### La recherche dans `/app` ne trouve ni les brouillons ni les biens privés, et ne trie pas par pertinence
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Models/Concerns/HasQueryBuilder.php:235`, `takussan-api/app/Models/Property.php:499-508`, `takussan-api/app/Http/Controllers/Api/PropertyController.php:80`, `takussan-web/src/lib/queries/properties-server.ts:126`
- Constat :
  - `filter[search]` de `/api/properties` passe par Meilisearch puis par un `whereIn`, alors que `shouldBeSearchable()` écarte de l'index les biens privés, brouillons, en revue et rejetés.
  - Mesuré : les biens privés 145-147 sont absents de l'index. Une recherche de leur titre exact rend 53, 70 et 103 autres biens, et jamais le bon.
  - Pas de `matchingStrategy` (relâchement `last`, corrigé côté public par TCK-338).
  - `defaultSort('-created_at')` est en dur, et le front envoie toujours `sort=-created_at` : la pertinence est perdue (lu).
- Piste : une recherche SQL sur le titre et la référence pour les listes internes, ou un index interne sans `shouldBeSearchable`. Utiliser `defaultSortsWithRelevance()`, et ne pas forcer `sort` quand une recherche est active.

### Les quartiers proposés par le panneau ne correspondent pas aux quartiers indexés
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/search/ChoixDuReferentiel.tsx:227-233`, `takussan-api/app/Services/Search/PropertySearchService.php:446-447`
- Constat :
  - Le panneau propose les noms du référentiel (`geo_neighborhoods`). Le filtre compare ce nom par égalité stricte avec `addresses.neighborhood`, qui est un texte libre.
  - Mesuré : `'Grand Yoff'` (le nom du référentiel) rend 0 bien, et `'Grand-Yoff'` en rend 39.
  - 205 adresses portent un quartier absent du référentiel : Plateau 44, Grand-Yoff 42, Hann Maristes 37…
  - Seules 322 adresses sur 826 sont rattachées à `geo_neighborhood_id`.
  - Le filtre tient compte des accents : `Guediawaye` rend 0, contre 23 pour `Guédiawaye`. `Dieupeul` et `Dieuppeul` coexistent.
  - En production : à vérifier.
- Piste : rattacher les adresses au référentiel (migration de données), puis indexer et filtrer par le nom canonique ou par `geo_neighborhood_id`.

### Les suggestions de recherche ont une limite unique de 60 requêtes par minute pour tout le site
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Providers/AppServiceProvider.php:373`
- Constat :
  - `Limit::perMinute(60)` est déclaré sans `->by()`. La clé est alors la même pour tous les visiteurs (lu dans `ThrottleRequests` et `Limit` du framework).
  - Le commentaire qui annonce `search-suggest|{ip}` est faux.
  - Le test (`tests/Feature/Api/Search/SearchSuggestTest.php:198`) vide une clé qui n'existe pas : il resterait vert dans les deux cas.
  - Avec un anti-rebond de 150 ms, une dizaine de personnes qui tapent en même temps font répondre 429 à tout le monde.
- Piste : `->by($this->visitorRateLimitKey($request))`, comme `public-read`, et un test avec deux IP distinctes.

### Deux recherches par changement de filtre, et des impressions Boost gonflées
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/hooks/useSearch.ts:183,360-364`, `takussan-web/src/app/[locale]/(public)/properties/(liste)/page.tsx:133-134`, `takussan-api/app/Services/Search/PropertySearchService.php:659`
- Constat :
  - `router.push` refait le rendu serveur, qui appelle déjà `rechercherBiensPublics`. La nouvelle graine est ignorée (`useReducer`/`useRef` ne la lisent qu'au montage), et le client relance la même recherche (lu ; à confirmer dans les journaux).
  - Chaque appel enregistre une impression sponsorisée, sans dédoublonnage (`BoostStatsRecorder.php:28`). C'est aussi le cas des revalidations ETag : un 304 recalcule tout (`routes/api/public.php:18-34`).
  - Or les impressions sont une métrique vendue aux agences.
- Piste : naviguer sans rendu serveur, ou consommer la graine à chaque nouvelle clé. Compter l'impression côté client, ou la dédoublonner par visiteur.

### Avec un tri par prix, la recherche élargie classe mal
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/scout.php:218`, `takussan-api/app/Services/Search/PropertySearchService.php:263-265`
- Constat :
  - `rankingRules` commence par `sort`. En régime élargi avec `price:asc`, le prix passe donc avant le nombre de mots trouvés.
  - Mesuré : `studio climatisation Thiès` rend [2,2,1…] mots trouvés sans tri, et [1,1,1…] avec.
- Piste : ranger `sort` après `words`, ou ne pas envoyer le tri dans le plan de repli.

### `SEARCH_ID_CAP` vaut en fait 1000, et la pagination publique aussi
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Models/Concerns/HasQueryBuilder.php:28`, `takussan-api/config/scout.php:150-254`
- Constat :
  - `pagination.maxTotalHits` est à 1000, le défaut de Meilisearch (mesuré). `take(5000)` ne rend donc que 1000 identifiants.
  - Côté public, au-delà de la page 25 (à 40 par page), les pages sont inaccessibles (lu ; à vérifier avec plus de 1000 biens).
  - `takussan-api/CLAUDE.md` annonce 5000.
- Piste : déclarer `maxTotalHits` dans `index-settings`, et corriger la doc.

### Des réglages d'index périmés font échouer la liste par défaut
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/scout.php:217`, `takussan-api/app/Services/Search/PropertySearchService.php:615`, `takussan-api/docker/release.sh:27-28`
- Constat :
  - Sur l'index local, `ranked_at` n'est pas triable, et les documents n'ont ni `ranked_at` ni `region`. `sort=ranked_at:desc` rend `invalid_search_sort` (mesuré) : une liste publique sans mot échoue en 500.
  - `release.sh` ne fait qu'avertir quand la synchronisation des réglages échoue.
- Piste : faire échouer le déploiement sur une synchronisation ratée, ou dégrader le tri au lieu de lever.

### Les facettes sont calculées à chaque recherche, et personne ne les lit
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Search/PropertySearchService.php:76,97,152`
- Constat : `neighborhood`, `bedrooms` et `type` sont demandées à Meilisearch à chaque requête. Le front ne lit `facets` nulle part : seule la déclaration de type `types/search.ts:608` le mentionne.
- Piste : les retirer, ou les afficher (« Mermoz (43) ») en facettes disjonctives.

### Une recherche d'un seul mot sans résultat n'a aucun repli
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Search/PropertySearchService.php:125`, `takussan-api/app/Models/Property.php:321-338`
- Constat :
  - Le repli exige au moins 2 termes. En dessous de 5 lettres, aucune faute n'est tolérée : `ker` rend 0, sans suggestion (mesuré).
  - Fonctionnent bien (mesuré) : la recherche par référence (`NSRKO42K`, `pr-nsrko42k`) et l'accent dans la requête (`Guediawaye` trouve `Guédiawaye`).
- Piste : en cas de zéro résultat, proposer les suggestions de `SuggestService` dans `SearchEmpty`.

### La carte charge toutes les photos, et les coordonnées ne sont pas indexées
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:521`, `takussan-api/app/Http/Resources/PropertyMapGeoJsonResource.php:49`
- Constat : `with('media')` charge toutes les photos de jusqu'à 501 biens pour n'en lire qu'une. `addresses` n'a aucun index sur `latitude`/`longitude` (mesuré, `pg_indexes`).
- Piste : charger la seule première photo, et ajouter un index `(latitude, longitude)` si la carte grossit.
