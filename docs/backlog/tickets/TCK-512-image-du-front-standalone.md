---
id: TCK-512
title: "Front — une image Next.js standalone par environnement, qui refuse de se construire sans ses origines"
status: todo
phase: P0
family: technique
estimate: S
wave: 64
created: 2026-09-13
updated: 2026-09-13
depends_on: []
blocks: [TCK-513]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, front, docker, nextjs, adr-0028]
---

## Objectif utilisateur

Que le front de préproduction soit servi depuis le VPS, avec les origines de SON environnement, et
que le code servi se prouve par un en-tête.

## Contrat de données

Décision : [ADR-0028](../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md) §3 et §10. Code et
test : [plan, tâche B3](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#tâche-b3--limage-du-front).

## Contraintes strictes (métier)

- `NEXT_PUBLIC_*` est inlinée à la compilation : une image par environnement, jamais une image
  « générique » dont les origines seraient fausses.
- Le build échoue sans `NEXT_PUBLIC_API_URL` ni `NEXT_PUBLIC_SITE_URL` : `robots.txt` retombe sinon
  en silence sur `https://www.takussan.com`.

## Delta à produire

- [ ] `takussan-web/Dockerfile`, `takussan-web/.dockerignore`
- [ ] `takussan-web/next.config.ts` : `output: 'standalone'`, en-tête `X-Build-Sha`
- [ ] `deploy/takussan/smoke-web.sh`

## Critères d'acceptation

- [ ] AC1 — `smoke-web.sh` rend ses six `✓`
- [ ] AC2 — l'ablation de la garde d'origines fait rougir le test sur le repli de `robots.txt`
- [ ] AC3 — lint, `tsc --noEmit`, tests et build du front restent verts

## Hors périmètre

- Le front de production, toujours servi par Vercel jusqu'à TCK-517.

## Notes d'implémentation

_(à remplir par implementing-specs)_
