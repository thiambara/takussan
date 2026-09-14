---
id: TCK-526
title: "Reconstruction reproductible — `bootstrap.sh` épingle Docker, et la version de Dokploy est posée après l'installation"
status: todo
phase: P1
family: technique
estimate: S
wave: 64
created: 2026-09-14
updated: 2026-09-14
depends_on: [TCK-510]
blocks: [TCK-517]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, serveur, versions, d-09, adr-0028]
---

## Objectif utilisateur

Que « reconstruire le serveur depuis le dépôt » produise les versions relevées, et non celles du
jour où l'on relance deux scripts distants.

## Contrat de données

`deploy/server/bootstrap.sh` installe Docker par `curl -fsSL https://get.docker.com | sh` (mesuré le
2026-09-14 : `Docker version 29.8.0`) ; le runbook installe Dokploy par `curl …/install.sh | sh`
(relevé : `dokploy/dokploy:v0.30.6`). Ni l'un ni l'autre n'est épinglé — c'est l'écart que D-09 a
fermé pour l'applicatif (`docs/infra/versions.json`, `scripts/check-infra-versions.mjs`) et qui
revient par l'infrastructure. Docker publie ses paquets `docker-ce` par version dans son dépôt apt ;
Dokploy se met à jour par `docker service update --image`.

## Contraintes strictes (métier)

- La version épinglée est celle **relevée** sur le serveur, pas la dernière publiée : on reproduit
  d'abord, on met à jour ensuite, par un geste séparé et relevé.
- `bootstrap.sh` reste idempotent : rejoué, il ne rétrograde ni ne réinstalle un Docker déjà à la
  version épinglée, et **refuse** une autre version au lieu de l'écraser.
- Aucun `curl | sh` non épinglé ne subsiste dans `bootstrap.sh`.

## Delta à produire

- [ ] `bootstrap.sh` : dépôt apt de Docker, `docker-ce`, `docker-ce-cli`, `containerd.io`,
  `docker-compose-plugin` à la version relevée, `apt-mark hold` ; variable `DOCKER_VERSION` en tête,
  avec la date et la commande du relevé
- [ ] Runbook « Reconstruire le serveur », étape 6 : après `install.sh`, `docker service update
  --image dokploy/dokploy:v0.30.6 dokploy` (ou la variable d'`install.sh` si elle existe — à
  mesurer dans le script, pas supposer), puis relecture de la version
- [ ] `docs/infra/versions.json` : entrées `docker` et `dokploy`, `prod` en `etat: mesure` avec la
  commande, et la garde `check-infra-versions.mjs` étendue si elle ne lit pas `bootstrap.sh`
- [ ] Ablation : `DOCKER_VERSION` changée pour une version absente → `bootstrap.sh` échoue sur apt
  avant d'avoir touché au système (ordre des étapes vérifié)

## Critères d'acceptation

- [ ] AC1 — sur le serveur, `bootstrap.sh` rejoué sort en 0 sans changer `docker --version`
- [ ] AC2 — `apt-mark showhold` liste les quatre paquets Docker
- [ ] AC3 — `node scripts/check-infra-versions.mjs` vert, avec `docker` et `dokploy` mesurés et datés
- [ ] AC4 — le runbook porte la version de Dokploy à poser, et la commande qui la relit

## Hors périmètre

- Mettre Docker ou Dokploy à jour : chaque montée de version est un geste relevé (runbook « Mettre
  Dokploy à jour »).
- Une réinstallation réelle du serveur pour prouver la reproductibilité de bout en bout : à jouer
  seulement si une réinstallation devient nécessaire.

## Notes d'implémentation

_(à remplir par implementing-specs)_
