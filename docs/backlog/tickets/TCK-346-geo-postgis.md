---
id: TCK-346
title: "Recherche géographique : rayon, distance, carte — unifier trois implémentations"
status: done
phase: P3
family: applicatif
estimate: L
wave: 44
created: 2026-08-21
updated: 2026-08-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md
tags: [back, front, geo]
---

## Contexte — RÉÉCRIT le 2026-08-22, la version d'origine était fausse

> **Ce que ce ticket affirmait, du 2026-08-21 au 2026-08-22 :**
>
> > *« Il n'y a rien à migrer : la géo n'existe pas encore. Mesuré le 2026-08-21 sur les ~62 000
> > lignes de `app/` : `addresses.latitude` / `longitude` en `decimal(10,7)`, et **zéro** calcul de
> > distance, **zéro** `ST_*`, **zéro** filtre par rayon. C'est une fonctionnalité neuve, pas une
> > conséquence de la migration. »*
>
> **Conservé, pas effacé** — le dépôt ne réécrit pas son histoire, il la date. Cette version faisait
> chercher une fonctionnalité neuve là où il y a **trois implémentations à arbitrer**, ce qui est
> plus coûteux que l'absence de contexte : on ne se méfie pas d'un document d'entrée.

Remesuré le **2026-08-22** :

| Affirmation d'origine | Mesure | Verdict |
|---|---|---|
| zéro `ST_*` | `grep -rEn '\bST_[A-Za-z]+\s*\(' app database ../takussan-web/src \| wc -l` → `0` | **vrai** |
| PostGIS nulle part | `grep -rn postgis app config database ../docker-compose.yml ../.github \| wc -l` → `0` | **vrai** |
| zéro calcul de distance | `app/Services/Model/SearchService.php:63-77` — **formule haversine SQL complète** | **FAUX** |
| zéro filtre par rayon | même fichier — `lat` + `lng` + `radius_km` | **FAUX** |
| la géo n'existe pas | `Property::toSearchableArray()` émet `_geo` **depuis TCK-280 (2026-05-20)** ; `_geo` est `filterable` (`config/scout.php`) ; `PropertySearchService` pose `_geoBoundingBox(...)` | **FAUX** |

### Les trois implémentations, et ce qu'on en fait

| # | Chemin | Moteur | Atteint par | Tests avant | Décision |
|---|---|---|---|---|---|
| 1 | `GET /api/public/properties/search` | Meilisearch | **personne** (aucune clé géo dans `SEARCH_FILTER_KEYS`) | 1 | **étendu** — rayon + tri par distance |
| 2 | `GET /api/public/properties/map` | SQL Eloquent, GeoJSON, cap 500 | la carte du front | 13 | **inchangé** |
| 3 | `App\Services\Model\SearchService::search()` | SQL Eloquent, **haversine** | aucune route HTTP ; `SendSavedSearchAlerts` seulement | **0** | **sous test, non convergé** |

**L'arbitrage réel n'était donc pas « faut-il PostGIS »**, c'était « comment unifier trois chemins ».
Tranché par [ADR-0023](../../adr/0023-recherche-geographique-par-distances-sans-postgis.md) :
**distances et rectangles, jamais de géométries ; pas de PostGIS, pas d'`earthdistance`.**

## Ce qui est fait (2026-08-22)

- [x] **ADR-0023** écrit et indexé dans `docs/adr/README.md`, avec les trois faits mesurés, le sort
      de chacun des trois chemins, et **ce qui rouvrirait la décision**.
- [x] `lat`, `lng`, `radius_km` sur `/api/public/properties/search` → `_geoRadius(lat, lng, mètres)`.
- [x] `sort=distance` → `_geoPoint(lat,lng):asc`, plus `_geo` dans `sortableAttributes`.
- [x] Bornes de validation : latitude `-90..90`, longitude `-180..180`, rayon `> 0` et `≤ 500 km`,
      `lat`/`lng` mutuellement obligatoires, `radius_km` et `sort=distance` exigeant le point.
- [x] Le `_geoBoundingBox` du chemin 1 **reçoit un statut** : contrat *viewport*, conjoint au rayon.
- [x] Le haversine du chemin 3 est **sous test** (`tests/Feature/Search/SearchServiceGeoTest.php`).
- [x] **Deux défauts de production corrigés** au passage sur le chemin 3, tous deux révélés par le
      fait de le tester (cf. ci-dessous).

## Deux défauts trouvés en mettant le chemin 3 sous test

1. **`acos()` fait LEVER PostgreSQL** — `SQLSTATE[22003] input is out of range` — dès que le point
   de recherche coïncide avec les coordonnées d'un bien, c'est-à-dire le cas « les biens autour de
   celui-ci ». MySQL et SQLite rendaient `NULL`. Comme `SendSavedSearchAlerts` itère par `each()`,
   l'exception **tuait le job**, donc toutes les alertes suivantes. Corrigé par
   `LEAST(1.0, GREATEST(-1.0, …))`, épinglé par
   `SearchServiceGeoTest::test_un_point_qui_coincide_avec_un_bien_ne_fait_pas_lever_le_moteur`.
2. **`! empty()` désactivait le filtre en silence** sur `lat = 0` / `lng = 0` (équateur, méridien de
   Greenwich) — `empty('0')` est vrai. Corrigé en `is_numeric()`, aligné sur le chemin 1.

## Le front — livré le 2026-08-22

Le rayon et le tri par distance étaient **inatteignables depuis l'interface** : `SEARCH_FILTER_KEYS`
(`takussan-web/src/types/search.ts`) ne portait aucune clé géo, exactement comme le
`_geoBoundingBox` livré à TCK-280. C'est réparé, **par la chaîne existante et non à côté d'elle**.

- [x] `radius_km`, `lat` et `lng` entrent dans `SEARCH_FILTER_KEYS`, donc dans `SearchFilters`,
      l'URL, les puces, le compteur, les recherches sauvegardées et la garde de parité — d'un seul
      geste, puisque tout cela en est **dérivé** depuis TCK-340.
- [x] **`agregeeDans` — l'inverse d'`eclater`.** `eclater` fait rendre plusieurs puces à une clé ;
      `agregeeDans` fait rendre **une** puce à plusieurs clés. `radius_km` porte le libellé
      (« Dans un rayon de 5 km ») et **possède** les trois paramètres d'URL ; `lat` et `lng` s'y
      agrègent. Trois puces indépendantes auraient été pires que muettes : retirer `lat` seule
      laisse `lng` + `radius_km`, c'est-à-dire **un 422 fabriqué par l'interface**
      (`required_with:lat`).
- [x] **`normaliserGeo()`** (`hooks/useSearch.ts`) efface les trois états que le serveur refuse —
      demi-coordonnée, rayon sans point, `sort=distance` sans origine — **en lecture d'URL, en
      écriture d'URL et sur la requête envoyée**. Une URL héritée qui les porte ne produit donc ni
      requête vouée au 422, ni sélecteur de tri qui annonce un tri qui n'aura pas lieu.
- [x] **Le tri « Le plus proche » n'est offert qu'avec une origine.** Une option qui rend 422 à coup
      sûr est pire qu'absente : l'utilisateur la choisit, l'écran perd ses résultats, et rien
      n'explique pourquoi.
- [x] **`AutourDeMoi`** (`components/search/AutourDeMoi.tsx`) — la commande, dans le panneau de
      filtres, juste après « Localisation ». Rayons de 1 à 25 km, très en deçà du plafond serveur.
      Elle pose **toujours** un rayon avec le point : un point seul ne filtre rien, ne porte aucune
      puce, et serait un état actif invisible.
- [x] **Le refus de géolocalisation est un état rendu, pas une exception** — traduit en `fr`, `en`
      et `wo`, et renvoyant au filtre « Ville » qui le précède. Un test compare les libellés `en` et
      `wo` au dictionnaire **français** : le deep-merge de `src/i18n/request.ts` afficherait sinon
      le français sous les deux autres locales, sans erreur ni test rouge.
- [x] `FILTRES_CONNUS` (`PropertiesDiscoveryPage`) est désormais **dérivé** de la table. Écrit à la
      main, il citait dix-huit clés et venait d'en manquer trois.

**Pourquoi la géolocalisation du navigateur et non le centre de la carte** — les deux étaient
recevables, et le centre de carte ne demande aucune permission. Il a été écarté pour trois raisons
écrites en tête d'`AutourDeMoi.tsx` : la commande vit dans le panneau de filtres, monté dans les
**deux** vues, et serait donc inerte dans la vue liste, qui est celle par défaut ; le centre bouge à
chaque pan, donc le rayon suivrait un point que l'utilisateur n'a jamais choisi et que l'URL — donc
le lien partagé, donc la recherche sauvegardée — enregistrerait ; et la carte publique interroge
`/map`, un autre endpoint, qui ne reçoit même pas `q`.

**Ce que ça coûte, assumé** : `navigator.geolocation` exige HTTPS (ou `localhost`), et le refus est
un chemin ordinaire. Sur origine non sécurisée, Chrome rend `PERMISSION_DENIED` comme un refus
humain : les deux tombent sur le même message, un message qui les distinguerait devrait deviner.

**Un correctif retiré parce qu'il était redondant.** `removeFilter` faisait aussi remonter le
retrait à l'agrégateur. Ablation mesurée le 2026-08-22 : le retirer **ne fait rougir aucun test**,
`normaliserGeo` produisant le même état final. C'était un second chemin pour la même garantie.

## Ce qui RESTE, et pourquoi


- [x] **La vue CARTE reçoit le rayon** *(2026-08-22)*. L'arbitrage annoncé est tranché : `/map`
      **accepte** le rayon plutôt que de dessiner un cercle décoratif — un filtre qui disparaît à la
      bascule est un silence, pas une simplification. Les trois clés (`lat`, `lng`, `radius_km`)
      portent les **mêmes noms, mêmes bornes et mêmes messages** que `/search`, parce que
      `App\Http\Requests\Concerns\FiltreParPointEtRayon` les définit une seule fois pour les deux
      `FormRequest`, plafond compris. La formule haversine — clamp `LEAST/GREATEST` inclus — est
      extraite dans `App\Support\DistanceHaversine` et partagée par `SearchService` et le
      contrôleur : **deux copies dont une seule porterait le clamp, c'est le défaut que ce ticket
      venait de payer.** Rayon et `bounds` se composent (ET) ; un bien sans coordonnées est exclu.
      Côté front, `mapFilters` transmet les trois clés.

      ⚠ **`sort=distance` n'est PAS ajouté à `/map`, et c'est une décision motivée** (docblock de
      `PublicPropertyController::map()`) : la sortie est un `FeatureCollection` sans pagination dont
      l'ordre n'est observable par personne, et l'énumération `sort` de `/search` n'a pas de sens sur
      un jeu de marqueurs — un `sort` de `/map` serait une AUTRE énumération sous le même nom, soit
      exactement la divergence que ce ticket supprime. Ce qui rouvrirait la question est écrit sur
      place : la **troncature** à `MAP_MAX_RESULTS`, qui rend l'ensemble arbitraire au-delà de 500.
      Tests : `tests/Feature/Public/PropertyMapRadiusTest.php` (13) et
      `src/components/property/__tests__/PropertiesDiscoveryPage.carte-geo.test.tsx` (4), les deux
      vérifiés par ablation.
- [x] **`docs/features.md` formule le rayon et la distance** *(2026-08-22)*. Deux lignes ajoutées à
      la §1.2, au format des voisines : « Recherche « autour de moi » : rayon en kilomètres autour
      d'un point, plafonné à 500 km, appliqué à la liste comme à la carte » et « Tri des résultats
      par distance au point de recherche », toutes deux P1 · 👤🏠 — la recherche publique est
      atteignable sans compte. `docs/features-by-actor.md` en est DÉRIVÉ et a été régénéré ;
      `node docs/gen-features-by-actor.mjs --check` est vert. *(L'avertissement sur l'acteur `🔧`
      non déclaré est antérieur et hors périmètre.)*
- [x] **Le chemin 3 ne converge PAS vers Meilisearch — décision écrite, et c'est le livrable.**
      Le ticket demandait de faire converger les trois chemins « si tu peux le faire sans élargir
      le chantier ; sinon dis pourquoi ». C'est la seconde branche, et la raison est mesurée.
      `SavedSearch.criteria` est
      un tableau libre (`['required','array']`, sans schéma) dont les noms de filtres divergent de
      ceux de `/search` (`min_price` contre `price_min`). Y brancher `PropertySearchService`
      changerait **silencieusement** le sens des recherches déjà enregistrées. La convergence exige
      d'abord une migration des `criteria` : c'est un ticket à elle seule, et il n'est
      **volontairement pas ouvert ici** — son périmètre dépend de l'arbitrage de
      [TCK-350](TCK-350-alertes-de-recherche-sauvegardee-renotifient.md), qui décidera où vit
      l'anti-renotification. *Ouvrir un ticket dont on ne sait pas encore délimiter le périmètre,
      c'est fabriquer une entrée que personne ne saura prendre.*
- [x] **`SendSavedSearchAlerts` : le défaut est vérifié et OUVERT en ticket** *(2026-08-22)* —
      [TCK-350](TCK-350-alertes-de-recherche-sauvegardee-renotifient.md). Le constat tient à la
      relecture (`SendSavedSearchAlerts.php:25-32`, `SearchService.php:140-142`), et un **second**
      défaut du même job est mesuré au passage : `notification_frequency` n'a aucun lecteur côté
      envoi, si bien qu'une alerte réglée sur `off` notifie quand même, tous les jours. Le ticket ne
      tranche délibérément pas entre les trois emplacements possibles de l'anti-renotification.
      **Toujours pas corrigé ici** : hors périmètre géographique.

## Références

- [ADR-0023](../../adr/0023-recherche-geographique-par-distances-sans-postgis.md) — la décision
- [ADR-0020](../../adr/0020-postgresql-sur-tous-les-environnements.md) §« Embarquer la recherche
  PostgreSQL et PostGIS dans ce chantier » — pourquoi c'était reporté
- [ADR-0008](../../adr/0008-meilisearch-sur-tous-les-environnements.md) — pourquoi le filtre géo
  doit vivre dans le même appel moteur que le texte et les facettes
