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
| Base | `sqlite` | SQLite `:memory:` | MySQL 8.0 |
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
mesurée** : **MySQL 8.0** (la production tourne dessus — *mesuré* le 2026-08-13, cf. la note
ci-dessous), **Meilisearch v1.16** (alignée sur la CI),
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

**Ce que ça ne résout pas.** La production reste posée par `apt` sans version épinglée dans le
dépôt, et le PHP de production (8.3) ne peut pas installer le `composer.lock` actuel (ardoise
D-01). Conteneuriser le développement rapproche les deux mondes ; ça ne fige pas celui d'en face.

> ⚠ **Correction du 2026-08-13.** Cet ADR a d'abord écrit « MariaDB » pour la production, et le
> compose l'a servi pendant six semaines. C'était faux : le serveur tourne sur **MySQL 8.0.46**,
> `utf8mb4_0900_ai_ci`. La ligne « la production tourne dessus » n'était pas une mesure mais une
> déduction — d'un `apt install mariadb-server` que personne n'avait exécuté. La divergence que ce
> compose existe pour supprimer était donc *reproduite* par lui. Corrigé, et gardé par
> `scripts/check-db-engine.mjs` (ardoise D-43, TCK-289).

## Application

- `docker-compose.yml` — le raisonnement service par service est dans son en-tête.
- `docker/pgsql-init.sql` — le droit `CREATEDB` du rôle applicatif, dont dépend l'isolation par
  processus de `Tests\Support\TestDatabase`. ⚠ Cette ligne nommait `docker/mysql-init.sql`, « la
  base de test, séparée de celle de développement » : le fichier a changé de nom **et de rôle**
  avec le moteur (ADR-0020). Il n'y a plus une seconde base figée, mais une base PAR PROCESSUS.
- `dev.sh` — modes `all` / `api` / `services` / `doctor`.
- `takussan-api/.env.docker` · `scripts/check-env-parity.mjs`.
- `.github/workflows/repo-ci.yml` — la garde de parité.
- `.github/workflows/api-ci.yml`, job **`migrations-pgsql`** (ex-`migrations-mysql`) — les
  migrations rejouées EN ARRIÈRE sur PostgreSQL 17. **Il a trouvé un `down()` cassé à sa première
  exécution** : `dropIndex` sur une colonne portant une FK, sur trois tables — le piège n°2 du
  `CLAUDE.md` d'alors. ⚠ Il a changé de raison d'être avec ADR-0020 : la suite de tests tournant
  désormais sur le moteur de la production, l'ALLER y est déjà éprouvé ; il ne garde plus que les
  `down()`, et seulement 15 sur 135.
