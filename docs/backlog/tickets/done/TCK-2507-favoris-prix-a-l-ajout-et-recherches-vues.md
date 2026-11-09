---
id: TCK-2507
title: Favoris : prix au moment de l'ajout, et recherches sauvegardées qui savent quand on les a ouvertes
status: done
phase: P1
family: back
estimate: S
wave: 85
created: 2026-11-08
updated: 2026-11-09
depends_on: []
blocks: [TCK-2508]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#16-favorite-"
    - "docs/models-spec.md#23-savedsearch-"
tags: [back, favoris, alertes, audit-ux]
---

## Objectif utilisateur

Le chercheur voit sur chaque favori ce qui a changé depuis qu'il l'a gardé (« −50 000 F depuis l'ajout »), et sur chaque recherche sauvegardée combien de biens sont arrivés depuis la dernière fois qu'il l'a ouverte.

## Contrat de données

1. **`favorites.price_at_favorite`** `decimal(14,2)` nullable — posé par `FavoriteObserver` à la création, au prix du bien à cet instant, **jamais rebasé** (au contraire d'`alert_baseline_price`, que `SendFavoriteChangeAlerts` rebase à chaque passage : il ne peut pas servir « depuis l'ajout »). Pas de rétro-remplissage : un favori existant garde `null`.
2. **`FavoriteResource`** émet `price_change` = prix courant − `price_at_favorite`, **seulement pour un favori `available`** et quand les deux prix existent ; `null` sinon. `price_at_favorite` lui-même n'est pas émis (le docblock de la ressource dit pourquoi un prix de référence ne sort pas : la règle tient, seul l'écart sort).
3. **`saved_searches.last_viewed_at`** `datetime` nullable ; **`POST /api/saved-searches/{savedSearch}/viewed`** (auth, titulaire seulement — 404 sinon, comme les autres routes de la ressource) le pose à `now()` et rend `204`. `SavedSearchResource` émet `last_viewed_at` (`iso()`).
4. Le compte des biens nouveaux **ne se calcule pas ici** : le front interroge la liste publique avec `published_after=<last_viewed_at ?? created_at>` (paramètre plat de `/api/public/properties/search`, TCK-2496) et `per_page=1` (filtre livré par TCK-2496), une requête par recherche affichée.

## Direction UX / Artistique

Sans objet (back). Maquette servie : `/fr/playground/maquettes?p=favoris&a=a`.

## Contraintes strictes (métier)

- Montant décimal en base (principe n°3), émis tel quel, sans helper de montant.
- `price_change` n'existe jamais pour un bien non public : la projection `{id, slug, title}` d'un favori indisponible reste sans prix (TCK-599).
- Migration réversible (`down()` qui retire les deux colonnes).

## Delta à produire

- [x] Migration : `favorites.price_at_favorite`, `saved_searches.last_viewed_at`.
- [x] `FavoriteObserver::created` pose `price_at_favorite`.
- [x] `FavoriteResource` : `price_change` (disponible seulement).
- [x] Route `saved-searches.viewed` + FormRequest (autorisation par la policy de la ressource, avant validation) ; `SavedSearchResource` émet `last_viewed_at`.
- [x] Tests.

## Critères d'acceptation

- [x] AC1 — Un favori créé sur un bien à 300 000, dont le prix passe à 250 000 puis subit un passage de `SendFavoriteChangeAlerts`, émet toujours `price_change = -50000` (le rebasage de l'alerte ne le touche pas — vérifié par ablation en lisant `alert_baseline_price` à la place).
- [x] AC2 — Un favori loué n'émet ni `price_change` ni aucun prix.
- [x] AC3 — `POST …/viewed` sur la recherche d'un autre utilisateur rend 404 et ne modifie rien ; sur la sienne, 204 et `last_viewed_at` émis.
- [x] AC4 — Un favori antérieur à la migration émet `price_change: null`, pas 0.

## Hors périmètre

- La page Favoris elle-même (TCK-2508).
- Le suivi de prix des favoris de l'appareil (anonyme) : il se garde côté navigateur (TCK-2508).

## Notes d'implémentation

**Prémisses re-mesurées le 2026-11-09 (agent favoris-alertes, vague 1) :**

- ✗ « 404 sinon, **comme les autres routes de la ressource** » : faux. `PUT/PATCH saved-searches/{id}` rend **403**
  (`UpdateSavedSearchRequest::authorize()`, `SavedSearchTest::test_user_cannot_update_other_users_search`) et
  `DELETE` aussi (`abort_unless(…, 403)`). La route neuve rend **404** comme l'exige AC3 ; les autres restent à 403
  (aligner est hors périmètre).
- ✗ « autorisation par **la policy** de la ressource » : il n'existe pas de `SavedSearchPolicy`. L'expression
  d'`UpdateSavedSearchRequest::authorize()` est **reprise** dans `MarkSavedSearchViewedRequest::authorize()`, en
  `abort_unless(…, 404)` (le corps est vide : l'ordre autorisation/validation n'a rien à protéger).
- `price_at_favorite` est posé dans `FavoriteObserver::creating` (et non `created` comme dit le Delta), avant l'INSERT.
- **Revue du 2026-11-09 (décision de la session)** : `price_at_favorite` ne se prend que si le bien est **public** à
  l'ajout (`Property::query()->public()`) ; sinon `null`, donc pas d'écart. Un favori posé sur un brouillon par son
  bailleur ou le personnel de l'agence ne comparera jamais le prix public au prix du brouillon (un agent retiré de
  l'agence le retrouvait par l'écart). Testé : `test_un_favori_pose_sur_un_brouillon_n_a_pas_de_prix_d_ajout`.
- La contrainte n°2 est gardée pour les quatre sorties du public (loué, vendu, devenu privé, repassé en brouillon) par
  un fournisseur de données ; la mutation `! in_array($availability, [RENTED, REMOVED])` rougit vendu, privé, brouillon.
- Les favoris de l'appareil versés au compte à la connexion prennent le prix de la connexion : écrit dans TCK-2508.
- `price_change` est calculé en centimes par `Favorite::cents()` sur les valeurs brutes, puis divisé par 100 : sort
  en entier JSON quand l'écart est rond (`-50000`), comme `price` sort en nombre.
- `POST …/viewed` n'avance pas `updated_at` (`timestamps = false`) : une ouverture ne modifie pas la recherche.

**Contrat exposé au front (TCK-2508) :**

- `GET /api/favorites` (et la réponse de `POST`/`PATCH`) : chaque favori porte `price_change: number|null` — négatif
  = baisse depuis l'ajout ; `null` pour un bien non `available` (loué, vendu, indisponible, supprimé), pour un
  favori ajouté avant le 2026-11-09 (prix d'ajout inconnu) ET pour un favori posé sur un bien alors non public. `0` = prix inchangé. Ni `price_at_favorite` ni
  `alert_baseline_price` ne sortent.
- `GET /api/saved-searches` : chaque recherche porte `last_viewed_at: string|null` (ISO 8601, `+00:00`).
- `POST /api/saved-searches/{id}/viewed` (session) : `204` sans corps ; `404` pour la recherche d'un autre ou un
  identifiant inconnu ; `401` sans session.
- Biens nouveaux : `GET /api/public/properties/search?…critères…&published_after=<last_viewed_at ?? created_at>&per_page=1&placements=false` (paramètre plat, TCK-2496 ; lire `meta.total`)
  → `meta.total` (filtre de TCK-2496, hors de ce ticket).
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (favoris : `price_change`, `…/viewed`) ; `docs/models-spec.md` § 16 `price_at_favorite` (public à l'ajout seulement) et § 23 `last_viewed_at` (`published_after` à plat, pas `filter[published_after]`).
