---
id: TCK-288
title: "Chaine de deploiement — master fige, la production ne recoit plus rien"
status: todo
phase: P0
family: technique
estimate: M
wave: null
created: 2026-08-12
updated: 2026-08-12
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [infra, deploiement, decision]
---

## Objectif utilisateur

Que ce qui est développé arrive en production — et que si ce n'est pas le cas, quelque chose le
dise.

## Contexte mesuré (2026-08-12)

- `origin/master` est figé au **2026-05-18**, **31 commits derrière `dev`**.
- `.github/workflows/deploy.yml` ne déclenche la production **que** sur un push vers `master`.
- Conclusion : **la production ne reçoit plus rien depuis trois mois.** Tout le travail depuis
  mai — recherche Meilisearch, canal WhatsApp, refonte RBAC, profils polymorphes, corrections de
  sécurité — vit sur `dev` et n'a jamais été déployé.
- **Rien ne le signale.** Aucun document, aucune alerte, aucun badge. La configuration du dépôt
  continue même d'annoncer `master` comme branche principale, alors que **7 des 10 dernières PR
  mergées ciblaient `dev`**.

Le flux réel (`dev` → `preview` → `master`) n'est documenté nulle part : il ne se déduit que des
déclencheurs de workflows.

## Contraintes strictes (métier)

**Ce ticket est d'abord une DÉCISION, pas une implémentation.** Deux issues cohérentes :

**A — `master` reste la branche de production.** Il faut alors y amener `dev`, ce qui **déclenche un
déploiement de trois mois de travail d'un coup**. Ce n'est pas un merge, c'est une mise en
production majeure : elle demande une fenêtre, un dump préalable
([voir la section Rollback du guide](../../infra/deploy-preview.html)) et une vérification après
coup. **Rappel : le PHP de production doit être passé en 8.4 AVANT** — sinon `composer install`
échoue et le déploiement s'arrête (ardoise D-01).

**B — `dev` devient la branche de production.** Le déclencheur de `deploy.yml` suit `dev`,
`master` est archivé ou supprimé, et la configuration du dépôt est alignée. Plus simple, mais
supprime le palier de recette que `preview` et `master` formaient.

**L'état actuel — une branche de production abandonnée qui reste le déclencheur — est le seul qui
ne soit défendable d'aucune façon.**

## Delta à produire

- [ ] Trancher entre A et B.
- [ ] Appliquer : merge contrôlé, ou changement de déclencheur dans `deploy.yml`.
- [ ] **Écrire le flux de branches** — dans `CLAUDE.md` et le guide de déploiement. Aujourd'hui il
      ne se déduit que des `on: push: branches:` des workflows.
- [ ] Aligner la branche par défaut du dépôt sur la décision.
- [ ] Poser la garde qui empêche la récidive : une divergence prolongée entre la branche de
      production et la branche d'intégration doit **se voir**. Un écart de quelques commits pendant
      quelques heures est normal ; 31 commits pendant trois mois est une panne silencieuse.

## Critères d'acceptation

- [ ] AC1 — le flux de branches est écrit dans `CLAUDE.md`, et il correspond aux déclencheurs des
      workflows (vérifiable en lisant les deux).
- [ ] AC2 — un déploiement de production a réussi après la décision, healthcheck vert.
- [ ] AC3 — une garde signale une divergence anormale entre branche de production et `dev`.
- [ ] AC4 — l'entrée D-04 de `docs/ardoise.md` est fermée en citant ce ticket.

## Hors périmètre

- La migration PHP 8.3 → 8.4 du serveur (ardoise D-01) : **c'est un prérequis**, pas ce ticket.
- Le déploiement du frontend, entièrement hors dépôt sur Vercel (ardoise D-10).

## Notes d'implémentation

Ardoise D-04, seule dette **P0 non soldée** du chantier de reprise du 2026-08-12 — précisément
parce qu'un déploiement de production est une action sortante et difficilement réversible : elle
appartient à une personne, pas à un agent.
