---
id: TCK-289
title: MariaDB de production non épinglée — la CI éprouve une hypothèse
status: todo
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

Aucun changement de modèle. Il s'agit d'aligner trois déclarations qui ne le sont pas :

- `docker-compose.yml` — `mariadb:11.4`, `--collation-server=utf8mb4_unicode_ci`
- `.github/workflows/api-ci.yml`, job `migrations-mysql` — `mariadb:11.4`
- la production — **inconnue** : `scripts/server-setup.sh` n'installe ni ne configure MariaDB,
  sa seule mention du service est `After=network.target mysql.service`

## Contraintes strictes (métier)

1. La version et la collation de production se **mesurent** avant de s'épingler :
   `mariadb -e "SELECT VERSION(), @@collation_server;"`.
2. Une fois mesurées, elles s'écrivent à **un seul endroit** dont les trois consommateurs
   dérivent. Trois copies d'une version divergeront comme ont divergé les trois copies de la
   liste des files (cf. l'historique de `scripts/check-queues.mjs`).
3. Si la production est en 10.11 avec `utf8mb4_general_ci`, c'est **la CI et le compose** qui
   s'alignent sur elle — pas l'inverse. Le banc d'essai reproduit la production, il ne la
   prescrit pas.

## Delta à produire

- [ ] Mesurer version et `@@collation_server` sur le serveur, et les consigner ici.
- [ ] `scripts/server-setup.sh` : installer et configurer MariaDB explicitement (version + collation).
- [ ] Aligner `docker-compose.yml` et `migrations-mysql` sur la valeur mesurée.
- [ ] Retirer l'avertissement « la version 11.4 est une hypothèse » de `api-ci.yml`.

## Critères d'acceptation

- [ ] AC1 — la version et la collation de production sont écrites dans le dépôt, sourcées par la
      commande qui les a mesurées.
- [ ] AC2 — `docker-compose.yml`, le job `migrations-mysql` et le serveur portent la même version
      et la même collation.
- [ ] AC3 — `server-setup.sh` pose cette version : un serveur reprovisionné ne dérive pas.

## Hors périmètre

- La migration des données ou tout changement de schéma.
- Le choix d'un autre moteur.

## Notes d'implémentation

Trouvé en revue de la PR #150 : le commentaire du job `migrations-mysql` présentait 11.4 comme
« le moteur de la PRODUCTION » alors que rien dans le dépôt ne l'y installe. Le job éprouvait donc
une hypothèse — utile, mais pas ce qu'il annonçait. L'avertissement a été écrit dans `api-ci.yml`
en attendant ce ticket. Voir aussi `docs/ardoise.md` (tableau des divergences dev↔prod).
