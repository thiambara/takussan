---
id: TCK-842
title: "Le dépôt oublie Vercel : relevé, garde, replis NEXT_PUBLIC_* et conditions de build devenus du code mort"
status: doing
phase: P1
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, front, ci, vercel, legal, adr-0028, adr-0069]
---

## Contexte

Vercel est supprimé : dernier déploiement de `vercel[bot]` le 2026-10-15 à 13:32 Z ; au
2026-10-18, `www.takussan.com` et `takussan.com` n'ont aucun enregistrement DNS, et l'environnement
GitHub `Production` est supprimé. C'est la [tâche F5, étape 1 du plan](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#tâche-f5--retirer-vercel-clore),
faite avant F3. La documentation a été mise à jour le 2026-10-18 ; **le code et les gardes, non** :
tout ce qui suit ne sert plus aucun build, mais reste lu, testé et gardé.

## Objectif utilisateur

Plus une ligne du dépôt ne décrit ni ne prévoit un build que personne ne fait : une condition
`process.env.VERCEL` ou un repli `NEXT_PUBLIC_*` fait croire à qui lit le code qu'il existe un
second chemin de production.

## Contraintes strictes

- Rien ne change pour l'image : `deploy/takussan/smoke-web.sh` reste vert.
- `next dev` continue de marcher avec `.env.local`. Si le repli `NEXT_PUBLIC_*` lui sert encore, le
  ticket le mesure et le dit, plutôt que de le garder « au cas où ».
- La garde `check-front-env-keys` ne perd aucun de ses refus sur le `Dockerfile`, `images.yml` et
  `web-ci.yml` : l'ablation de chacun est rejouée.

## Delta à produire

Repris de F5, étape 2, et complété par l'inventaire du 2026-10-18
(`git grep -n -i vercel -- takussan-web takussan-api scripts .github`) :

- **Relevé et garde** : `git rm .github/workflows/front-deploy-map.yml
  docs/infra/frontend-deploiement.md docs/infra/frontend-deploiement.json` ; dans
  `scripts/check-front-env-keys.mjs`, retirer `RELEVE` et tout ce qui lit `variables_build` ;
  réparer les liens (`node scripts/check-doc-links.mjs`).
- **`config-publique.ts`** : le repli `NEXT_PUBLIC_*` et la branche `VERCEL_ENV` / `VERCEL_URL` de
  `resoudreOrigineSite()`, avec leurs tests et les exceptions i18n qui les nomment
  (« `SITE_URL (NEXT_PUBLIC_SITE_URL sous Vercel)` »).
- **`next.config.ts`** : `output: process.env.VERCEL ? undefined : 'standalone'` devient
  inconditionnel ; le drapeau `TAKUSSAN_LOADER_MEDIA` disparaît, le loader de Cloudflare devient
  inconditionnel hors développement (ADR-0069 § 3) — le `Dockerfile` cesse de le poser.
- **`sw.js`** : `VERCEL_GIT_COMMIT_SHA` sort de `versionDuDeploiement()`.
- **`@vercel/analytics`** : `AudienceSansSecret`, son test et la dépendance. Hors de Vercel, le
  composant n'envoie rien.
- **API** : la règle `takussan-[a-z0-9-]+\.vercel\.app` de `takussan-api/config/cors.php` et son
  commentaire.
- **`.env.example`** (front) : les commentaires qui citent Vercel ou `VERCEL_URL`.
- **Textes légaux** (ajouté le 2026-10-18 sur décision du porteur) : Vercel quitte les hébergeurs
  des mentions légales et des sous-traitants de la politique de confidentialité, avec sa mesure
  d'audience ; `VERSION_DOCUMENTS` passe au 18 octobre 2026.

## Critères d'acceptation

- [x] AC1 — `git grep -n -i vercel -- takussan-web/src takussan-web/next.config.ts
      takussan-web/Dockerfile takussan-api/config scripts .github` ne rend plus que les exceptions
      listées dans les notes, chacune justifiée (ex. `_vercel` dans `robots.ts` et
      `i18n/routing.ts`, si on le garde).
- [x] AC2 — `node scripts/check-front-env-keys.mjs` est vert, et rougit toujours par ablation sur
      une `NEXT_PUBLIC_*` ajoutée au `Dockerfile`, à `images.yml`, puis à `web-ci.yml`.
- [x] AC3 — `deploy/takussan/smoke-web.sh` est vert, sans `TAKUSSAN_LOADER_MEDIA` dans l'image.
- [ ] AC4 — `npm run lint`, `npx tsc --noEmit`, `npm run test` et tous les `npm run check:*` sont
      verts ; `php artisan test` sur les tests CORS.
- [x] AC5 — `node scripts/check-doc-links.mjs` est vert après la suppression du relevé.

## Hors périmètre

- ADR-0017, l'ardoise D-04 et D-10, TCK-332 : F5, étape 3, qui attend la production (TCK-517).

## Notes d'implémentation

- **Le repli `NEXT_PUBLIC_*` ne servait plus `next dev`** : le serveur lit `API_URL`, `SITE_URL`
  et `MEDIA_URL` dans `.env.local` comme dans Dokploy, et le navigateur les reçoit du layout dans
  les deux cas. Retiré entièrement : le front ne lit plus aucune `NEXT_PUBLIC_*`. `.env.example`
  passe aux nouveaux noms ; `./dev.sh` signale un `.env.local` qui porte encore les anciens.
- **Le loader se branche sur `NODE_ENV=production`**, que `next build` pose avant de lire
  `next.config.ts` (`node_modules/next/dist/bin/next` : `NODE_ENV || defaultEnv`), et non plus sur
  le drapeau `TAKUSSAN_LOADER_MEDIA` du `Dockerfile`. Sous `next dev`, l'optimiseur reste.
- **La garde `check-front-env-keys` change d'objet** : sans relevé, elle refuse toute lecture de
  `NEXT_PUBLIC_*` dans le front, et exige les trois clés d'exécution dans `.env.example`. Elle
  n'était jouée en CI que par `front-deploy-map.yml` : elle passe dans `repo-ci.yml`, avec
  `check-workflows-sans-environnement` (TCK-832), qu'aucun workflow ne jouait.
- **Exceptions gardées (AC1)** : les commentaires d'`api-ci.yml` et `check-skip-ci-marker.mjs`
  (l'incident mesuré qui justifie leur garde), `manifest.test.ts` (refuse le `vercel.svg` du gabarit
  `create-next-app`) et `Logo.test.tsx` (l'histoire de la favicon). Les ADR, le journal, les
  tickets clos et le récit de l'ardoise gardent ce qu'ils ont cru.
- **Mesuré le 2026-10-18** : `npm run lint` 0 erreur, `npx tsc --noEmit` propre, tous les
  `npm run check:*` verts, `npx vitest run` 789 fichiers et 6 675 tests verts ; toutes les gardes
  `scripts/check-*.mjs` vertes ; `deploy/takussan/smoke-web.sh` vert (loader branché sans drapeau,
  `/_next/image` en 404).
- **Ablations, toutes rouges puis vertes une fois restaurées** : le repli `NEXT_PUBLIC_API_URL`
  remis dans `origineApi()` (test) ; le loader rebranché sur `TAKUSSAN_LOADER_MEDIA` (test) ;
  `output` conditionné à `VERCEL` (test) ; une `process.env.NEXT_PUBLIC_MEDIA_URL` dans
  `image-loader.ts`, un `ARG NEXT_PUBLIC_SITE_URL` dans le `Dockerfile`, une `NEXT_PUBLIC_API_URL`
  dans les `build-args` d'`images.yml`, `SITE_URL` renommée dans `.env.example`, une lecture de
  `VERCEL_URL` dans le module (garde).
- **Non joué en local** : la suite de l'API. Le changement de `config/cors.php` (le motif
  `*.vercel.app` retiré, aucune origine par motif) est rejoué par la CI.
