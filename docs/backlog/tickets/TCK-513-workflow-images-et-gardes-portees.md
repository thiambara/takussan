---
id: TCK-513
title: "CI — images.yml construit, pousse, déclenche Dokploy et prouve ; les gardes quittent la chaîne bash"
status: doing
phase: P0
family: technique
estimate: M
wave: 64
created: 2026-09-13
updated: 2026-09-13
depends_on: [TCK-511, TCK-512]
blocks: [TCK-514, TCK-515]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, ci, github-actions, gardes, adr-0028]
---

## Objectif utilisateur

Qu'un déploiement ne se déclare réussi que lorsque l'URL publique sert le commit attendu — et que
les gardes du dépôt surveillent la chaîne qui existe, plus celle qu'on retire.

## Contrat de données

Décision : [ADR-0028](../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md) §2 et §10. Code,
ablations et inventaire des suppressions : [plan, tâches B4 et B5](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#tâche-b4--le-workflow-qui-construit-déploie-et-prouve).

## Contraintes strictes (métier)

- Le déploiement est **sauté**, jamais échoué, tant que l'environnement GitHub n'a pas ses variables Dokploy.
- Aucune garde retirée sans son remplaçant : le test de réindexation de la recherche est porté, pas perdu.
- Chaque garde modifiée se prouve par ablation.

## Delta à produire

- [ ] `.github/workflows/images.yml` ; retrait de `deploy.yml` et `deploy-preview.yml`
- [ ] `scripts/test-release-reindex.sh` ; `check-queues.mjs`, `check-front-env-keys.mjs`, `check-heredocs.mjs` portés
- [ ] retrait de `scripts/deploy.sh`, `server-setup.sh`, `seed-environnement.sh`, `seed-remote.sh` et des scripts de déploiement liés, après relecture

## Critères d'acceptation

- [ ] AC1 — `actionlint` vert ; la preuve `X-Build-Sha` extraite du YAML rejouée en local
- [ ] AC2 — `test-release-reindex.sh` rend ses onze `✓`, et son ablation rougit
- [ ] AC3 — chaque ablation de B5 rougit la garde visée ; toutes les gardes vertes ensuite

## Hors périmètre

- Le raccordement réel à Dokploy et le premier déploiement observé (TCK-515).

## Notes d'implémentation

**2026-09-13, branche `feat/auto-hebergement-dokploy`.**

- Majeures des actions Docker mesurées (`gh api repos/<action>/releases/latest`) : `setup-buildx`
  v4.3.0, `login` v4.6.0, `build-push` v7.3.0 — le plan disait `@v3`, `@v3`, `@v6`.
- AC1 — `actionlint` vert sur `images.yml` et `repo-ci.yml`. La preuve extraite du YAML, rejouée
  contre l'image du front sur un port local : `✓ …/up sert smoke`, `✓ …/robots.txt sert smoke`,
  code 0 ; avec un SHA faux, `::error::… sert « smoke » au lieu de 0000…`, code 1.
- AC2 — `scripts/test-release-reindex.sh` : dix vérifications et une ablation, vertes, code 0.
- AC3 — ablations : `media` retirée de `worker-media` → `check-queues` rougit (« `media` — absente de :
  serveur ») ; l'`ARG` ou le `build-arg` de `NEXT_PUBLIC_SITE_URL` retiré → `check-front-env-keys`
  rougit. Chaque fichier restauré, `md5` contrôlé. Toutes les gardes vertes après le retrait.
- Retirés après relecture de leur en-tête, chacun avec son successeur : `deploy.yml`,
  `deploy-preview.yml`, `deploy.sh` (ses onze étapes ont chacune un successeur : `release.sh`,
  l'`entrypoint`, l'image, la sonde, `X-Build-Sha`, le nettoyage de Dokploy), `server-setup.sh`,
  `seed-environnement.sh` et `seed-remote.sh` (`seed.sh` refuse toute base hors `*_preview` et
  `*_smoke`), `deploy-preview-vps.sh`, `deploy-prod-vps.sh`, `test-deploy-search-reindex.sh`.
- `actionlint` sur tout le dépôt signale deux remarques de shellcheck dans `api-ci.yml`
  (SC1003, SC2011), fichier que cette branche ne touche pas.
