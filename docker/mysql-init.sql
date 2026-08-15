-- Init MySQL — joué UNIQUEMENT à la première création du volume `mysql-data`.
--
-- Sur un volume déjà existant, Docker n'exécute pas ce fichier. Pour le rejouer :
--   docker compose exec -T mysql mysql -uroot -ptakussan < docker/mysql-init.sql
-- ou repartir de zéro :
--   docker compose down -v && docker compose up -d
--
-- La base `takussan` et l'utilisateur `takussan` sont créés par les variables
-- MYSQL_* du compose. Ce fichier ne pose que ce qu'elles ne savent pas faire :
-- la base de TEST, séparée, pour qu'un passage de la suite sur MySQL ne
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

-- La collation est celle du serveur de PRODUCTION, mesurée le 2026-08-13
-- (`utf8mb4_0900_ai_ci`, MySQL 8.0.46). Une base de test dans une autre collation
-- que la prod n'éprouve pas les comparaisons de chaînes de la prod.
CREATE DATABASE IF NOT EXISTS `takussan_test`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

GRANT ALL PRIVILEGES ON `takussan_test`.* TO 'takussan'@'%';

FLUSH PRIVILEGES;
