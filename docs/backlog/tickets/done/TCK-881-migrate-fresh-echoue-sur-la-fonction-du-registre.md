---
id: TCK-881
title: "Le seed d'une préproduction échoue depuis le 2026-10-12 : fonction du registre rejouée par migrate:fresh, GeoReferentialSeeder appelé sans son argument, verrous épuisés par les photos"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [api, migrations, postgresql, seed, adr-0061]
---

## Contexte

Relevé le 2026-10-18 par `deploy/takussan/smoke-api.sh pile`, pendant TCK-880 : toutes les étapes
passent, puis `le seed échoue`. Le service `seed` (`takussan-api/docker/seed.sh`) lance
`php artisan migrate:fresh --force` sur une base que `release` vient de migrer, et la migration
`2026_10_12_500200_create_credit_ledger_tables` meurt en `42723` :

```
CREATE FUNCTION credit_movements_append_only() RETURNS trigger …  →  SQLSTATE 42723 (la fonction existe déjà)
```

Sur PostgreSQL, `migrate:fresh` retire les tables (`dropAllTables()`), jamais les fonctions. La
fonction créée le 2026-10-12 (ADR-0061, registre en insertion seule) survit donc, et sa création
sans `OR REPLACE` échoue au rejeu. Depuis le 2026-10-12, aucune remise à zéro d'une base déjà
migrée ne passait : le seed de la préproduction, le smoke de la pile, et
`php artisan migrate:fresh --seed` sur un poste.

La suite de tests ne le voyait pas : `Tests\Support\TestDatabase` crée une base neuve par processus.

**Un second défaut, derrière le premier.** Une fois la fonction corrigée, le même smoke meurt dans
le seed :

```
Too few arguments to function Database\Seeders\System\GeoReferentialSeeder::run(), 0 passed in
/app/database/seeders/YearOfActivitySeeder.php on line 151 and exactly 1 expected
```

`YearOfActivitySeeder` appelle `$seeder->run()` en direct sur chaque seeder de son `PIPELINE`.
Depuis le 2026-10-12 (6be24adab, TCK-633 lot D), `GeoReferentialSeeder::run()` reçoit
`GeoReferentialSync` par injection, que seul le conteneur fournit. Les tests le lançaient par
`$this->seed()`, qui passe par le conteneur : ils ne pouvaient pas le voir.

**Un troisième, avec les photos.** Sur un poste où `SEED_DOWNLOAD_MEDIA=true`, la remise à zéro
de la base de développement (2026-10-18) meurt après 46 minutes dans `PropertyMediaSeeder`, en
`25P02` sur une requête innocente. Le journal du serveur porte la vraie erreur, une seconde plus
tôt : `out of shared memory`, avec le conseil d'augmenter `max_locks_per_transaction`. Chaque photo
attachée ouvre des sous-transactions, et PostgreSQL garde le verrou de chacune jusqu'à la
validation de la transaction englobante. Mesuré, trois verrous de plus par photo. Comme
`YearOfActivitySeeder` enveloppe chaque seeder dans UNE transaction, on dépasse les 6 400 places
de la table des verrous (64 × 100 connexions). La CI et la préproduction ne le voient pas : elles
seedent sans médias.

## Objectif utilisateur

Le seed de la préproduction et la remise à zéro d'une base de développement repassent.

## Delta à produire

- La migration `2026_10_12_500200` crée la fonction par `CREATE OR REPLACE FUNCTION`. Sur une base
  neuve, c'est la même instruction ; sur une base où la fonction survit, elle la remplace (la
  migration `2026_10_14_100000` la redéfinit ensuite, comme avant).
- Un test d'architecture refuse `CREATE FUNCTION` ou `CREATE PROCEDURE` sans `OR REPLACE` dans les
  migrations.
- `YearOfActivitySeeder` lance chaque seeder par `__invoke()`, qui résout les arguments de `run()`
  par le conteneur. Aucun seeder n'utilise `WithoutModelEvents`, le seul autre effet
  d'`__invoke()` (relu le 2026-10-18).
- `PropertyMediaSeeder` se joue hors de la transaction par seeder
  (`YearOfActivitySeeder::HORS_TRANSACTION`). Il est idempotent : il saute un bien qui a déjà ses
  photos.

## Critères d'acceptation

- [x] **AC1** — `tests/Unit/Architecture/MigrationRejouableParFreshTest.php` passe ; il rougit sur
      la migration d'avant (ablation : `CREATE FUNCTION` remis → `2026_10_12_500200_… : CREATE
      FUNCTION`).
- [x] **AC2** — `smoke-api.sh pile` passe jusqu'au seed compris (« le seed tourne sur la cible
      seed »), qui rejoue `migrate:fresh` sur la base que `release` a migrée.
- [x] **AC3** — `migrate:fresh --seed` avec `SEED_DOWNLOAD_MEDIA=true` sort en 0 sur la base de
      développement. Avant le correctif, il mourait en `out of shared memory` (relevé ci-dessus).
      Mesuré le 2026-10-18 : sortie 0 en 21 min 15 s, « 3535 téléchargement(s) tenté(s), 3535
      réussi(s) », aucune `out of shared memory` dans le journal du serveur.

## Hors périmètre

- Faire retirer les fonctions par `migrate:fresh` (`--drop-types` ne les vise pas) : la règle
  « créer par `OR REPLACE` » suffit, et elle vaut aussi pour un rejeu partiel.

## Notes d'implémentation

- Modifier une migration déjà jouée est sans effet sur les bases existantes : la ligne de
  `migrations` est déjà là, et l'instruction n'est rejouée que par `migrate:fresh`, où elle doit
  justement réussir.
