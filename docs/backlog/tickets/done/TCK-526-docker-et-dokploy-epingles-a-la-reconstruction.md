---
id: TCK-526
title: "Reconstruction reproductible — `bootstrap.sh` épingle Docker, et la version de Dokploy est posée après l'installation"
status: done
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

- [x] `bootstrap.sh` : dépôt apt de Docker, `docker-ce`, `docker-ce-cli`, `containerd.io`,
  `docker-compose-plugin` à la version relevée, `apt-mark hold` ; variable `DOCKER_VERSION` en tête,
  avec la date et la commande du relevé
- [x] Runbook « Reconstruire le serveur », étape 6 : après `install.sh`, `docker service update
  --image dokploy/dokploy:v0.30.6 dokploy` (ou la variable d'`install.sh` si elle existe — à
  mesurer dans le script, pas supposer), puis relecture de la version
- [x] `docs/infra/versions.json` : entrées `docker` et `dokploy`, `prod` en `etat: mesure` avec la
  commande, et la garde `check-infra-versions.mjs` étendue si elle ne lit pas `bootstrap.sh`
- [x] Ablation : `DOCKER_VERSION` changée pour une version absente → `bootstrap.sh` échoue sur apt
  avant d'avoir touché au système (ordre des étapes vérifié)

## Critères d'acceptation

- [x] AC1 — sur le serveur, `bootstrap.sh` rejoué sort en 0 sans changer `docker --version`
- [x] AC2 — `apt-mark showhold` liste les quatre paquets Docker
- [x] AC3 — `node scripts/check-infra-versions.mjs` vert, avec `docker` et `dokploy` mesurés et datés
- [x] AC4 — le runbook porte la version de Dokploy à poser, et la commande qui la relit

## Hors périmètre

- Mettre Docker ou Dokploy à jour : chaque montée de version est un geste relevé (runbook « Mettre
  Dokploy à jour »).
- Une réinstallation réelle du serveur pour prouver la reproductibilité de bout en bout : à jouer
  seulement si une réinstallation devient nécessaire.

## Notes d'implémentation

- **Relevé du 2026-09-14 sur le serveur** (`dpkg -l`) : `docker-ce` et `docker-ce-cli`
  `5:29.8.0-1~ubuntu.24.04~noble`, `containerd.io` `2.3.5-1~ubuntu.24.04~noble`,
  `docker-compose-plugin` `5.5.1-1~ubuntu.24.04~noble`, `docker-buildx-plugin`
  `0.37.1-1~ubuntu.24.04~noble` ; `apt-mark showhold` vide ; `docker.list` déjà posé par
  get.docker.com ; Dokploy `dokploy/dokploy:v0.30.6@sha256:1d6bd69b…`. `29.8.0` est aussi la plus
  récente de `noble/stable` ce jour-là : l'épingle ne fige pas une version en retard.
- **`bootstrap.sh`** : un § 0 vérifie les cinq versions dans l'index apt de Docker **en lecture
  seule** (`…/dists/noble/stable/binary-amd64/Packages`, 447 Ko) avant tout geste, et refuse un
  Docker présent à une autre version ; le § 2 tient les cinq paquets **avant** `apt-get upgrade`
  (sinon le premier rejeu les aurait montés avant de les tenir) ; le § 5 pose le dépôt apt, installe
  à la version épinglée si Docker manque, tient, et vérifie `docker version` du démon. Le paquet
  `docker-buildx-plugin` est tenu aussi : il est installé et `images.yml` n'en dépend pas, mais le
  laisser bouger seul n'aurait aucun sens.
- **Ablation, sur le serveur** : `DOCKER_VERSION=99.0.0 bash bootstrap.sh` → `✗ docker-ce
  5:99.0.0-1~ubuntu.24.04~noble absent du dépôt apt de Docker … rien n'a été touché`, sortie 1 en
  1 s ; swap et ufw relus intacts. **AC1** : `bash bootstrap.sh` rejoué → sortie 0 en 39 s,
  `docker --version` 29.8.0 avant et après, `docker version --format '{{.Server.Version}}'` 29.8.0,
  `docker`, `seuils.timer` et `fermer-port-3000` actifs. **AC2** : `apt-mark showhold` →
  `containerd.io docker-buildx-plugin docker-ce docker-ce-cli docker-compose-plugin`.
- **Dokploy** : `install.sh` (relu le 2026-09-14) lit `DOKPLOY_VERSION` (`export DOKPLOY_VERSION=…
  && curl … | sh`) et, sans elle, prend la dernière *release* GitHub ; il porte sa propre constante
  `DOCKER_VERSION="28.5.0"` et l'installe par get.docker.com **seulement si Docker manque** — d'où
  l'ordre du runbook, `bootstrap.sh` avant. Le runbook (étape 6) pose `DOKPLOY_VERSION=v0.30.6` et
  relit l'image du service ; « Mettre Dokploy à jour » et « Mettre Docker à jour » disent le geste
  et ce qu'il faut relever ensuite.
- **`versions.json` et la garde** : entrées `docker` et `dokploy`, `prod` en `etat: mesure` avec
  commande, date et source, `dev`/`ci` à `null` avec leur `absence`. `check-infra-versions.mjs`
  gagne la sonde `epingle` et la règle **R6** : la valeur `VARIABLE=…` lue dans le fichier
  (`bootstrap.sh`, ou la ligne `DOKPLOY_VERSION=` du runbook) doit être égale à la mesure du serveur,
  et une épingle sans mesure est refusée. Deux ablations rouges : `docker.prod.valeur` → `29.7.0`
  (« épinglé à 29.8.0, mesuré à 29.7.0 ») ; la ligne `DOCKER_VERSION=` renommée dans `bootstrap.sh`
  (« l'épingle a disparu »). **AC3** : `--report` vert, 15 déclarations, `serveur docker 29.8.0` et
  `serveur dokploy v0.30.6` dans la liste.
