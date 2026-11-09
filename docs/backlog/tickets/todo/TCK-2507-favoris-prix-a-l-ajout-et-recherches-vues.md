---
id: TCK-2507
title: Favoris : prix au moment de l'ajout, et recherches sauvegardées qui savent quand on les a ouvertes
status: todo
phase: P1
family: back
estimate: S
wave: 85
created: 2026-11-08
updated: 2026-11-08
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
4. Le compte des biens nouveaux **ne se calcule pas ici** : le front interroge la liste publique avec `filter[published_after]=<last_viewed_at ?? created_at>` et `per_page=1` (filtre livré par TCK-2496), une requête par recherche affichée.

## Direction UX / Artistique

Sans objet (back). Maquette servie : `/fr/playground/maquettes?p=favoris&a=a`.

## Contraintes strictes (métier)

- Montant décimal en base (principe n°3), émis tel quel, sans helper de montant.
- `price_change` n'existe jamais pour un bien non public : la projection `{id, slug, title}` d'un favori indisponible reste sans prix (TCK-599).
- Migration réversible (`down()` qui retire les deux colonnes).

## Delta à produire

- [ ] Migration : `favorites.price_at_favorite`, `saved_searches.last_viewed_at`.
- [ ] `FavoriteObserver::created` pose `price_at_favorite`.
- [ ] `FavoriteResource` : `price_change` (disponible seulement).
- [ ] Route `saved-searches.viewed` + FormRequest (autorisation par la policy de la ressource, avant validation) ; `SavedSearchResource` émet `last_viewed_at`.
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Un favori créé sur un bien à 300 000, dont le prix passe à 250 000 puis subit un passage de `SendFavoriteChangeAlerts`, émet toujours `price_change = -50000` (le rebasage de l'alerte ne le touche pas — vérifié par ablation en lisant `alert_baseline_price` à la place).
- [ ] AC2 — Un favori loué n'émet ni `price_change` ni aucun prix.
- [ ] AC3 — `POST …/viewed` sur la recherche d'un autre utilisateur rend 404 et ne modifie rien ; sur la sienne, 204 et `last_viewed_at` émis.
- [ ] AC4 — Un favori antérieur à la migration émet `price_change: null`, pas 0.

## Hors périmètre

- La page Favoris elle-même (TCK-2508).
- Le suivi de prix des favoris de l'appareil (anonyme) : il se garde côté navigateur (TCK-2508).

## Notes d'implémentation

_(à remplir par implementing-specs)_
