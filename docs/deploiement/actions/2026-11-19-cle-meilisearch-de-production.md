---
titre: "Créer la clé Meilisearch `prod_*` à actions nommées (14, dont indexes.swap), et ses preuves inverses"
type: cle-env
tickets: [TCK-517]
cles: [MEILISEARCH_KEY]
creee: 2026-11-19
preview: fait
production: a-faire
---

## Quoi faire

[Plan, F1, étape 4](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md) renvoie à la commande d'A4, étape 6, qui liste **13** actions : elle est
**fausse**. La préproduction a dû passer à **14** le 2026-11-04, en ajoutant `indexes.swap` : sans elle,
`/api/search/suggest` rendait 500 (hebergement.md). Créer la clé avec les 14 actions, sur `prod_*`.

## Comment vérifier

Avec la clé : 202 sur une tâche `prod_sonde`, 403 sur `preview_sonde`, 403 sur `GET /keys`, `/dumps` et `/snapshots`.

## Historique

- 2026-11-19 · preview · fait · Claude (inventaire, pour le porteur) · reporté de hebergement.md (clé à 14 actions, 2026-11-04), non re-mesuré le 2026-11-19
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · aucune clé `prod_*` relevée ; corriger la liste d'actions du plan avant de la recopier
