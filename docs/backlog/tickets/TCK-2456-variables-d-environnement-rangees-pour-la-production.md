---
id: TCK-2456
title: "Variables d'environnement rangées pour la mise en production : gabarits Dokploy, garde et comparaison de configuration"
status: done
phase: P2
family: technique
estimate: M
wave: 80
created: 2026-11-01
updated: 2026-11-01
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [infra, env, deploiement, production]
---

## Objectif

Le porteur prépare la mise en production : toutes les variables qu'on doit avoir, en local et sur Dokploy, même sans valeur,
rangées de la même façon. Ce ticket ne touche ni à Dokploy ni au serveur : il livre ce qu'on y recopie.

## Livraison

- `takussan-api/.env.example`, `.env.docker` et `takussan-web/.env.example` réordonnés en sections communes, sans qu'aucune paire
  clé=valeur active change ; les clés manquantes y entrent commentées (`.env.example` est l'environnement de test de la CI, D-54).
- `deploy/takussan/env.api.production.example` et `env.web.production.example` : le gabarit de l'onglet *Environment*.
- `deploy/takussan/comparer-config-env.php` : les chemins de configuration qu'un fichier change, jamais une valeur.
- `scripts/check-env-production.mjs` : le code, `.env.example`, les gabarits et la liste des résidus motivés se couvrent.
- `docs/infra/hebergement.md` : le renvoi aux gabarits et le passage de gabarit à environnement.

## Critères d'acceptation

- [x] Toute clé lue par le code est au gabarit, ou dans les résidus avec son motif : `node scripts/check-env-production.mjs`.
- [x] Les paires clé=valeur actives de `.env.example` et `.env.docker` sont celles d'avant, comparées par `Dotenv::parse`.
- [x] `php comparer-config-env.php <gabarit>` ne fait différer que les valeurs voulues, et n'imprime aucune valeur.
- [x] Une clé retirée, un secret posé ou `APP_DEBUG=true` dans un gabarit fait rougir la garde (ablation).
