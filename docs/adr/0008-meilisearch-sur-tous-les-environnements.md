# ADR-0008 — Meilisearch est le moteur de recherche sur tous les environnements, CI comprise

- **Statut** : Accepté
- **Date de la décision** : 2026-05-20 · **Rédigé rétroactivement** : 2026-08-12
- **Tickets** : TCK-280 (recherche de biens) · TCK-281 (entités internes — `doing`)

## Contexte

La recherche publique de biens tournait sur du SQL `LIKE`, alors que `features.md` §2.4 la spécifie
« (Scout) ». L'écart s'est creusé sans que rien ne le signale.

Laravel Scout permet de choisir un driver par environnement. La tentation était de garder
`collection` en développement et en CI — pas d'infrastructure à démarrer — et Meilisearch en
production.

**C'est précisément ce qu'il ne fallait pas faire.** Le driver `collection` filtre en PHP sur une
collection Eloquent : il ne partage ni la tokenisation, ni le classement par pertinence, ni la
tolérance aux fautes de frappe du moteur réel. Une recherche éprouvée en `collection` ne prouve rien
de celle qui tourne en production. C'est le motif *« le seul régime que personne n'éprouve est celui
que tout le monde exécute »*.

## Décision

**Meilisearch sur tous les environnements, y compris la CI.**

`phpunit.xml` force `SCOUT_DRIVER=meilisearch` **sans repli**. La CI démarre un service
`getmeili/meilisearch:v1.16`, attend son health, synchronise les réglages d'index
(`scout:sync-index-settings`), puis lance la suite. La preview partage l'instance de production,
isolée par `SCOUT_PREFIX=preview_`.

## Conséquences

**Meilisearch devient un prérequis dur du développement.** Un contributeur sans instance locale ne
peut **pas** lancer `php artisan test` — la suite ne démarre pas. C'est le coût assumé de la
décision, et c'est pour cette raison que `docker-compose.yml` en fournit une
([ADR-0011](0011-environnement-de-dev-conteneurise.md)) : sans elle, la décision se paie en friction
à chaque reprise du projet.

**Les tests locaux polluent l'index réel du développeur.** `phpunit.xml` force le driver mais ne
définit ni `MEILISEARCH_HOST`, ni `MEILISEARCH_KEY`, **ni `SCOUT_PREFIX`** : la suite indexe et
supprime dans les mêmes index que l'environnement de travail. Aucune isolation (ardoise D-08).
Poser `SCOUT_PREFIX=testing_` referme le trou en une ligne.

**Les versions ne sont pas alignées.** CI en `v1.16`, machine de développement en `1.36.0`,
production en `apt install meilisearch` (donc *latest*). Trois versions pour un moteur dont le
classement de pertinence évolue entre versions mineures — la parité annoncée par cet ADR est donc
tenue sur le *driver*, pas sur le *moteur*. `docker-compose.yml` fige le développement sur `v1.16`,
alignée sur la CI ; **la production reste non versionnée** (ardoise D-09).

**Le périmètre est partiel.** Seuls trois modèles sont `Searchable` : `Property`, `Document`,
`Message`. TCK-281, qui devait en ajouter quatre (clients, maintenance, agences, utilisateurs), vit
sur une branche non mergée.

**Un caveat de conception, écrit dans le code — et SOLDÉ depuis.** `BaseModelTrait::scopeWithSearch()`
composait Scout et Eloquent par un `whereIn` sur les identifiants : **l'ordre de pertinence de Scout
n'était pas préservé**. Deux tickets ont refermé le trou par les deux bouts. **TCK-281** a fait
restituer l'ordre sur le chemin d'API (`HasQueryBuilder::$searchRelevanceIds` →
`App\Sorts\SearchRelevanceSort`, rejoué via `defaultSortsWithRelevance()`). **TCK-326** a supprimé
le chemin qui, lui, ne le restituait pas : ré-inventorié le 2026-08-20 sur le dépôt entier, il
n'avait **aucun appelant hors du test qui le testait**. Le trait, devenu vide, a disparu avec lui.

Il n'y a donc plus qu'un chemin, et il classe par pertinence. `scripts/check-filtering-single-mechanism.mjs`
(contrôle D) refuse d'en voir réapparaître un second, y compris sous un autre nom.

## Application

- `.github/workflows/api-ci.yml` — service `meilisearch`, attente du health, `scout:sync-index-settings`.
- `takussan-api/phpunit.xml` — `SCOUT_DRIVER=meilisearch`, sans repli.
- `docker-compose.yml` — service `meilisearch` en `v1.16`, port 7701.
- `app/Models/Concerns/HasQueryBuilder.php` — le SEUL chemin qui compose Scout et Eloquent depuis
  TCK-326, et il restitue l'ordre de pertinence (TCK-281). L'ancien
  `app/Models/Bases/Traits/BaseModelTrait.php`, qui portait le caveat, n'existe plus.
- `docs/configuration.md` §3.6 — **qui se contredit avec ses §1 et §5.1** (ardoise D-25).

## Amendement du 2026-11-16 (TCK-578) — les consoles cherchent les biens par la base

**Décision du porteur (option c).** L'index des biens reste **public** : `Property::shouldBeSearchable()`
n'y admet ni brouillon, ni bien en attente, refusé ou privé, ni bien d'une agence hors ligne
(TCK-600, ADR-0048). Les consoles, elles, listent tout cela — et leur `filter[search]` passait par
cet index : un brouillon était introuvable, **en silence** (mesuré le 2026-09-24 : une référence
exacte de brouillon, 196 réponses, le bien absent).

- **Tous les appelants de `Property::buildQuery()` sont des consoles** (relevé du 2026-11-16 :
  `/api/properties`, `portfolio-summary`, les sous-biens, les biens d'un bailleur,
  `/api/admin/agencies/{agency}/properties`). Le modèle le déclare par
  `HasQueryBuilder::rechercheParLaBase()` → `true` : `filter[search]` y prend le repli SQL existant,
  replié par `CaseInsensitive` (piège n° 9), dans la portée d'agence que la requête impose déjà.
  C'est le précédent des consoles super-admin (TCK-281) et de la console plateforme (TCK-600).
- **La recherche publique ne change pas** : elle passe par `PropertySearchService`, jamais par
  `buildQuery()`, et l'index ne reçoit toujours aucun bien non public. Les voies (a) « tout indexer
  et filtrer » et (b) « deux index » sont écartées : (a) met la non-fuite à la merci d'un filtre
  oublié, (b) double l'indexation pour une console qui n'en a pas besoin.
- **Le prix, assumé** : la console des biens perd la tolérance aux fautes et le classement du
  moteur, et deux choses plus fréquentes en pratique : les **accents** (`residence` ne trouve plus
  `Résidence` — `CaseInsensitive` ne les replie pas, ADR-0025) et les **mots non contigus**
  (`villa almadies` ne trouve plus « Villa de luxe aux Almadies » : un seul motif `%…%`). Elle classe en SQL (`rangDeRechercheSql()`) : **référence exacte en tête**, puis titre,
  puis le reste, l'ordre par défaut départageant ; un `sort=` explicite reste souverain.
- **Mesure, pas d'index** : `EXPLAIN ANALYZE` sur la base de développement (582 biens, 214 pour la
  plus grosse agence) — `Bitmap Index Scan on properties_agency_id_index`, 1,2 ms ; sans portée
  d'agence (super-admin), `Seq Scan`, 1,4 ms. Un `LIKE '%…%'` n'emprunterait aucun index btree
  d'expression ; `pg_trgm` serait une décision à part, à prendre sur une mesure qui le justifie.
- **Garde** : `RechercheConsoleDesBiensTest`, qui joue les cinq appelants (vérifié par ablation des deux côtés : retirer
  `rechercheParLaBase()` rend les brouillons introuvables ; affaiblir `shouldBeSearchable()` fait
  entrer les biens non publics dans l'index).

Le « seul chemin » de la section Conséquences tient : c'est toujours `HasQueryBuilder`
`filter[search]`, qui choisit désormais entre le moteur et la base selon ce que l'index du modèle
peut contenir.
