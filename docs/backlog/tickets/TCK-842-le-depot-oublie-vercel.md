---
id: TCK-842
title: "Le dépôt oublie Vercel : relevé, garde, replis NEXT_PUBLIC_* et conditions de build devenus du code mort"
status: todo
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
tags: [infra, front, ci, vercel, adr-0028, adr-0069]
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

## Critères d'acceptation

- [ ] AC1 — `git grep -n -i vercel -- takussan-web/src takussan-web/next.config.ts
      takussan-web/Dockerfile takussan-api/config scripts .github` ne rend plus que les exceptions
      listées dans les notes, chacune justifiée (ex. `_vercel` dans `robots.ts` et
      `i18n/routing.ts`, si on le garde).
- [ ] AC2 — `node scripts/check-front-env-keys.mjs` est vert, et rougit toujours par ablation sur
      une `NEXT_PUBLIC_*` ajoutée au `Dockerfile`, à `images.yml`, puis à `web-ci.yml`.
- [ ] AC3 — `deploy/takussan/smoke-web.sh` est vert, sans `TAKUSSAN_LOADER_MEDIA` dans l'image.
- [ ] AC4 — `npm run lint`, `npx tsc --noEmit`, `npm run test` et tous les `npm run check:*` sont
      verts ; `php artisan test` sur les tests CORS.
- [ ] AC5 — `node scripts/check-doc-links.mjs` est vert après la suppression du relevé.

## Hors périmètre

- **Les textes légaux** (`src/content/legal/privacy.ts`, `editeur.ts`, `notice.ts`) nomment Vercel
  comme hébergeur et sa mesure d'audience. C'est du contenu juridique public : il se corrige sur
  décision du porteur, avec le nouvel hébergeur, pas dans ce ticket.
- ADR-0017, l'ardoise D-04 et D-10, TCK-332 : F5, étape 3, qui attend la production (TCK-517).

## Notes d'implémentation

_(à remplir par implementing-specs)_
