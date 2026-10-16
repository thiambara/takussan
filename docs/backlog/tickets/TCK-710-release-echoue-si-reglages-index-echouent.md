---
id: TCK-710
title: "`release.sh` échoue si `scout:sync-index-settings` échoue"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-1--recherche-dun-bien
tags: [api, search, deploy, meilisearch, pistes]
---

## Contexte

Réf : **P01.07** du fichier de pistes, `validé` (classement V5 accordé : la correction touche le
déploiement).

Le service `release` de Compose (`takussan-api/docker/release.sh`) synchronise les réglages
Meilisearch avant de démarrer l'API. Un échec de `scout:sync-index-settings` n'y écrit qu'un
avertissement, et le déploiement continue. Or des réglages périmés ne dégradent pas la recherche,
ils la cassent : `sort=ranked_at:desc`, le tri par défaut de la liste publique sans mot
(`PropertySearchService.php:613-615`), rend `invalid_search_sort` quand `ranked_at` n'est pas
déclaré triable sur l'index (mesuré par le mesureur sur l'index local, 2026-10-15).

### Décision du porteur

> release.sh échoue si scout:sync-index-settings échoue ; pas de tri dégradé

Hypothèse (mode sans humain) : « échoue » veut dire que `release` sort en erreur, ce qui empêche
api, worker, worker-media et scheduler de démarrer (ils attendent son succès, ADR-0028 § 5),
comme pour une migration en échec. L'importation `scout:import` qui suit n'est donc pas tentée.

## Objectif utilisateur

Un visiteur ne tombe jamais sur une recherche publique en erreur parce qu'un déploiement a laissé
l'index sur d'anciens réglages : le déploiement s'arrête et l'ancienne version continue de servir.

## Contrat de données

Aucun. Seule change la sortie de `release` quand la synchronisation des réglages échoue.

## Delta à produire

- [x] `takussan-api/docker/release.sh` : un échec de `scout:sync-index-settings` sort en 1, avec
      un message `ERREUR` sur la sortie d'erreur, au lieu d'un avertissement.
- [x] `scripts/test-release-reindex.sh` : trois vérifications neuves (sortie 1, aucune importation
      tentée, et rien d'arrêté sous `SCOUT_DRIVER=collection`).
- [x] `docs/configuration.md` : la ligne qui décrit la synchronisation au déploiement dit qu'un
      échec l'arrête.

## Critères d'acceptation

- [x] AC1 — `php artisan scout:sync-index-settings` en échec : `release.sh` sort en 1.
- [x] AC2 — dans ce cas, aucun `scout:import` n'est lancé.
- [x] AC3 — sous `SCOUT_DRIVER=collection`, la synchronisation n'est pas jouée et `release.sh`
      sort en 0.
- [x] AC4 — le tri de `PropertySearchService` n'est pas touché : pas de tri dégradé.

## Hors périmètre

- Le tri dégradé côté `PropertySearchService` : écarté par la décision du porteur.
- Les autres étapes tolérées de `release.sh` (`membership:reconcile-system-roles`,
  `geo:sync-referential`, `tags:sync-catalog`, `scout:import`) gardent leur avertissement.
- La documentation de `docs/infra/` (chemin fermé à l'implémenteur) et le plan du 2026-09-13, qui
  recopie l'ancien bloc : non retouchés.

## Notes d'implémentation

- **Reproduction** : le harnais, avant correctif, rend `attendu « 1 », obtenu « 0 »` sur la sortie
  et `attendu « 0 », obtenu « 2 »` sur les importations : le déploiement continuait et réimportait.
- **Ablation** : `release.sh` remis à sa version de `pre-dev` → les deux mêmes vérifications
  rouges ; correctif remis → `13 vérifications et une ablation`, vert.
