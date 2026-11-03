---
id: TCK-524
title: "Protection des branches — `preview` et `master` n'acceptent qu'une PR verte ; `dev` reste libre à cause de la carte d'impact"
status: done
phase: P0
family: technique
estimate: S
wave: 64
created: 2026-09-14
updated: 2026-09-14
depends_on: [TCK-515]
blocks: [TCK-517]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, github, ci, securite, adr-0028]
---

## Objectif utilisateur

Qu'un commit qui déploie une préproduction — et demain la production — soit passé par une PR et
par la CI, et qu'un push direct soit refusé plutôt que déployé.

## Contrat de données

Mesuré le 2026-09-14 : `gh api repos/thiambara/takussan/branches/{preview,master,dev}/protection`
→ **404** sur les trois. Un `push` direct sur `preview` déclenche `images.yml`, donc un
déploiement, sans PR ni check. Les environnements GitHub `Preview` et `Production` existent (créés
par Vercel), sans règle de protection ; le réviseur de `Production` est prévu en F2 (TCK-517).
⚠ `dev` reçoit un push direct d'un step de CI (régénération de la carte d'impact, TCK-479, qui a
mesuré ce même 404) : la protéger casserait ce step — hors de ce ticket.

## Contraintes strictes (métier)

- `preview` et `master` : PR obligatoire, checks requis = les jobs des trois workflows (`api-ci`,
  `web-ci`, `repo-ci`) tels que GitHub les nomme, `enforce_admins` activé, pas de force-push, pas de
  suppression.
- Le rituel actuel (`gh pr merge` de `dev` vers `preview`) doit rester possible sans clic
  supplémentaire : pas de réviseur obligatoire sur les branches (le porteur est seul), le réviseur
  vit sur l'environnement `Production` (F2).
- Les noms de checks requis se relèvent (`gh api …/check-runs`), jamais recopiés d'un fichier.

## Delta à produire

- [x] Règles posées par `gh api -X PUT …/branches/preview/protection` et `…/master/protection`, la
  commande complète dans le ticket
- [x] Ablation : un `git push origin HEAD:preview` direct est **refusé** ; une PR `dev → preview`
  fusionne normalement une fois verte
- [x] `CLAUDE.md`, « Workflow git » : la protection, ce qu'elle exige, et pourquoi `dev` n'y est pas
  (TCK-479)
- [x] `docs/infra/hebergement.md` : ligne « Protection des branches », commande de relecture
- [x] `.github/workflows/promotion-ci.yml` + `workflow_call` et `branches-ignore` sur les trois CI,
  garde `scripts/check-promotion-ci.mjs` (non prévu par le ticket, imposé par la mesure — notes)

## Critères d'acceptation

- [x] AC1 — `gh api …/branches/preview/protection -q .required_status_checks.contexts` liste les
  checks, même chose pour `master`
- [x] AC2 — le push direct de l'ablation est rejeté (`protected branch hook declined`)
- [x] AC3 — une PR `dev → preview` fusionnée après ce ticket déploie et prouve (`images.yml` vert
  avec la ligne `X-Build-Sha`)
- [x] AC4 — le step de la carte d'impact sur `dev` fonctionne toujours (run cité)

## Hors périmètre

- La protection de `dev` : dépend d'une reprise du step de TCK-479 (jeton d'application ou
  exception), ticket à part si on la veut.
- Le réviseur de l'environnement `Production` : TCK-517, F2.

## Notes d'implémentation

- **Le contrat du ticket ne pouvait pas tenir tel quel, et c'est la mesure des noms qui l'a dit.**
  Sur la dernière promotion fusionnée (#271, tête `01d8a31e`), `gh api …/check-runs` rend
  `Gardes documentaires`, `lint-and-test`, `Rollback des migrations…` — **pas** `Web (ESLint + tsc +
  Vitest + build)` : `web-ci` n'a pas tourné, ses chemins n'étaient pas touchés. Un check requis qui
  ne se déclenche pas bloque la PR (« Expected — Waiting for status to be reported ») ; requis tels
  quels, les jobs des trois CI auraient interdit toute promotion qui ne les déclenche pas tous — une
  promotion de documentation, par exemple. D'où `promotion-ci.yml` : sur toute PR vers `preview` ou
  `master`, il **appelle** les trois workflows (`uses:`, `secrets: inherit`, `permissions:
  contents: write` pour le job `lint-and-test` qui le déclare), sans filtre ; les trois portent
  `workflow_call:` et `branches-ignore: [preview, master]` pour ne tourner qu'une fois par
  promotion. Les noms requis sont ceux que GitHub a rendus sur la PR de mesure #286 (fermée sans
  fusion) : préfixés du nom du job appelant — `API / …`, `Front / …`, `Dépôt / …`.
- **Commande posée le 2026-09-14, 22:51 Z**, sur `preview` puis `master` :

  ```bash
  gh api -X PUT repos/thiambara/takussan/branches/preview/protection --input protection.json
  ```

  avec `protection.json` :

  ```json
  {
    "required_status_checks": { "strict": false, "contexts": [
      "API / lint-and-test",
      "API / Rollback des migrations sur PostgreSQL 17 (le code que rien d'autre n'exécute)",
      "API / Image de l'API (construite, pas poussée)",
      "Front / Web (ESLint + tsc + Vitest + build)",
      "Front / Image du front (construite, pas poussée)",
      "Dépôt / Gardes documentaires" ] },
    "enforce_admins": true,
    "required_pull_request_reviews": { "required_approving_review_count": 0 },
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false,
    "required_linear_history": false,
    "required_conversation_resolution": false
  }
  ```

  Réponse relue : `enforce_admins.enabled = true`, 6 contextes, `strict = false`, 0 réviseur,
  force-push et suppression `false` — identique sur les deux branches. `rulesets` → `[]`.
- **AC2, mesuré le 2026-09-14** : un commit vide posé sur `origin/preview` dans un worktree jetable,
  `git push origin HEAD:preview` → `remote: error: GH006: Protected branch update failed`, « Changes
  must be made through a pull request », « 6 of 6 required status checks are expected », `!
  [remote rejected] HEAD -> preview (protected branch hook declined)` ; `origin/preview` toujours
  `ad93e5e6`.
- `scripts/check-promotion-ci.mjs` garde l'appariement (chaque `*-ci.yml` à `pull_request` est
  appelé, porte `workflow_call:` et `branches-ignore`) ; deux ablations rouges en local (un `uses:`
  retiré ; `branches-ignore` retiré de repo-ci). Elle ne relit pas la protection elle-même, qui vit
  chez GitHub : la commande de relecture est au relevé.
- AC3 et AC4 se mesurent **après** la fusion de ce ticket sur `dev` : la première promotion
  `dev → preview` qui suit (images.yml avec la ligne `X-Build-Sha`), et le run d'`api-ci` sur `dev`
  qui rejoue le step de la carte d'impact. Ils sont cochés par le commit qui ferme le ticket.
- **AC3, mesuré le 2026-09-14** : la promotion #287 (`dev → preview`) a attendu les six checks
  requis (`BLOCKED` tant que `API / lint-and-test` et `Front / Web (…)` étaient `pending`, puis
  `CLEAN`), fusionnée en `e40a0d9d` ; `images.yml` run **34909614092** (`push`, `success` à
  23:40:40 Z) : `✓ https://preview.api.takussan.com/up sert e40a0d9d…` et
  `✓ https://preview.takussan.com/robots.txt sert e40a0d9d…` ; `curl -sI …/up` relu → `x-build-sha:
  e40a0d9d…`. Le déploiement de l'API est passé par la commande en deux temps de TCK-522 et la
  preuve du front par le compte `ci` de TCK-525.
- **AC4, mesuré le 2026-09-14** : run `api-ci` **34907182820** sur `dev` (`push`, `7ed3d26f`, la
  fusion de ce ticket), job `lint-and-test`, step « Régénérer la carte d'impact » → `success`. Le
  step de TCK-479 pousse toujours sur `dev`, qui n'est pas protégée.
