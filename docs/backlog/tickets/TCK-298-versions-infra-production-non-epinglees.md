---
id: TCK-298
title: "Les versions d'infrastructure de production ne sont épinglées nulle part dans le dépôt"
status: todo
phase: P2
family: technique
estimate: S
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-289]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, ci, versions, reproductibilite, dette]
---

## Objectif utilisateur

Qu'on puisse lire dans le dépôt quelle version de chaque service la production exécute — au lieu de
la découvrir en se connectant au serveur, ou de la deviner à partir de la commande d'installation.

## Contrat de données

Aucune donnée applicative. Mesuré le 2026-08-16 :

| Service | Développement | CI | Production |
|---|---|---|---|
| MySQL | `mysql:8.0` ✅ | `mysql:8.0` ✅ | 8.0.46 — **mesuré** (TCK-289), non épinglé dans le dépôt |
| Meilisearch | `getmeili/meilisearch:v1.16` ✅ | `getmeili/meilisearch:v1.16` ✅ | **rien** |
| Redis | `redis:8-alpine` ✅ | absent | **rien** |
| PHP | 8.4.x | `8.4` ✅ | 8.4 — déduit d'un déploiement réussi (D-01), non épinglé |
| Node | — | — | **rien** |

`scripts/server-setup.sh` **n'installe rien** : il vérifie la présence de PHP-FPM et de nginx et
imprime la commande à lancer à la main. Le provisionnement de production est donc entièrement
manuel, et aucune version n'y est écrite.

## Contraintes strictes (métier)

- **Ne rien déduire de la configuration.** C'est la leçon de D-43 et de TCK-289 : le compose et la
  CI ont tourné dix-huit mois sur MariaDB parce qu'un commentaire affirmait ce que la prod
  exécutait. Toute valeur écrite par ce ticket est soit **mesurée sur la machine**, soit marquée
  explicitement comme une cible à vérifier — jamais présentée comme un constat.
- Ce ticket **ne déploie rien et ne touche pas au serveur**. Il rend le dépôt capable de dire ce
  que la production exécute ; la confrontation avec la machine appartient à TCK-288.
- Une valeur épinglée sans garde retombe en dette au premier `apt upgrade`. La sortie doit inclure
  un mécanisme de vérification, pas seulement un tableau.

## Delta à produire

- [ ] Un fichier unique de référence des versions d'infrastructure (format à choisir : JSON lisible
      par script, sur le modèle de `waves.json`), portant pour chaque service la version **dev**,
      **CI** et **prod cible**
- [ ] Étendre `scripts/check-db-engine.mjs` — ou créer son pendant générique — pour vérifier
      l'accord entre ce fichier, `docker-compose.yml` et `.github/workflows/*.yml`
- [ ] Brancher la garde dans `repo-ci.yml`
- [ ] Prouver la garde **par mutation** : désaligner une version, vérifier le rouge
- [ ] Documenter dans `docs/infra/` la commande de mesure qui produit la colonne « prod » — pour que
      la prochaine mise à jour se mesure au lieu de se recopier

## Critères d'acceptation

- [ ] AC1 — chaque service du tableau ci-dessus a une version écrite dans le fichier de référence,
      ou une mention explicite « non mesuré » qui nomme la commande à lancer
- [ ] AC2 — désaligner `docker-compose.yml` d'une version fait échouer la CI, et le message nomme
      le service et les deux valeurs
- [ ] AC3 — aucune valeur de la colonne « prod » n'est déduite d'un guide d'installation ; chacune
      cite sa source (commande + date)

## Hors périmètre

- Le moteur de base de données — déjà épinglé et gardé par TCK-289.
- Épingler les versions **sur le serveur** (`apt-mark hold`, images) — TCK-288.
- Le déploiement du frontend — TCK-299.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
