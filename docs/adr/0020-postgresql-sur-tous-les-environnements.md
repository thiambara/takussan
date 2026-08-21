# ADR-0020 — PostgreSQL sur tous les environnements, base de test comprise

- **Statut** : Accepté
- **Date de la décision** : 2026-08-21
- **Spec** : [`docs/superpowers/specs/2026-08-21-migration-postgresql-design.md`](../superpowers/specs/2026-08-21-migration-postgresql-design.md)
- **Plan** : [`docs/superpowers/plans/2026-08-21-migration-postgresql.md`](../superpowers/plans/2026-08-21-migration-postgresql.md)
- **Dettes concernées** : D-04 (la production n'a jamais été déployée), D-44 (les ressources partagées par machine)

## Contexte

Trois moteurs coexistaient, et aucun des trois n'éprouvait ce que les deux autres exécutaient.

| | Moteur | Ce qu'il éprouve |
|---|---|---|
| Suite de tests | SQLite `:memory:` (`phpunit.xml:27`) | ~2320 tests |
| Job CI `migrations-mysql` | MySQL 8.0 | le **DDL** seulement, jamais le comportement |
| Production | MySQL 8.0, `utf8mb4_0900_ai_ci` (mesuré le 2026-08-13) | rien : **elle n'a jamais servi** |

**La divergence préexiste à cette décision et le dépôt la payait déjà.** Le job `migrations-mysql`
n'existe que pour rattraper une partie de l'écart, et il n'attrape que le schéma. Aucun test n'a
jamais tourné sur le moteur de production. C'est exactement le motif d'[ADR-0008](0008-meilisearch-sur-tous-les-environnements.md)
— *le seul régime que personne n'éprouve est celui que tout le monde exécute* — appliqué au moteur
de recherche et jamais à la base.

**Le porteur du projet demande PostgreSQL pour quatre motifs** : JSONB indexé, pgvector (un chatbot
sur Laravel AI SDK), la recherche `pg_trgm`/FTS, et PostGIS. Mesurés, ces quatre motifs n'ont pas
le même poids — et c'est leur **fenêtre de tir**, pas leur importance, qui décide de ce qui entre
dans ce chantier :

| Motif | Fenêtre | Décision |
|---|---|---|
| JSONB | `json` → `jsonb` est un mot par colonne tant que les tables sont vides ; un `ALTER` bloquant après | **embarqué** (le type seulement) |
| pgvector | le schéma vient avec le chatbot, mais l'instance doit *pouvoir* porter l'extension | **embarqué** (le provisionnement seulement) |
| recherche PG | n'importe quand | **reporté** — révoque ADR-0008 |
| PostGIS | n'importe quand | **reporté** — n'existe pas encore dans le code |

**Et surtout : l'API n'a jamais été déployée.** `https://api.takussan.com/up` → 404 quand
`preview` → 200 ; `deploy.yml` a échoué deux fois le 2026-08-15 sur l'authentification MySQL du
compte `takussan_prod` (D-04). **Il n'y a donc aucune donnée à migrer.** Cette fenêtre ne se
rouvrira pas.

## Décision

**PostgreSQL 17 sur tous les environnements — développement, CI, preview, production, et la suite
de tests.** SQLite et MySQL sont retirés, pas conservés en option.

### 1. La base de test devient la base de production

`phpunit.xml` force `DB_CONNECTION=pgsql`, exactement comme il force déjà `SCOUT_DRIVER=meilisearch`
**sans repli**.

SQLite n'est pas gardé « au cas où », pour deux raisons. La première est celle d'ADR-0008. La
seconde est mécanique : un double support obligerait chaque `whereRaw` à brancher sur **trois**
drivers au lieu d'un — le contraire exact de ce que ce chantier cherche.

**Coût assumé** : PostgreSQL devient un prérequis dur du développement. Meilisearch l'est déjà, et
`docker-compose.yml` existe pour ça ([ADR-0011](0011-environnement-de-dev-conteneurise.md)).

### 2. L'image porte pgvector, dès maintenant

`pgvector/pgvector:pg17`, et non `postgres:17` — partout, y compris en CI et sur le serveur
(`postgresql-17-pgvector`).

**Aucune extension n'est créée par ce chantier.** Ce qui se décide ici, c'est que le
provisionnement les *autorise* : `vector`, et plus tard `pg_trgm` ou `citext`, viennent avec leurs
propres tickets. Une instance managée qui refuse `CREATE EXTENSION vector` fermerait le motif
pgvector **en silence**, et six mois plus tard.

### 3. La collation reste déterministe

La production mesurée tourne en `utf8mb4_0900_ai_ci` : insensible à la casse **et** aux accents.
PostgreSQL est sensible aux deux. La base est créée en `--encoding=UTF8 --locale=C`.

**On ne reproduit pas le comportement MySQL** (voir « Alternatives écartées »). L'insensibilité
redevient une **règle métier explicite**, là où le domaine la demande — ce qui est déjà, sans avoir
été nommé, la politique du dépôt : `User::setEmailAttribute` normalise à l'écriture, la migration
`2026_05_05_213450_normalize_users_email_to_lowercase` a normalisé l'existant, et
`CustomerTagController.php:42` contourne à la lecture par `Tag::whereRaw('LOWER(name) = ?')`.

### 4. `json` → `jsonb`

Les 56 fichiers de migration qui déclarent des colonnes `->json(` passent en `->jsonb(`. Seul
`jsonb` est indexable par GIN. C'est gratuit tant que les tables sont vides, et c'est un `ALTER`
bloquant ensuite.

### 5. Une base de test par processus

`Tests\Support\TestDatabase` engendre un nom de base par processus, sur le patron des quatre
isolations existantes (`TestProcessToken`). Voir « Conséquences ».

### 6. Le principe non négociable n°4 de `CLAUDE.md` est révoqué

*« Une migration se pense pour MySQL, jamais pour SQLite »* n'a plus d'objet : il n'y a plus qu'un
moteur, et c'est celui sur lequel la suite tourne. Le dire explicitement — **un principe révoqué
sans mention reste appliqué**, et ce dépôt a déjà payé ce défaut pendant trois mois avec
`spatie/laravel-permission` (TCK-303).

## Conséquences

### Six contraintes d'unicité changent de sens — et c'est le danger principal

`users.email` · `users.username` · `properties.slug` · `agencies.slug` · `tags.name` · `tags.slug`

Sous `utf8mb4_0900_ai_ci`, `Dakar` et `dakar` violaient l'unicité. Sous PostgreSQL en `locale=C`,
**non** : ce sont deux lignes.

**Une contrainte qui change de sens ne lève pas d'erreur — elle laisse passer un doublon en
silence**, et on le découvre dans les données, des mois plus tard. C'est pourquoi la protection est
*double*, et non alternative : normalisation à l'écriture (elle garde le comportement) **et** index
unique sur expression `LOWER(...)` (il garde les données, y compris contre un
`DB::table()->insert()` qui court-circuite le modèle).

### Une cinquième ressource partagée par machine — que cette décision CRÉE

Le dépôt en isolait quatre, toutes par `TestProcessToken` : les index Meilisearch, les disques
`Storage::fake()`, les vues compilées, et la file de tâches Meilisearch (TCK-334, ouverte).

Sous SQLite `:memory:`, **la base n'en était pas une** : chaque processus avait la sienne, sans que
personne ait eu à le décider. Sur PostgreSQL, tous les processus de la machine parlent au même
serveur. Sans correctif, deux agents qui testent en même temps se détruisent — le `migrate:fresh`
de `RefreshDatabase` de l'un vide les tables sous l'autre, qui rougit sur une assertion métier
parfaitement juste.

**C'est la panne D-44 à l'identique, sur une ressource que cette décision introduit.** Elle est
donc fermée dans le même chantier, avant d'être mesurée pour une fois :
`Tests\Support\TestDatabase` crée `takussan_test_<jeton>`, la supprime en fin d'exécution, et
balaie les orphelines. Le rôle applicatif reçoit `CREATEDB` **en développement et en CI
seulement** — jamais en production.

### Ce qui se dénoue

**D-04.** Au lieu de réparer un compte MySQL `takussan_prod` que personne n'a réussi à joindre — le
journal ne dit même pas de quel côté est l'écart : secret périmé, compte absent ou *grant* manquant
s'y ressemblent — on provisionne un PostgreSQL neuf avec un compte qu'on crée. **TCK-288 redevient
exécutable.**

### Ce qui reste ouvert

- **Le temps de suite.** SQLite `:memory:` → PostgreSQL réel, le ralentissement est inconnu et
  touche tout l'appareil bâti autour du temps de suite (`--parallel`, le cliquet de couverture,
  `bin/impacted-tests.php`). Si la mesure dépasse ×2, la piste est `CREATE DATABASE … TEMPLATE`.
- **L'hébergement de production.** VPS ou managé : la seule contrainte posée ici est que
  `CREATE EXTENSION vector` doit être possible.
- **TCK-334** (la file Meilisearch en `--parallel` simultané) n'est pas touchée par cette décision.

## Alternatives écartées

### Reproduire `utf8mb4_0900_ai_ci` par une collation ICU non déterministe

`CREATE COLLATION … (provider = icu, locale = 'fr-FR-u-ks-level1', deterministic = false)` rend les
comparaisons insensibles à la casse et aux accents, comme MySQL.

**Écartée : PostgreSQL refuse `LIKE` sur une colonne à collation non déterministe.** Le dépôt
compte 21 `where(…, 'like', …)` ; ils tomberaient tous, sur une erreur sans rapport avec le sujet.
*On échangerait un problème visible contre un problème obscur.*

### Garder SQLite pour les tests et n'utiliser PostgreSQL qu'en production

C'est l'état actuel avec un autre moteur au bout — et c'est précisément ce que cet ADR corrige.

### Un job CI « suite sur PostgreSQL » toléré en échec, ramené progressivement à zéro

Écartée pour une raison mesurée dans ce dépôt : une violation Pint a bloqué la CI **six semaines**
sans que personne ne le remarque. *Un job toléré en échec est un job que plus personne ne lit.*

### Adapter les migrations d'abord, basculer ensuite

C'était le plan initial. Mesuré, il met l'effort là où il n'y a pas de risque — 0 `enum`,
0 `fullText`, 0 `storedAs`, 0 `charset`, 0 `->comment()`, et 6 des 8 migrations à SQL brut
branchent **déjà** sur `'pgsql'` — tout en laissant l'étape « lancer les tests » aveugle, puisque
la suite tourne sur SQLite.

### Embarquer la recherche PostgreSQL et PostGIS dans ce chantier

Écartée par la fenêtre de tir, pas par l'intérêt. Ni l'une ni l'autre ne coûtera plus cher dans six
mois ; `jsonb` et l'extension `vector`, si. Les emballer ensemble ferait dépendre la seule chose
urgente de trois choses qui ne le sont pas, et rendrait indécidable, au premier test rouge, laquelle
des quatre a cassé.

## Application

- `docker-compose.yml` — service `postgres`, image épinglée, `--locale=C`
- `docker/pgsql-init.sql` — `CREATEDB` sur le rôle applicatif
- `takussan-api/phpunit.xml` — `DB_CONNECTION=pgsql`, sans repli
- `takussan-api/tests/Support/TestDatabase.php` — une base par processus
- `scripts/check-db-engine.mjs` — la garde, cible réécrite
- `.github/workflows/api-ci.yml` — service PostgreSQL, `pdo_pgsql`, `migrations-pgsql`
