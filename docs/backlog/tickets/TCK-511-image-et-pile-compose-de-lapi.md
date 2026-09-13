---
id: TCK-511
title: "API — une image FrankenPHP par commit et sa pile Compose, éprouvées en local"
status: doing
phase: P0
family: technique
estimate: M
wave: 64
created: 2026-09-13
updated: 2026-09-13
depends_on: []
blocks: [TCK-513]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, back, docker, frankenphp, adr-0028]
---

## Objectif utilisateur

Que l'API, ses files et son planificateur tournent partout depuis la même image, construite une fois
par commit, au lieu d'un `composer install` rejoué sur le serveur à chaque déploiement.

## Contrat de données

Décision : [ADR-0028](../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md) §3 à §5 et §8.
Code complet et tests : [plan, tâches B1 et B2](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#tâche-b1--limage-de-lapi).

## Contraintes strictes (métier)

- Aucun `.env` dans l'image : le poste en porte de réels, ignorés par git mais pas par Docker.
- Aucune configuration cuite au build ; `config:cache` au démarrage, jamais pour `release` et `seed`.
- Caddy sans `trusted_proxies` : seul Laravel remonte `X-Forwarded-For` (ADR-0028 §8).
- La file `media` et la file `default` ont chacune un consommateur (`scripts/check-queues.mjs`).

## Delta à produire

- [ ] `takussan-api/Dockerfile`, `.dockerignore`, `docker/{Caddyfile,php.ini,entrypoint.sh,lib.sh,release.sh,seed.sh}`
- [ ] `deploy/takussan/compose.api.yml`, `deploy/takussan/.env.smoke.example`
- [ ] `deploy/takussan/smoke-api.sh image|pile`

## Critères d'acceptation

- [ ] AC1 — `smoke-api.sh image` rend ses huit `✓`
- [ ] AC2 — l'ablation de `.env*` dans `.dockerignore` fait rougir `smoke-api.sh image` en nommant le fichier
- [ ] AC3 — `smoke-api.sh pile` rend ses `✓` (release idempotent, files consommées, en-têtes, taille de corps, redémarrages, seed)
- [ ] AC4 — chaque ablation du tableau de B2 fait rougir la vérification qu'elle vise

## Hors périmètre

- Le workflow qui construit et pousse l'image (TCK-513).

## Notes d'implémentation

_(à remplir par implementing-specs)_
