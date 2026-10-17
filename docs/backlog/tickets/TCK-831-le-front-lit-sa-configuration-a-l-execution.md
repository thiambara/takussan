---
id: TCK-831
title: "Le front lit sa configuration à l'exécution : une image par commit, refusée au démarrage sans API_URL, SITE_URL et MEDIA_URL"
status: doing
phase: P1
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-830]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, front, docker, configuration, sitemap, adr-0069, adr-0028, p34-02]
---

## Contexte

[ADR-0069](../../adr/0069-deux-environnements-dokploy-configuration-hors-de-github.md) § 3, étape 2
de son Application. L'image du front était construite **une par environnement** : l'origine de
l'API, celle du site et celle des médias y entraient en `NEXT_PUBLIC_*`, que Next inline à la
compilation, code serveur compris. La production ne pouvait donc pas servir l'image que la
préproduction avait servie.

Relevé avant le changement : 31 fichiers de `src/` lisaient ces trois clés, dont 25 redéclaraient
chacun `const API_URL = process.env.NEXT_PUBLIC_API_URL…replace(/\/api$/, '')` en constante de
module ; six s'exécutent dans le navigateur. Le build rendait 5 routes statiques, dont
`robots.txt` et `sitemap.xml`, qui portent l'origine du site.

La piste **P34.02** (validée le 2026-10-17) est incluse : le sitemap était prérendu au build, et le
build local en sortait 12 `<loc>`, l'API ne lui répondant pas.

## Objectif utilisateur

La même image de front sert la préproduction puis la production ; seules les variables posées dans
Dokploy changent. Un conteneur mal configuré ne sert rien, plutôt que de servir des canoniques
fausses.

## Contraintes strictes

- Aucun composant ne relit `process.env` côté client pour ces valeurs : le navigateur les reçoit du
  layout racine, par un module unique.
- Rien de secret ne passe par la configuration transmise au navigateur, et une garde le vérifie.
- Le build de Vercel (production jusqu'à la phase F) et `next dev` continuent de marcher sans rien
  changer à leurs variables : le repli `NEXT_PUBLIC_*` reste, jusqu'à F5.

## Delta à produire

- `src/lib/config-publique.ts` : `origineApi()`, `origineSite()`, `origineMedia()`, lues à
  l'appel ; côté serveur `API_URL` / `SITE_URL` / `MEDIA_URL`, puis le repli `NEXT_PUBLIC_*` ; côté
  navigateur `window.__TAKUSSAN_CONFIG__`. `resoudreOrigineSite()` y déménage, `alternates.ts` le
  réexporte ; `ORIGINE_SITE` devient `origineSite()`.
- Le layout racine écrit `window.__TAKUSSAN_CONFIG__` dans `<head>`, `<` et U+2028/2029 échappés.
- Les 25 constantes locales, `lib/api.ts`, `sw.js` et le loader d'images passent par le module.
- `robots.txt` et `sitemap.xml` en `force-dynamic` ; les appels du sitemap en
  `next: { revalidate: 3600 }` (P34.02).
- `next.config.ts` : le loader de Cloudflare se branche aussi sur `TAKUSSAN_LOADER_MEDIA=1`, posé
  par le `Dockerfile`.
- `takussan-web/docker/demarrer.mjs`, nouveau `CMD` : refuse de démarrer sans les trois origines
  bien formées, puis importe `server.js`. Le `Dockerfile` perd ses `ARG`/`ENV` `NEXT_PUBLIC_*` et
  leurs refus ; `images.yml` ne passe plus que `BUILD_SHA`.
- `scripts/check-front-env-keys.mjs` : lecture confinée au module (et à `next.config.ts`), aucune
  `NEXT_PUBLIC_*` dans le `Dockerfile` ni dans `images.yml`, liste fermée des clés transmises au
  navigateur et des variables que le module lit.
- `deploy/takussan/smoke-web.sh` : refus au démarrage, puis la même image sur deux origines.

## Critères d'acceptation

- [ ] AC1 — `config-publique.test.ts` : une valeur posée APRÈS l'import change ce que rendent
      `origineApi()`, `origineSite()` et `origineMedia()`. Éprouvé par ablation : une constante de
      module dans `origineApi()` rougit 5 tests.
- [ ] AC2 — `demarrer.test.ts` rejoue `docker/demarrer.mjs` à côté d'un faux `server.js` : il
      démarre avec les trois origines, et sort en 1 sans démarrer, en nommant chaque clé fautive,
      pour une clé absente, blanche, avec barre finale, chemin, sans schéma ou en `ftp:`. Éprouvé
      par ablation : sans `process.exit(1)`, 9 tests rougissent ; sans le contrôle d'origine, 2.
- [ ] AC3 — `node scripts/check-front-env-keys.mjs` est vert, et rougit, par ablation, sur chacun
      de : un composant client qui lit `process.env.NEXT_PUBLIC_API_URL`, un fichier qui lit
      `process.env.API_URL`, un `ARG NEXT_PUBLIC_SITE_URL` dans le `Dockerfile`, une clé de plus dans
      `ConfigPublique`, une variable de plus lue par le module.
- [ ] AC4 — `npm run build` : `/robots.txt` et `/sitemap.xml` ne sont plus prérendus.
- [ ] AC5 — `deploy/takussan/smoke-web.sh` est vert : image sans `NEXT_PUBLIC_*`, démarrage refusé
      sans `SITE_URL` par sa garde, `robots.txt` sur l'origine posée, configuration écrite dans
      `/fr`, puis la même image sur `https://www.takussan.com`.
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit` et `npm run test` sont verts.

## Hors périmètre

- Poser `API_URL`, `SITE_URL` et `MEDIA_URL` sur `takussan-web-preview` dans Dokploy : à faire
  **avant** la promotion de ce ticket vers `preview` (`docs/infra/hebergement.md`).
- Les étiquettes `sha-` / `tree-`, la promotion par réétiquetage et le retrait de l'environnement
  GitHub d'`images.yml` : étape 3 d'ADR-0069.
- Le loader inconditionnel et le retrait du repli `NEXT_PUBLIC_*` : avec Vercel, en F5.
- Compter les `<loc>` du sitemap avant sa soumission : plan F3, hors agents (P34.02).

## Notes d'implémentation
