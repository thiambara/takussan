---
id: TCK-512
title: "Front — une image Next.js standalone par environnement, qui refuse de se construire sans ses origines"
status: doing
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

**2026-09-13, branche `feat/auto-hebergement-dokploy`.**

- AC1 — `deploy/takussan/smoke-web.sh` : six `✓` (build refusé sans `NEXT_PUBLIC_SITE_URL`, conteneur
  sain, utilisateur `node` sans `.env`, `X-Build-Sha` et origine du site, `/fr` `/en` `/wo` à 200,
  optimiseur d'images en AVIF).
- Ablation du refus (`RUN test -n "$NEXT_PUBLIC_SITE_URL"` retiré) : le test rougit sur « l'image se
  construit SANS NEXT_PUBLIC_SITE_URL », code 1 ; `Dockerfile` restauré, `md5` contrôlé.
- AC2 — ce que la garde empêche, mesuré : l'image construite par une copie du `Dockerfile` SANS la
  garde, et sans `NEXT_PUBLIC_SITE_URL`, se construit (code 0) et sert
  `Sitemap: https://www.takussan.com/sitemap.xml` et
  `<link rel="canonical" href="https://www.takussan.com/fr"/>` : une préproduction qui se déclarerait
  la production. Image et conteneur supprimés, `takussan-web/` intact.
- `scripts/check-front-env-keys.mjs` lit désormais le `Dockerfile` et `images.yml` : retirer l'`ARG`
  ou le `build-arg` de `NEXT_PUBLIC_SITE_URL` la fait rougir, en nommant le fichier et
  `src/lib/alternates.ts:129`.
- Écart au plan : **pas de directive `# syntax=`**. Elle ajoute à chaque build une requête vers Docker
  Hub, et trois builds sont tombés dessus sur un délai dépassé ; aucune instruction des deux
  Dockerfiles ne dépend d'un frontend externe (vérifié : ni `--mount`, ni heredoc, ni `--link`).
- AC3 — `tsc --noEmit` 0, ESLint de `next.config.ts` 0, `npm run build` vert dans l'image.
- Défaut du test corrigé (mesuré sur la piste CheckPrint Plus, même code) : l'étape 1 comptait TOUT
  échec du build sans origine comme un refus — un délai dépassé de Docker Hub y passait pour la garde.
  Elle capture désormais la sortie en `--progress=plain` et exige `✗ NEXT_PUBLIC_SITE_URL manquant`.
  Rejoué : six `✓`, code 0, dont « build refusé sans NEXT_PUBLIC_SITE_URL, par sa garde ».
