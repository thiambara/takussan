---
id: TCK-931
title: "La phase F se réécrit sur ADR-0069 : F2 réétiquette l'image de la préproduction, F3 met en service un environnement Dokploy `production`"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-930]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, production, documentation, adr-0028, adr-0069]
---

## Contexte

Étape 6, la dernière, de l'application d'[ADR-0069](../../adr/0069-deux-environnements-dokploy-configuration-hors-de-github.md).
Le plan de la phase F (`docs/plans/2026-09-13-auto-hebergement-vps-dokploy.md`) décrivait encore la
production d'avant cette décision : un environnement GitHub `prod` avec réviseur, des URL écrites
dans `images.yml` et une image de front construite pour la production, un Redis partagé séparé par
`REDIS_DB` 2/3, `API_INTERNAL_URL` sur un nom de conteneur, et une bascule depuis Vercel avec retour
arrière par le CNAME Vercel — alors que Vercel est supprimé et que `www` n'a plus d'enregistrement.

## Objectif utilisateur

Le jour où le porteur ouvre la phase F, le plan qu'il suit décrit le serveur tel qu'il est, et
aucune étape ne recrée ce qu'ADR-0069 a retiré.

## Delta produit

- **F2** : `images.yml` sur `master` = une ligne du `case` (`environnement=production`,
  `prefixe=PRODUCTION`), l'image réétiquetée sans reconstruction ; plus d'environnement GitHub ni de
  réviseur ; plus de retrait de `@vercel/analytics` (fait par TCK-842) ; la 308 vers `/fr` reste.
- **F3** : mise en service, non plus bascule. Environnement Dokploy `production` créé depuis une
  table, jamais par `environment.duplicate` ; `IMAGE_TAG=production`, `API_ALIAS`, `REDIS_PASSWORD`
  propre à la pile ; front à configuration d'exécution (`API_URL`, `SITE_URL`, `MEDIA_URL`,
  `API_INTERNAL_URL` sur l'alias, `VISITOR_IP_TRUSTED_HOPS` après la mesure de préproduction) ;
  identifiants `PRODUCTION_*` au niveau du dépôt ; `www` en A proxifié ; retour arrière par retrait
  de l'enregistrement ou réétiquetage d'un `sha-` ; restauration par WAL-G (TCK-930).
- **F1** : plus de relevé Vercel ni CheckPrint Plus, étape MySQL sans objet, sauvegardes de
  `takussan_prod` seule (et la règle des 8 copies sous le verrou), filtre de conteneur de la base
  corrigé (l'image n'est plus `pgvector/pgvector:pg17`).
- **F5, étape 4** : les conteneurs se trouvent par nom exact (`redis-takussan` n'existe plus, et
  deux `-f name=` se combinent en OU) ; **F5, étape 3** : la garde de `master` est sa protection.
- **D6** : même correction du filtre de conteneur, dans la commande de comptage.

## Critères d'acceptation

- [x] **AC1** — `grep -nE "environnement GitHub .prod.|réviseur|REDIS_DB|redis-takussan|CNAME Vercel|ancestor=pgvector|checkprintplus_prod"`
      sur les tâches F1 à F3 et F5 du plan ne rend que des mentions historiques datées (« retiré »,
      « annulée », « sans objet »), aucune consigne.
- [x] **AC2** — Chaque nom que F2 et F3 donnent à lire existe : `prefixe` et le `case` dans
      `images.yml`, `raccorde=non` quand Dokploy n'est pas raccordé, `API_ALIAS` et `redis` dans
      `deploy/takussan/compose.api.yml`, `dynamic = 'force-dynamic'` dans `sitemap.ts` (TCK-831).
- [x] **AC3** — Toutes les gardes du dépôt sont vertes.

## Notes d'implémentation

- Fait relevé en écrivant F2 : sans les identifiants `PRODUCTION_*`, `images.yml` ne rougit pas —
  il pousse l'image et sort en vert (`raccorde=non`). Le plan le dit, pour qu'un vert sur `master`
  avant F3 ne passe pas pour un déploiement.
