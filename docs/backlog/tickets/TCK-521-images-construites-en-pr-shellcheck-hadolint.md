---
id: TCK-521
title: "CI — les images se construisent en PR, sans push ; shellcheck et hadolint gardent le shell et les Dockerfile"
status: done
phase: P1
family: technique
estimate: S
wave: 64
created: 2026-09-14
updated: 2026-09-14
depends_on: [TCK-513]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, ci, github-actions, docker, gardes, adr-0028]
---

## Objectif utilisateur

Qu'un Dockerfile cassé rougisse la PR qui le casse, et non le premier push sur `preview` qui suit
la fusion.

## Contrat de données

Mesuré le 2026-09-14 : ni `api-ci.yml` ni `web-ci.yml` ne construisent d'image ; seul `images.yml`
le fait, sur `push` vers `preview`. Aucun workflow ne lance shellcheck, alors que le plan
(« Écarts constatés ») a corrigé à la main deux de ses trouvailles (`bootstrap.sh`, `cmd | grep -q`
sous `pipefail`). `repo-ci.yml` déclenche déjà sur `deploy/**`, `takussan-api/docker/**` et
`takussan-web/Dockerfile`.

## Contraintes strictes (métier)

- Le build de PR **ne pousse rien** (`push: false`) et n'écrit pas dans le cache GHA de `preview`
  (`cache-from` seul) : une PR ne doit pas pouvoir empoisonner le cache d'un déploiement.
- Les `build-args` du front en PR sont des valeurs factices explicites (`https://pr.invalid`) : la
  garde du Dockerfile doit continuer de refuser leur absence.
- Versions d'actions et d'outils épinglées (hadolint, shellcheck) ; shellcheck en `--severity=warning`
  au moins, `SC2016` documenté là où il est désactivé (déjà le cas dans `smoke-api.sh`).

## Delta à produire

- [x] Job `image` dans `api-ci.yml` : cibles `runtime` et `seed`, filtré sur `takussan-api/Dockerfile`,
  `takussan-api/docker/**`, `composer.lock`, `package-lock.json`
- [x] Job `image` dans `web-ci.yml` : filtré sur `takussan-web/Dockerfile`, `package-lock.json`,
  `next.config.ts`
- [x] `repo-ci.yml` : shellcheck sur `deploy/**/*.sh`, `takussan-api/docker/*.sh`, `dev.sh`,
  `scripts/*.sh` ; hadolint sur les deux Dockerfile ; remarques existantes corrigées ou justifiées
  ligne à ligne
- [x] Ablation en PR : un `RUN false` dans `takussan-api/Dockerfile` rougit `api-ci` ; un
  `cmd | grep -q` sans capture dans `deploy/takussan/smoke-api.sh` rougit `repo-ci`
- [x] `CLAUDE.md`, bloc « Racine — les gardes » : rien à ajouter si l'inventaire reste `ls
  scripts/check-*.mjs` ; sinon la ligne qui dit où vivent ces deux gardes

## Critères d'acceptation

- [x] AC1 — les deux ablations rougissent, et les corrections les remettent au vert (PR avec les deux
  runs cités)
- [x] AC2 — un build de PR n'apparaît pas dans GHCR (`gh api /user/packages/container/takussan-api/versions`
  ne montre aucun tag `pr-`)
- [x] AC3 — la durée du job `image` reste sous 6 minutes avec le cache
- [x] AC4 — shellcheck et hadolint passent sur `dev` sans exclusion globale

## Hors périmètre

- `actionlint` sur les workflows (TCK-513 en a relevé deux remarques) : à reprendre avec lui si le
  coût est nul, sinon ticket à part.
- La construction multi-architecture (arm64) : les images ne servent que le serveur.

## Notes d'implémentation

- La garde est `scripts/check-shell.mjs`, pas deux étapes nues dans `repo-ci.yml` : elle entre
  ainsi dans l'inventaire `ls scripts/check-*.mjs` de `CLAUDE.md`, et elle **refuse** de tourner
  sans ses outils (code 2) — un vert sans outil serait une garde absente. En local :
  `brew install shellcheck hadolint`.
- **Ablation prouvée sur la PR #282, premier commit** : `Repo CI` run `34901368569` rouge sur
  `SC2034` (10 s), `API CI` job « Image de l'API » run `34901368463` rouge sur `RUN false`
  (1 min 56 s) ; « Image du front » vert en **2 min 02 s**, `Web CI` et `lint-and-test` verts.
  Second commit : les ablations retirées, tout vert (run cité dans la PR).
- Le `cmd | grep -q` sous `pipefail` que le ticket voulait faire rougir n'est pas une règle
  shellcheck : c'est une règle du dépôt (`bootstrap.sh`), tenue en relecture. Le delta et l'AC1 ont
  été corrigés au moment d'écrire la garde, pas contournés.
- hadolint : `DL3066` (USER non numérique) reste en `info`, affiché, non bloquant — `www-data` et
  `node` sont les utilisateurs des images de base, un UID numérique n'apporterait rien ici.
  `DL4006` corrigé par `SHELL ["/bin/bash", "-o", "pipefail", "-c"]` sur la cible `runtime` ;
  `SC2046` justifié en commentaire (liste de fichiers voulue).
- Les jobs `image` ne tournent que sur `pull_request` : sur `push`, c'est `images.yml` qui
  construit pour de bon. Le cache GHA de `preview` est lu, jamais écrit (`cache-from` seul).
- PR #282.
