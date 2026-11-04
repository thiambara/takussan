# Versions d'infrastructure — ce que chaque environnement exécute

**Source de vérité : [`versions.json`](versions.json).** Ce document explique le *pourquoi* et donne
les commandes ; il ne recopie aucune valeur, parce qu'une valeur écrite à deux endroits diverge.

```bash
node scripts/check-infra-versions.mjs --report   # le tableau dev / CI / prod, et ce qui l'a produit
```

---

## Ce que ce fichier existe pour corriger

Mesuré le 2026-08-16 (TCK-298) : **développement et CI étaient épinglés des deux côtés ; la
production ne l'était nulle part dans le dépôt.**

`scripts/server-setup.sh`, le seul script de provisionnement, **n'installait rien**. Il lisait
`php -v`, vérifiait que `/etc/php/<version>/fpm/pool.d` et `/etc/nginx/sites-available` existaient,
et sinon il **imprimait la commande à lancer à la main**. Le seul document qui nommait une
installation était un guide — `deploy-preview.html` §6.4, `sudo apt install meilisearch` — sans
version, et personne ne pouvait dire quand il avait été joué ni ce qu'`apt` avait posé ce jour-là.

**Depuis [ADR-0028](../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md) (2026-09-13), le
script et le guide sont retirés** : le serveur est réinstallé, et chaque service y tourne dans une
image épinglée — `takussan-api/Dockerfile`, `takussan-web/Dockerfile`,
`deploy/server/compose.data.yml`. L'écart se réduit, il ne se ferme pas : *une image déclarée n'est
pas une image servie*. Un service créé à la main dans Dokploy, un déploiement qui n'a pas repris, et
la machine diverge du dépôt sans qu'un fichier change. La colonne « production » reste donc un relevé.

Ce n'est pas une hypothèse sur ce qui *pourrait* mal tourner : c'est **exactement** la mécanique de
l'ardoise **D-43**. `docker-compose.yml` et le job `migrations-mysql` ont tourné sur `mariadb:11.4`
parce qu'un commentaire affirmait que c'était « ce qu'`apt install mariadb-server` pose sur le
serveur ». Personne n'avait lancé cette commande. Le serveur servait **MySQL 8.0.46**, avec une autre
collation. Pas un écart de version : **le mauvais moteur**, et un banc d'essai qui validait du DDL
que la production n'exécuterait jamais — en annonçant l'inverse à chaque exécution.

> **Ne jamais déduire l'état d'un environnement de la configuration — ni de la commande
> d'installation — qui le vise.** Un guide dit ce qu'on *voudrait* poser. Un workflow de déploiement dit ce qui
> *devrait* se produire. Seule la machine dit ce qui *est*.

---

## Les deux états d'une ligne « production », et pourquoi il n'y en a pas trois

| `etat` | Ce que ça veut dire | Ce que le catalogue exige |
|---|---|---|
| `mesure` | La commande a été lancée **sur la machine**, et sa sortie est recopiée. | `valeur`, `commande`, `date` (AAAA-MM-JJ), `source` |
| `non_mesure` | Personne n'a lancé la commande. On l'écrit, et on écrit **laquelle lancer**. | `valeur: null`, `commande`, `pourquoi` |

Il n'existe pas d'état « probable », « supposé » ni « d'après le guide ». Une version qu'on croit
tenir sans l'avoir relevée est une version fausse qui n'a pas encore coûté — et la garde refuse
`etat: non_mesure` accompagné d'une valeur, précisément pour empêcher qu'on « comble » le tableau.

**Un `non_mesure` n'est pas un échec de ce ticket, c'est son livrable.** Le dépôt ne pouvait pas dire
ce qu'il ignorait ; il le dit maintenant, avec la commande qui y remédie. La confrontation avec la
machine de production appartient à la **tâche F5** du plan d'ADR-0028
([TCK-517](../backlog/tickets/todo/TCK-517-production-auto-hebergee.md), phase F). TCK-288, qui la portait
jusque-là, décrit l'ancienne chaîne de déploiement, retirée par ADR-0028.

---

## Mesurer la production

Aucune de ces commandes n'écrit quoi que ce soit. Chaque version se lit **dans le conteneur en
marche**, jamais dans l'image ni dans le fichier qui la déclare ([ADR-0028](../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md),
plan, tâche F5). Les noms de conteneurs sont ceux que Dokploy attribue : les relever d'abord.

```bash
ssh root@<serveur> '
  docker ps --format "table {{.Names}}\t{{.Image}}"         # ce qui tourne, et depuis quelle image
  docker exec <conteneur api de production> php -v | head -1
  docker exec <conteneur meilisearch> meilisearch --version
  docker exec <conteneur redis> redis-server --version
  docker exec <conteneur du front de production> node --version
  docker ps --format "{{.Image}}" | grep -i mailpit || echo "mailpit: absent"
'
```

Pour la base, la mesure de référence reste celle que porte `scripts/check-db-engine.mjs` — elle
relève aussi la **collation**, qui compte autant que la version : c'est d'elle que dépend le sens
de six contraintes d'unicité sur texte (ADR-0020 §4.2).

Il n'y a plus de PostgreSQL sur l'hôte (ADR-0028) : chaque base est un service Database de Dokploy,
et la commande se lance dans son conteneur — la même que `postgres.prod.commande` de `versions.json`.

```bash
docker exec <conteneur du service Database de production> psql -U <rôle> -d <base> -Atc \
  "SELECT version(), datcollate, datctype, pg_encoding_to_char(encoding)
     FROM pg_database WHERE datname = current_database();"
# attendu, cible : PostgreSQL 17.x · C | C | UTF8
```

> ⚠ **La collation se lit dans `pg_database`, jamais dans un paramètre de session** :
> `current_setting('lc_collate')` n'existe pas en PostgreSQL 17 et rend
> *« unrecognized configuration parameter »*. L'erreur a été payée en écrivant ADR-0020.
>
> **Et cette commande n'a encore jamais rendu de résultat** : aucune base de production PostgreSQL
> n'existe (D-04). Elle décrit la mesure à prendre en tâche F5 (TCK-517), pas une mesure prise. La
> commande MySQL qu'elle remplace, elle, avait été exécutée — le 2026-08-13, sur un moteur que
> le dépôt n'exécute plus depuis ADR-0020.

**Après avoir mesuré**, dans `versions.json` : passer `etat` à `mesure`, écrire `valeur`, `date`
(le jour du relevé, pas celui de l'écriture) et `source` (ticket ou entrée d'ardoise), puis

```bash
node scripts/check-infra-versions.mjs --report
```

Une valeur relevée il y a six mois n'est plus une mesure de l'état courant : c'est une mesure datée.
La `date` est là pour qu'on puisse en juger, pas pour la décoration.

---

## Ce que la garde vérifie

`scripts/check-infra-versions.mjs`, rejoué par **Repo CI**, tient cinq propriétés, plus une
sixième depuis TCK-526 (l'épingle du serveur égale sa mesure, sonde `epingle` ci-dessous) :

1. **Le catalogue et le dépôt disent la même chose.** Chaque valeur `dev`/`ci` est une citation :
   la garde la retrouve, à l'identique, dans le fichier qui la déclare.
2. **Rien n'échappe au catalogue.** Toute image de conteneur, tout `php-version:`/`node-version:`
   trouvé dans `docker-compose.yml` ou dans **n'importe quel** workflow doit se rattacher à un
   service catalogué. Ajouter un service sans l'y inscrire fait rougir.
3. **Une déclaration ne disparaît pas en silence.** Un service dont le catalogue annonce une valeur
   pour un environnement doit y être trouvé au moins une fois.
4. **L'aveu d'ignorance est obligatoire et outillé** — les deux états ci-dessus, et rien d'autre.
5. **Les valeurs partagées avec une autre garde restent d'accord** (`accords_croises`), sur le texte
   *hors commentaires*.

Le périmètre CI est obtenu en **listant `.github/workflows/`**, jamais en énumérant les fichiers :
une garde dont le périmètre est une liste écrite cesse de couvrir le fichier qu'on ajoute.

Chaque service se rattache au dépôt par ses `sondes`, de quatre types
(`scripts/check-infra-versions.mjs:222-243`, relu le 2026-11-03) :

| Type | Ce qu'elle lit | Ce qui rougit |
|---|---|---|
| `image` | toute ligne `image:` de `docker-compose.yml` (dev) et des workflows (CI), rattachée au service par son dépôt d'image | une valeur différente, ou une image dont le dépôt n'est réclamé par aucun service |
| `cle-yaml` | toute clé `php-version:` / `node-version:` des mêmes fichiers | une valeur différente de `dev`/`ci` |
| `json` | une valeur à un chemin d'un fichier JSON, pour l'environnement que la sonde nomme — aujourd'hui `config.platform.php` de `takussan-api/composer.json`, comparé à `php.dev` | le fichier absent, le chemin disparu, ou une valeur différente |
| `epingle` | la première ligne `VARIABLE=x` (ou `VARIABLE=${VARIABLE:-x}`, `export VARIABLE=x`) hors commentaires d'un fichier — `DOCKER_VERSION` de `deploy/server/bootstrap.sh`, `DOKPLOY_VERSION` du runbook d'`hebergement.md` | l'épingle disparue, une ligne `prod` qui n'est pas `mesure` (*une épingle sans mesure est une supposition installée*), ou une épingle différente de la valeur mesurée du serveur (R6, TCK-526) |

### Prouvée par mutation

Une garde qu'on n'a pas vue rougir ne garde rien. Les sept mutations jouées avant de la câbler :

| Mutation | Attendu | Obtenu |
|---|---|---|
| `docker-compose.yml` : Meilisearch `v1.16` → `v1.15` | rouge, nomme le service et les deux valeurs | ✅ `docker-compose.yml:117 — meilisearch en DEV vaut v1.15 ; … déclare v1.16` |
| `api-ci.yml` : `php-version` `8.4` → `8.3` | rouge, **deux fois** (deux jobs) | ✅ lignes 40 et 190 |
| `docker-compose.yml` : ligne `image: redis:8-alpine` **supprimée** | rouge — c'est le trou par lequel `check-db-engine` était passé | ✅ `redis.dev — … AUCUNE déclaration n'a été trouvée` |
| Nouveau service `rabbitmq:4-management` ajouté au compose | rouge — un service hors catalogue | ✅ `image rabbitmq:4-management … ABSENTE de docs/infra/versions.json` |
| `meilisearch.prod` : `valeur` remplie tout en restant `non_mesure` | rouge — c'est le geste que le ticket interdit | ✅ `… mais valeur vaut "v1.16". Une version non mesurée n'est pas une version : c'est une supposition.` |
| `redis.dev` nullé **sans** `absence` | rouge — sinon supprimer une version rend la garde muette | ✅ `valeur: null sans absence` |
| `check-db-engine.mjs` : `PROD.version` → `8.0.47-…`, catalogue inchangé (⚠ la constante s'appelle **`CIBLE`** depuis ADR-0020 — renommée parce qu'aucune production PostgreSQL n'a été relevée, et qu'un nom `PROD` inviterait à croire le contraire) | rouge — les deux gardes doivent porter la même mesure | ⚠️ **verte d'abord**, cf. ci-dessous |

La dernière mutation est la plus instructive, et elle a **trouvé un défaut réel dans la garde**.
L'accord croisé cherchait le littéral dans le fichier *entier* — or `8.0.46-0ubuntu0.24.04.3` survit
**trois fois** dans le docblock de `check-db-engine.mjs`, qui raconte la mesure (`ii mysql-server
8.0.46-…`). La garde lisait donc la *mémoire* du défaut et la prenait pour la déclaration. Corrigé :
l'accord croisé s'évalue hors commentaires, et la mutation rougit.

*Un accord croisé qui accepte une correspondance en commentaire n'accorde rien : il constate que les
deux fichiers se souviennent de la même chose, pas qu'ils déclarent la même chose.*

---

## Ce que ce dispositif ne fait pas

- **Il ne mesure pas la production.** Il ne s'y connecte jamais, et n'a aucun secret pour le faire.
  Il rend le dépôt capable de *dire* ce qu'il sait et ce qu'il ignore. Confronter le catalogue à la
  machine, c'est la tâche F5 du plan d'ADR-0028 (TCK-517).
- **Il n'épingle pas lui-même : il vérifie les épingles des autres.** Depuis TCK-526,
  `deploy/server/bootstrap.sh` § 0 épingle Docker (`DOCKER_VERSION`) et tient ses paquets par
  `apt-mark hold`, et le runbook pose `DOKPLOY_VERSION` ; les images des services sont épinglées
  dans leurs Dockerfile et dans `deploy/server/compose.data.yml`. La sonde `epingle` confronte les
  deux premières épingles à la mesure du serveur. Ce qu'un geste fait sur la machine sans passer par
  le dépôt — une mise à jour de Dokploy par son interface, un `apt upgrade` d'un paquet non tenu —,
  la garde ne le voit pas : elle voit seulement que la ligne `mesure` a vieilli, si quelqu'un lit sa
  `date`.
- **Il ne couvre pas ce qui n'est ni une image de `docker-compose.yml` ou d'un workflow, ni une clé
  `*-version`, ni un chemin JSON, ni une épingle `VARIABLE=`.** Hors catalogue, relevé du
  2026-11-03 :
  - **Traefik** (`traefik:v3.6.7`, conteneur `dokploy-traefik`) — posé par l'installation de
    Dokploy, aucun fichier du dépôt ne le déclare ; relevé dans `hebergement.md`, « Le relevé de
    Dokploy » ;
  - **WAL-G** (`ARG WALG_VERSION=v3.0.9`, `deploy/postgres/Dockerfile:19`) et **l'image de la base**
    (`FROM pgvector/pgvector:pg17@sha256:…`, même fichier, ligne 14 ; publiée en
    `ghcr.io/thiambara/takussan-postgres:sha-<commit>`) — la garde ne lit aucun Dockerfile ;
  - **FrankenPHP** (`ARG FRANKENPHP_TAG`, `takussan-api/Dockerfile:20`) — seul le PHP qu'il porte
    a une ligne, en `php.prod` ;
  - systemd, le noyau.

  Ajouter une sonde est peu coûteux ; prétendre que le tableau est complet le serait beaucoup plus.
