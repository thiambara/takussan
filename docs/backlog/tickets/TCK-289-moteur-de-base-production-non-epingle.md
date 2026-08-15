---
id: TCK-289
title: Moteur de base de production non épinglé — la CI éprouvait une hypothèse, et elle était fausse
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-08-13
updated: 2026-08-13
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [technique, ci, deploiement, base-de-donnees]
---

## Objectif utilisateur

Qu'un déploiement qui passe la CI ne casse pas sur la base de production pour une différence de
moteur — et que deux chaînes égales ici le soient aussi là-bas.

## Contrat de données

Aucun changement de modèle. Il s'agissait d'aligner trois déclarations qui ne l'étaient pas :

- `docker-compose.yml` — `mariadb:11.4`, `--collation-server=utf8mb4_unicode_ci`
- `.github/workflows/api-ci.yml`, job `migrations-mysql` — `mariadb:11.4`
- la production — **inconnue** : `scripts/server-setup.sh` n'installe ni ne configure la base,
  sa seule mention du service est `After=network.target mysql.service`

## Contraintes strictes (métier)

1. La version et la collation de production se **mesurent** avant de s'épingler.
2. Une fois mesurées, elles ne doivent pas pouvoir diverger entre leurs consommateurs.
3. Si la production diffère de ce que la CI suppose, c'est **la CI et le compose** qui s'alignent
   sur elle — pas l'inverse. Le banc d'essai reproduit la production, il ne la prescrit pas.

## La mesure

Serveur Contabo, Ubuntu 24.04, le **2026-08-13**, en préparant le premier déploiement :

```
$ dpkg -l | grep -Ei 'mysql-server|mariadb-server|mysql-client|mariadb-client'
ii  mysql-client-8.0       8.0.46-0ubuntu0.24.04.3
ii  mysql-client-core-8.0  8.0.46-0ubuntu0.24.04.3
ii  mysql-server           8.0.46-0ubuntu0.24.04.3

$ command -v mysql mysqld mariadb mariadbd
/usr/bin/mysql
/usr/sbin/mysqld

$ sudo mysql -e "SELECT VERSION(), @@collation_server, @@character_set_server;"
8.0.46-0ubuntu0.24.04.3 | utf8mb4_0900_ai_ci | utf8mb4
```

**Ce n'était pas un écart de version : c'était le mauvais moteur.** L'hypothèse écrite dans
`api-ci.yml` — « sur une Ubuntu LTS, ce serait MariaDB 10.11 avec `utf8mb4_general_ci` » — se
trompait sur les trois valeurs à la fois, parce qu'elle se trompait sur la question.

MariaDB 11 et MySQL 8 ont divergé pour de bon : collation par défaut, contraintes `CHECK`, colonnes
`JSON` (natives chez MySQL, alias de `LONGTEXT` chez MariaDB), noms d'index générés. Un DDL accepté
par MariaDB 11.4 et refusé par MySQL 8 passait le job et aurait cassé `migrate --force` au
déploiement — l'échec exact que ce job existe pour empêcher.

## Delta produit

- [x] Mesurer version, collation et jeu de caractères sur le serveur, et les consigner ici.
- [x] `docker-compose.yml` → `mysql:8.0`, `utf8mb4_0900_ai_ci`, sonde `mysqladmin ping`, volume
      `mysql-data` (les fichiers de données de MariaDB ne se lisent pas par MySQL).
- [x] `docker/mariadb-init.sql` → `docker/mysql-init.sql`, base de test en `utf8mb4_0900_ai_ci`.
- [x] `.github/workflows/api-ci.yml`, job `migrations-mysql` → `mysql:8.0`, et une étape qui
      **mesure** `@@collation_server` du conteneur de service : un service container n'accepte pas
      d'arguments de commande, sa collation ne peut donc qu'être constatée.
- [x] `scripts/check-db-engine.mjs` + étape Repo CI — l'accord des trois déclarations est gardé.
- [x] Retirer l'avertissement « la version 11.4 est une hypothèse » et écrire à sa place ce qui a
      été mesuré, avec la commande qui l'a produit.
- [x] Propager : `CLAUDE.md`, `dev.sh`, `docs/ardoise.md` (D-43), ADR-0007, ADR-0011,
      `docs/configuration.md`, le docblock de `2026_06_18_000001`.

## Critères d'acceptation

- [x] AC1 — la version et la collation de production sont écrites dans le dépôt, sourcées par la
      commande qui les a mesurées (constante `PROD` de `scripts/check-db-engine.mjs`, et son
      en-tête).
- [x] AC2 — `docker-compose.yml`, le job `migrations-mysql` et l'init SQL portent le même moteur et
      la même collation, **et une garde le vérifie** : toute image de base et toute collation
      écrites dans le périmètre doivent valoir celles de la production. Prouvé par mutation dans
      les deux sens (image revenue à `mariadb:11.4` → rouge ; collation de la base de test remise
      en `utf8mb4_unicode_ci` → rouge ; déclaration supprimée → rouge ; code juste → vert).
- [ ] AC3 — `server-setup.sh` pose cette version : un serveur reprovisionné ne dérive pas.
      **NON FAIT, et délibérément.** Voir ci-dessous.

## Ce qui reste ouvert, et pourquoi

`server-setup.sh` n'installe toujours pas le moteur. Lui faire poser MySQL reviendrait à faire
tourner un `apt install` sur un serveur qui **sert déjà la préproduction depuis une base vivante** :
le premier déploiement de production n'est pas le moment de reprovisionner le moteur sous
l'application qui tourne. Le script reste donc descriptif sur ce point, et l'écart est désormais
*mesuré* au lieu d'être *supposé* — ce qui était l'essentiel du défaut.

À reprendre dans un ticket dédié, avec la question qui va avec : faut-il que `server-setup.sh` soit
capable de reconstruire un serveur complet (et donc d'installer et configurer la base), ou
assume-t-on qu'il complète une machine déjà provisionnée ? Le script ne tranche aujourd'hui ni dans
un sens ni dans l'autre.

## Hors périmètre

- La migration des données ou tout changement de schéma.
- Le choix d'un autre moteur.

## Notes d'implémentation

Trouvé en revue de la PR #150 : le commentaire du job `migrations-mysql` présentait 11.4 comme « le
moteur de la PRODUCTION » alors que rien dans le dépôt ne l'y installait. **L'avertissement écrit
alors était juste — et il n'a rien empêché** : le job a continué de tourner sur le mauvais moteur
pendant six semaines en annonçant qu'il éprouvait la production. *Une hypothèse signalée reste une
hypothèse exécutée ; c'est la mesure qui clôt, pas la note de bas de page.*

Voir `docs/ardoise.md` D-43, et la leçon sœur de D-04 : **ne jamais déduire l'état d'un
environnement de la configuration qui le vise** — ici, d'une commande d'installation supposée.
