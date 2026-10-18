---
id: TCK-832
title: "images.yml : une image par commit étiquetée par son arbre, sans environnement GitHub"
status: doing
phase: P1
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-831]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, ci, docker, github, dokploy, adr-0069, adr-0028]
---

## Contexte

[ADR-0069](../../adr/0069-deux-environnements-dokploy-configuration-hors-de-github.md) §§ 2 et 3,
étape 3 de son Application. Avant :

- `images.yml` construisait une image de front par environnement (`preview-sha-<commit>`) ;
- son `case` portait les trois URL de la préproduction ;
- le job `deploy` lisait l'environnement GitHub `preview`, qui porte trois variables Dokploy et deux
  secrets. Les noms d'environnement ne tenant pas compte de la casse, c'est le même que `Preview`,
  celui des déploiements de Vercel (mesuré : `Preview` et `Production`, sans règle, et 91 + 9
  déploiements).

Sur un dépôt privé gratuit, cet environnement et ses secrets disparaîtraient. Et faute de
déclencheur, le job s'arrêtait en notice, **vert**, sans rien déployer.

Depuis TCK-831, le front lit sa configuration à l'exécution : rien n'empêche plus une image par
commit.

## Objectif utilisateur

Un commit dont l'arbre a déjà été construit n'est pas reconstruit : la production servira l'image
que la préproduction a servie. Et le déploiement ne dépend plus d'aucun environnement GitHub.

## Contraintes strictes

- Les étiquettes `sha-` ne se déplacent jamais ; l'étiquette d'environnement, si.
- GitHub ne garde que de quoi déclencher et prouver, en secrets et variables de dépôt.
- La preuve reste `X-Build-Sha` sur l'URL publique.

## Delta à produire

- `images.yml` :
  - une matrice de trois images (API, graine de l'API, front) ;
  - les étiquettes `sha-<commit>`, `tree-<arbre>` et `<environnement>` ;
  - réétiquetage par `imagetools create` quand `tree-<arbre>` existe, construction sinon ;
  - un cache unique `web` pour le front ;
  - aucun `environment:` ;
  - un `case` qui ne rend que l'environnement et le préfixe ;
  - le front déclenché par son webhook Dokploy, l'API par la clé d'API ;
  - la preuve accepte un commit de même arbre.
- `web-ci.yml` : cache du build de contrôle en `scope=web`.
- `scripts/check-workflows-sans-environnement.mjs` : aucun `environment:` dans un workflow, aucune
  URL dans le `case`.
- Secrets et variables de dépôt :
  - variables : `DOKPLOY_URL`, `PREVIEW_DOKPLOY_API_COMPOSE_ID`, `PREVIEW_API_URL`,
    `PREVIEW_SITE_URL` ;
  - secrets : `DOKPLOY_API_KEY`, `PREVIEW_DOKPLOY_WEB_WEBHOOK`, `PREVIEW_BASIC_AUTH`.
- Dans Dokploy : `API_URL`, `SITE_URL` et `MEDIA_URL` sur `takussan-web-preview`.

## Critères d'acceptation

- [x] AC1 — `takussan-web-preview` porte `API_URL`, `SITE_URL` et `MEDIA_URL` (relus par
      `application.one`).
- [x] AC2 — Le déclencheur est mesuré avant d'être choisi.
  - Webhook du front sans charge utile : `200`, et un déploiement « NEW CHANGES » `done`.
  - Webhook du Compose : `400` « Automatic deployments are disabled ». Avec le déploiement
    automatique activé : `301` « Branch Not Match ».
  - Le Compose est donc déclenché par la clé d'API, et son déploiement automatique est remis à
    `false`.
- [x] AC3 — Les sept secrets et variables de dépôt existent. `PREVIEW_BASIC_AUTH` ouvre la
      préproduction : `401` sans, `200` avec.
- [x] AC4 — `node scripts/check-workflows-sans-environnement.mjs` est vert, et rougit par ablation
      sur un `environment: preview` ajouté au job `deploy`, puis sur une URL ajoutée au `case`.
      `actionlint` passe sur `images.yml`.
- [ ] AC5 — Premier push sur `preview` avec ce workflow : les trois images sont construites avec
      leurs trois étiquettes, la preuve passe sur l'API et sur le front, et le journal ne porte pas
      la notice « pas raccordé ». Puis un `workflow_dispatch` sur le même commit réétiquette au
      lieu de reconstruire, et passe la preuve.
- [ ] AC6 — Les secrets et variables de l'environnement GitHub `Preview` sont retirés une fois AC5
      vert, et l'environnement est supprimé.

## Hors périmètre

- `master` et l'environnement `production` : phase F, avec la réécriture de F2 et F3 (étape 6).
- Redis et le nom d'API par environnement : étape 4.

## Notes d'implémentation

- **`imagetools inspect`** rend `0` sur une étiquette existante et `1` (« not found ») sur une
  absente, mesuré sur `ghcr.io/thiambara/takussan-web`. Toute autre erreur mène à une construction :
  l'échec va dans le sens sûr.
- **La preuve accepte un commit de même arbre.** Une image réétiquetée porte le `BUILD_SHA` du
  commit qui l'a construite. Après `dev → preview → master`, `X-Build-Sha` désignera donc le commit
  de `preview`. Le job récupère ce commit (`git fetch --depth=1`) et compare son arbre.
- **L'API et sa graine se construisent désormais en parallèle**, dans deux jobs. La graine ne
  partage plus le constructeur local de l'image `runtime`, seulement le cache `gha` de portée `api`.
- **Vercel recrée ses environnements GitHub** (`Preview`, `Production`) à chaque déploiement, jusqu'à
  F5. Supprimer `Preview` en retire les secrets : c'est ce qui compte pour un dépôt privé. La garde
  `front-deploy-map.yml` compte les déploiements « Production » de Vercel.
