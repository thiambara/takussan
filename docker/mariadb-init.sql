-- Init MariaDB — joué UNIQUEMENT à la première création du volume `mariadb-data`.
--
-- Sur un volume déjà existant, Docker n'exécute pas ce fichier. Pour le rejouer :
--   docker compose exec -T mariadb mariadb -uroot -ptakussan < docker/mariadb-init.sql
-- ou repartir de zéro :
--   docker compose down -v && docker compose up -d
--
-- La base `takussan` et l'utilisateur `takussan` sont créés par les variables
-- MARIADB_* du compose. Ce fichier ne pose que ce qu'elles ne savent pas faire :
-- la base de TEST, séparée, pour que `php artisan test --database=mysql` ne
-- détruise jamais les données de développement.

CREATE DATABASE IF NOT EXISTS `takussan_test`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `takussan_test`.* TO 'takussan'@'%';

FLUSH PRIVILEGES;
