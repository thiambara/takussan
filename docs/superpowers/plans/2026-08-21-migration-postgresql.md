# Migration PostgreSQL — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`. Les étapes sont en cases à cocher (`- [ ]`).

**But :** faire tourner `takussan-api` sur PostgreSQL 17 — schéma, code, suite de tests, CI et
provisionnement — pendant qu'aucune donnée de production n'existe.

**Architecture :** la suite de tests bascule sur PostgreSQL **au premier commit**, avant tout
correctif. La liste des tests rouges qu'elle produit **est** le plan de travail des tâches
suivantes. MySQL et SQLite disparaissent tous les deux : la base de test devient celle de la
production.

**Pile :** Laravel 13 · PHP 8.4.1 · PostgreSQL 17 (`pgvector/pgvector:pg17`) · Meilisearch v1.16
(inchangé) · PHPUnit + ParaTest.

**Spec :** [`docs/superpowers/specs/2026-08-21-migration-postgresql-design.md`](../specs/2026-08-21-migration-postgresql-design.md)

---

## Contraintes globales

Elles s'appliquent à **toutes** les tâches, sans être répétées.

- **`./vendor/bin/pint` avant chaque commit backend.** Rien ne l'impose ; une violation d'un seul
  fichier a bloqué la CI six semaines.
- **Messages de commit en français**, préfixe conventionnel, `(TCK-NNN)` quand un ticket existe.
- **Ne jamais merger ni pousser sans demande explicite.**
- **Un agent délégué ne lance JAMAIS la suite entière.** Il lance les classes qu'il touche, ou
  `php bin/impacted-tests.php --run`. La suite entière est lancée par la session déléguante, une
  fois, à la fin.
- **Toute mesure de temps se prend machine au repos**, avec `uptime` et `sysctl -n hw.ncpu` relevés
  à côté du chiffre. Sous charge, la même commande met ×11.
- **Un rouge Meilisearch se relance seul avant d'accuser le code** (dette D-44).
- **Ablation obligatoire** : pour tout correctif, vérifier qu'un test rougirait sans lui.
- **Ne jamais écrire un chiffre sans la commande qui le produit.**
- **PostgreSQL cible : 17.** Image `pgvector/pgvector:pg17` partout — dev, CI, preview, prod.
- **Port docker : 5433** (le dépôt décale tous ses ports d'un cran).
- **Aucune extension créée dans ce chantier.** `vector`, `pg_trgm`, `citext` viennent avec leurs
  propres tickets. Ici, on garantit seulement qu'elles *pourront* l'être.
- **Collation déterministe.** Interdiction d'introduire une collation ICU non déterministe :
  PostgreSQL refuse `LIKE` dessus, et le dépôt en compte 21.

---

## Structure des fichiers

**Créés**

| Fichier | Responsabilité |
|---|---|
| `docs/adr/0020-postgresql-sur-tous-les-environnements.md` | la décision, ses motifs, ses conséquences |
| `takussan-api/tests/Support/TestDatabase.php` | **la cinquième ressource partagée par machine** : une base de test par processus |
| `docker/pgsql-init.sql` | rôle applicatif, droit `CREATEDB`, base de travail |
| `docs/plans/2026-08-21-inventaire-postgres.md` | le livrable mesuré de la tâche 4 — la liste des rouges |

**Modifiés**

| Fichier | Ce qui change |
|---|---|
| `docker-compose.yml` | service `postgres` ajouté, service `mysql` retiré (tâche 12), volume `pgsql-data` |
| `takussan-api/.env.docker` · `.env.example` | `DB_CONNECTION`, port, identifiants |
| `takussan-api/phpunit.xml` | `DB_CONNECTION=pgsql` + paramètres de connexion |
| `takussan-api/tests/bootstrap.php` | `TestDatabase::install()` |
| `takussan-api/tests/CreatesApplication.php` | `TestDatabase::ensureCreated()` |
| `takussan-api/tests/Support/TestFilesystemIsolation.php` | le commentaire qui affirme « la suite tourne sur SQLite `:memory:` » devient faux |
| `takussan-api/database/migrations/**` | `->json(` → `->jsonb(` et les correctifs F1 |
| `takussan-api/app/**` | les correctifs F2 → F6 |
| `.github/workflows/api-ci.yml` | service PostgreSQL, `pdo_pgsql`, job `migrations-mysql` → `migrations-pgsql` |
| `scripts/check-db-engine.mjs` | cible entièrement réécrite |
| `scripts/server-setup.sh` · `deploy.yml` | provisionnement PostgreSQL |
| `CLAUDE.md` · `docs/models-spec.md` · `docs/infra/prod-drivers.json` | la documentation d'entrée |

---

## Tâche 1 — ADR-0020

**Fichiers**
- Créer : `docs/adr/0020-postgresql-sur-tous-les-environnements.md`
- Modifier : `docs/adr/README.md`

Règle du dépôt : *toute décision structurelle s'écrit en ADR AVANT l'implémentation.*

- [ ] **Étape 1 — Lire le format en vigueur**

```bash
cat docs/adr/0008-meilisearch-sur-tous-les-environnements.md
```

C'est l'ADR le plus proche par la forme *et* par le fond : il décide « un seul moteur sur tous les
environnements, sans repli », exactement le raisonnement qu'on applique ici à la base.

- [ ] **Étape 2 — Écrire l'ADR**

Sections obligatoires : Statut · Date · Tickets · Contexte · Décision · Conséquences · Alternatives
écartées.

Doivent y figurer, sans être dilués :

1. **PostgreSQL 17 sur tous les environnements, base de test comprise.** SQLite et MySQL retirés.
2. **La collation reste déterministe** — et la raison exacte : PostgreSQL refuse `LIKE` sur une
   collation non déterministe, le dépôt en compte 21. L'alternative ICU `fr-FR-u-ks-level1` est
   *écartée*, pas ignorée : l'écrire dans « Alternatives écartées ».
3. **Les six contraintes d'unicité sur texte changent de sens** — `users.email`, `users.username`,
   `properties.slug`, `agencies.slug`, `tags.name`, `tags.slug`. Sous `ai_ci` `Dakar` et `dakar`
   violaient l'unicité ; sous PostgreSQL non. **Une contrainte qui change de sens ne lève pas
   d'erreur, elle laisse passer un doublon en silence.**
4. **`json` → `jsonb` maintenant**, parce que c'est un `ALTER` bloquant plus tard.
5. **L'image porte pgvector dès maintenant**, alors qu'aucune table ne l'utilise : c'est le
   provisionnement qui se décide ici, pas le schéma.
6. **Il révoque le principe non négociable n°4 de `CLAUDE.md`** (« une migration se pense pour
   MySQL »). Le dire explicitement — un principe révoqué sans mention reste appliqué.

- [ ] **Étape 3 — Ajouter la ligne à l'index**

```bash
grep -n '0019' docs/adr/README.md   # repérer la forme exacte de la ligne précédente
```

Ajouter l'entrée `0020` dans le même format.

- [ ] **Étape 4 — Vérifier les gardes de documentation**

```bash
for g in scripts/check-*.mjs; do node "$g" >/dev/null || echo "✗ $g"; done
```

Attendu : aucune ligne `✗`.

- [ ] **Étape 5 — Commit**

```bash
git add docs/adr/
git commit -m "docs(adr): ADR-0020 — PostgreSQL sur tous les environnements, base de test comprise"
```

---

## Tâche 2 — Le service PostgreSQL

**Fichiers**
- Modifier : `docker-compose.yml`
- Créer : `docker/pgsql-init.sql`
- Modifier : `takussan-api/.env.docker`, `takussan-api/.env.example`, `dev.sh`

**Interfaces**
- Produit : un PostgreSQL 17 sur `127.0.0.1:5433`, base `takussan`, rôle `takussan` **avec
  `CREATEDB`** — ce droit est consommé par la tâche 3 et par `--parallel`.

- [ ] **Étape 1 — Ajouter le service**

Dans `docker-compose.yml`, après le bloc `mysql:` (qui reste en place jusqu'à la tâche 12) :

```yaml
  postgres:
    # pgvector/pgvector, PAS postgres:17. L'extension `vector` doit être DISPONIBLE
    # sur tous les environnements dès maintenant, alors même qu'aucune table ne
    # l'utilise encore (ADR-0020) : le jour où le chatbot arrive, une instance sans
    # l'extension se découvre en production, pas en développement.
    #
    # Le tag suit les correctifs de la branche 17 sans changer de branche — un
    # passage en 18 doit rester une décision.
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_DB: takussan
      POSTGRES_USER: takussan
      POSTGRES_PASSWORD: takussan
      # Encodage et collation de la base, écrits plutôt que subis. `--locale=C` est
      # DÉLIBÉRÉ et c'est la décision la plus lourde de l'ADR-0020 : un tri et une
      # comparaison DÉTERMINISTES, sensibles à la casse et aux accents. On ne
      # reproduit PAS `utf8mb4_0900_ai_ci` — PostgreSQL refuse `LIKE` sur une
      # collation non déterministe, et le dépôt en compte 21.
      POSTGRES_INITDB_ARGS: '--encoding=UTF8 --locale=C'
    ports:
      # Décalé d'un cran comme les quatre autres (3307 / 7701 / 6380 / 1026) : une
      # installation brew de PostgreSQL écoute sur 5432 et les deux mondes doivent
      # cohabiter, pas se remplacer.
      #
      # ⚠ On RÉUTILISE `TAKUSSAN_DB_PORT` (11 occurrences dans `dev.sh`) plutôt que
      # d'introduire un second nom : `dev.sh` compare cette variable à `DB_PORT` du
      # `.env` pour décider si l'environnement vise les conteneurs du dépôt. Une
      # variable neuve laisserait cette comparaison porter sur un port mort.
      - '127.0.0.1:${TAKUSSAN_DB_PORT:-5433}:5432'
    volumes:
      - pgsql-data:/var/lib/postgresql/data
      # Joué UNIQUEMENT à la première création du volume.
      - ./docker/pgsql-init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      # `pg_isready` avec l'utilisateur ET la base : sans eux il répond sur la base
      # `postgres` par défaut et déclare sain un serveur dont la base applicative
      # n'existe pas encore.
      test: ['CMD-SHELL', 'pg_isready -U takussan -d takussan']
      interval: 5s
      timeout: 3s
      retries: 20
```

Et dans la section `volumes:` :

```yaml
  pgsql-data:
```

- [ ] **Étape 2 — Le script d'initialisation**

`docker/pgsql-init.sql` — **à la racine du dépôt**, comme `docker/mysql-init.sql` :

```sql
-- Joué une seule fois, à la création du volume `pgsql-data`.
--
-- Le rôle `takussan` est créé par POSTGRES_USER ; ce script ne fait qu'AJOUTER ce
-- que l'image ne donne pas : le droit de créer des bases.
--
-- Pourquoi CREATEDB. La suite de tests crée UNE BASE PAR PROCESSUS
-- (Tests\Support\TestDatabase). C'est la cinquième ressource partagée par machine
-- de ce dépôt, et la seule que la migration vers PostgreSQL CRÉE : sous SQLite
-- `:memory:`, chaque processus avait sa base gratuitement. Sans ce droit, deux
-- agents qui testent en même temps se détruisent mutuellement — exactement la
-- panne D-44, sur une autre ressource.
--
-- `--parallel` en a besoin pour la même raison, un cran plus bas : ParaTest ouvre
-- N bases, une par worker.
ALTER ROLE takussan CREATEDB;
```

- [ ] **Étape 3 — Démarrer et vérifier**

```bash
docker compose up -d postgres
docker compose ps postgres
# ⚠ PAS `current_setting('lc_collate')` : ce paramètre n'existe plus à l'exécution en
# PostgreSQL 17 (« unrecognized configuration parameter »). La collation est une
# propriété de la BASE, elle se lit dans `pg_database`.
docker compose exec -T postgres psql -U takussan -d takussan -tAc \
  "SELECT current_setting('server_version'), datcollate, datctype, pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database();"
docker compose exec postgres psql -U takussan -d takussan -c \
  "SELECT rolcreatedb FROM pg_roles WHERE rolname = 'takussan';"
```

Attendu : `17.x|C|C|UTF8` (mesuré le 2026-08-21 : `17.11 (Debian 17.11-1.pgdg12+2)|C|C|UTF8`) et `rolcreatedb` = `t`.

- [ ] **Étape 4 — Vérifier que pgvector est bien disponible** *(sans l'installer)*

```bash
docker compose exec postgres psql -U takussan -d takussan -c \
  "SELECT name, default_version FROM pg_available_extensions WHERE name = 'vector';"
```

Attendu : une ligne. **Si elle est absente, l'image est la mauvaise et tout le motif pgvector
tombe** — s'arrêter et le signaler, ne pas continuer.

- [ ] **Étape 5 — Les deux `.env`**

Dans `.env.docker`, remplacer le bloc DB :

```dotenv
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5433
DB_DATABASE=takussan
DB_USERNAME=takussan
DB_PASSWORD=takussan
```

Dans `.env.example`, poser les **mêmes clés** (la garde `scripts/check-env-parity.mjs` compare les
clés, jamais les valeurs) :

```dotenv
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5433
DB_DATABASE=takussan
DB_USERNAME=takussan
DB_PASSWORD=
```

> ⚠ `.env.example` livrait `DB_CONNECTION=sqlite`. **La CI fait `cp .env.example .env`**
> (`api-ci.yml:58`) : ce fichier n'est pas décoratif, c'est l'environnement de test de la CI. Une
> clé vide y écrase un défaut de `config/` — cf. l'histoire des quatre clés SMS dans `phpunit.xml`.

- [ ] **Étape 6 — Vérifier la parité des clés**

```bash
node scripts/check-env-parity.mjs
node scripts/check-webhook-env-keys.mjs
```

Attendu : sortie 0 pour les deux.

- [ ] **Étape 7 — `./dev.sh` : sonder PostgreSQL, et nommer le port canonique**

C'est le **critère d'acceptation n°6** de la spec, et il a deux moitiés — la seconde compte plus
que la première.

`dev.sh` sonde ce que le `.env` DÉCLARE, et il compare `TAKUSSAN_DB_PORT` à `DB_PORT` pour décider
si l'environnement vise les conteneurs du dépôt (11 occurrences de la variable ; c'est pourquoi la
tâche 2 la réutilise au lieu d'en créer une seconde). Il faut :

1. remplacer la sonde MySQL par une sonde PostgreSQL — un service déclaré et absent ne produit
   *aucune* erreur lisible : l'API démarre, et c'est la première requête qui meurt ;
2. **nommer le cas inverse** — un `.env` qui vise le port **canonique 5432** alors que le dépôt
   publie 5433. Ce cas-là ne produit aucun rouge : le service répond, c'est celui de brew. Mais
   rien de ce que `docker-compose.yml` garantit ne s'applique alors — ni la version 17, ni
   `--locale=C`, ni la disponibilité de pgvector. `takussan-api/.env` est ignoré par git : aucun
   fichier du dépôt ne peut corriger l'écart, **seulement l'afficher** (c'est exactement la dette
   D-48, transposée du port 3306 au port 5432).

Reprendre la formulation du message existant pour MySQL, en changeant les deux ports.

```bash
./dev.sh doctor
```

Attendu : PostgreSQL nommé et joignable ; sortie 0. Puis, **l'ablation** — poser temporairement
`DB_PORT=5432` dans `takussan-api/.env` et vérifier que `doctor` le **nomme** au lieu de se taire,
puis rétablir. Une garde qui ne rougit pas sur le cas qu'elle vise ne garde rien.

- [ ] **Étape 8 — Commit**

```bash
./vendor/bin/pint --test   # depuis takussan-api/ ; rien de PHP ici, mais l'habitude se garde
git add docker-compose.yml docker/pgsql-init.sql dev.sh takussan-api/.env.docker takussan-api/.env.example
git commit -m "feat(infra): service PostgreSQL 17 avec pgvector, port 5433 (ADR-0020)"
```

---

## Tâche 3 — `TestDatabase` : une base de test par processus

**BLOQUANTE.** Elle doit être finie avant la tâche 4, sinon la mesure est fausse.

**Fichiers**
- Créer : `takussan-api/tests/Support/TestDatabase.php`
- Modifier : `takussan-api/tests/bootstrap.php`
- Modifier : `takussan-api/tests/CreatesApplication.php`
- Modifier : `takussan-api/phpunit.xml`
- Modifier : `takussan-api/tests/Support/TestFilesystemIsolation.php` (un commentaire devenu faux)

**Interfaces**
- Consomme : `Tests\Support\TestProcessToken::value()` — jeton composé `<pid+aléa>[_<worker>]`.
- Produit : `TestDatabase::install(): string` (nom de la base, posé dans l'environnement) et
  `TestDatabase::ensureCreated(Repository $config): void` (création + programmation de la
  suppression).

### Pourquoi cette tâche existe

Le dépôt isole déjà **quatre** ressources partagées par machine, toutes par `TestProcessToken` :
les index Meilisearch (`TestSearchIndex`), les disques `Storage::fake()`
(`TestFilesystemIsolation`), les vues compilées (`TestCompiledViews`), et la file de tâches
Meilisearch (TCK-334, non résolue).

Sous SQLite `:memory:`, **la base n'en était pas une** : chaque processus PHP avait la sienne,
gratuitement. Sur PostgreSQL, tous les processus de la machine partagent une seule base. Deux
agents qui lancent des tests en même temps se détruisent mutuellement — `RefreshDatabase` de l'un
tronque les tables sous l'autre.

**C'est une régression que cette migration CRÉE.** Elle doit être fermée dans le même chantier,
pas découverte comme D-44 l'a été.

- [ ] **Étape 1 — Écrire la classe**

`takussan-api/tests/Support/TestDatabase.php` :

```php
<?php

namespace Tests\Support;

use Illuminate\Contracts\Config\Repository;
use PDO;
use Throwable;

/**
 * La CINQUIÈME ressource partagée par machine — et la seule que la migration vers
 * PostgreSQL CRÉE plutôt qu'elle ne révèle.
 *
 * Sous SQLite `:memory:`, la base de test n'était pas une ressource partagée : chaque
 * processus PHP avait la sienne, sans que personne ait eu à le décider. Sur PostgreSQL,
 * tous les processus de la machine parlent au MÊME serveur et, sans ce fichier, à la
 * MÊME base. Deux exécutions simultanées — deux agents, ou `php artisan test` lancé
 * deux fois — se détruisent alors mutuellement : le `migrate:fresh` de `RefreshDatabase`
 * de l'une vide les tables sous l'autre, qui rougit sur une assertion métier juste.
 *
 * C'est exactement la panne D-44, sur une autre ressource. On la ferme AVANT qu'elle
 * ne soit mesurée, pour une fois.
 *
 * ## Deux points d'accroche, et pourquoi ils sont deux
 *
 * 1. `install()` — depuis `tests/bootstrap.php`, AVANT toute application Laravel. Elle
 *    ne fait que POSER le nom dans l'environnement : le dépôt de Dotenv est immuable
 *    (`safeLoad()` n'écrase jamais une valeur déjà posée), donc cette valeur l'emporte
 *    sur le `DB_DATABASE` du `.env` du développeur comme sur celui de la CI. Elle ne
 *    peut RIEN faire de plus : à ce moment-là, l'hôte, le port et le mot de passe ne
 *    sont pas connus.
 * 2. `ensureCreated()` — depuis `Tests\CreatesApplication::createApplication()`, donc
 *    avec une application bootée et sa configuration. C'est le SEUL endroit qui
 *    s'exécute après que la connexion soit configurée et AVANT `setUpTraits()`, donc
 *    avant que `RefreshDatabase` ne tente de migrer. Même raisonnement que
 *    `TestSearchIndex::registerCleanup()`, qui attend d'être appelée depuis un endroit
 *    qui connaît l'hôte et la clé.
 *
 * ## L'âge d'une base, et pourquoi il est écrit à la main
 *
 * `pg_database` ne porte AUCUNE date de création. Le balayage des orphelins — le
 * filet des exécutions tuées par SIGKILL, que `register_shutdown_function` ne couvre
 * pas — n'a donc rien à lire. On l'écrit nous-mêmes : `COMMENT ON DATABASE` stocke
 * l'horodatage, et `shobj_description()` le relit. Pas de superutilisateur requis.
 *
 * ⚠ Ce fichier suppose que le rôle a `CREATEDB` (cf. `docker/pgsql-init.sql`). Sans ce
 * droit, la création lève, et c'est voulu : un échec bruyant vaut mieux qu'un repli
 * silencieux sur la base partagée, qui reproduirait la panne qu'on ferme ici.
 */
final class TestDatabase
{
    /** Le motif d'un nom engendré ici — sert aussi au balayage des orphelins. */
    private const PREFIX = 'takussan_test_';

    /** Au-delà, une base préfixée ne peut plus appartenir à une exécution vivante. */
    private const ORPHAN_TTL_SECONDS = 7200;

    private static ?string $name = null;

    private static bool $created = false;

    /**
     * Engendre le nom de la base du processus et l'expose à `env()`.
     *
     * Appelée depuis `tests/bootstrap.php`.
     */
    public static function install(): string
    {
        if (self::$name !== null) {
            return self::$name;
        }

        $name = self::PREFIX.TestProcessToken::value();

        putenv("DB_DATABASE={$name}");
        $_ENV['DB_DATABASE'] = $name;
        $_SERVER['DB_DATABASE'] = $name;

        return self::$name = $name;
    }

    public static function name(): string
    {
        return self::$name ?? self::install();
    }

    /**
     * Crée la base du processus si elle n'existe pas, programme sa suppression, et
     * balaie au passage celles qu'une exécution tuée aurait laissées derrière elle.
     *
     * Idempotente : appelée à chaque `createApplication()`, elle n'agit qu'une fois.
     */
    public static function ensureCreated(Repository $config): void
    {
        if (self::$created || $config->get('database.default') !== 'pgsql') {
            return;
        }

        self::$created = true;

        $name = self::name();
        $pdo = self::maintenanceConnection($config);

        self::sweepOrphans($pdo, $name);

        $exists = $pdo
            ->query('SELECT 1 FROM pg_database WHERE datname = '.$pdo->quote($name))
            ->fetchColumn();

        if ($exists === false) {
            // `CREATE DATABASE` n'accepte ni paramètre lié ni transaction : le nom est
            // engendré ici (préfixe + jeton hexadécimal), il ne vient d'aucune entrée
            // extérieure.
            $pdo->exec('CREATE DATABASE "'.$name.'"');
            $pdo->exec('COMMENT ON DATABASE "'.$name.'" IS '.$pdo->quote((string) time()));
        }

        register_shutdown_function(static function () use ($config, $name) {
            self::drop(self::maintenanceConnection($config), $name);
        });
    }

    /**
     * Une connexion à la base de MAINTENANCE (`postgres`) — on ne peut pas supprimer
     * une base depuis elle-même.
     */
    private static function maintenanceConnection(Repository $config): PDO
    {
        $c = $config->get('database.connections.pgsql');

        $dsn = sprintf('pgsql:host=%s;port=%s;dbname=postgres', $c['host'], $c['port']);

        return new PDO($dsn, $c['username'], $c['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
    }

    /** Bases laissées par une exécution qui n'a pas pu se nettoyer (SIGKILL, Ctrl-C). */
    private static function sweepOrphans(PDO $pdo, string $mine): void
    {
        $cutoff = time() - self::ORPHAN_TTL_SECONDS;

        try {
            $rows = $pdo->query(
                "SELECT datname, shobj_description(oid, 'pg_database') AS stamp
                 FROM pg_database
                 WHERE datname LIKE ".$pdo->quote(self::PREFIX.'%')
            )->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable) {
            return;
        }

        foreach ($rows as $row) {
            if ($row['datname'] === $mine) {
                continue;
            }

            // Sans horodatage, on s'abstient : mieux vaut une base de trop qu'une base
            // arrachée sous une exécution concurrente vivante.
            if ($row['stamp'] === null || (int) $row['stamp'] >= $cutoff) {
                continue;
            }

            self::drop($pdo, $row['datname']);
        }
    }

    private static function drop(PDO $pdo, string $name): void
    {
        try {
            // WITH (FORCE) coupe les connexions restantes — un worker ParaTest tué peut
            // en laisser une ouverte, et `DROP DATABASE` échouerait sans elle.
            $pdo->exec('DROP DATABASE IF EXISTS "'.$name.'" WITH (FORCE)');
        } catch (Throwable) {
            // Le nettoyage ne doit jamais faire échouer une exécution.
        }
    }
}
```

- [ ] **Étape 2 — Brancher les deux points d'accroche**

`takussan-api/tests/bootstrap.php` — ajouter l'import et l'appel :

```php
use Tests\Support\TestDatabase;
// …
TestDatabase::install();
TestSearchIndex::install();
TestFilesystemIsolation::install();
```

`takussan-api/tests/CreatesApplication.php` :

```php
use Tests\Support\TestDatabase;
// …
    public function createApplication(): Application
    {
        $app = require __DIR__.'/../bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();
        TestCompiledViews::install($app['config']);
        // AVANT `setUpTraits()`, donc avant que `RefreshDatabase` ne migre : la base
        // du processus doit exister quand la première connexion s'ouvre.
        TestDatabase::ensureCreated($app['config']);

        return $app;
    }
```

- [ ] **Étape 3 — `phpunit.xml`**

Remplacer les deux lignes SQLite par le bloc PostgreSQL, avec le commentaire qui explique
pourquoi `DB_DATABASE` n'y est **pas** figé :

```xml
        <env name="DB_CONNECTION" value="pgsql"/>
        <env name="DB_HOST" value="127.0.0.1"/>
        <env name="DB_PORT" value="5433"/>
        <env name="DB_USERNAME" value="takussan"/>
        <env name="DB_PASSWORD" value="takussan"/>
        <!-- ⚠ `DB_DATABASE` N'EST PAS DÉCLARÉ ICI, et c'est délibéré — même raison
             que `SCOUT_PREFIX` ci-dessous.

             Sous SQLite `:memory:`, chaque processus avait sa base gratuitement.
             Sur PostgreSQL, tous les processus de la machine parlent au même
             serveur : un littéral ici les ferait tous écrire dans la MÊME base, et
             le `migrate:fresh` de `RefreshDatabase` de l'un viderait les tables
             sous l'autre. C'est la panne D-44, sur une cinquième ressource.

             Le nom est donc engendré PAR PROCESSUS dans `tests/bootstrap.php` —
             cf. `Tests\Support\TestDatabase`, qui crée la base, programme sa
             suppression en fin d'exécution, et balaie celles qu'une exécution tuée
             aurait laissées. -->
```

- [ ] **Étape 4 — Corriger le commentaire devenu faux**

`tests/Support/TestFilesystemIsolation.php` affirme :

> *« …la machinerie de `--parallel` (qui irait créer des bases suffixées par le jeton alors que la
> suite tourne sur SQLite `:memory:`) »*

La justification tombe : la suite ne tourne plus sur SQLite. Réécrire le paragraphe pour dire ce
qui reste vrai — on ne pose toujours pas `LARAVEL_PARALLEL_TESTING`, mais désormais parce que
**`TestDatabase` fait le travail de `TestDatabases` en mieux** : il isole par *exécution* et pas
seulement par worker, ce que la machinerie de Laravel ne sait pas faire.

- [ ] **Étape 5 — Éprouver l'isolation, et par ablation**

Deux exécutions simultanées d'un sous-ensemble (**jamais la suite entière**) :

```bash
cd takussan-api
php artisan test --filter=CurrencyRuleTest > /tmp/a.log 2>&1 &
php artisan test --filter=CurrencyRuleTest > /tmp/b.log 2>&1 &
wait; tail -3 /tmp/a.log /tmp/b.log
```

Attendu : les deux vertes.

```bash
docker compose exec postgres psql -U takussan -d postgres -c \
  "SELECT datname FROM pg_database WHERE datname LIKE 'takussan_test_%';"
```

Attendu : **aucune ligne** après la fin des deux (les bases sont supprimées à l'extinction).

**Ablation — obligatoire.** Commenter l'appel à `TestDatabase::install()` dans `tests/bootstrap.php`,
relancer les deux exécutions simultanées, vérifier qu'au moins une **rougit**, puis rétablir. *Un
test vert qui serait vert sans le correctif ne garde rien.*

- [ ] **Étape 6 — Commit**

```bash
./vendor/bin/pint
git add tests/ phpunit.xml
git commit -m "test(db): une base PostgreSQL par processus — la cinquième ressource partagée (ADR-0020)"
```

---

## Tâche 4 — LA MESURE

**Aucun correctif dans cette tâche.** Elle produit le plan de travail des tâches 5 à 10.

**Fichiers**
- Créer : `docs/plans/2026-08-21-inventaire-postgres.md`

**Cette tâche est exécutée par la session principale, pas par un agent délégué** — la suite entière
dépasse le plafond de délégation.

- [ ] **Étape 1 — Les migrations passent-elles ?**

```bash
cd takussan-api
php artisan migrate:fresh 2>&1 | tee /tmp/migrate.log; echo "sortie=$?"
```

Noter : sortie, et le **premier** échec s'il y en a un (les suivants en découlent souvent).

- [ ] **Étape 2 — Relever l'état de la machine AVANT**

```bash
uptime; sysctl -n hw.ncpu
```

Sans ces deux valeurs, le temps mesuré ci-dessous ne voudra plus rien dire dans six mois.

- [ ] **Étape 3 — La suite entière, machine au repos**

```bash
cd takussan-api && time php artisan test 2>&1 | tee /tmp/suite-pgsql.log
```

- [ ] **Étape 4 — Classer les rouges par famille**

```bash
grep -E '^\s*(FAIL|⨯)' /tmp/suite-pgsql.log | sort | uniq -c | sort -rn > /tmp/rouges.txt
wc -l /tmp/rouges.txt
```

Puis, pour chaque test rouge, lire le message et le ranger dans **une seule** des six familles :

| | Famille | Signature typique |
|---|---|---|
| F1 | Schéma | l'échec survient à la migration, pas au test |
| F2 | SQL brut | `SQLSTATE[42883] function … does not exist`, `42601 syntax error` |
| F3 | Casse & accents | assertion sur un résultat de recherche, un ordre de liste, un doublon accepté |
| F4 | Types de retour | `Failed asserting that '5' matches expected 5` |
| F5 | Séquences | `SQLSTATE[23505] duplicate key value violates unique constraint … _pkey` |
| F6 | `GROUP BY` | `SQLSTATE[42803] column … must appear in the GROUP BY clause` |

- [ ] **Étape 5 — Écrire le livrable**

`docs/plans/2026-08-21-inventaire-postgres.md`, portant **exactement** :

1. la commande et la date de chaque chiffre ;
2. `migrate:fresh` passe-t-il, et sinon où il meurt ;
3. le compte de rouges **par famille**, avec la liste nominative des tests ;
4. le temps de suite, avec `uptime` et `hw.ncpu` **relevés avant** ;
5. la comparaison au temps de référence SQLite (204-235 s au 2026-08-16) — et si le
   ralentissement dépasse ×2, une ligne disant ce qu'on en fait (la piste est
   `CREATE DATABASE … TEMPLATE`, une base migrée une fois puis clonée par processus) ;
6. `CREATEDB` est-il bien accordé (prérequis de `--parallel`) :

```bash
docker compose exec postgres psql -U takussan -d takussan -tAc \
  "SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user;"
```

7. **une section « Ce que cette mesure ne dit pas »** — au minimum : un vert ne prouve pas que le
   chemin PostgreSQL a été *emprunté* (cf. la branche morte de `PipelineStatsService`).

- [ ] **Étape 6 — Point de décision**

Comparer le compte de rouges à ce que les tâches 5-10 prévoient. **Si la liste est massivement plus
grande que l'inventaire de reconnaissance, s'arrêter et re-découper avant de continuer.** Le design
l'exige : on ne planifie pas au-delà de cette mesure sans l'avoir lue.

- [ ] **Étape 7 — Commit**

```bash
git add docs/plans/2026-08-21-inventaire-postgres.md
git commit -m "docs(plans): inventaire mesuré de la bascule PostgreSQL — la liste des rouges"
```

---

## Tâches 5 à 10 — Les six familles

**Entrées communes :** le livrable de la tâche 4, plus l'inventaire de reconnaissance
(`docs/plans/2026-08-21-recon-postgres.md`).

**Protocole identique pour les six**, et il ne se répète pas ensuite :

- [ ] **Étape A — Reproduire** le premier rouge de la famille, seul :
  `php artisan test --filter=<Classe>`. Lire le message **en entier** avant de toucher au code.
- [ ] **Étape B — Corriger** un seul défaut.
- [ ] **Étape C — Rejouer** la même classe. Verte.
- [ ] **Étape D — Ablation** : annuler le correctif, vérifier que la classe **rougit**, rétablir.
- [ ] **Étape E** — Répéter A→D jusqu'à ce que la famille soit vide.
- [ ] **Étape F** — `php bin/impacted-tests.php --run`, puis `./vendor/bin/pint`, puis commit.

> ⚠ **Un rouge Meilisearch ne compte pas comme un rouge PostgreSQL.** Le relancer seul avant de
> conclure quoi que ce soit (D-44).

### Tâche 5 — F1 · Schéma

**Fichiers :** `takussan-api/database/migrations/**`

- [ ] `->json(` → `->jsonb(` sur les 56 fichiers. `jsonb` seul est indexable par GIN : c'est ce
      qui rend le ticket « index JSONB » possible plus tard sans `ALTER` bloquant.

```bash
cd takussan-api
grep -rl -e '->json(' database/migrations | wc -l    # 56 avant
# après la reprise :
grep -rn -e '->json(' database/migrations | wc -l    # attendu 0
```

- [ ] Vérifier les **casts Eloquent** correspondants : `'array'`, `'json'`, `'collection'`
      continuent de fonctionner sur `jsonb`, mais l'**ordre des clés n'est plus préservé** —
      `jsonb` normalise. Chercher tout test qui assert sur une chaîne JSON *littérale* plutôt que
      sur une structure décodée : ceux-là rougiront et le correctif est de comparer des tableaux,
      pas des chaînes.
- [ ] Les 6 migrations qui branchent déjà sur `'pgsql'` : leur branche n'avait **jamais** été
      exécutée. La lire ligne à ligne maintenant qu'elle l'est.
- [ ] Noms d'index : MySQL plafonne à 64 caractères, **PostgreSQL à 63**. Un nom de 64 exactement
      passait et ne passe plus.
- [ ] `unsignedBigInteger` : PostgreSQL n'a pas d'entier non signé, Laravel le rend en `bigint`.
      Vérifier qu'aucune migration ne s'appuie sur le refus des négatifs.

### Tâche 6 — F2 · SQL brut

**Fichiers :** les 36 fichiers de `takussan-api/app/` portant du SQL brut.

- [ ] **`app/Services/Crm/PipelineStatsService.php:112` et `:158`** — la branche « sinon MySQL »
      emploie `JSON_EXTRACT` / `JSON_UNQUOTE`, qui n'existent pas en PostgreSQL. Équivalents :

```php
// MySQL : JSON_EXTRACT(properties, '$.attributes.pipeline_stage') IS NOT NULL
// PostgreSQL :
"properties->'attributes'->>'pipeline_stage' IS NOT NULL"

// MySQL : JSON_UNQUOTE(JSON_EXTRACT(properties, '$.old.pipeline_stage'))
// PostgreSQL (->> rend déjà du texte, pas de déquotage à faire) :
"properties->'old'->>'pipeline_stage'"
```

> ⚠ Le branchement `sqlite`/`sinon` **disparaît** : il n'y a plus qu'un driver. Toute la structure
> `$driver = DB::connection()->getDriverName()` de ce fichier doit partir. **Laisser un
> branchement à une seule branche, c'est laisser croire qu'il en existe une autre.**

- [ ] **`app/Services/Admin/UnifiedModerationService.php`** — 33 occurrences, le fichier le plus
      risqué. Un `UNION` de trois sous-requêtes bâties par `selectRaw` de littéraux **non typés**.
      PostgreSQL infère `unknown` et peut refuser l'`UNION` ou en changer le type de colonne. Le
      correctif est un `CAST` explicite sur chaque littéral :

```php
// avant
->selectRaw("'property' as source_type")
// après
->selectRaw("CAST('property' AS text) as source_type")
```

Appliquer à **toutes** les colonnes littérales des trois branches, y compris `'pending'`,
`'flagged'`, `'review'`, et la branche `CASE WHEN … END`. **Les trois branches doivent rendre le
même type pour la même position.**

- [ ] `GROUP_CONCAT` → `string_agg(col, ',')` s'il en reste.
- [ ] Vérifier `orderByRaw('due_at IS NULL, due_at asc')` et `orderByRaw('agency_id IS NULL')` :
      les deux moteurs ordonnent `false` avant `true`, donc **a priori** identiques — le vérifier
      plutôt que de le supposer, avec un test qui compare l'ordre attendu.
- [ ] `whereRaw('ABS(amount - ?) < 1', […])` : portable. Ne pas y toucher.

### Tâche 7 — F3 · Casse et accents

**Le danger n°1 du chantier**, parce qu'il ne lève pas d'erreur.

- [ ] Pour **chacune** des six contraintes — `users.email`, `users.username`, `properties.slug`,
      `agencies.slug`, `tags.name`, `tags.slug` — établir si la normalisation existe déjà à
      l'écriture, et l'ajouter sinon. `User::setEmailAttribute` est le modèle à suivre.
- [ ] **Doubler par un index unique sur expression** — la normalisation applicative seule ne
      protège pas d'un `DB::table()->insert()` :

```php
// Nouvelle migration, une par table concernée
DB::statement('CREATE UNIQUE INDEX tags_name_lower_unique ON tags (LOWER(name))');
```

*La normalisation à l'écriture et l'index sur expression, les deux — pas l'un ou l'autre.* Le
premier garde le comportement, le second garde les données.

- [ ] **Un test par contrainte**, qui insère une variante de casse **et** une variante accentuée et
      attend le rejet. Ces six tests sont les critères d'acceptation n°5 de la spec.
- [ ] Les 21 `where(…, 'like', …)` : pour chacun, décider **recherche utilisateur** (→ `ilike`) ou
      **comparaison technique** (→ `like` inchangé). `AuditLogController:36`
      (`where('subject_type', 'like', '%'.Str::studly($entity))`) est technique ; les recherches de
      `AgencyModerationController` et `PropertyModerationController` sont utilisateur.

```php
// recherche utilisateur, sur PostgreSQL
$q->where('name', 'ilike', "%{$search}%")
```

- [ ] Les tris par colonne texte : sous `--locale=C`, `Z` trie **avant** `a`. Tout test qui assert
      un ordre de liste triée par texte rougira. Le correctif dépend du besoin métier — trier sur
      `LOWER(col)` si l'ordre doit être humain, ou corriger l'attente du test si l'ordre importait
      peu. **Ne pas corriger le test sans avoir décidé lequel des deux est juste.**

### Tâche 8 — F4 · Types de retour

- [ ] Pour chaque agrégat brut qui atteint une réponse HTTP, ajouter un cast explicite :

```php
// avant — le driver décide du type PHP
->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as gross')
// après — au point de lecture
'count' => (int) $row->count,
'gross' => (float) $row->gross,
```

- [ ] Colonnes `decimal(` sans cast `decimal:2` dans le modèle : les ajouter. Le principe n°3 du
      dépôt (montant décimal en base, entier ×100 à la frontière du driver de paiement) rend ce
      point sensible — vérifier tout code qui multiplie par 100.
- [ ] Booléens : `pdo_pgsql` rend un booléen PHP natif sur une colonne `boolean`, mais `'t'`/`'f'`
      sur du SQL brut non casté. Chercher les `=== true` et `=== 1`.
- [ ] Faire tourner la suite **front** aussi : `cd takussan-web && npm run test`. Un changement de
      forme de charge utile s'y voit.

### Tâche 9 — F5 · Séquences et seeders

- [ ] Retirer les `id` explicites des seeders et factories, **ou** repositionner la séquence après
      insertion :

```php
// Après tout insert à id explicite, dans le même seeder
DB::statement("SELECT setval(pg_get_serial_sequence('tags', 'id'), COALESCE((SELECT MAX(id) FROM tags), 1))");
```

- [ ] Vérifier les migrations qui insèrent des données —
      `2026_08_16_120300_backfill_agency_roles_seed_system.php` en particulier.
- [ ] Éprouver de bout en bout :

```bash
cd takussan-api && php artisan migrate:fresh --seed 2>&1 | tail -20; echo "sortie=$?"
```

Puis, **la vérification qui compte** — créer une ligne applicative dans chaque table semée à id
explicite et vérifier qu'elle ne lève pas `23505`. Un `migrate:fresh --seed` vert ne prouve rien
ici : la panne survient au **premier insert applicatif suivant**.

### Tâche 10 — F6 · `GROUP BY` strict et divers

- [ ] Chaque `groupBy` dont le `SELECT` porte une colonne non agrégée : soit l'ajouter au
      `GROUP BY`, soit l'agréger (`MIN()`, `MAX()`), selon ce que le métier veut. **Ne jamais
      choisir au hasard** : SQLite rendait une valeur arbitraire, donc le comportement actuel n'est
      pas une référence.
- [ ] `SELECT DISTINCT` + `ORDER BY` sur une colonne hors sélection : PostgreSQL refuse.
- [ ] `UNION` + `ORDER BY` : n'ordonner que sur les colonnes du résultat.
- [ ] Mots réservés PostgreSQL employés comme noms de colonnes (`user`, `order`, `default`,
      `limit`, `window`, `grant`) : Laravel les échappe, mais pas dans le SQL brut.
- [ ] `inRandomOrder()` : Laravel émet `random()` sur PostgreSQL, rien à faire — le vérifier.

---

## Tâche 11 — La CI

**Fichiers :** `.github/workflows/api-ci.yml`, `scripts/check-db-engine.mjs`, `docker-compose.yml`

- [ ] **Étape 1 — Le job de tests**

Ajouter un service PostgreSQL au job principal, à côté de Meilisearch :

```yaml
      postgres:
        image: pgvector/pgvector:pg17
        env:
          POSTGRES_DB: takussan
          POSTGRES_USER: takussan
          POSTGRES_PASSWORD: takussan
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U takussan -d takussan"
          --health-interval 5s --health-timeout 3s --health-retries 20
```

Ajouter `pdo_pgsql, pgsql` aux extensions PHP du step `Setup PHP`. Remplacer
`DB_CONNECTION: sqlite` par `DB_CONNECTION: pgsql` au step des tests.

- [ ] **Étape 2 — Accorder `CREATEDB` sur le runner**

Le service GitHub ne joue pas `docker/pgsql-init.sql`. Ajouter un step avant les tests :

```yaml
      - name: Accorder CREATEDB au rôle applicatif
        # `Tests\Support\TestDatabase` crée une base par processus. Sans ce droit, la
        # suite meurt au premier test, et le message accuse la connexion.
        run: PGPASSWORD=takussan psql -h 127.0.0.1 -p 5433 -U takussan -d takussan -c 'ALTER ROLE takussan CREATEDB;'
```

- [ ] **Étape 3 — `migrations-mysql` → `migrations-pgsql`**

Le job **change de raison d'être** et le commentaire doit le dire : la suite tournant désormais sur
PostgreSQL, il ne garde plus que **la couverture des `down()`** — les 14 migrations au-dessus de la
borne TCK-278. Corriger au passage le « 3 sur 124 » de `CLAUDE.md`, qui est faux.

- [ ] **Étape 4 — Réécrire `scripts/check-db-engine.mjs`**

La constante `PROD` devient PostgreSQL. Les deux propriétés gardées changent de nature :

1. toute image de conteneur de base vaut exactement `pgvector/pgvector:pg17` — et **la regex
   `IMAGE_BDD` doit refuser `postgres:17` tout court**, sinon le motif pgvector se perd au premier
   copier-coller ;
2. la garde de collation `utf8mb4_*` n'a plus d'objet ; la remplacer par une garde sur
   `--locale=C` / `--encoding=UTF8` — c'est *elle* qui porte désormais la décision de l'ADR-0020.

Conserver `elaguer()` : les commentaires qui **racontent** MySQL sont la mémoire du chantier, ils ne
déclarent rien.

- [ ] **Étape 5 — Retirer le service `mysql`** de `docker-compose.yml`, son volume `mysql-data`, et
      `docker/mysql-init.sql`. Réécrire le paragraphe de l'en-tête qui justifie MySQL.
- [ ] **Étape 6 — Toutes les gardes**

```bash
for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done
node docs/backlog/gen-index.mjs --check
node docs/gen-features-by-actor.mjs --check
```

- [ ] **Étape 7 — Le cliquet de couverture, remesuré**

```bash
cd takussan-api
XDEBUG_MODE=coverage php vendor/phpunit/phpunit/phpunit --coverage-clover=storage/coverage/clover.xml
php bin/coverage-gate.php storage/coverage/clover.xml --min=86
```

Du code spécifique à MySQL disparaît : le pourcentage **peut bouger dans les deux sens**. S'il
monte, resserrer le cliquet ; s'il descend, dire pourquoi avant de desserrer.

> ⚠ Ne **pas** juger le cliquet avec `php artisan test --coverage --min=86` : la commande sort en 1
> sans imprimer un chiffre sur une suite verte, et perd ses options selon leur ordre.

---

## Tâche 12 — Le provisionnement

**Fichiers :** `scripts/server-setup.sh`, `.github/workflows/deploy.yml`,
`docs/infra/prod-drivers.json`

C'est ici que **D-04 se dénoue** : on ne répare pas le compte MySQL `takussan_prod`, on provisionne
un PostgreSQL neuf avec un compte qu'on crée.

- [ ] Installer PostgreSQL 17 **et** `postgresql-17-pgvector` dans `server-setup.sh`.
- [ ] Créer rôle, base, et accorder les droits. **Ne pas accorder `CREATEDB` en production** — ce
      droit n'existe que pour la suite de tests.
- [ ] `deploy.yml` : la variable de connexion change de forme (`DB_CONNECTION=pgsql`, port 5432).
- [ ] Mettre `docs/infra/prod-drivers.json` à jour — en respectant sa discipline : chaque valeur
      porte son `etat` (`mesure` ou `non_mesure`), sa commande et sa date. **Un driver non vérifié
      sur le serveur est `non_mesure`, pas `mesure`.**
- [ ] Vérifier que `CREATE EXTENSION vector` serait **possible** sur l'instance cible, sans la
      créer :

```bash
psql -c "SELECT 1 FROM pg_available_extensions WHERE name = 'vector';"
```

> ⚠ Le déploiement effectif relève de **TCK-288** et exige un accès au serveur. Cette tâche prépare
> le terrain ; elle ne prétend pas déployer. Si l'accès manque, écrire ce qui reste à faire plutôt
> que de deviner.

---

## Tâche 13 — Les documents

**Fichiers :** `CLAUDE.md`, `docs/models-spec.md`, `docker-compose.yml` (en-tête),
`takussan-api/CLAUDE.md`

- [ ] **`CLAUDE.md`, principe non négociable n°4** : « une migration se pense pour MySQL, jamais
      pour SQLite » est **révoqué**. Le remplacer, et remplacer les quatre familles de pièges MySQL
      par les pièges PostgreSQL réellement rencontrés dans les tâches 5-10 — pas par une liste
      recopiée d'ailleurs. *Un piège qu'on n'a pas payé n'a pas sa place dans ce fichier.*
- [ ] **Corriger les trois chiffres faux relevés pendant ce chantier** : 124 migrations → **134** ;
      `down()` couverts « 3 sur 124 » → **14 au-dessus de la borne TCK-278** ; et le compte de
      seeders, qui se **contredit dans le même fichier** (ligne 29 « 11 seeders », ligne 290
      « 38 seeders ») → **48 fichiers**, mesuré par
      `find takussan-api/database/seeders -name '*.php' | wc -l`.
- [ ] Mettre à jour le bloc des commandes : plus de `DB_CONNECTION=sqlite`, le nouveau temps de
      suite de référence (avec sa date, son `load average` et son nombre de cœurs), et la
      restriction `--parallel` re-vérifiée sur PostgreSQL.
- [ ] `docs/models-spec.md` : les types de colonnes qui changent (`json` → `jsonb`).

---

## Tâche 14 — La revue adverse

- [ ] **Étape 1 — La suite entière, machine au repos, par la session principale**

```bash
cd takussan-api
uptime; sysctl -n hw.ncpu
time php artisan test
```

- [ ] **Étape 2 — La suite front**

```bash
cd takussan-web && npm run lint && npx tsc --noEmit && npm run test
```

- [ ] **Étape 3 — Les neuf critères d'acceptation** de la spec, un par un, avec la commande qui
      les prouve. Pour chacun, se poser la question du dépôt : *une régression le cocherait-elle
      aussi ?*
- [ ] **Étape 4 — Revue adverse**, avec pour consigne explicite de **réfuter** :
  - les six contraintes d'unicité laissent-elles passer un doublon de casse ou d'accent ?
  - un test vert emprunte-t-il vraiment le chemin PostgreSQL ? Le prouver **par le clover** sur les
    36 fichiers à SQL brut, pas par le vert global.
  - reste-t-il un `getDriverName()` à une seule branche ?
  - reste-t-il une mention de MySQL ou de SQLite qui **prescrit** au lieu de **raconter** ?

```bash
grep -rn -e 'sqlite' -e 'mysql' -e 'mariadb' takussan-api/config takussan-api/phpunit.xml \
  docker-compose.yml .github/workflows/ scripts/ | grep -v -e '^\s*[#*/]' 
```

- [ ] **Étape 5 — Les quatre tickets hors périmètre**, en `todo`, avec `depends_on` :
  index GIN + requêtes JSONB · pgvector + chatbot (Laravel AI SDK) · recherche PostgreSQL
  remplaçant Meilisearch (révoque ADR-0008) · géo/PostGIS.

```bash
node docs/backlog/gen-index.mjs
node docs/backlog/check-backlog.mjs --report
```

- [ ] **Étape 6 — Commit final, sans push ni merge** (règle du dépôt : jamais sans demande
      explicite).

---

## Ce que ce plan ne dit pas

- **Le nombre de tests rouges.** Il est délibérément absent : c'est la tâche 4 qui le produit.
  Toute estimation écrite ici serait une croyance présentée comme un plan.
- **Le temps de suite sur PostgreSQL.** Inconnu. S'il dépasse ×2 le temps SQLite, la piste est
  `CREATE DATABASE … TEMPLATE` — une base migrée une fois, clonée par processus.
- **L'hébergement de production.** VPS actuel ou managé : la seule contrainte posée ici est que
  `CREATE EXTENSION vector` doit être possible. Le choix appartient à TCK-288.
- **Si `--parallel` tient sur PostgreSQL.** Le droit `CREATEDB` est vérifié à la tâche 4 ; le
  comportement réel de la suite entière en parallèle ne l'est qu'à la tâche 14, et TCK-334 (la file
  Meilisearch) reste ouverte de toute façon.
