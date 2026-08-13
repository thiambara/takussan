# ADR-0011 — L'environnement de développement est conteneurisé et calqué sur la production

- **Statut** : Accepté
- **Date** : 2026-08-12

## Contexte

Au 2026-08-12, le dépôt ne contenait **aucun artefact d'environnement reproductible** : pas de
`docker-compose.yml`, pas de `Dockerfile`, pas de `dev.sh`, pas de `Makefile`, pas de `.nvmrc`. La
reprise du projet passait par des services Homebrew installés à la main.

Et `.env.example` — le seul document d'installation qui fasse autorité — **ne reproduisait aucun
environnement existant** :

| | `.env.example` | CI | Production |
|---|---|---|---|
| Base | `sqlite` | SQLite `:memory:` | MariaDB |
| Recherche | `collection` | Meilisearch | Meilisearch |
| Cache | `redis` | *(array)* | `database` |

`CACHE_STORE=redis` était livré par défaut **sans que rien ne provisionne Redis** : ni la CI, ni
`scripts/server-setup.sh`, et le guide de déploiement affirme explicitement qu'il n'y en a pas. Un
développeur qui suivait la documentation obtenait une application qui ne démarre pas.

Le coût réel n'est pas la friction d'installation. C'est que **le développement n'éprouvait rien de
ce que la production exécute** : `CLAUDE.md` documente quatre familles de pièges de migration MySQL
que SQLite ne peut pas voir, et le dépôt les avait déjà payés deux fois (`c473081b`, `9815694f`).

## Décision

**`docker-compose.yml` à la racine sert quatre services, chacun couvrant une divergence dev↔prod
mesurée** : **MariaDB** (la production tourne dessus), **Meilisearch v1.16** (alignée sur la CI),
**Redis** (pour que `.env.example` cesse de décrire un environnement impossible), **Mailpit** (une
vingtaine de tâches planifiées envoient du courrier que `MAIL_MAILER=log` rend invisible).

**`takussan-api/.env.docker` est l'environnement de développement ; `.env.example` reste le contrat
des clés.** Chaque driver de `.env.docker` est celui de la production.

**`./dev.sh` démarre tout** — services, API, file de jobs, scheduler, front — et **ne force pas
docker** : il détecte si le `.env` vise les conteneurs du dépôt ou des services natifs, **sonde ce
que le `.env` déclare**, et nomme ce qui ne répond pas.

## Conséquences

**Les ports sont décalés d'un cran** — 3307, 7701, 6380, 1026/8026. Ce n'est pas une préférence :
les quatre ports canoniques étaient occupés sur la machine où la décision a été prise (MySQL et
Meilisearch natifs via brew, Redis et Mailpit tenus par un projet voisin). Le décalage rend les deux
mondes simultanés au lieu d'exiger qu'on démonte l'existant. Chaque port est surchargeable par un
`.env` à la racine.

**La file de jobs et le scheduler tournent en développement.** `routes/console.php` planifie une
vingtaine de tâches et `QUEUE_CONNECTION=database` met les jobs en base au lieu de les exécuter.
Sans worker, **tout ce qui passe par `dispatch()` ne s'exécute jamais en local** — et l'absence ne
se signale pas : l'écran répond 200, la ligne part en base, rien ne la consomme.

**Deux fichiers d'environnement peuvent diverger.** `scripts/check-env-parity.mjs` garde la parité
des **clés** (jamais des valeurs — deux fichiers aux valeurs identiques n'auraient aucune raison
d'être deux) et tourne en CI. La garde est prouvée par mutation.

**Ce que ça ne résout pas.** La production reste non versionnée (`apt install mariadb-server`,
`apt install meilisearch`), et le PHP de production (8.3) ne peut pas installer le `composer.lock`
actuel (ardoise D-01). Conteneuriser le développement rapproche les deux mondes ; ça ne fige pas
celui d'en face.

## Application

- `docker-compose.yml` — le raisonnement service par service est dans son en-tête.
- `docker/mariadb-init.sql` — la base de test, séparée de celle de développement.
- `dev.sh` — modes `all` / `api` / `services` / `doctor`.
- `takussan-api/.env.docker` · `scripts/check-env-parity.mjs`.
- `.github/workflows/repo-ci.yml` — la garde de parité.
- `.github/workflows/api-ci.yml`, job `migrations-mysql` — les migrations rejouées sur MariaDB.
  **Il a trouvé un `down()` cassé à sa première exécution** : `dropIndex` sur une colonne portant
  une FK, sur trois tables — exactement le piège n°2 de `CLAUDE.md`.
