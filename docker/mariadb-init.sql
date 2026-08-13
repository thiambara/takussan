-- Init MariaDB — joué UNIQUEMENT à la première création du volume `mariadb-data`.
--
-- Sur un volume déjà existant, Docker n'exécute pas ce fichier. Pour le rejouer :
--   docker compose exec -T mariadb mariadb -uroot -ptakussan < docker/mariadb-init.sql
-- ou repartir de zéro :
--   docker compose down -v && docker compose up -d
--
-- La base `takussan` et l'utilisateur `takussan` sont créés par les variables
-- MARIADB_* du compose. Ce fichier ne pose que ce qu'elles ne savent pas faire :
-- la base de TEST, séparée, pour qu'un passage de la suite sur MariaDB ne
-- détruise jamais les données de développement.
--
-- La commande, EXACTEMENT :
--   DB_CONNECTION=mysql DB_DATABASE=takussan_test php artisan test
--
-- ⚠ PAS `php artisan test --database=mysql` : ce n'était pas une option d'`artisan
-- test`, elle était transmise à PHPUnit qui la refuse (« Unknown option
-- "--database" »). La version précédente de ce commentaire la donnait pourtant comme
-- la raison d'être du fichier — la base créée ici était donc inatteignable par la
-- seule commande qui la nommait. Vérifié en l'exécutant.
--
-- Les variables d'environnement, elles, fonctionnent : `phpunit.xml` force
-- `DB_CONNECTION=sqlite`, mais un `<env>` de PHPUnit n'écrase jamais une variable
-- déjà posée dans le processus.
--
-- Utile pour éprouver les quatre pièges MySQL que SQLite ne voit pas (cf. CLAUDE.md) ;
-- la CI le fait sur les migrations via le job `migrations-mysql`.

CREATE DATABASE IF NOT EXISTS `takussan_test`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `takussan_test`.* TO 'takussan'@'%';

FLUSH PRIVILEGES;
