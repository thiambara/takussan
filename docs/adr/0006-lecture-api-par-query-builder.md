# ADR-0006 — Toute lecture d'API passe par `spatie/laravel-query-builder`, sparse fieldsets obligatoires

- **Statut** : Accepté
- **Date de la décision** : 2026-04 · **Rédigé rétroactivement** : 2026-08-12

## Contexte

Une plateforme immobilière sert beaucoup de listes : biens, réservations, baux, factures, clients,
demandes de maintenance. Chacune est vue sous plusieurs angles — une carte de bien n'a pas besoin
des mêmes colonnes qu'une ligne de tableau d'administration.

Deux dérives guettent, et elles se renforcent : le backend renvoie tout « au cas où », et le front
filtre côté client sur une liste déjà rapatriée. Le résultat est une charge utile qui grossit avec le
schéma, et des filtres qui mentent dès que la pagination s'en mêle.

## Décision

**La couche de lecture de l'API est `spatie/laravel-query-builder`, pilotée par des propriétés
statiques déclaratives sur le modèle** (`HasQueryBuilder::buildQuery()`).

Sept whitelists par modèle : `$requestFilterable`, `$requestFilterablePartial`,
`$requestRangeFilters`, `$requestSearchFields`, `$requestSortable`, `$requestLoadable`,
`$requestCountable`, plus `$queryFields` pour les sparse fieldsets.

**Côté frontend, trois règles sont obligatoires** :

1. **Ne jamais fetcher tous les champs** — toujours `fields[table]=col1,col2` avec les seules
   colonnes de la vue.
2. **Filtrer côté serveur** — jamais côté client sur une liste déjà récupérée.
3. **Charger les relations par `include=`** — jamais par une requête séparée.

## Conséquences

**Un modèle exposé en liste doit déclarer ses whitelists**, sinon il n'est ni filtrable ni triable.
C'est le prix de la sécurité : rien n'est exposé qui n'ait été nommé.

**Deux pièges d'ordre, déjà payés**, documentés dans le code parce qu'ils ne se devinent pas :

1. `allowedFields` **doit** précéder `allowedIncludes`, sinon spatie lève `UnknownIncludedFieldsQuery`.
2. Les colonnes des relations chargeables doivent être **préfixées du nom de table**
   (`properties.id`), sinon `fields[properties]=… + include=property` lève `InvalidFieldQuery`.

**L'adoption est partielle, et c'est la limite de la règle.** Sur 72 modèles : `$queryFields` n'est
déclaré que dans 35, `$requestSearchFields` dans 15, `$requestCountable` dans 6. Surtout, **les API
Resources codent en dur leur jeu de clés complet** : `PropertyResource::toArray()` rend une
trentaine de clés quel que soit le `fields[]` demandé. Le sparse fieldset agit sur le SQL, pas sur la
sérialisation — l'économie est réelle en base et partielle sur le fil (ardoise, §dette de code).

**Un second mécanisme concurrent existe.** Le DSL maison `scopeFilter()`/`scopeWithSearch()` de
`BaseModelTrait` est monté sur le même `AbstractModel`, donc disponible sur 67 modèles. Aucun
document n'arbitrait. **`takussan-api/CLAUDE.md` tranche désormais** : `buildQuery()` pour toute
surface d'API, `scopeFilter` pour les usages internes (jobs, commandes, services).

## Application

- `app/Models/Concerns/HasQueryBuilder.php` — le cœur ; les deux pièges d'ordre sont commentés
  lignes 26-29 et 49-58.
- `app/Models/Property.php:29-99` — le modèle exemplaire : les 7 propriétés + `customQueryFilters()`.
- `app/Models/MaintenanceRequest.php:70-83` — le seul override complet, pour un tri maison.
- `src/lib/api.ts:182-230` — `buildQueryString()`, le sérialiseur canonique côté front.
- `src/lib/queries/` — **32 constantes `*_FIELDS`** qui matérialisent les fieldsets par vue.
- `docs/spatie-query-builder.md` — la référence complète.
- **Aucune garde** ne vérifie qu'un appel front passe bien un `fields[]`.
